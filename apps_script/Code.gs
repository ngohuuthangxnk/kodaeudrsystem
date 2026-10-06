const SCHEMA = {
 '01_SO_MASTER':['id','so','customer','po','due','owner','folder','status','source_system','source_key','created_at','updated_at'],
 '02_SO_ITEM_MATERIAL':['id','case_id','sku','material','supplier','supplier_po','tier','folder','source_system','source_key'],
 '03_EVIDENCE_REQUIREMENT':['id','material','evidence','department','tier','enabled'],
 '04_EVIDENCE_TRACKER':['id','case_id','material_id','evidence','department','owner','due','status','document_id','note','updated_at','calendar_event_id'],
 '05_OWNER_MASTER':['email','name','department','role','active'],
 '06_DOCUMENT_REGISTER':['id','case_id','task_id','kind','name','file_id','version','status','uploaded_by','created_at'],
 '07_AI_REVIEW_QUEUE':['id','case_id','document_id','finding','status','reviewer'],
 '08_ACTIVITY_LOG':['id','timestamp','actor','action','case_id','entity_id','previous','next'],
 '09_CONFIG':['key','value'],
 '10_INTEGRATION_LOG':['batch_id','source','timestamp','status','records','error'],
 '11_INTEGRATION_ERROR':['batch_id','source_key','error','retry_status']
};
const PREPARED = {
 sheetId:'1xura5W6coeGeJsc1zQMP6Emw_QMTv5XAf0bqpC5Uk3A',
 rootFolderId:'1BWXpf-L6yBPQtXbskoQKMfN890aZXCJg',
 calendarId:'44c53155b661c93b06c6ee49bd9cce5764a91fa80cc57c805de639d3483cfce2@group.calendar.google.com'
};
function attachPreparedSheet(){return connectPreparedSheet_(false);}
function reconnectPreparedSheet(){return connectPreparedSheet_(true);}
function diagnoseConnection(){
 const p=PropertiesService.getScriptProperties();
 const result={currentSheetId:p.getProperty('DB_ID')||'(not set)',expectedSheetId:PREPARED.sheetId,previousSheetId:p.getProperty('PREVIOUS_DB_ID')||'(not set)'};
 console.log(JSON.stringify(result));
 return result;
}
function connectPreparedSheet_(allowSwitch){
 const p=PropertiesService.getScriptProperties();
 const existing=p.getProperty('DB_ID');
 if(existing&&existing!==PREPARED.sheetId&&!allowSwitch)throw Error('This script is already connected to a different Sheet. Run reconnectPreparedSheet() to switch to the prepared EUDR workbook; the previous ID will be saved.');
 const db=SpreadsheetApp.openById(PREPARED.sheetId);
 Object.keys(SCHEMA).forEach(n=>{
   const s=db.getSheetByName(n);if(!s)throw Error('Missing tab '+n);
   const actual=s.getRange(1,1,1,SCHEMA[n].length).getValues()[0];
   if(JSON.stringify(actual)!==JSON.stringify(SCHEMA[n]))throw Error('Header mismatch in '+n);
 });
 DriveApp.getFolderById(PREPARED.rootFolderId).getName();
 if(!CalendarApp.getCalendarById(PREPARED.calendarId))throw Error('Calendar unavailable to the deploying account');
 const email=Session.getEffectiveUser().getEmail().toLowerCase();if(!email)throw Error('Deploying account email unavailable');
 const properties={DB_ID:PREPARED.sheetId,ROOT_ID:PREPARED.rootFolderId,CALENDAR_ID:PREPARED.calendarId};
 if(existing&&existing!==PREPARED.sheetId)properties.PREVIOUS_DB_ID=existing;
 p.setProperties(properties);
 if(!rows_('05_OWNER_MASTER').some(x=>String(x.email).toLowerCase()===email))add_('05_OWNER_MASTER',{email,name:email,department:'Marketing',role:'ADMIN',active:'YES'});
 if(existing!==PREPARED.sheetId)audit_(existing?'RECONNECT_PREPARED':'ATTACH_PREPARED', '', '', existing||'', 'Configured existing Sheet / Drive / Calendar',email);
 return {spreadsheet:db.getUrl(),folder:DriveApp.getFolderById(PREPARED.rootFolderId).getUrl(),calendar:PREPARED.calendarId};
}
function setupFromProperties(){
 const p=PropertiesService.getScriptProperties();
 return setup({sheetId:p.getProperty('INSTALL_SHEET_ID'),rootFolderId:p.getProperty('INSTALL_ROOT_FOLDER_ID')});
}
function setup(config){
 if(config===undefined)return attachPreparedSheet();
 if(!config||!config.sheetId||!config.rootFolderId) throw Error('For a new blank workbook, supply both Sheet and root Folder IDs.');
 const p=PropertiesService.getScriptProperties();
 if(p.getProperty('DB_ID')) throw Error('Already initialized; setup never overwrites existing data.');
 const email=Session.getEffectiveUser().getEmail(); if(!email) throw Error('Google identity required');
 const db=SpreadsheetApp.openById(config.sheetId.trim());
 const root=DriveApp.getFolderById(config.rootFolderId.trim());
 const sheets=db.getSheets();
 if(sheets.length!==1||sheets[0].getLastRow()>0||sheets[0].getLastColumn()>0)throw Error('Setup requires a dedicated blank spreadsheet with one empty tab. Existing data was not changed.');
 // Remove the blank tab only after the new schema is fully created.
 Object.keys(SCHEMA).forEach(n=>{const s=db.insertSheet(n);s.appendRow(SCHEMA[n]);s.setFrozenRows(1);s.getRange(1,1,1,SCHEMA[n].length).setBackground('#123d36').setFontColor('white').setFontWeight('bold');});
 db.deleteSheet(sheets[0]);db.setSpreadsheetTimeZone('Asia/Ho_Chi_Minh');
 p.setProperties({DB_ID:db.getId(),ROOT_ID:root.getId()});
 add_('05_OWNER_MASTER',{email,name:email,department:'Marketing',role:'ADMIN',active:'YES'});
 ['Sales order','COO','INV','PL','BL','Supplier FSC license','FSC Cert','Transport invoice','GEO location'].forEach((e,i)=>add_('03_EVIDENCE_REQUIREMENT',{id:'R'+i,material:'*',evidence:e,department:e==='GEO location'?'Sourcing':'Purchasing',tier:'DIRECT',enabled:'YES'}));
 add_('09_CONFIG',{key:'RULES_CONFIRMED',value:'NO'});
 add_('09_CONFIG',{key:'REMINDERS_ENABLED',value:'NO'});
 audit_('SETUP','','', '', 'MVP initialized; draft requirement rules');
 return {spreadsheet:db.getUrl(),folder:root.getUrl()};
}
function doGet(){return HtmlService.createHtmlOutput('KODA pilot API. Open the Netlify site to use the workspace.').setTitle('KODA EUDR');}
function db_(){const id=PropertiesService.getScriptProperties().getProperty('DB_ID');if(!id)throw Error('Run setup first');return SpreadsheetApp.openById(id);}
function rows_(n){const v=db_().getSheetByName(n).getDataRange().getValues(),h=v.shift();return v.filter(r=>r[0]).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i] instanceof Date?r[i].toISOString():r[i]])));}
function safe_(v){return typeof v==='string' && /^[=+@\-]/.test(v)?"'"+v:v;}
function add_(n,o){db_().getSheetByName(n).appendRow(SCHEMA[n].map(k=>safe_(o[k]===undefined?'':o[k])));}
function patch_(n,id,o){const s=db_().getSheetByName(n),v=s.getDataRange().getValues(),i=v.findIndex((r,j)=>j>0&&r[0]===id);if(i<1)throw Error('Record not found');Object.keys(o).forEach(k=>{const col=SCHEMA[n].indexOf(k);if(col<0)throw Error('Unknown field');s.getRange(i+1,col+1).setValue(safe_(o[k]));});}
function uid_(){return Utilities.getUuid();}
function now_(){return new Date().toISOString();}
function user_(){
 const email=String(BRIDGE_ACTOR||Session.getActiveUser().getEmail()||'').toLowerCase();
 const u=rows_('05_OWNER_MASTER').find(x=>String(x.email).toLowerCase()===email&&x.active==='YES');
 if(!u)fail_('AUTH_REQUIRED','User is not active');
 if(!ROLES_.includes(u.role))fail_('PERMISSION_DENIED','Unknown role');
 if(u.role==='SUPPLIER_USER'&&!rows_('14_SUPPLIERS').some(s=>s.id===u.supplier_id&&s.active==='YES'))fail_('PERMISSION_DENIED','Supplier disabled');
 return u;
}
function manager_(u){return ['ADMIN','MARKETING'].includes(u.role);}
function requireManager_(){return requireRole_(['ADMIN','MARKETING']);}
function lock_(fn){const l=LockService.getScriptLock();l.waitLock(20000);try{return fn();}finally{l.releaseLock();}}
function audit_(action,c,e,previous,next,actor){const email=actor||BRIDGE_ACTOR||Session.getEffectiveUser().getEmail(),u=rows_('05_OWNER_MASTER').find(x=>x.email===email),order=c&&rows_('01_SO_MASTER').find(x=>x.id===c);let comment='';try{comment=JSON.parse(next||'{}').comment||'';}catch(ignore){}add_('08_ACTIVITY_LOG',{id:uid_(),timestamp:now_(),actor:email,role:u?u.role:'SYSTEM',action,object_type:action.split('_')[0],case_id:c,order_no:order?order.so:'',entity_id:e,previous,next,comment});}
function config_(k){return (rows_('09_CONFIG').find(x=>x.key===k)||{}).value;}
