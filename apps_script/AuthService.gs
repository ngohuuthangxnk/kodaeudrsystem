const ROLES_=['ADMIN','MARKETING','EUDR_REVIEWER','INTERNAL_USER','SUPPLIER_USER','VIEWER'];
function fail_(code,message){const e=Error(message);e.code=code;throw e;}
function requireRole_(roles){const u=user_();if(!roles.includes(u.role))fail_('PERMISSION_DENIED','Role does not allow this action');return u;}
function assigned_(u,id){try{return JSON.parse(u.assigned_orders||'[]').includes(id);}catch(e){return false;}}
function canTask_(u,t){if(u.role==='ADMIN')return true;if(u.role==='SUPPLIER_USER')return !!u.supplier_id&&t.supplier_id===u.supplier_id;return t.owner===u.email||t.assigned_reviewer===u.email||assigned_(u,t.case_id)||rows_('01_SO_MASTER').some(c=>c.id===t.case_id&&c.owner===u.email);}
function canOrder_(u,c){if(u.role==='ADMIN')return true;if(u.role==='SUPPLIER_USER')return rows_('04_EVIDENCE_TRACKER').some(t=>t.case_id===c.id&&canTask_(u,t));return c.owner===u.email||assigned_(u,c.id)||rows_('04_EVIDENCE_TRACKER').some(t=>t.case_id===c.id&&canTask_(u,t));}
function order_(id,u){const c=rows_('01_SO_MASTER').find(x=>x.id===id);if(!c)fail_('ORDER_NOT_FOUND','Order not found');if(!canOrder_(u,c))fail_('PERMISSION_DENIED','Order outside assigned scope');return c;}
function task_(id,u){const t=rows_('04_EVIDENCE_TRACKER').find(x=>x.id===id);if(!t||!canTask_(u,t))fail_('PERMISSION_DENIED','Task outside assigned scope');return t;}
function document_(id,u){const d=rows_('06_DOCUMENT_REGISTER').find(x=>x.id===id);if(!d)fail_('FILE_NOT_FOUND','Document not found');
 if(u.role==='SUPPLIER_USER'){const t=rows_('04_EVIDENCE_TRACKER').find(x=>x.id===d.task_id);if(!t||!canTask_(u,t)||d.supplier_id!==u.supplier_id)fail_('PERMISSION_DENIED','Document outside supplier scope');}
 else order_(d.case_id,u);return d;
}
function requireWrite_(u){if(u.role==='VIEWER')fail_('PERMISSION_DENIED','Read-only user');}
function manageUser(input){const actor=requireRole_(['ADMIN']);return lock_(()=>{
 const email=String(input.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!ROLES_.includes(input.role))fail_('INVALID_INPUT','Invalid email or role');
 if(!['YES','NO'].includes(input.active))fail_('INVALID_INPUT','Invalid active state');
 if(input.role==='SUPPLIER_USER'&&!rows_('14_SUPPLIERS').some(s=>s.id===input.supplier_id&&s.active==='YES'))fail_('INVALID_INPUT','Active supplier required');
 const ids=Array.isArray(input.assigned_orders)?input.assigned_orders:[];if(ids.some(id=>!rows_('01_SO_MASTER').some(c=>c.id===id)))fail_('ORDER_NOT_FOUND','Assignment order missing');
 if(email===actor.email&&(input.active!=='YES'||input.role!=='ADMIN'))fail_('PERMISSION_DENIED','Admin cannot remove own access');
 const old=rows_('05_OWNER_MASTER').find(x=>x.email===email),value={email,name:text_(input.name,200),department:text_(input.department,200),role:input.role,active:input.active,supplier_id:input.role==='SUPPLIER_USER'?input.supplier_id:'',assigned_orders:JSON.stringify(ids)};
 if(old)patch_('05_OWNER_MASTER',email,value);else add_('05_OWNER_MASTER',{...value,created_at:now_(),created_by:actor.email});
 audit_('USER_SAVED','','',old?JSON.stringify(old):'',JSON.stringify(value),actor.email);return {email};
 });}
