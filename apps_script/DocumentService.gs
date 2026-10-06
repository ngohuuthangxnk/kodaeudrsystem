const MAX_FILE_BYTES_=3*1024*1024;
function validateFile_(file,limit){limit=limit||MAX_FILE_BYTES_;
 if(!file||typeof file.data!=='string'||file.data.length>Math.ceil(limit*4/3)+8||!file.data||!/^[A-Za-z0-9+/]+={0,2}$/.test(file.data))fail_('INVALID_FILE','Invalid base64; upload limit is 3 MB');
 const bytes=Utilities.base64Decode(file.data),type=file.type,name=fileName_(file.name);if(bytes.length>limit||!bytes.length)fail_('INVALID_FILE','File must be 1 byte–3 MB');
 const hex=bytes.slice(0,8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 const signatures={'application/pdf':'255044462d','image/png':'89504e470d0a1a0a','image/jpeg':'ffd8ff'};
 if(signatures[type]){if(!hex.startsWith(signatures[type]))fail_('INVALID_FILE','Content does not match file type');}
 else if(['application/json','application/geo+json'].includes(type)){try{JSON.parse(Utilities.newBlob(bytes).getDataAsString());}catch(e){fail_('INVALID_FILE','Malformed JSON file');}}
 else fail_('INVALID_FILE','Supported in this staging release: PDF, PNG, JPG, JSON and GeoJSON');
 return {bytes,type,name};
}
function storeFile_(folder,key,file,name){
 const marker='KODA_EUDR_RECORD:'+key,it=folder.getFilesByName(name);let found=null,occupied=false;
 while(it.hasNext()){const f=it.next();if(f.getDescription()===marker){if(found)fail_('VERSION_CONFLICT','Duplicate file record');found=f;}else occupied=true;}
 if(found)return found;if(occupied)fail_('VERSION_CONFLICT','Filename is occupied by an unregistered file; resolve before retry');
 const created=folder.createFile(Utilities.newBlob(file.bytes,file.type,name));created.setDescription(marker);return created;
}
function uploadEvidence(taskId,file,limit){const u=user_();requireWrite_(u);const t=task_(taskId,u);if(!['ADMIN','MARKETING','INTERNAL_USER','SUPPLIER_USER','EUDR_REVIEWER'].includes(u.role))fail_('PERMISSION_DENIED','Upload not allowed');
 const valid=validateFile_(file,limit);return withOperation_(()=>{
 const m=rows_('02_SO_ITEM_MATERIAL').find(x=>x.id===t.material_id),id=stable_('document:'+taskId+':'+BRIDGE_REQUEST_KEY),all=rows_('06_DOCUMENT_REGISTER').filter(d=>d.task_id===taskId&&d.kind==='EVIDENCE'),existing=all.find(d=>d.id===id),version=existing?Number(existing.version):Math.max(0,...all.map(d=>Number(d.version)||0))+1;
 if(!m)fail_('INVALID_INPUT','Task material missing');if(!existing&&file.expected_document_id!==String(t.document_id||''))fail_('VERSION_CONFLICT','Task document changed; refresh before uploading');
 if(t.status==='APPROVED'&&!existing)fail_('VERSION_CONFLICT','Request revision before replacing approved evidence');
 const supplier=rows_('14_SUPPLIERS').find(s=>s.id===t.supplier_id),ext=valid.type==='application/pdf'?'pdf':valid.type==='image/png'?'png':valid.type==='image/jpeg'?'jpg':'geojson';
 const name=fileName_((supplier?supplier.name:'KODA')+'_'+t.evidence+'_v'+String(version).padStart(2,'0')+'.'+ext),f=storeFile_(folder_(DriveApp.getFolderById(m.folder),t.evidence_block||BLOCKS_[t.evidence]||'05_Upstream_Traceability'),id,valid,name);
 if(!existing)add_('06_DOCUMENT_REGISTER',{id,case_id:t.case_id,task_id:taskId,kind:'EVIDENCE',name,file_id:f.getId(),version,status:'UPLOADED',uploaded_by:u.email,created_at:now_(),material_id:m.id,supplier_id:t.supplier_id,evidence_block:t.evidence_block,document_type:t.evidence,mime_type:valid.type,active_version:'YES',updated_at:now_(),request_key:BRIDGE_REQUEST_KEY});
 all.filter(d=>d.id!==id&&d.active_version==='YES').forEach(d=>patch_('06_DOCUMENT_REGISTER',d.id,{active_version:'NO',superseded_by:id,updated_at:now_()}));
 patch_('04_EVIDENCE_TRACKER',taskId,{document_id:id,status:'UPLOADED',updated_at:now_()});patch_('01_SO_MASTER',t.case_id,{status:'IN_REVIEW',updated_at:now_()});
 notify_(t.assigned_reviewer,t.case_id,id,'New evidence uploaded for review');audit_('DOCUMENT_UPLOADED',t.case_id,id,t.document_id||'',JSON.stringify({version,status:'UPLOADED'}),u.email);return {id,version};
 });}
function submitDocument(id){const u=user_();requireWrite_(u);return lock_(()=>{const d=document_(id,u);if(d.active_version!=='YES'||d.status!=='UPLOADED')fail_('VERSION_CONFLICT','Only active uploaded version can be submitted');patch_('06_DOCUMENT_REGISTER',id,{status:'SUBMITTED',updated_at:now_()});if(d.task_id)patch_('04_EVIDENCE_TRACKER',d.task_id,{status:'SUBMITTED',updated_at:now_()});audit_('DOCUMENT_SUBMITTED',d.case_id,id,'UPLOADED','SUBMITTED',u.email);return true;});}
function reviewDocument(id,decision,comment){const u=requireRole_(['ADMIN','EUDR_REVIEWER']);return lock_(()=>{
 const d=document_(id,u);if(d.kind!=='EVIDENCE')fail_('INVALID_INPUT','Use processed-copy verification for derivatives');if(d.task_id)task_(d.task_id,u);if(d.active_version!=='YES')fail_('VERSION_CONFLICT','Inactive version cannot be reviewed');
 if(!['IN_REVIEW','APPROVED','REJECTED','MORE_INFO_REQUIRED'].includes(decision))fail_('INVALID_INPUT','Invalid review decision');
 if(!['SUBMITTED','IN_REVIEW','APPROVED'].includes(d.status))fail_('VERSION_CONFLICT','Submit document before review');
 const note=text_(comment||'',2000);if(['REJECTED','MORE_INFO_REQUIRED'].includes(decision)&&!note)fail_('INVALID_INPUT','Comment required');
 const o={status:decision,reviewed_by:u.email,reviewed_at:now_(),review_comment:note,updated_at:now_()};patch_('06_DOCUMENT_REGISTER',id,o);
 if(d.task_id){const t=rows_('04_EVIDENCE_TRACKER').find(t=>t.id===d.task_id);patch_('04_EVIDENCE_TRACKER',t.id,{status:decision,note,updated_at:now_()});notify_(t.owner,d.case_id,id,'Evidence '+decision+(note?': '+note:''));syncTaskCalendar_({...t,status:decision});}
 if(note)add_('16_COMMENTS',{id:uid_(),case_id:d.case_id,document_id:id,version:d.version,visibility:'SHARED_WITH_SUPPLIER',comment:note,author:u.email,created_at:now_()});
 audit_('DOCUMENT_'+decision,d.case_id,id,JSON.stringify({status:d.status,version:d.version}),JSON.stringify(o),u.email);return true;
 });}
function addComment(id,input){const u=user_();requireWrite_(u);const d=document_(id,u),visibility=input.visibility;
 if(!['INTERNAL_ONLY','SHARED_WITH_SUPPLIER'].includes(visibility)||u.role==='SUPPLIER_USER'&&visibility!=='SHARED_WITH_SUPPLIER')fail_('PERMISSION_DENIED','Comment visibility not allowed');
 const comment=text_(input.comment,3000);if(!comment)fail_('INVALID_INPUT','Comment required');return withOperation_(()=>{const cid=stable_('comment:'+BRIDGE_REQUEST_KEY+':'+u.email);if(!rows_('16_COMMENTS').some(c=>c.id===cid))add_('16_COMMENTS',{id:cid,case_id:d.case_id,document_id:id,version:d.version,visibility,comment,author:u.email,created_at:now_()});audit_('COMMENT_ADDED',d.case_id,cid,'',visibility,u.email);return {id:cid};});}
function getDocument(id){const u=user_();if(String(id).startsWith('export:'))return getExport_(String(id).slice(7),u);const d=document_(id,u),f=DriveApp.getFileById(d.file_id);if(f.getSize()>MAX_TRANSFER_)fail_('FILE_TOO_LARGE','File exceeds 25 MiB transfer limit');const blob=f.getSize()<=MAX_FILE_BYTES_?f.getBlob():null;
 const comments=rows_('16_COMMENTS').filter(c=>c.document_id===id&&(u.role!=='SUPPLIER_USER'||c.visibility==='SHARED_WITH_SUPPLIER'));
 const versions=rows_('06_DOCUMENT_REGISTER').filter(x=>x.case_id===d.case_id&&x.task_id===d.task_id&&x.kind===d.kind&&(!['REDACTED','EN_SUBTITLE'].includes(d.kind)||x.source_document_id===d.source_document_id)).filter(x=>u.role!=='SUPPLIER_USER'||x.supplier_id===u.supplier_id).map(x=>({id:x.id,name:x.name,version:x.version,status:x.status,active_version:x.active_version,created_at:x.created_at,reviewed_at:x.reviewed_at}));
 return {id,name:d.name,type:d.mime_type||(blob?blob.getContentType():'application/pdf'),data:blob?Utilities.base64Encode(blob.getBytes()):null,download_chunked:!blob,size:f.getSize(),status:d.status,version:d.version,active:d.active_version,comments,versions};
}
function uploadProcessed(sourceId,kind,file,limit){const u=requireRole_(['ADMIN','EUDR_REVIEWER']),d=document_(sourceId,u),valid=validateFile_(file,limit);if(d.kind!=='EVIDENCE'||d.status!=='APPROVED'||d.active_version!=='YES')fail_('VERSION_CONFLICT','Original evidence must be approved and active');if(!['REDACTED','EN_SUBTITLE'].includes(kind)||valid.type!=='application/pdf')fail_('INVALID_INPUT','Processed output must be PDF');return withOperation_(()=>{
 const id=stable_('processed:'+sourceId+':'+BRIDGE_REQUEST_KEY),c=order_(d.case_id,u),previous=rows_('06_DOCUMENT_REGISTER').filter(x=>x.source_document_id===sourceId&&x.kind===kind),old=previous.find(x=>x.id===id),version=old?Number(old.version):Math.max(0,...previous.map(x=>Number(x.version)||0))+1,name=fileName_(d.name.replace(/\.pdf$/i,'')+'_'+kind+'_v'+String(version).padStart(2,'0')+'.pdf'),f=storeFile_(folder_(DriveApp.getFolderById(c.folder),'90_Processed'),id,valid,name);
 if(!old)add_('06_DOCUMENT_REGISTER',{id,case_id:d.case_id,task_id:d.task_id,material_id:d.material_id,supplier_id:d.supplier_id,kind,name,file_id:f.getId(),version,status:'UPLOADED',uploaded_by:u.email,created_at:now_(),mime_type:valid.type,active_version:'YES',source_document_id:sourceId,evidence_block:d.evidence_block,document_type:d.document_type,updated_at:now_(),request_key:BRIDGE_REQUEST_KEY});previous.filter(x=>x.id!==id&&x.active_version==='YES').forEach(x=>patch_('06_DOCUMENT_REGISTER',x.id,{active_version:'NO',superseded_by:id}));audit_('PROCESSED_COPY_ADDED',d.case_id,id,'',kind,u.email);return {id};
 });}
function verifyProcessed(id,input){const u=requireRole_(['ADMIN','EUDR_REVIEWER']);return lock_(()=>{const d=document_(id,u);if(!['REDACTED','EN_SUBTITLE'].includes(d.kind)||d.active_version!=='YES')fail_('INVALID_INPUT','Processed active version required');const source=document_(d.source_document_id,u);if(source.kind!=='EVIDENCE'||source.status!=='APPROVED'||source.active_version!=='YES')fail_('VERSION_CONFLICT','Original source is no longer approved active evidence');if(input.verified!==true||!text_(input.notes||'',2000))fail_('INVALID_INPUT','Human verification and notes required');
 const patch={status:'APPROVED',reviewed_by:u.email,reviewed_at:now_(),review_comment:input.notes,updated_at:now_()};patch[d.kind==='REDACTED'?'redaction_verified':'translation_verified']='YES';patch_('06_DOCUMENT_REGISTER',id,patch);audit_('PROCESSED_VERIFIED',d.case_id,id,'UPLOADED',JSON.stringify(patch),u.email);return true;
 });}
