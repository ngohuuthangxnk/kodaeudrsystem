// Advanced Calendar API; deterministic event IDs survive retries after partial failure.
function syncTaskCalendar_(t){
 if((!t.due||!t.owner)&&!t.calendar_event_id)return {status:'NOT_SCHEDULED'};
 const calendarId=PropertiesService.getScriptProperties().getProperty('CALENDAR_ID')||config_('GOOGLE_CALENDAR_ID');if(!calendarId)return {status:'CALENDAR_ACCESS_REQUIRED'};
 const c=rows_('01_SO_MASTER').find(c=>c.id===t.case_id),m=rows_('02_SO_ITEM_MATERIAL').find(m=>m.id===t.material_id);if(!c||!m)return {status:'INVALID_TASK'};
 if(!t.due||!t.owner){try{let ev;try{ev=Calendar.Events.get(calendarId,t.calendar_event_id);}catch(e){const list=Calendar.Events.list(calendarId,{iCalUID:t.calendar_event_id,maxResults:2}).items||[];if(list.length!==1)throw e;ev=list[0];}if(ev.extendedProperties?.private?.eudrTaskId!==t.id&&!String(ev.description||'').includes('Task ID: '+t.id))throw Error('Calendar event ownership mismatch');Calendar.Events.patch({summary:'[UNSCHEDULED][EUDR]['+c.so+'] '+t.evidence,transparency:'transparent',reminders:{useDefault:false,overrides:[]}},calendarId,ev.id,{sendUpdates:'none'});patch_('04_EVIDENCE_TRACKER',t.id,{calendar_sync_status:'UNSCHEDULED'});return {status:'UNSCHEDULED'};}catch(e){patch_('04_EVIDENCE_TRACKER',t.id,{calendar_sync_status:'CALENDAR_SYNC_FAILED'});return {status:'CALENDAR_SYNC_FAILED'};}}
 const eventId=t.calendar_event_id&&/^[0-9a-v]+$/.test(t.calendar_event_id)?t.calendar_event_id:stable_('eudr-task:'+t.id),end=new Date(isoDate_(t.due)+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
 const body={id:eventId,summary:(t.status==='APPROVED'?'[DONE]':'')+'[EUDR]['+c.so+']['+m.material+'] '+t.evidence,description:'Assigned To: '+t.owner+'\nTask ID: '+t.id+'\nStatus: '+t.status+'\n'+(config_('FRONTEND_URL')||'')+'/#task='+encodeURIComponent(t.id),start:{date:t.due},end:{date:end.toISOString().slice(0,10)},extendedProperties:{private:{eudrTaskId:t.id}},reminders:{useDefault:false,overrides:t.status==='APPROVED'?[]:[{method:'popup',minutes:10080},{method:'popup',minutes:4320},{method:'popup',minutes:1440}]}};
 try{
  // Lookup first. Only an actual 404 is an absent event; permission failures never create elsewhere.
  let event=null;try{event=Calendar.Events.get(calendarId,eventId);}catch(e){if(!/404|not found/i.test(String(e)))throw e;}
  if(t.calendar_event_id&&t.calendar_event_id!==eventId&&!event){
   const found=Calendar.Events.list(calendarId,{iCalUID:t.calendar_event_id,maxResults:2}).items||[];
   if(found.length>1)throw Error('Ambiguous legacy Calendar ID');if(found.length===1){event=found[0];body.id=event.id;}
  }
  if(event&&event.extendedProperties?.private?.eudrTaskId!==t.id&&!String(event.description||'').includes('Task ID: '+t.id))throw Error('Calendar event ownership mismatch');
  body.transparency='opaque';if(event)Calendar.Events.patch(body,calendarId,event.id,{sendUpdates:'none'});else Calendar.Events.insert(body,calendarId,{sendUpdates:'none'});
  patch_('04_EVIDENCE_TRACKER',t.id,{calendar_event_id:body.id,calendar_sync_status:'SYNCED'});return {status:'SYNCED',eventId:body.id};
 }catch(e){const status=/403|forbidden|permission|unauthorized|access|Calendar is not defined|not found/i.test(String(e))?'CALENDAR_ACCESS_REQUIRED':'CALENDAR_SYNC_FAILED';patch_('04_EVIDENCE_TRACKER',t.id,{calendar_sync_status:status});return {status};}
}
function syncCalendar(){const u=requireRole_(['ADMIN','MARKETING','EUDR_REVIEWER']);return lock_(()=>{const result=rows_('04_EVIDENCE_TRACKER').filter(t=>canTask_(u,t)).map(t=>({taskId:t.id,...syncTaskCalendar_(t)}));audit_('CALENDAR_SYNC','','','',JSON.stringify(result.map(r=>({taskId:r.taskId,status:r.status}))),u.email);return result;});}
