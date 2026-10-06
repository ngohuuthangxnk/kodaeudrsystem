import {createHmac, createHash, randomUUID, timingSafeEqual} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const actions=new Set(['beginUpload','uploadChunk','finishUpload','getDocumentChunk','recordLogin','bootstrap','createCase','completeCase','createOrder','previewMaterials','confirmMaterials','addChainNode','updateTask','uploadEvidence','submitDocument','reviewDocument','getDocument','addComment','uploadProcessed','verifyProcessed','syncCalendar','getAiPrompt','importAiResult','saveGeo','reviewGeo','exportPackage','updateMaterialInfo','saveCertificate','saveCountryRisk','manageUser','manageSupplier','saveSettings','markNotification']);
const reply=(statusCode,value,requestId)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'},body:JSON.stringify({...value,requestId})});
const error=(statusCode,code,message,id)=>reply(statusCode,{ok:false,data:null,error:{code,message}},id);
export async function handler(event){
 const requestId=randomUUID();if(event.httpMethod!=='POST')return error(405,'METHOD_NOT_ALLOWED','POST required',requestId);
 const secret=process.env.BRIDGE_SECRET||'',url=process.env.APPS_SCRIPT_WEBAPP_URL||'';
 if(secret.length<32||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))return error(503,'CONFIG_REQUIRED','Bridge is not configured',requestId);
 const origin=event.headers?.origin||event.headers?.Origin||'',origins=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!origins.length||!origins.includes(origin))return error(403,'ORIGIN_DENIED','Origin is not allowed',requestId);
 const authorization=event.headers?.authorization||event.headers?.Authorization||'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 if(token.length<32||token.length>256)return error(401,'AUTH_REQUIRED','Valid personal token required',requestId);
 let entries;try{entries=JSON.parse(process.env.TOKEN_HASHES_JSON||'[]');if(!Array.isArray(entries))throw Error();}catch{return error(503,'CONFIG_REQUIRED','Token registry invalid',requestId);}
 const hash=digest(token),matches=entries.filter(x=>typeof x.sha256==='string'&&equal(x.sha256,hash)&&x.active!==false&&(!x.expires_at||Date.parse(x.expires_at)>Date.now()));
 let actor=matches.length===1?matches[0].email:'';
 // Explicit compatibility opt-in for transition only; NEVER enabled by default.
 if(!actor&&process.env.ALLOW_PILOT_ADMIN==='true'&&process.env.PILOT_ADMIN_TOKEN?.length>=32&&equal(token,process.env.PILOT_ADMIN_TOKEN))actor=process.env.PILOT_ADMIN_EMAIL||'';
 if(typeof actor!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor))return error(401,'AUTH_REQUIRED','Token is invalid or expired',requestId);
 if(!event.body||Buffer.byteLength(event.body)>4400000||event.isBase64Encoded)return error(413,'REQUEST_TOO_LARGE','Request too large',requestId);
 let body;try{body=JSON.parse(event.body);}catch{return error(400,'INVALID_JSON','Invalid JSON',requestId);}
 if(!body||!actions.has(body.action)||!Array.isArray(body.args)||body.args.length>3)return error(400,'UNKNOWN_ACTION','Unknown action',requestId);
 if(body.requestKey!==undefined&&!/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestKey))return error(400,'INVALID_INPUT','Invalid request key',requestId);
 const payload=JSON.stringify({ts:Date.now(),nonce:requestId,actor:actor.trim().toLowerCase(),action:body.action,args:body.args,requestKey:body.requestKey||requestId,origin});
 const signature=createHmac('sha256',secret).update(payload).digest('hex');
 try{
  const upstream=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'follow',signal:AbortSignal.timeout(25000)});
  if(!upstream.ok)return error(502,'UPSTREAM_ERROR','Apps Script returned HTTP '+upstream.status,requestId);
  const raw=await upstream.text();if(raw.length>5500000)return error(413,'RESPONSE_TOO_LARGE','Download exceeds current bridge limit',requestId);
  let result;try{result=JSON.parse(raw);}catch{return error(502,'UPSTREAM_ERROR','Apps Script returned a non-JSON response',requestId);}
  if(result.ok)return reply(200,{ok:true,data:result.data??result.result,error:null},requestId);
  const e=typeof result.error==='object'?result.error:{code:'UPSTREAM_ERROR',message:String(result.error||'Request failed')};
  return error(e.code==='INTERNAL_ERROR'?500:['AUTH_REQUIRED','PERMISSION_DENIED'].includes(e.code)?403:400,e.code,e.message,requestId);
 }catch{return error(502,'UPSTREAM_UNAVAILABLE','Cannot reach Apps Script; retry with the same request key',requestId);}
}
