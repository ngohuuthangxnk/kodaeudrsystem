// Personal pilot only. The caller is the Netlify server; never expose BRIDGE_SECRET in HTML.
var BRIDGE_ACTOR = '';
var BRIDGE_ACTIONS = {
  bootstrap: bootstrap,
  createCase: createCase,
  addMaterial: addMaterial,
  updateTask: updateTask,
  uploadEvidence: uploadEvidence,
  getDocument: getDocument,
  registerOutput: registerOutput,
  completeCase: completeCase,
  syncCalendar: syncCalendar,
  getAiPrompt: getAiPrompt
};

function bridgeHex_(bytes) {
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function bridgeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var difference = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

function doPost(e) {
  var response;
  try {
    var content = e && e.postData && e.postData.contents;
    if (!content || content.length > 4400000) throw Error('Invalid request size');
    var envelope = JSON.parse(content);
    var payload = envelope.payload;
    var secret = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET');
    if (!secret || secret.length < 32 || typeof payload !== 'string' || payload.length > 4300000) throw Error('Bridge unavailable');
    var expected = bridgeHex_(Utilities.computeHmacSha256Signature(payload, secret));
    if (!bridgeEqual_(expected, envelope.signature)) throw Error('Access denied');
    var request = JSON.parse(payload);
    if (!request || !Number.isSafeInteger(request.ts) || Math.abs(Date.now() - request.ts) > 300000) throw Error('Request expired');
    if (!/^[a-f0-9-]{36}$/.test(request.nonce || '')) throw Error('Invalid request ID');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.actor || '')) throw Error('Invalid actor');
    if (!Object.prototype.hasOwnProperty.call(BRIDGE_ACTIONS, request.action) || !Array.isArray(request.args)) throw Error('Unknown action');
    var cache = CacheService.getScriptCache();
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (cache.get('bridge_' + request.nonce)) throw Error('Request already used');
      cache.put('bridge_' + request.nonce, '1', 360);
    } finally { lock.releaseLock(); }
    // The signed actor must still be ACTIVE in the Sheet on every request.
    BRIDGE_ACTOR = request.actor.toLowerCase();
    try { response = {ok: true, result: BRIDGE_ACTIONS[request.action].apply(null, request.args)}; }
    finally { BRIDGE_ACTOR = ''; }
  } catch (error) {
    BRIDGE_ACTOR = '';
    response = {ok: false, error: String(error && error.message || error)};
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
