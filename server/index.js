require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { GoogleAuth } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 6789;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Optional API token middleware: if APP_API_TOKEN is set, require header x-api-token
function requireApiToken(req, res, next){
  const required = !!process.env.APP_API_TOKEN;
  if(!required) return next();
  const token = req.headers['x-api-token'] || req.query.api_token;
  if(!token || token !== process.env.APP_API_TOKEN){
    return res.status(401).json({ ok:false, error: 'missing or invalid api token' });
  }
  return next();
}

// apply to all /api routes
app.use('/api', requireApiToken);

// Simple API token middleware: if APP_API_TOKEN is set, require header x-api-token
function requireApiToken(req, res, next){
  const token = process.env.APP_API_TOKEN;
  if(!token) return next(); // not configured
  const provided = req.headers['x-api-token'] || req.query.api_token;
  if(!provided || provided !== token) return res.status(401).json({ ok:false, error: 'missing or invalid api token' });
  next();
}

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: Date.now(), env: process.env.NODE_ENV || 'dev' });
});

// Simple marketplace stub (kept for backward compatibility)
const SAMPLE_MARKETPLACE = [
  { id: 'voice-alloy-pro', type: 'voice', title: 'Alloy Pro', author: 'Studio AI', price: 0, desc: 'Neutral, klar — ideal für Erzähler.' },
  { id: 'voice-fable-warm', type: 'voice', title: 'Fable Warm', author: 'VoiceLab', price: 2.99, desc: 'Warm & expressiv - Paid sample included.' },
  { id: 'template-dark-fantasy', type: 'template', title: 'Dark Fantasy Template', author: 'TemplateStore', price: 0, desc: 'Scene templates for dark fantasy audiobooks.' }
];
app.get('/api/marketplace', (req, res) => {
  res.json({ ok: true, items: SAMPLE_MARKETPLACE });
});

// Provider adapters
const { listVoicesElevenLabs, previewVoiceElevenLabs } = require('./adapters/elevenlabs');

// simple in-memory cache for provider lists
const providerCache = new Map(); // key -> { ts, data }
function cacheSet(key, data, ttl = 1000 * 60 * 60){
  providerCache.set(key, { ts: Date.now(), data, ttl });
}
function cacheGet(key){
  const v = providerCache.get(key);
  if(!v) return null;
  if(Date.now() - v.ts > v.ttl){ providerCache.delete(key); return null; }
  return v.data;
}

// Jobs stub
let JOBS = {};
app.post('/api/jobs', (req, res) => {
  const id = 'job-' + Math.random().toString(36).slice(2,9);
  JOBS[id] = { id, status: 'queued', created: Date.now() };
  res.json({ ok: true, id });
});
app.get('/api/jobs/:id', (req, res) => {
  const job = JOBS[req.params.id];
  if(!job) return res.status(404).json({ ok:false, error: 'not found' });
  res.json({ ok:true, job });
});

// TTS proxy: forward requests to provider (OpenAI or ElevenLabs) and return a data-url base64 audio
// --- Cost constants (per character) ---
// Basis: EK per 10,000 Zeichen = $0.16 -> per char = 0.000016
// Premium: EK per 10,000 Zeichen = $2.40 -> per char = 0.000240
const COST_PER_CHAR = {
  BASIS: 0.000016,
  PREMIUM: 0.000240
};

async function forwardToOpenAI(text, voice, options = {}){
  const key = process.env.OPENAI_API_KEY;
  if(!key) throw new Error('OPENAI_API_KEY not configured');
  const endpoint = 'https://api.openai.com/v1/audio/speech';
  const body = { model: options.model || 'gpt-4o-mini-tts', voice: voice || 'alloy', input: text };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const txt = await resp.text();
    throw new Error(`OpenAI TTS error ${resp.status}: ${txt}`);
  }
  const buffer = await resp.buffer();
  const ct = resp.headers.get('content-type') || 'audio/mpeg';
  return `data:${ct};base64,${buffer.toString('base64')}`;
}

