function validateGeometry_(geometry){
 if(!geometry||!['Point','Polygon'].includes(geometry.type))fail_('INVALID_GEO','Only Point or Polygon is supported in this release');
 function position(p){if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>90)fail_('INVALID_GEO','Expected [longitude, latitude] within range');}
 if(geometry.type==='Point'){position(geometry.coordinates);return geometry;}
 if(!Array.isArray(geometry.coordinates)||geometry.coordinates.length!==1)fail_('INVALID_GEO','Polygon holes require specialist review; unsupported by current validator');
 const ring=geometry.coordinates[0];if(!Array.isArray(ring)||ring.length<4||ring.length>2000)fail_('INVALID_GEO','Ring must have 4–2000 positions');ring.forEach(position);
 if(JSON.stringify(ring[0])!==JSON.stringify(ring[ring.length-1]))fail_('INVALID_GEO','Polygon must be closed');
 const unique=new Set(ring.slice(0,-1).map(p=>JSON.stringify(p)));if(unique.size!==ring.length-1)fail_('INVALID_GEO','Duplicate polygon vertex');
 let area=0;for(let i=0;i<ring.length-1;i++){area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];if(Math.abs(ring[i][0]-ring[i+1][0])>180)fail_('INVALID_GEO','Antimeridian crossing requires specialist review');}if(Math.abs(area)<1e-15)fail_('INVALID_GEO','Polygon has zero area');
 function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
 function on(a,b,c){return Math.abs(cross(a,b,c))<1e-12&&c[0]>=Math.min(a[0],b[0])-1e-12&&c[0]<=Math.max(a[0],b[0])+1e-12&&c[1]>=Math.min(a[1],b[1])-1e-12&&c[1]<=Math.max(a[1],b[1])+1e-12;}
 function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return x*y<0&&z*w<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
 const n=ring.length-1;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(j===i+1||i===0&&j===n-1)continue;if(intersects(ring[i],ring[i+1],ring[j],ring[j+1]))fail_('INVALID_GEO','Self-intersecting polygon');}
 return geometry;
}
function saveGeo(caseId,input){const u=requireRole_(['ADMIN','EUDR_REVIEWER','MARKETING','INTERNAL_USER','SUPPLIER_USER']),c=order_(caseId,u);const m=rows_('02_SO_ITEM_MATERIAL').find(m=>m.id===input.material_id&&m.case_id===caseId),node=rows_('15_SUPPLY_CHAIN').find(n=>n.id===input.chain_node_id&&n.case_id===caseId&&n.material_id===input.material_id&&n.node_type==='PLOT');
 if(!m||!node)fail_('INVALID_GEO','A plot node in the material supply chain is required');if(u.role==='SUPPLIER_USER'&&node.supplier_id!==u.supplier_id)fail_('PERMISSION_DENIED','Plot outside supplier scope');
 const plot=text_(input.plot_id,150),country=text_(input.country_of_production,100),production=text_(input.production_range||'',200),area=Number(input.area_ha);if(!plot||node.plot_id!==plot||! /^[A-Z]{2}$/.test(country)||!production||!Number.isFinite(area)||area<=0)fail_('INVALID_GEO','Plot, production country, production range and area are required');
 const source=document_(input.source_document_id,u);if(source.case_id!==caseId||source.material_id!==m.id)fail_('INVALID_GEO','Source document outside material');
 const precision=Number(input.coordinate_precision_digits);if(!Number.isInteger(precision)||precision<6||precision>12)fail_('INVALID_GEO','Declare source coordinate precision of 6–12 decimal digits; do not fabricate it');const geometry=validateGeometry_(input.geometry);if(geometry.type==='Point'&&area>Number(config_('GEO_POLYGON_THRESHOLD_HA')||4))fail_('INVALID_GEO','For wood plots above 4 ha, provide a polygon');
 return withOperation_(()=>{const id=stable_('geo:'+caseId+':'+BRIDGE_REQUEST_KEY),old=rows_('17_GEO_LOCATIONS').find(g=>g.id===id);if(rows_('17_GEO_LOCATIONS').some(g=>g.case_id===caseId&&g.material_id===m.id&&g.plot_id===plot&&g.id!==id))fail_('DUPLICATE_PLOT','Plot already registered; review existing record');
 if(!old)add_('17_GEO_LOCATIONS',{id,case_id:caseId,material_id:m.id,supplier_id:node.supplier_id,chain_node_id:node.id,plot_id:plot,country_of_production:country,production_range:production,area_ha:area,geometry_json:JSON.stringify(geometry),source_document_id:source.id,verification_status:'REVIEW_REQUIRED',notes:text_(input.notes||'',2000),coordinate_precision_digits:precision,rule_version:config_('LEGAL_RULE_VERSION')||'NOT_REVIEWED'});
 audit_('GEO_ADDED',caseId,id,'','REVIEW_REQUIRED',u.email);return {id,status:'REVIEW_REQUIRED',note:'Geometry validation does not verify legality, origin, area accuracy or deforestation status'};
 });}
