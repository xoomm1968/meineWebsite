// Worker: D1-backed billing and helper endpoints
// Cost constants (must match server pricing)
// Basis: EK per 10,000 Zeichen = $0.16 -> per char = 0.000016
// Premium: EK per 10,000 Zeichen = $2.40 -> per char = 0.000240
const COST_PER_CHAR_BASIS = 0.000016;
const COST_PER_CHAR_PREMIUM = 0.000240;
// Helper: Validiert ein API-Token gegen die `users`-Tabelle in D1
// Gibt `null` zurück, wenn das Token ungültig ist, sonst ein Objekt
// { id, quota, quota_used, quota_reset_at }
async function getUserIdByToken(token, env){
  if(!token) return null;
  try{
    // Detect available columns to avoid SQL errors on different schemas
    let hasTokenCol = false;
    try{
      const cols = await env.DB.prepare("PRAGMA table_info(users)").all();
      if(cols && cols.results){
        hasTokenCol = cols.results.some(c => c.name === 'token');
      }
    }catch(e){
      // ignore - we'll fall back to api_token
    }

    // Build SQL only with columns that are present in the DB schema
    const selectCols = ['id','api_token','kontingent_basis_tts','quota','quota_used','quota_reset_at'].join(',');
    const whereClause = hasTokenCol ? '(token = ? OR api_token = ?)' : '(api_token = ?)';
    const sql = `SELECT ${selectCols} FROM users WHERE ${whereClause} LIMIT 1`;
    const bindParams = hasTokenCol ? [token, token] : [token];
    const resp = await env.DB.prepare(sql).bind(...bindParams).all();
    const row = (resp && resp.results && resp.results[0]) ? resp.results[0] : null;
    if(!row) return null;
    // Normalize quota fields: some schemas may use `kontingent_basis_tts` instead of `quota`.
    if((row.quota === null || row.quota === undefined) && row.kontingent_basis_tts !== undefined){
      row.quota = row.kontingent_basis_tts;
    }

    // Falls ein Quota-Reset-Timestamp gesetzt ist und bereits überschritten,
    // setzen wir `quota_used` serverseitig auf 0 (einfacher Reset-Mechanismus).
    if(row.quota_reset_at){
      const now = new Date().toISOString();
      if(row.quota_reset_at <= now && (row.quota_used || 0) > 0){
        try{
          await env.DB.prepare(`UPDATE users SET quota_used = 0 WHERE id = ?`).bind(row.id).run();
          row.quota_used = 0;
        }catch(e){
          // Nicht kritisch — wir loggen nicht direkt, sondern geben trotzdem die Daten zurück
        }
      }
    }

    return {
      id: row.id,
      quota: row.quota || null,
      quota_used: row.quota_used || 0,
      quota_reset_at: row.quota_reset_at || null
    };
  }catch(err){
    return null;
  }
}

// Atomically check and deduct kontingent (credits) for a user.
// Returns { ok: true, remaining } on success, or { ok: false, reason } on failure.
// userId: user's id as stored in users.id
// charCount: number of characters to charge
// isPremium: boolean -> use premium kontingent column
async function checkAndDeductKontingent(userId, charCount, isPremium, env, referenceTxId = null){
  if(!userId) return { ok:false, reason: 'missing userId' };
  // Ensure the DB has the optional reference_tx_id column so queries below won't fail.
  try{
    await ensureReferenceTxColumn(env);
  }catch(e){
    // non-fatal: we'll continue and handle missing column errors during individual queries
  }
  const col = isPremium ? 'kontingent_premium_tts' : 'kontingent_basis_tts';
  try{
    // Idempotency: if a referenceTxId is provided and a transaction with that reference exists,
    // return the existing result without double-deducting.
    if(referenceTxId){
      try{
        const existing = await env.DB.prepare(`SELECT id, user_id, type, amount, price_usd, status, reference_tx_id FROM transactions WHERE reference_tx_id = ? LIMIT 1`).bind(referenceTxId).all();
        const er = (existing && existing.results && existing.results[0]) ? existing.results[0] : null;
        if(er){
          // fetch remaining balance to report
          const after = await env.DB.prepare(`SELECT ${col} AS credits FROM users WHERE id = ? LIMIT 1`).bind(userId).all();
          const newRow = (after && after.results && after.results[0]) ? after.results[0] : null;
          const remaining = newRow ? Number(newRow.credits || 0) : null;
          return { ok:true, existing: true, transaction: er, remaining };
        }
      }catch(e){
        // ignore and continue to normal flow
      }
    }
    // Begin transaction
    await env.DB.prepare('BEGIN').run();

    // Read current credits
    const sel = await env.DB.prepare(`SELECT ${col} AS credits FROM users WHERE id = ? LIMIT 1`).bind(userId).all();
    const row = (sel && sel.results && sel.results[0]) ? sel.results[0] : null;
    if(!row){
      await env.DB.prepare('ROLLBACK').run();
      return { ok:false, reason: 'user_not_found' };
    }
    const credits = Number(row.credits || 0);
    if(credits < charCount){
      // insufficient funds
      await env.DB.prepare('ROLLBACK').run();
      return { ok:false, reason: 'insufficient_credits', remaining: credits };
    }

    // deduct
    const upd = await env.DB.prepare(`UPDATE users SET ${col} = ${col} - ? WHERE id = ?`).bind(charCount, userId).run();

    // optionally log transaction into transactions table if exists
    try{
      const pricePerChar = isPremium ? COST_PER_CHAR_PREMIUM : COST_PER_CHAR_BASIS;
      const priceUsd = Number((charCount * pricePerChar).toFixed(6));
      const ts = new Date().toISOString();
      if(referenceTxId){
        await env.DB.prepare(`INSERT INTO transactions (user_id, type, amount, price_usd, timestamp, status, reference_tx_id) VALUES (?, 'deduct', ?, ?, ?, 'ok', ?)`).bind(userId, charCount, priceUsd, ts, referenceTxId).run();
      }else{
        await env.DB.prepare(`INSERT INTO transactions (user_id, type, amount, price_usd, timestamp, status) VALUES (?, 'deduct', ?, ?, ?, 'ok')`).bind(userId, charCount, priceUsd, ts).run();
      }
    }catch(e){
      // non-fatal: continue
    }

    // commit
    await env.DB.prepare('COMMIT').run();

    // return new remaining balance
    const after = await env.DB.prepare(`SELECT ${col} AS credits FROM users WHERE id = ? LIMIT 1`).bind(userId).all();
    const newRow = (after && after.results && after.results[0]) ? after.results[0] : null;
    const remaining = newRow ? Number(newRow.credits || 0) : null;
    return { ok:true, remaining };
  }catch(err){
    try{ await env.DB.prepare('ROLLBACK').run(); }catch(e){}
    return { ok:false, reason: 'error', error: String(err) };
  }
}

