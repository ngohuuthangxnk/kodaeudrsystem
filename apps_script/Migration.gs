// Additive schema only. Run migrateV2() on a BACKED-UP STAGING copy first.
const V2_COLUMNS_={
 '01_SO_MASTER':['product','product_image_id','so_document_id','request_key'],
 '02_SO_ITEM_MATERIAL':['supplier_id','category','scientific_name','source_reference','confirmed_by','confirmed_at','request_key','material_original','commodity','common_species','hs_cn_code','quantity','quantity_uom','production_countries','production_range','legality_evidence_ids','deforestation_evidence_ids','scope_status','scope_rule_version','metadata_source_document_id','metadata_reference'],
 '04_EVIDENCE_TRACKER':['supplier_id','evidence_block','required','assigned_reviewer','priority','created_at','calendar_sync_status'],
 '05_OWNER_MASTER':['supplier_id','assigned_orders','last_login','created_at','created_by'],
 '08_ACTIVITY_LOG':['role','object_type','order_no','comment'],
 '06_DOCUMENT_REGISTER':['material_id','supplier_id','evidence_block','document_type','mime_type','active_version','reviewed_by','reviewed_at','review_comment','superseded_by','source_document_id','redaction_verified','translation_verified','updated_at','request_key','certificate_holder','certificate_no','certificate_scope','issue_date','expiry_date']
};
const V2_TABLES_={
 '14_SUPPLIERS':['id','name','email','active','created_at','created_by'],
 '15_SUPPLY_CHAIN':['id','case_id','material_id','supplier_id','parent_id','node_type','plot_id','source_document_id','created_by','created_at'],
 '16_COMMENTS':['id','case_id','document_id','version','visibility','comment','author','created_at'],
 '17_GEO_LOCATIONS':['id','case_id','material_id','supplier_id','chain_node_id','plot_id','country_of_production','production_range','area_ha','geometry_json','source_document_id','verification_status','reviewed_by','reviewed_at','notes','rule_version','coordinate_precision_digits'],
 '18_AI_PROMPT_RUNS':['id','case_id','function','document_id','prompt_version','generated_by','generated_at','prompt','imported_result','result_status'],
 '19_EXPORT_LOG':['id','case_id','actor','created_at','file_id','manifest_json','include_history','request_key'],
 '20_NOTIFICATIONS':['id','email','case_id','object_id','message','read','created_at'],
 '23_UPLOAD_SESSIONS':['id','actor','case_id','task_id','name','mime_type','size','sha256','chunk_count','folder_id','expected_document_id','status','created_at','request_key','document_id','kind','source_document_id'],
 '22_COUNTRY_RISK':['id','country_code','risk_level','rule_version','checked_at','reviewed_by','source_url'],
 '21_OPERATIONS':['id','actor','action','fingerprint','status','result_json','updated_at']
};
Object.keys(V2_COLUMNS_).forEach(n=>SCHEMA[n]=SCHEMA[n].concat(V2_COLUMNS_[n]));
Object.assign(SCHEMA,V2_TABLES_);
const STATUS_MAP_={Missing:'MISSING',Received:'UPLOADED',Accepted:'APPROVED',Rework:'MORE_INFO_REQUIRED',Superseded:'SUPERSEDED',Draft:'UPLOADED',Approved:'APPROVED',Collecting:'COLLECTING_EVIDENCE',Completed:'CLOSED'};
function migrateV2(){
 const email=Session.getEffectiveUser().getEmail().toLowerCase(),db=db_();
 const admin=db.getSheetByName('05_OWNER_MASTER').getDataRange().getValues().slice(1).some(r=>String(r[0]).toLowerCase()===email&&r[3]==='ADMIN'&&r[4]==='YES');
 if(!admin)throw Error('PERMISSION_DENIED: deploying account must already be Admin');
 return lock_(()=>{
  // Validate EVERY header before ANY mutation. Never repair by destructive rewrite.
  const plans=Object.keys(SCHEMA).map(n=>{const sheet=db.getSheetByName(n),expected=SCHEMA[n];
   if(!sheet){if(!V2_TABLES_[n])throw Error('SCHEMA_MISMATCH: '+n);return {n,expected,create:true};}
   const actual=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
   if(actual.some((h,i)=>h!==expected[i])||actual.length>expected.length)throw Error('SCHEMA_MISMATCH: '+n);
   return {n,expected,start:actual.length,sheet};
  });
  plans.forEach(p=>{const s=p.sheet||db.insertSheet(p.n);if(s.getMaxColumns()<p.expected.length)s.insertColumnsAfter(s.getMaxColumns(),p.expected.length-s.getMaxColumns());
   if(p.create)s.getRange(1,1,1,p.expected.length).setValues([p.expected]);
   else if(p.start<p.expected.length)s.getRange(1,p.start+1,1,p.expected.length-p.start).setValues([p.expected.slice(p.start)]);
   s.setFrozenRows(1);
  });
  ['01_SO_MASTER','04_EVIDENCE_TRACKER','06_DOCUMENT_REGISTER'].forEach(n=>rows_(n).forEach(r=>{if(STATUS_MAP_[r.status])patch_(n,r.id,{status:STATUS_MAP_[r.status]});}));
  rows_('06_DOCUMENT_REGISTER').forEach(d=>{if(d.active_version==='')patch_('06_DOCUMENT_REGISTER',d.id,{active_version:d.status==='SUPERSEDED'?'NO':'YES'});});
  const defaults={SCHEMA_VERSION:'2.0.0-staging',LEGAL_RULE_VERSION:'NOT_REVIEWED',ANNEX_I_VERSION:'NOT_REVIEWED',COUNTRY_RISK_VERSION:'NOT_REVIEWED',LAST_LEGAL_REVIEW_DATE:'',LEGAL_REVIEWED_BY:'',LEGAL_REVIEW_MAX_DAYS:'90',GEO_MIN_DECIMALS:'6',GEO_POLYGON_THRESHOLD_HA:'4',FRONTEND_URL:'https://koda-eudr-system.netlify.app'};
  Object.keys(defaults).forEach(k=>{if(!rows_('09_CONFIG').some(x=>x.key===k))add_('09_CONFIG',{key:k,value:defaults[k]});});
  audit_('SCHEMA_MIGRATED','','','','2.0.0 additive migration',email);
  return {version:'2.0.0-staging',tabs:plans.length};
 });
}