// --- Charge integration: call the Worker /api/charge to deduct user kontingent before calling provider ---
async function performChargeIfNeeded(payload, req){
  // payload may contain userId or token or charCount override
  const workerBase = process.env.WORKER_URL;
  if(!workerBase){
    // Worker URL not configured; fail-fast to avoid accidental free usage
    throw new Error('WORKER_URL not configured; cannot perform charge');
  }

  // resolve userId: prefer explicit userId, otherwise use token via worker /api/auth/validate
  let userId = payload.userId || payload.user_id || null;
  if(!userId && payload.token){
    const authUrl = `${workerBase.replace(/\/$/, '')}/api/auth/validate`;
    // Forward Authorization header if present on incoming request, otherwise send Bearer <token>
    const authHeaders = { 'Accept': 'application/json' };
    if(req && req.headers && req.headers['authorization']){
      authHeaders['Authorization'] = req.headers['authorization'];
    }else{
      authHeaders['Authorization'] = 'Bearer ' + String(payload.token);
    }
    const r = await fetch(authUrl, { method: 'GET', headers: authHeaders });
    if(!r.ok) throw new Error('failed to validate token with auth worker');
    const j = await r.json();
    if(!j.ok || !j.user || !j.user.id) throw new Error('invalid token');
    userId = j.user.id;
  }

  if(!userId){
    throw new Error('missing userId or token to resolve user');
  }

  // charCount: allow override via payload.charCount, otherwise measure script length
  const charCount = Number(payload.charCount || (payload.script || payload.text || '').length || 0);
  const isPremium = !!(payload.isPremium || payload.api === 'elevenlabs');

  // call worker /api/charge
  const chargeUrl = `${workerBase.replace(/\/$/, '')}/api/charge`;
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if(process.env.APP_API_TOKEN) headers['x-api-token'] = process.env.APP_API_TOKEN;
  // Forward incoming Authorization header if present so the worker can validate the user/token
  if(req && req.headers && req.headers['authorization']){
    headers['Authorization'] = req.headers['authorization'];
  }
  const referenceTxId = payload.referenceTxId || payload.reference_tx_id || null;
  const resp = await fetch(chargeUrl, { method: 'POST', headers, body: JSON.stringify({ userId, charCount, isPremium, referenceTxId }) });
  const body = await resp.json().catch(()=>null);
  return { status: resp.status, body };
}