// Ensure the `reference_tx_id` column exists on the `transactions` table.
// This runs a PRAGMA check and only executes ALTER TABLE when necessary.
async function ensureReferenceTxColumn(env){
  try{
    const info = await env.DB.prepare(`SELECT name FROM pragma_table_info('transactions') WHERE name = 'reference_tx_id'`).all();
    const exists = (info && info.results && info.results[0]);
    if(!exists){
      await env.DB.prepare(`ALTER TABLE transactions ADD COLUMN reference_tx_id TEXT`).run();
    }
  }catch(e){
    // If anything goes wrong here, do not throw — make calling code robust to absent column.
  }
}

// Expose a charge endpoint so external proxies (or the server) can request a pre-check and deduct.
// POST /api/charge { userId, charCount, isPremium }
// Returns JSON { ok: true, remaining } or { ok:false, reason }
// Note: protect this endpoint via Worker binding ACLs or require API token in production.
async function handleChargeEndpoint(request, env){
  try{
    const j = await request.json();
    const userId = j.userId || j.user_id || j.id;
    const charCount = Number(j.charCount || j.chars || j.amount || 0);
    const isPremium = !!j.isPremium;
    const referenceTxId = j.referenceTxId || j.reference_tx_id || null;
    if(!userId || !charCount) return new Response(JSON.stringify({ ok:false, error:'missing parameters' }), { status:400, headers:{'Content-Type':'application/json'} });
    const result = await checkAndDeductKontingent(userId, charCount, isPremium, env, referenceTxId);
    return new Response(JSON.stringify(result), { headers:{'Content-Type':'application/json'} });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
  }
}

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

    // Simple router

    // Small helper to mask keys when returning status
    function maskKey(k){ if(!k) return null; const s = String(k); return s.length>8 ? s.slice(0,4)+"..."+s.slice(-4) : "****"; }
    try {
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

      // Expose which API keys are present (masked) so you can verify secrets in Cloudflare
      if (pathname === '/api/config/keys' && request.method === 'GET'){
        return new Response(JSON.stringify({ ok:true, keys: {
          ELEVENLABS: maskKey(KEYS.ELEVENLABS),
          OPENAI: maskKey(KEYS.OPENAI),
          POLLY: maskKey(KEYS.POLLY),
          GEMINI: maskKey(KEYS.GEMINI)
        }}), { headers: { 'Content-Type': 'application/json' } });
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

      // Charge endpoint: atomic debit of user's kontingent
      if (pathname === '/api/charge' && request.method === 'POST'){
        return await handleChargeEndpoint(request, env);
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

      // Auth validation endpoint (test only)
      if (pathname === '/api/auth/validate' && request.method === 'GET'){
        // Accept token via Authorization: Bearer <token> or ?token=...
        const auth = request.headers.get('Authorization') || '';
        let token = null;
        if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
        if (!token) token = url.searchParams.get('token') || null;

        if (!token) return new Response(JSON.stringify({ ok:false, error: 'missing token' }), { status:400, headers:{'Content-Type':'application/json'} });

        const user = await getUserIdByToken(token, env);
        if (!user) return new Response(JSON.stringify({ ok:false, error: 'invalid token' }), { status:401, headers:{'Content-Type':'application/json'} });

        // Return safe user info
        return new Response(JSON.stringify({ ok:true, user }), { headers:{'Content-Type':'application/json'} });
      }

      return new Response('Not found', { status:404 });
    } catch(err){
      return new Response(JSON.stringify({ ok:false, error: String(err) }), { status:500, headers:{'Content-Type':'application/json'} });
    }
  }
}
