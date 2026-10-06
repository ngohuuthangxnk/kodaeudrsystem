var BRIDGE_ACTOR='',BRIDGE_REQUEST_KEY='',BRIDGE_ACTION='',BRIDGE_ARGS=[];
var BRIDGE_ACTIONS={beginUpload,uploadChunk,finishUpload,getDocumentChunk,recordLogin,bootstrap,createCase,completeCase,createOrder,previewMaterials,confirmMaterials,addChainNode,updateTask,uploadEvidence,submitDocument,reviewDocument,getDocument,addComment,uploadProcessed,verifyProcessed,syncCalendar,getAiPrompt,importAiResult,saveGeo,reviewGeo,exportPackage,updateMaterialInfo,saveCertificate,saveCountryRisk,manageUser,manageSupplier,saveSettings,markNotification};
function bridgeHex_(bytes){return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function bridgeEqual_(a,b){if(typeof a!=='string'||typeof b!=='string')return false;var difference=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
function doPost(e){let response,requestId='';try{
 const content=e&&e.postData&&e.postData.contents;if(!content||content.length>4400000)fail_('INVALID_INPUT','Invalid request size');
 const envelope=JSON.parse(content),payload=envelope.payload,secret=PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
 if(!secret||secret.length<32||typeof payload!=='string'||payload.length>4300000)fail_('AUTH_REQUIRED','Bridge unavailable');
 if(!bridgeEqual_(bridgeHex_(Utilities.computeHmacSha256Signature(payload,secret)),envelope.signature))fail_('AUTH_REQUIRED','Invalid signature');
 const r=JSON.parse(payload);requestId=r.nonce||'';
 if(!Number.isSafeInteger(r.ts)||Math.abs(Date.now()-r.ts)>300000)fail_('AUTH_REQUIRED','Request expired');
 if(!/^[a-f0-9-]{36}$/.test(r.nonce||'')||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.actor||''))fail_('AUTH_REQUIRED','Invalid signed request');
 const origins=(PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim());if(!origins.includes(r.origin))fail_('PERMISSION_DENIED','Origin not allowed');
 if(!Object.prototype.hasOwnProperty.call(BRIDGE_ACTIONS,r.action)||!Array.isArray(r.args)||r.args.length>3)fail_('UNKNOWN_ACTION','Unknown action');
 const cache=CacheService.getScriptCache(),lock=LockService.getScriptLock();lock.waitLock(10000);try{if(cache.get('bridge_'+r.nonce))fail_('AUTH_REQUIRED','Request already used');cache.put('bridge_'+r.nonce,'1',360);}finally{lock.releaseLock();}
 BRIDGE_ACTOR=r.actor.toLowerCase();BRIDGE_REQUEST_KEY=r.requestKey;BRIDGE_ACTION=r.action;BRIDGE_ARGS=r.args;user_();
 response={ok:true,data:BRIDGE_ACTIONS[r.action].apply(null,r.args),error:null,requestId};
 }catch(error){response={ok:false,data:null,error:{code:error.code||'INTERNAL_ERROR',message:error.code?error.message:'Operation failed; inspect server logs using requestId'},requestId};if(!error.code)console.error(requestId,String(error));}
 finally{BRIDGE_ACTOR='';BRIDGE_REQUEST_KEY='';BRIDGE_ACTION='';BRIDGE_ARGS=[];}
 return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