function reviewGeo(id,input){const u=requireRole_(['ADMIN','EUDR_REVIEWER']);return lock_(()=>{const g=rows_('17_GEO_LOCATIONS').find(g=>g.id===id);if(!g)fail_('INVALID_GEO','Plot record missing');order_(g.case_id,u);
 if(!['VERIFIED','REJECTED','MORE_INFO_REQUIRED'].includes(input.status)||!text_(input.notes||'',2000))fail_('INVALID_INPUT','Status and review notes required');
 if(input.status==='VERIFIED'){if(legalState_().reviewDue)fail_('LEGAL_REVIEW_DUE','Review the legal baseline first');const source=document_(g.source_document_id,u);if(source.status!=='APPROVED'||source.active_version!=='YES')fail_('VERSION_CONFLICT','Plot source must be approved active evidence');validateGeometry_(JSON.parse(g.geometry_json));}
 patch_('17_GEO_LOCATIONS',id,{verification_status:input.status,reviewed_by:u.email,reviewed_at:now_(),notes:input.notes,rule_version:config_('LEGAL_RULE_VERSION')});audit_('GEO_REVIEWED',g.case_id,id,g.verification_status,input.status,u.email);return true;
 });}
function chainIssues_(materialId){const nodes=rows_('15_SUPPLY_CHAIN').filter(n=>n.material_id===materialId),plots=rows_('17_GEO_LOCATIONS').filter(g=>g.material_id===materialId),docs=rows_('06_DOCUMENT_REGISTER'),issues=[];
 if(!nodes.length)return ['UPSTREAM_CHAIN_MISSING'];
 nodes.forEach(n=>{if(n.parent_id&&!nodes.some(p=>p.id===n.parent_id))issues.push('BROKEN_PARENT:'+n.id);
 const visited=new Set();let current=n;while(current){if(visited.has(current.id)){issues.push('CHAIN_CYCLE:'+n.id);break;}visited.add(current.id);current=nodes.find(p=>p.id===current.parent_id);}
 const evidence=docs.find(d=>d.id===n.source_document_id);if(!evidence||evidence.status!=='APPROVED'||evidence.active_version!=='YES')issues.push('CHAIN_EVIDENCE_MISSING:'+n.id);
 if(!nodes.some(child=>child.parent_id===n.id)){const geo=plots.find(g=>g.chain_node_id===n.id&&g.verification_status==='VERIFIED'),source=geo&&docs.find(d=>d.id===geo.source_document_id);if(n.node_type!=='PLOT'||!geo||!source||source.active_version!=='YES'||source.status!=='APPROVED')issues.push('PLOT_OR_VERIFIED_GEO_MISSING:'+n.id);}
 });return [...new Set(issues)];}
