function text_(v,max){if(typeof v!=='string')fail_('INVALID_INPUT','Text field required');if(v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))fail_('INVALID_INPUT','Invalid text length/content');return v.trim();}
function stable_(s){return bridgeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s)).slice(0,32);}
function isoDate_(d){if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)fail_('INVALID_INPUT','Invalid calendar date');return d;}
function folder_(parent,name){const it=parent.getFoldersByName(name);if(it.hasNext()){const f=it.next();if(it.hasNext())fail_('VERSION_CONFLICT','Duplicate folder requires manual resolution');return f;}return parent.createFolder(name);}
function fileName_(s){return text_(s,240).replace(/[\\/<>:"|?*\u0000-\u001f]/g,'_').replace(/^\.+/,'_')||'document';}
function notify_(email,caseId,objectId,message){if(!email)return;const id=stable_([BRIDGE_REQUEST_KEY,objectId,email,message].join(':'));if(!rows_('20_NOTIFICATIONS').some(x=>x.id===id))add_('20_NOTIFICATIONS',{id,email,case_id:caseId,object_id:objectId,message,read:'NO',created_at:now_()});}
function markNotification(id){const u=user_();return lock_(()=>{const n=rows_('20_NOTIFICATIONS').find(n=>n.id===id&&n.email===u.email);if(!n)fail_('PERMISSION_DENIED','Notification outside scope');patch_('20_NOTIFICATIONS',id,{read:'YES'});return true;});}
function withOperation_(fn){return lock_(()=>{
 const key=BRIDGE_REQUEST_KEY;if(!/^[a-zA-Z0-9_-]{16,80}$/.test(key||''))fail_('INVALID_INPUT','Idempotency key required');
 const id=stable_(BRIDGE_ACTOR+':'+BRIDGE_ACTION+':'+key),fingerprint=stable_(JSON.stringify(BRIDGE_ARGS)),old=rows_('21_OPERATIONS').find(r=>r.id===id);
 if(old&&old.fingerprint!==fingerprint)fail_('VERSION_CONFLICT','Idempotency key reused with different content');
 if(old&&old.status==='DONE')return JSON.parse(old.result_json);
 if(!old)add_('21_OPERATIONS',{id,actor:BRIDGE_ACTOR,action:BRIDGE_ACTION,fingerprint,status:'RUNNING',updated_at:now_()});
 try{const result=fn();patch_('21_OPERATIONS',id,{status:'DONE',result_json:JSON.stringify(result===undefined?null:result),updated_at:now_()});return result;}
 catch(e){patch_('21_OPERATIONS',id,{status:'RETRY_REQUIRED',updated_at:now_()});throw e;}
 });}
const BLOCKS_={
 'Sales order':'01_Commercial_Shipping',COO:'01_Commercial_Shipping',INV:'01_Commercial_Shipping',PL:'01_Commercial_Shipping',BL:'01_Commercial_Shipping',
 'Supplier FSC license':'02_FSC_Certification','FSC Cert':'02_FSC_Certification','Transport invoice':'03_Transport','GEO location':'04_Geolocation'
};
function createCase(input){return createOrder(input);}
function createOrder(input){const u=requireManager_();return withOperation_(()=>{
 const valid=validateFile_(input.file);if(valid.type!=='application/pdf')fail_('INVALID_FILE','Sales Order must be PDF');const so=text_(input.so,100);if(!so||/[\\/]/.test(so))fail_('INVALID_INPUT','Order No. is required');if(input.due)isoDate_(input.due);const image=input.image?validateFile_(input.image):null;if(image&&!['image/png','image/jpeg'].includes(image.type))fail_('INVALID_FILE','Image must be PNG/JPG');
 const previous=rows_('01_SO_MASTER').find(c=>c.so===so);if(previous&&previous.request_key!==BRIDGE_REQUEST_KEY)fail_('DUPLICATE_ORDER','Open the existing order');
 const id=previous?previous.id:stable_('order:'+so),rootId=PropertiesService.getScriptProperties().getProperty('ROOT_ID')||config_('DRIVE_ROOT_FOLDER_ID');if(!rootId)fail_('ROOT_FOLDER_NOT_RESOLVED','Configure a real Drive root folder');
 const root=DriveApp.getFolderById(rootId),f=previous?DriveApp.getFolderById(previous.folder):folder_(root,fileName_(so));
 const soFolder=folder_(f,'00_SO');['90_Processed','98_Export','99_Archive'].forEach(n=>folder_(f,n));
 const docId=stable_('SO:'+id),file=storeFile_(soFolder,docId,valid,so+'_SO.pdf');
 let imageId='';if(image){imageId=stable_('image:'+id);const imageFile=storeFile_(soFolder,imageId,image,so+'_Product_Image.'+(image.type==='image/png'?'png':'jpg'));if(!rows_('06_DOCUMENT_REGISTER').some(d=>d.id===imageId))add_('06_DOCUMENT_REGISTER',{id:imageId,case_id:id,kind:'PRODUCT_IMAGE',name:imageFile.getName(),file_id:imageFile.getId(),version:1,status:'UPLOADED',uploaded_by:u.email,created_at:now_(),mime_type:image.type,active_version:'YES',updated_at:now_(),request_key:BRIDGE_REQUEST_KEY});}
 if(!previous)add_('01_SO_MASTER',{id,so,customer:text_(input.customer||'',200),po:text_(input.po||'',200),due:input.due||'',owner:u.email,folder:f.getId(),status:'NOT_STARTED',source_system:'MANUAL',source_key:id,created_at:now_(),updated_at:now_(),product:text_(input.product||'',300),product_image_id:imageId,so_document_id:docId,request_key:BRIDGE_REQUEST_KEY});
 if(!rows_('06_DOCUMENT_REGISTER').some(d=>d.id===docId))add_('06_DOCUMENT_REGISTER',{id:docId,case_id:id,kind:'SO',name:file.getName(),file_id:file.getId(),version:1,status:'UPLOADED',uploaded_by:u.email,created_at:now_(),mime_type:'application/pdf',active_version:'YES',updated_at:now_(),request_key:BRIDGE_REQUEST_KEY});
 audit_('ORDER_CREATED',id,id,'','NOT_STARTED',u.email);return {id};
 });}
function parseMaterials_(caseId,input){const u=requireManager_(),c=order_(caseId,u);let obj;try{obj=typeof input==='string'?JSON.parse(input):input;}catch(e){fail_('INVALID_JSON','JSON cannot be parsed');}
 if(!obj||obj.order_no!==c.so||!Array.isArray(obj.materials)||!obj.materials.length||obj.materials.length>100)fail_('INVALID_INPUT','Order No. must match; provide 1–100 materials');
 const seen=new Set(),materials=obj.materials.map(m=>{const name=text_(m.material_name_normalized,150),original=text_(m.material_name_original,150),category=text_(m.material_category,50),reference=text_(m.source_reference,500);if(!name||!original||!reference||!['SOLID_WOOD','VENEER','MDF','PLYWOOD','OTHER_WOOD'].includes(category))fail_('INVALID_INPUT','Material name, category and source reference required');
 const k=name.toLowerCase();if(seen.has(k))fail_('DUPLICATE_MATERIAL','Duplicate material in imported result');seen.add(k);
 if(m.scientific_name!==null&&typeof m.scientific_name!=='string')fail_('INVALID_INPUT','Scientific name must be text or null');
 return {material:name,original,category,scientific_name:m.scientific_name?text_(m.scientific_name,200):'NOT PROVIDED',source_reference:reference};});
 return {order_no:c.so,product:text_(obj.product||'',300),materials};
}
function previewMaterials(caseId,json){const result=parseMaterials_(caseId,json);return {...result,preview_hash:stable_(JSON.stringify(result))};}
function confirmMaterials(caseId,json,confirmation){const u=requireManager_(),c=order_(caseId,u),preview=parseMaterials_(caseId,json);if(!confirmation||confirmation.confirmed!==true||confirmation.preview_hash!==stable_(JSON.stringify(preview)))fail_('VERSION_CONFLICT','Confirm the exact preview first');
 return withOperation_(()=>{const existing=rows_('02_SO_ITEM_MATERIAL').filter(m=>m.case_id===caseId),root=DriveApp.getFolderById(c.folder),ids=[];
 preview.materials.forEach((m,i)=>{const id=stable_(caseId+':material:'+m.material.toLowerCase()),old=existing.find(x=>x.id===id);if(old&&old.request_key!==BRIDGE_REQUEST_KEY)fail_('DUPLICATE_MATERIAL','Material already exists');
 const f=old?DriveApp.getFolderById(old.folder):folder_(root,String(i+1).padStart(2,'0')+'_'+fileName_(m.material));Object.values(BLOCKS_).concat('05_Upstream_Traceability').filter((n,i,a)=>a.indexOf(n)===i).forEach(n=>folder_(f,n));
 if(!old)add_('02_SO_ITEM_MATERIAL',{id,case_id:caseId,material:m.material,category:m.category,material_original:m.original,common_species:m.material,commodity:'wood',scope_status:'NOT_PROVIDED',scientific_name:m.scientific_name,source_reference:m.source_reference,tier:'DIRECT',folder:f.getId(),source_system:'AI_HUMAN_CONFIRMED',source_key:id,confirmed_by:u.email,confirmed_at:now_(),request_key:BRIDGE_REQUEST_KEY});
 const rules=rows_('03_EVIDENCE_REQUIREMENT').filter(r=>r.enabled==='YES'&&(r.material==='*'||String(r.material).toLowerCase()===m.material.toLowerCase())&&(r.tier==='DIRECT'||r.tier==='*'));
 rules.forEach(r=>{const tid=stable_(id+':'+r.id);if(!rows_('04_EVIDENCE_TRACKER').some(t=>t.id===tid))add_('04_EVIDENCE_TRACKER',{id:tid,case_id:caseId,material_id:id,evidence:r.evidence,department:r.department,owner:'',due:c.due,status:'MISSING',evidence_block:BLOCKS_[r.evidence]||'05_Upstream_Traceability',required:'YES',priority:'NORMAL',created_at:now_(),updated_at:now_()});});ids.push(id);
 });
 patch_('01_SO_MASTER',caseId,{status:'COLLECTING_EVIDENCE',product:preview.product||c.product,updated_at:now_()});audit_('MATERIALS_CONFIRMED',caseId,'','',JSON.stringify(ids),u.email);return {ids};
 });}
function addChainNode(caseId,input){const u=requireRole_(['ADMIN','EUDR_REVIEWER','MARKETING']);order_(caseId,u);return withOperation_(()=>{
 const m=rows_('02_SO_ITEM_MATERIAL').find(m=>m.id===input.material_id&&m.case_id===caseId);if(!m)fail_('INVALID_INPUT','Material missing');
 if(!['SUPPLIER','PROCESSOR','LOG_SUPPLIER','PLOT'].includes(input.node_type))fail_('INVALID_INPUT','Invalid chain node type');
 if(!rows_('14_SUPPLIERS').some(s=>s.id===input.supplier_id&&s.active==='YES'))fail_('INVALID_INPUT','Active supplier required');
 if(input.parent_id&&!rows_('15_SUPPLY_CHAIN').some(n=>n.id===input.parent_id&&n.material_id===m.id&&n.case_id===caseId))fail_('INVALID_INPUT','Parent outside material');
 if(input.node_type==='PLOT'&&!text_(input.plot_id||'',150))fail_('INVALID_INPUT','Plot ID required');
 if(input.source_document_id){const d=document_(input.source_document_id,u);if(d.case_id!==caseId||d.material_id!==m.id)fail_('INVALID_INPUT','Evidence outside material');}
 const id=stable_('chain:'+caseId+':'+BRIDGE_REQUEST_KEY);if(!rows_('15_SUPPLY_CHAIN').some(n=>n.id===id))add_('15_SUPPLY_CHAIN',{id,case_id:caseId,material_id:m.id,supplier_id:input.supplier_id,parent_id:input.parent_id||'',node_type:input.node_type,plot_id:input.plot_id||'',source_document_id:input.source_document_id||'',created_by:u.email,created_at:now_()});audit_('CHAIN_NODE_ADDED',caseId,id,'',input.node_type,u.email);return {id};
 });}
function updateTask(id,change){const u=requireRole_(['ADMIN','MARKETING','EUDR_REVIEWER']),t=task_(id,u);if(change.status!==undefined)fail_('INVALID_INPUT','Use reviewDocument for status decisions');return lock_(()=>{
 const o={updated_at:now_()};if(change.owner==='')o.owner='';else if(change.owner!==undefined){const owner=rows_('05_OWNER_MASTER').find(x=>x.email===change.owner&&x.active==='YES');if(!owner)fail_('INVALID_INPUT','Owner not active');o.owner=owner.email;if(owner.role==='SUPPLIER_USER')o.supplier_id=owner.supplier_id;}
 if(change.supplier_id!==undefined){if(change.supplier_id&&!rows_('14_SUPPLIERS').some(s=>s.id===change.supplier_id&&s.active==='YES'))fail_('INVALID_INPUT','Supplier not active');o.supplier_id=change.supplier_id;}
 const finalSupplier=o.supplier_id===undefined?t.supplier_id:o.supplier_id,finalOwner=o.owner===undefined?t.owner:o.owner,owner=rows_('05_OWNER_MASTER').find(x=>x.email===finalOwner);if(owner&&owner.role==='SUPPLIER_USER'&&owner.supplier_id!==finalSupplier)fail_('INVALID_INPUT','Owner/supplier mismatch');
 if(change.assigned_reviewer!==undefined){if(change.assigned_reviewer&&!rows_('05_OWNER_MASTER').some(x=>x.email===change.assigned_reviewer&&x.active==='YES'&&['ADMIN','EUDR_REVIEWER'].includes(x.role)))fail_('INVALID_INPUT','Active reviewer required');o.assigned_reviewer=change.assigned_reviewer;}
 if(change.due!==undefined)o.due=change.due?isoDate_(change.due):'';if(change.priority!==undefined){if(!['LOW','NORMAL','HIGH','URGENT'].includes(change.priority))fail_('INVALID_INPUT','Invalid priority');o.priority=change.priority;}
 patch_('04_EVIDENCE_TRACKER',id,o);notify_(o.owner||t.owner,t.case_id,id,'Evidence task assigned or updated');const sync=syncTaskCalendar_({...t,...o});audit_('TASK_ASSIGNED',t.case_id,id,JSON.stringify(t),JSON.stringify(o),u.email);return {saved:true,calendar:sync};
 });}