function manageSupplier(input){const u=requireRole_(['ADMIN']);return lock_(()=>{const id=input.id||stable_('supplier:'+text_(input.name,200).toLowerCase());
 const value={id,name:text_(input.name,200),email:text_(input.email||'',200),active:input.active||'YES'};if(!value.name||!['YES','NO'].includes(value.active))fail_('INVALID_INPUT','Invalid supplier');
 const old=rows_('14_SUPPLIERS').find(s=>s.id===id);if(old)patch_('14_SUPPLIERS',id,value);else add_('14_SUPPLIERS',{...value,created_at:now_(),created_by:u.email});audit_('SUPPLIER_SAVED','',id,old?JSON.stringify(old):'',JSON.stringify(value),u.email);return value;});}
function saveSettings(input){const u=requireRole_(['ADMIN']);const allowed=['RULES_CONFIRMED','LEGAL_RULE_VERSION','ANNEX_I_VERSION','COUNTRY_RISK_VERSION','LAST_LEGAL_REVIEW_DATE','LEGAL_REVIEWED_BY','LEGAL_REVIEW_MAX_DAYS','GEO_MIN_DECIMALS','GEO_POLYGON_THRESHOLD_HA'];return lock_(()=>{
 Object.keys(input).forEach(k=>{if(!allowed.includes(k))fail_('PERMISSION_DENIED','Setting not writable');});
 if(input.LAST_LEGAL_REVIEW_DATE)isoDate_(input.LAST_LEGAL_REVIEW_DATE);if(input.LEGAL_REVIEW_MAX_DAYS&&(!Number.isFinite(Number(input.LEGAL_REVIEW_MAX_DAYS))||Number(input.LEGAL_REVIEW_MAX_DAYS)<=0))fail_('INVALID_INPUT','Review interval must be positive');
 if(input.RULES_CONFIRMED&&!['YES','NO'].includes(input.RULES_CONFIRMED))fail_('INVALID_INPUT','Invalid rules confirmation');
 if(input.GEO_MIN_DECIMALS&&(!Number.isInteger(Number(input.GEO_MIN_DECIMALS))||Number(input.GEO_MIN_DECIMALS)<6||Number(input.GEO_MIN_DECIMALS)>12))fail_('INVALID_INPUT','Precision must be 6–12 decimals');
 if(input.GEO_POLYGON_THRESHOLD_HA&&Number(input.GEO_POLYGON_THRESHOLD_HA)!==4)fail_('INVALID_INPUT','Change threshold through reviewed legal migration');
 Object.keys(input).forEach(k=>{const value=text_(input[k],500);if(rows_('09_CONFIG').some(r=>r.key===k))patch_('09_CONFIG',k,{value});else add_('09_CONFIG',{key:k,value});});audit_('SETTINGS_UPDATED','','','',JSON.stringify(input),u.email);return true;
 });}
function legalState_(){const date=config_('LAST_LEGAL_REVIEW_DATE'),days=Number(config_('LEGAL_REVIEW_MAX_DAYS')||90),validDate=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date));return {regulation:config_('LEGAL_RULE_VERSION'),annex:config_('ANNEX_I_VERSION'),countryRisk:config_('COUNTRY_RISK_VERSION'),checkedDate:date,reviewedBy:config_('LEGAL_REVIEWED_BY'),reviewDue:!validDate||!config_('LEGAL_REVIEWED_BY')||!Number.isFinite(days)||days<=0||Date.now()-Date.parse(date)>days*86400000||[config_('LEGAL_RULE_VERSION'),config_('ANNEX_I_VERSION'),config_('COUNTRY_RISK_VERSION')].some(v=>!v||v==='NOT_REVIEWED')};}

function recordLogin(){const u=user_();return lock_(()=>{patch_('05_OWNER_MASTER',u.email,{last_login:now_()});audit_('USER_SIGNED_IN','','','','',u.email);return true;});}
