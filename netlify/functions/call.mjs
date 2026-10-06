import {createHmac, createHash, randomUUID, timingSafeEqual} from 'node:crypto';

const reply = (statusCode, value) => ({statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}, body:JSON.stringify(value)});
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const allowed = new Set(['bootstrap','createCase','addMaterial','updateTask','uploadEvidence','getDocument','registerOutput','completeCase','syncCalendar','getAiPrompt']);

export async function handler(event) {
  if (event.httpMethod !== 'POST') return reply(405,{error:'POST required'});
  const token = process.env.PILOT_ADMIN_TOKEN || '';
  const secret = process.env.BRIDGE_SECRET || '';
  const actor = (process.env.PILOT_ADMIN_EMAIL || '').trim().toLowerCase();
  const url = process.env.APPS_SCRIPT_WEBAPP_URL || '';
  if (token.length < 32 || secret.length < 32 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor) || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))
    return reply(503,{error:'Pilot bridge is not configured'});
  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authorization.startsWith('Bearer ') || !equal(authorization.slice(7), token)) return reply(401,{error:'Access denied'});
  if (!event.body || event.body.length > 4400000 || event.isBase64Encoded) return reply(413,{error:'Request too large'});
  let body;
  try { body = JSON.parse(event.body); } catch { return reply(400,{error:'Invalid JSON'}); }
  if (!body || !allowed.has(body.action) || !Array.isArray(body.args) || body.args.length > 3) return reply(400,{error:'Unknown action'});
  const payload = JSON.stringify({ts:Date.now(),nonce:randomUUID(),actor,action:body.action,args:body.args});
  const signature = createHmac('sha256',secret).update(payload).digest('hex');
  try {
    const upstream = await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'follow',signal:AbortSignal.timeout(25000)});
    if (!upstream.ok) return reply(502,{error:'Apps Script returned HTTP '+upstream.status});
    const raw = await upstream.text();
    if (raw.length > 5500000) return reply(413,{error:'Document exceeds pilot download limit (3 MB)'});
    let result;
    try { result = JSON.parse(raw); } catch { return reply(502,{error:'Apps Script returned a non-JSON page. Check deployment access and URL.'}); }
    return reply(result.ok ? 200 : 400, result.ok ? {result:result.result} : {error:result.error || 'Apps Script error'});
  } catch (error) {
    console.error('Bridge request failed:',error);
    return reply(502,{error:'Cannot reach Apps Script. Check deployment and Netlify function logs.'});
  }
}
