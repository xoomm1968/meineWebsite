// npm install @aws-sdk/signature-v4
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";

// --- Wichtige Konfiguration (sollte aus Cloudflare Secrets/Umgebungsvariablen kommen) ---
const AWS_REGION = "eu-central-1"; // Frankfurt
const AWS_SERVICE = "polly";
// ----------------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // collect API keys from Worker env (set these as Cloudflare Worker secrets or bindings)
    const KEYS = {
      ELEVENLABS: env.ELEVENLABS_API_KEY || env.ELEVENLABS_KEY || null,
      OPENAI: env.OPENAI_API_KEY || env.OPENAI_KEY || null,
      POLLY: env.POLLY_API_KEY || env.AWS_POLLY_API_KEY || null,
      GEMINI: env.GEMINI_API_KEY || env.GOOGLE_GEMINI_API_KEY || null,
      // add additional providers here if needed
    };


    // --- CORS PATCH START ---
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // CORS Preflight Handler (OPTIONS request)
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    // --- CORS PATCH END ---

  // Small helper to mask keys when returning status
  function maskKey(k){ if(!k) return null; const s = String(k); return s.length>8 ? s.slice(0,4)+"..."+s.slice(-4) : "****"; }
      if (pathname === '/api/marketplace/voices' && request.method === 'GET') {
        // Read from D1 table 'marketplace_items'
        const sql = `SELECT id, provider, provider_id, title, description, meta, created_at FROM marketplace_items ORDER BY created_at DESC LIMIT 500`;
  const resp = await env.DB.prepare(sql).all();
        const items = (resp && resp.results) ? resp.results.map(r => ({
          id: r.id,
          provider: r.provider,
          providerId: r.provider_id,
          title: r.title,
          description: r.description,
          meta: r.meta,
          created_at: r.created_at
        })) : [];
        return new Response(JSON.stringify({ ok: true, items }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (pathname === '/api/config/keys' && request.method === 'GET'){
        return new Response(JSON.stringify({ ok:true, keys: {
          ELEVENLABS: maskKey(KEYS.ELEVENLABS),
          OPENAI: maskKey(KEYS.OPENAI),
          POLLY: maskKey(KEYS.POLLY),
          GEMINI: maskKey(KEYS.GEMINI)
        }}), { headers: { 'Content-Type': 'application/json' } });
      }

      // (debug route for secret checks removed)

      

      if (pathname === '/api/db/test' && request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare("SELECT 'Datenbank ist erreichbar' as status").all();
          return new Response(JSON.stringify({ 
            ok: true, 
            message: "DB Verbindung erfolgreich.",
            status: results && results[0] ? results[0].status : null
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });

        } catch (error) {
          return new Response(JSON.stringify({ ok: false, error: "DB Verbindung fehlgeschlagen!", details: error && error.message ? error.message : String(error) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (pathname === '/api/marketplace/preview' && request.method === 'GET') {
        const provider = (url.searchParams.get('provider') || '').toLowerCase();
        const voiceId = url.searchParams.get('voiceId');
        const text = url.searchParams.get('text') || 'Dies ist eine kurze Vorschau.';

        if (!provider || !voiceId) return new Response(JSON.stringify({ ok:false, error: 'provider and voiceId are required' }), { status: 400, headers:{'Content-Type':'application/json'} });

        if (provider === 'elevenlabs'){
          const key = env.ELEVENLABS_API_KEY;
          if(!key) return new Response(JSON.stringify({ ok:false, error: 'ElevenLabs key not configured on Worker' }), { status:400, headers:{'Content-Type':'application/json'} });
          // Normalize voiceId (strip provider: prefix if present)
          const normalized = voiceId.startsWith('elevenlabs:') ? voiceId.split(':')[1] : voiceId;
          const forwardUrl = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(normalized)}`;
          const body = JSON.stringify({ text, voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
          const r = await fetch(forwardUrl, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body });
          if(!r.ok){ const txt = await r.text(); return new Response(JSON.stringify({ ok:false, error: 'elevenlabs tts failed: '+r.status, details: txt }), { status: 502, headers:{'Content-Type':'application/json'} }); }
          const buffer = await r.arrayBuffer();
          // convert to base64
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          const b64 = btoa(binary);
          const contentType = r.headers.get('content-type') || 'audio/mpeg';
          return new Response(JSON.stringify({ ok:true, dataUrl: `data:${contentType};base64,${b64}` }), { headers:{ 'Content-Type':'application/json' } });
        }

        return new Response(JSON.stringify({ ok:false, error:'unsupported provider' }), { status:400, headers:{'Content-Type':'application/json'} });
      }

      if (pathname === '/api/marketplace/import' && request.method === 'POST'){
        const data = await request.json();
        // expected fields: id (optional), provider, provider_id, title, description, meta
        const id = data.id || ('mp_' + Math.random().toString(36).slice(2,9));
        const provider = data.provider || 'unknown';
        const provider_id = data.provider_id || null;
        const title = data.title || null;
        const description = data.description || null;
        const meta = JSON.stringify(data.meta || {});
        const created_at = new Date().toISOString();
  const sql = `INSERT INTO marketplace_items (id, provider, provider_id, title, description, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  await env.DB.prepare(sql).bind(id, provider, provider_id, title, description, meta, created_at).run();
        return new Response(JSON.stringify({ ok:true, id }), { headers:{'Content-Type':'application/json'} });
      }

      // lightweight routing to the TTS handler function
      if (request.method === 'POST' && url.pathname === '/api/tts/generate') {
        // Delegate to centralized handler
        return handleTtsRequest(request, env);
      }

      // =======================================================
      // /api/ai/process - KI-Textverarbeitung (OpenAI/Gemini)
      // =======================================================
    if (pathname === '/api/ai/process' && request.method === 'POST') {
      const { text, provider, prompt } = await request.json() || {};
      const user_id = await getUserId(request, env);

      if (!user_id) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized: Missing or invalid Authorization Bearer token.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (!text || !provider || !prompt) {
        return new Response(JSON.stringify({ ok: false, error: 'text, provider, and prompt are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const cost_in_credits = Math.ceil(text.length / 10);
      const deductionResult = await deductCredits(env, user_id, cost_in_credits);
      if (!deductionResult || !deductionResult.ok) {
        return new Response(JSON.stringify({ ok:false, error: deductionResult && deductionResult.error ? deductionResult.error : 'Nicht genügend Guthaben' }), { status: 402, headers: { 'Content-Type': 'application/json' } });
      }

      try {
        let aiResponseText = '';

        if (provider === 'gemini') {
          if (!env.GEMINI_API_KEY) {
            await creditRefund(env, user_id, cost_in_credits);
            return new Response(JSON.stringify({ ok: false, error: 'Gemini key not configured on worker' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
          }

          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `Aufgabe: ${prompt}\nZu bearbeitender Text: "${text}"` }] }],
              generationConfig: { temperature: 0.7 }
            })
          });

          const geminiData = await geminiResponse.json();
          if (!geminiResponse.ok || geminiData.error) {
            // Refund bei API-Fehler
            await creditRefund(env, user_id, cost_in_credits);
            return new Response(JSON.stringify({ 
              ok: false, 
              error: geminiData.error ? geminiData.error.message : `Gemini API Fehler: ${geminiResponse.status}`,
              refundStatus: 'Credits wurden zurückgebucht.'
            }), { status: geminiResponse.status || 500, headers: { 'Content-Type': 'application/json' } });
          }

          aiResponseText = geminiData.candidates[0].content.parts[0].text;

        } else if (provider === 'openai') {
          if (!env.OPENAI_API_KEY) {
            await creditRefund(env, user_id, cost_in_credits);
            return new Response(JSON.stringify({ ok:false, error: 'OpenAI API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
          }

          const model = env.OPENAI_MODEL || 'gpt-3.5-turbo';
          const openaiUrl = 'https://api.openai.com/v1/chat/completions';
          const payload = { model, messages: [ { role: 'system', content: prompt }, { role: 'user', content: text } ], max_tokens: Math.max(100, Math.ceil(text.length / 2)), temperature: 0.7 };

          const r = await fetch(openaiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(payload) });
          if (!r.ok) {
            await creditRefund(env, user_id, cost_in_credits);
            const details = await r.text().catch(() => 'No details');
            return new Response(JSON.stringify({ ok:false, error: `OpenAI request failed: ${r.status}`, details }), { status: r.status, headers: { 'Content-Type': 'application/json' } });
          }

          const data = await r.json().catch(() => null);
          if (data) {
            if (data.choices && data.choices[0]) {
              if (data.choices[0].message && data.choices[0].message.content) aiResponseText = data.choices[0].message.content;
              else if (data.choices[0].text) aiResponseText = data.choices[0].text;
            } else if (data.text) aiResponseText = data.text;
          }

          aiResponseText = aiResponseText || '[OpenAI] (leere Antwort)';

        } else {
          // unsupported provider -> refund and return
          await creditRefund(env, user_id, cost_in_credits);
          return new Response(JSON.stringify({ ok: false, error: 'Unsupported AI provider' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // success
        return new Response(JSON.stringify({ ok: true, processedText: aiResponseText, deductedCredits: cost_in_credits }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      } catch (error) {
        await creditRefund(env, user_id, cost_in_credits);
        return new Response(JSON.stringify({ ok: false, error: 'AI processing failed', details: error && error.message ? error.message : String(error), refundStatus: 'Credits wurden aufgrund des KI-Fehlers zurückgebucht.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

      return new Response('Not found', { status:404 });
  }
}

// Helper: deductCredits
// Attempts to decrement a user's credit balance by `amount` in the D1 `user_credits` table.
// Returns { ok:true, remaining } on success or { ok:false, error } on failure.
async function deductCredits(env, user_id, amount) {
  // Returns an object: { ok: boolean, remaining?: number, error?: string }
  try {
    const db = env.DB;

    if (!db || typeof db.prepare !== 'function') {
      const msg = 'No database binding available at env.DB';
      try { console.error(msg); } catch(e){}
      return { ok: false, error: msg };
    }

    if (amount <= 0) {
      // nothing to deduct
      return { ok: true };
    }

    // 1. Prüfen, ob der Benutzer genügend Guthaben hat (SELECT)
    const rows = await db.prepare("SELECT current_balance FROM accounts WHERE user_id = ?").bind(user_id).all();
    const results = rows && rows.results ? rows.results : rows;

    if (!results || results.length === 0) {
      // Benutzerkonto nicht gefunden
      return { ok: false, error: 'Account not found' };
    }

    const current_balance = Number(results[0].current_balance || 0);

    if (current_balance < amount) {
      // Nicht genügend Guthaben
      return { ok: false, error: 'Insufficient balance' };
    }

    // 2. Guthaben aktualisieren (UPDATE)
    const deductionResult = await db.prepare(
      "UPDATE accounts SET current_balance = current_balance - ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(amount, user_id).run();

    const changes = (deductionResult && (deductionResult.changes || deductionResult.success || 0)) || 0;
    
    if (changes > 0) {
        // 3. Audit-Log erstellen: Transaktion in die Datenbank schreiben
        await db.prepare(
            `INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'DEDUCTION', ?, 'SUCCESS')`
        ).bind(user_id, amount).run();

        return { ok: true, remaining: current_balance - amount }; // Rückgabe des neuen Saldos
    } else {
        // Sollte nie erreicht werden, wenn der Kontostand ausreicht
        return { ok: false, error: "Abzug fehlgeschlagen (Datenbank-Fehler).", remaining: current_balance };
    }

    return { ok: false, error: 'Deduction failed' };
  } catch (error) {
    // Log error to console so it appears in wrangler dev logs for easier debugging
    try { console.error('DeductCredits error:', error && error.stack ? error.stack : error); } catch(e) {}
    return { ok: false, error: 'Deduction failed: ' + (error && error.message ? error.message : String(error)) };
  }
}
// Helper: creditRefund
// Funktion zur Rückbuchung von Credits (Refund-Logik), falls die externe API fehlschlägt.
async function creditRefund(env, user_id, amount) {
  if (amount <= 0 || !user_id) return false;

  // Führen Sie den Refund in einer Transaktion durch
  const refundSuccess = await env.DB.batch([
    // 1. Guthaben aktualisieren (Addition)
    env.DB.prepare(
      `UPDATE accounts SET current_balance = current_balance + ? WHERE user_id = ?;`
    ).bind(amount, user_id),
    // 2. Transaktion für den Refund aufzeichnen
    env.DB.prepare(
      `INSERT INTO transactions (user_id, type, amount, status) VALUES (?, 'REFUND', ?, 'SUCCESS');`
    ).bind(user_id, amount)
  ]).then(() => true).catch(error => {
    try { console.error("Credit Refund failed:", error); } catch(e){}
    return false;
  });

  return refundSuccess;
}

// Helper: refundCredits
// Adds credits back to a user's account. Returns true on success.
async function refundCredits(env, user_id, amount) {
  try {
    const db = env.DB;
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('No database binding available at env.DB');
    }
    if (amount <= 0) return true;
    const result = await db.prepare(
      "UPDATE accounts SET current_balance = current_balance + ?, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?"
    ).bind(amount, user_id).run();
    const changes = (result && (result.changes || result.success || 0)) || 0;
    return changes > 0;
  } catch (err) {
    try { console.error('RefundCredits error:', err && err.stack ? err.stack : err); } catch(e) {}
    return false;
  }
}

// Helper: getUserId
// Very small auth helper: tries to read an Authorization Bearer token and map to a user in `users` table.
export async function getUserId(request, env){
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if(!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if(!token) return null;
  const row = await env.DB.prepare('SELECT id FROM users WHERE api_token = ? LIMIT 1').bind(token).first();
  return row && row.id ? row.id : null;
}

// Helper: signAWSRequest (STUB)
// Simuliert das Signieren einer AWS SigV4-Anfrage für Dienste wie Polly.
// HINWEIS: Diese Implementierung ist nur ein Platzhalter und GEEIGNET NUR FÜR TESTS/DEV.
// Für den produktiven Einsatz muss die vollständige SigV4-Logik implementiert werden.
async function signAWSRequest(requestOptions = {}, awsCredentials = {}, region = 'eu-central-1', service = 'polly') {
  // requestOptions: { method, path, headers, body }
  // awsCredentials: { accessKeyId, secretAccessKey, sessionToken }
  try {
    const now = new Date();
    // basic ISO-ish timestamp used in header (not full canonicalization)
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '') + 'Z';

    const signedHeaders = Object.assign({}, requestOptions.headers || {});
    // Add simulated SigV4 headers
    if (awsCredentials && awsCredentials.sessionToken) {
      signedHeaders['X-Amz-Security-Token'] = awsCredentials.sessionToken;
    }
    signedHeaders['X-Amz-Date'] = amzDate;
    signedHeaders['x-amz-content-sha256'] = 'UNSIGNED-PAYLOAD';

    // Simulated Authorization header (NOT a real signature)
    const fakeSignature = 'SIMULATED_SIGNATURE';
    const credDate = amzDate.slice(0,8);
    signedHeaders['Authorization'] = `AWS4-HMAC-SHA256 Credential=${awsCredentials.accessKeyId || 'AKIA...'}\/${credDate}\/${region}\/${service}\/aws4_request, SignedHeaders=host;x-amz-date, Signature=${fakeSignature}`;

    return Object.assign({}, requestOptions, { headers: signedHeaders });
  } catch (err) {
    try { console.error('signAWSRequest error', err); } catch(e){}
    return requestOptions; // fallback: return unmodified options
  }
}

// SigV4 helper using AWS SDK SignatureV4 (for Cloudflare Workers)
// Note: This helper uses env secrets passed into the calling scope.
async function signAndFetchPolly(env, text, voice = "Vicki") {
  const url = `https://polly.${AWS_REGION}.amazonaws.com/v1/speech`;

  // Read credentials from env
  const ACCESS_KEY_ID = env.AWS_ACCESS_KEY_ID;
  const SECRET_ACCESS_KEY = env.AWS_SECRET_ACCESS_KEY;
  const SESSION_TOKEN = env.AWS_SESSION_TOKEN;

  const body = {
    Text: text,
    OutputFormat: "mp3",
    VoiceId: voice,
    Engine: "standard",
  };

  const request = {
    method: "POST",
    headers: {
      'content-type': 'application/json',
      'host': `polly.${AWS_REGION}.amazonaws.com`,
    },
    url: url,
    body: JSON.stringify(body),
  };

  try {
    // Non-secret diagnostics
    try { console.log('signAndFetchPolly: starting sign', { hasAccessKey: !!ACCESS_KEY_ID, hasSessionToken: !!SESSION_TOKEN, region: AWS_REGION }); } catch(e){}

    const signer = new SignatureV4({
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
        sessionToken: SESSION_TOKEN,
      },
      service: AWS_SERVICE,
      region: AWS_REGION,
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    const response = await fetch(signedRequest.url, {
      method: signedRequest.method,
      headers: signedRequest.headers,
      body: signedRequest.body,
    });

    if (!response.ok) {
      // read body safely and return structured error (no secrets)
      const bodyText = await response.text().catch(() => null);
      return { ok: false, status: response.status, awsBody: bodyText };
    }

    const blob = await response.blob();
    return { ok: true, blob };
  } catch (err) {
    try { console.error('signAndFetchPolly exception', err && (err.stack || err)); } catch(e){}
    return { ok: false, status: null, awsBody: String(err && err.message ? err.message : err) };
  }
}

// Centralized handler for /api/tts/generate
// This extracts the previous inline logic into a single callable function.
export async function handleTtsRequest(request, env) {
  // Auth
  const user_id = await getUserId(request, env);
  if (!user_id) return new Response(JSON.stringify({ ok:false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const body = await request.json().catch(() => ({}));
  // Default to OpenAI for local/dev use instead of ElevenLabs per user request
  const provider = (body.provider || 'openai').toLowerCase();
  const text_to_speak = body.text || '';
  const voice_id = body.voiceId || body.voice || null;

  if (!text_to_speak || !voice_id) return new Response(JSON.stringify({ ok:false, error: 'text and voiceId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const cost_in_credits = text_to_speak.length;
  const deductionResult = await deductCredits(env, user_id, cost_in_credits);
  if (!deductionResult || !deductionResult.ok) return new Response(JSON.stringify({ ok:false, error: deductionResult && deductionResult.error ? deductionResult.error : 'Insufficient credits' }), { status: 402, headers: { 'Content-Type': 'application/json' } });

  // OpenAI TTS branch (default)
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) {
      await creditRefund(env, user_id, cost_in_credits);
      return new Response(JSON.stringify({ ok:false, error: 'OpenAI API key not configured for TTS' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const ttsModel = env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const openaiUrl = `https://api.openai.com/v1/audio/speech?model=${encodeURIComponent(ttsModel)}`;
    try {
      const r = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({ input: text_to_speak, voice: voice_id })
      });
      if (!r.ok) {
        const details = await r.text().catch(() => 'No details');
        await creditRefund(env, user_id, cost_in_credits);
        return new Response(JSON.stringify({ ok:false, error: `OpenAI TTS failed: ${r.status}`, details }), { status: r.status || 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(r.body, { status: 200, headers: { 'Content-Type': r.headers.get('content-type') || 'audio/mpeg' } });
    } catch (err) {
      await creditRefund(env, user_id, cost_in_credits);
      return new Response(JSON.stringify({ ok:false, error: 'OpenAI TTS error', details: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } else if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) {
      await creditRefund(env, user_id, cost_in_credits);
      return new Response(JSON.stringify({ ok:false, error: 'Gemini/Google TTS key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
    const voiceObj = { languageCode: 'de-DE' };
    if (voice_id) voiceObj.name = voice_id;
    try {
      const r = await fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { text: text_to_speak }, voice: voiceObj, audioConfig: { audioEncoding: 'MP3' } })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || !data.audioContent) {
        await creditRefund(env, user_id, cost_in_credits);
        return new Response(JSON.stringify({ ok:false, error: 'Gemini/Google TTS failed', status: r.status, details: data }), { status: r.status || 500, headers: { 'Content-Type': 'application/json' } });
      }
      const b64 = data.audioContent;
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new Response(bytes.buffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    } catch (err) {
      await creditRefund(env, user_id, cost_in_credits);
      return new Response(JSON.stringify({ ok:false, error: 'Gemini TTS error', details: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } else if (provider === 'polly' || provider === 'aws') {
    // Statt AWS Polly direkt: Weiterleitung an externen Signer-Service
      try {
      const pollyResp = await fetch('https://us-central1-polly-stimme-hoerbuch-elite.cloudfunctions.net/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text_to_speak, voiceId: voice_id })
      });
      if (!pollyResp.ok) {
        await creditRefund(env, user_id, cost_in_credits);
        const details = await pollyResp.text().catch(() => 'No details');
        return new Response(JSON.stringify({ ok:false, error: `Polly-Signer failed: ${pollyResp.status}`, details }), { status: pollyResp.status || 500, headers: { 'Content-Type': 'application/json' } });
      }
      // Der Service liefert typischerweise ein MP3-Buffer oder base64
      const contentType = pollyResp.headers.get('content-type') || 'audio/mpeg';
      return new Response(pollyResp.body, { status: 200, headers: { 'Content-Type': contentType } });
    } catch (err) {
      await creditRefund(env, user_id, cost_in_credits);
      return new Response(JSON.stringify({ ok:false, error: 'Polly-Signer error', details: err && err.message ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } else {
    await creditRefund(env, user_id, cost_in_credits);
    return new Response(JSON.stringify({ ok:false, error: 'Unsupported TTS provider' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}