async function forwardToElevenLabs(text, voice, options = {}){
  const key = process.env.ELEVENLABS_API_KEY;
  if(!key) throw new Error('ELEVENLABS_API_KEY not configured');
  const v = encodeURIComponent(voice || 'alloy');
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${v}`;
  const body = { text };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const txt = await resp.text();
    throw new Error(`ElevenLabs TTS error ${resp.status}: ${txt}`);
  }
  const buffer = await resp.buffer();
  const ct = resp.headers.get('content-type') || 'audio/mpeg';
  return `data:${ct};base64,${buffer.toString('base64')}`;
}

// Helper: forward to Google Cloud TTS using service account credentials
async function forwardToGoogleTTS(text, voice, options = {}){
  // Require explicit credentials: either GOOGLE_APPLICATION_CREDENTIALS (path) or GOOGLE_CREDENTIALS (JSON)
  if(!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CREDENTIALS){
    // Throw a specific message that the route handler can map to a 400 response
    throw new Error('MISSING_GOOGLE_CREDS: Google credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS env variable.');
  }

  // Use GoogleAuth to obtain an access token via GOOGLE_APPLICATION_CREDENTIALS
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;
  if(!accessToken) throw new Error('failed to obtain google access token');

  const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
  // voice: Google expects languageCode and name; allow voice to be a name or fallback to language
  const voiceName = typeof voice === 'string' && voice.includes('-') ? voice : (options.languageCode || 'de-DE');
  const body = {
    input: { text },
    voice: { languageCode: options.languageCode || 'de-DE', name: voiceName },
    audioConfig: { audioEncoding: options.audioEncoding || 'MP3' }
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if(!resp.ok){
    const txt = await resp.text();
    throw new Error(`Google TTS error ${resp.status}: ${txt}`);
  }
  const j = await resp.json();
  if(!j || !j.audioContent) throw new Error('no audioContent in Google TTS response');
  // audioContent is base64 already
  const mime = (body.audioConfig && body.audioConfig.audioEncoding === 'MP3') ? 'audio/mpeg' : 'audio/wav';
  return `data:${mime};base64,${j.audioContent}`;
}

app.post('/api/tts-proxy', async (req, res) => {
  try{
    const payload = req.body || {};
    const api = (payload.api || payload.provider || 'mock').toLowerCase();
    const script = payload.script || payload.text || payload.prompt || '';
    const voice = payload.voice || (Array.isArray(payload.speakers) && payload.speakers[0] && payload.speakers[0].voice) || 'alloy';

    // Prefer forwarding the incoming Authorization header to the worker; do not mutate payload here.

    // perform charge (if configured) before calling provider
    if(api !== 'mock'){
        // perform charge (may forward Authorization header to worker)
      try{
          // Accept Idempotency header from client and attach to payload so worker can do idempotent deductions.
          const refHeader = req.headers['idempotency-key'] || req.headers['x-reference-tx-id'] || req.headers['x-idempotency-key'];
          if(refHeader && !payload.referenceTxId && !payload.reference_tx_id) payload.referenceTxId = refHeader;

          const charge = await performChargeIfNeeded(payload);
        // charge.body contains { ok:true } or { ok:false }
        if(!charge || !charge.body){
          return res.status(502).json({ ok:false, error:'charge call failed' });
        }
        if(!charge.body.ok){
          // insufficient funds -> 402 Payment Required
          if(charge.body.reason === 'insufficient_credits'){
            const msg = "Sie haben Ihr Premium-Anforderungsguthaben überschritten. Wir haben Sie automatisch zu GPT-4.1 gewechselt, das in Ihrem Plan enthalten ist. Weitere Informationen finden Sie in Ihrem Abrechnungspanel oder kontaktieren Sie Support.";
            return res.status(402).json({ ok:false, error: 'insufficient_credits', message: msg, details: charge.body });
          }
          return res.status(402).json({ ok:false, error: 'charge_failed', details: charge.body });
        }
        // else proceed
      }catch(e){
        console.warn('charge check failed', e.message || e);
        return res.status(500).json({ ok:false, error: 'charge_check_error', details: String(e) });
      }
    }

    let dataUrl;
    if(api === 'openai'){
      dataUrl = await forwardToOpenAI(script, voice, payload);
    }else if(api === 'elevenlabs' || api === 'eleven'){
      dataUrl = await forwardToElevenLabs(script, voice, payload);
    }else if(api === 'google' || api === 'gcp' || api === 'google-tts'){
      dataUrl = await forwardToGoogleTTS(script, voice, payload);
    }else if(api === 'mock'){
      const id = 'audio-' + Math.random().toString(36).slice(2,9);
      dataUrl = 'data:audio/wav;base64,' + Buffer.from('RIFF....').toString('base64');
      return res.json({ ok: true, id, forwardedTo: 'mock', dataUrl });
    }else{
      return res.status(400).json({ ok:false, error: 'unsupported provider: ' + api });
    }

    const id = 'audio-' + Math.random().toString(36).slice(2,9);
    res.json({ ok:true, id, forwardedTo: api, dataUrl });
  }catch(e){
    console.error('tts-proxy forward error', e);
    // Map missing-google-creds to a 400 Bad Request so callers know to configure env
    const msg = String(e.message || e || '');
    if(msg.startsWith('MISSING_GOOGLE_CREDS')){
      return res.status(400).json({ ok:false, error: msg.replace(/^MISSING_GOOGLE_CREDS:\s*/,'') });
    }
    return res.status(500).json({ ok:false, error: String(e) });
  }
});

// Voices listing endpoint (normalized). Example: /api/marketplace/voices?provider=elevenlabs
app.get('/api/marketplace/voices', requireApiToken, async (req, res) => {
  const provider = (req.query.provider || '').toLowerCase();
  try{
    if(provider === 'elevenlabs'){
      const cacheKey = 'elevenlabs:voices';
      const cached = cacheGet(cacheKey);
      if(cached) return res.json({ ok:true, items: cached, cached: true });
      const key = process.env.ELEVENLABS_API_KEY;
      if(!key) return res.status(400).json({ ok:false, error:'ELEVENLABS_API_KEY not configured on server' });
      const items = await listVoicesElevenLabs(key);
      cacheSet(cacheKey, items, 1000 * 60 * 60); // 1h cache
      return res.json({ ok:true, items });
    }
    return res.status(400).json({ ok:false, error:'unsupported provider or missing provider param' });
  }catch(e){
    console.error('marketplace voices error', e);
    res.status(500).json({ ok:false, error: String(e) });
  }
});

// Preview route: returns base64 data-url audio for short preview
app.get('/api/marketplace/preview', requireApiToken, async (req, res) => {
  const provider = (req.query.provider || '').toLowerCase();
  const voiceId = req.query.voiceId;
  const text = req.query.text || req.query.q || 'Dies ist eine kurze Vorschau.';
  try{
    if(provider === 'elevenlabs'){
      const key = process.env.ELEVENLABS_API_KEY;
      if(!key) return res.status(400).json({ ok:false, error:'ELEVENLABS_API_KEY not configured on server' });
      // voiceId may come like 'elevenlabs:abcd' — normalize
      const normalized = voiceId && voiceId.startsWith('elevenlabs:') ? voiceId.split(':')[1] : voiceId;
      const dataUrl = await previewVoiceElevenLabs(key, normalized, text);
      return res.json({ ok:true, dataUrl });
    }
    return res.status(400).json({ ok:false, error:'unsupported provider' });
  }catch(e){
    console.error('marketplace preview error', e);
    res.status(500).json({ ok:false, error: String(e) });
  }
});

app.listen(PORT, ()=>{
  console.log(`HHB backend scaffold listening on http://localhost:${PORT}`);
});
