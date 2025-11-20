// worker_main.js - single clean Cloudflare Worker implementation
//
// Idempotency / reference_tx_id
// -----------------------------
// This worker supports idempotent charge/deduction requests by accepting an
// optional `referenceTxId` (or `reference_tx_id`) value in POST bodies sent to
// `/api/charge`. If provided, the worker will attempt a best-effort check for
// an existing transaction row with the same `reference_tx_id` and return that
// existing transaction instead of creating a new one. This prevents duplicate
// deductions when the client retries the same request.
//
// Notes:
// - The worker will try to add the `reference_tx_id` column to the `transactions`
//   table at runtime if it doesn't exist (best-effort, non-fatal).
// - For production, prefer running the idempotency migration located at
//   `migrations/20251120_add_reference_tx_id.sql` to make schema changes explicit.
// - The server should forward client idempotency keys (Idempotency-Key or
//   x-reference-tx-id) to the worker as `referenceTxId` in the /api/charge body.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// --- Password hashing helpers (Argon2 placeholder + PBKDF2 fallback) -------
function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// Try to use a Worker-compatible argon2 implementation if available (e.g. globalThis.argon2).
// Otherwise fall back to PBKDF2-HMAC-SHA256 (not Argon2 but provides a working default).
async function hashPassword(password) {
  if (!password) return null;
  // Lazy-load a local argon2 adapter if available (bundle it into your Worker build):
  if (!globalThis.argon2) {
    try {
      // dynamic import; bundlers will inline this if configured
      const mod = await import('./worker_argon2.mjs');
      if (mod && (mod.default || mod.argon2)) {
        globalThis.argon2 = mod.default || mod.argon2;
      }
    } catch (e) {
      // ignore — fallback will be used
    }
  }
  if (globalThis.argon2 && typeof globalThis.argon2.hash === 'function') {
    return await globalThis.argon2.hash(password);
  }
  // Fallback PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMaterial, 256);
  const derivedHex = toHex(derivedBits);
  const saltHex = toHex(salt);
  return `pbkdf2$${saltHex}$${derivedHex}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!password) return false;
  // If argon2 verify available
  if (!globalThis.argon2) {
    try {
      const mod = await import('./worker_argon2.mjs');
      if (mod && (mod.default || mod.argon2)) globalThis.argon2 = mod.default || mod.argon2;
    } catch (e) {
      // ignore
    }
  }
  if (globalThis.argon2 && typeof globalThis.argon2.verify === 'function') {
    try { return await globalThis.argon2.verify(storedHash, password); } catch (e) { return false; }
  }
  // pbkdf2$<saltHex>$<derivedHex>
  if (String(storedHash).startsWith('pbkdf2$')) {
    try {
      const parts = String(storedHash).split('$');
      const saltHex = parts[1];
      const derivedHex = parts[2];
      const salt = fromHex(saltHex);
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
      const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMaterial, 256);
      const candidateHex = toHex(derivedBits);
      return candidateHex === derivedHex;
    } catch (e) { return false; }
  }
  // Unknown format: fallback to direct comparison (not recommended)
  return String(password) === String(storedHash);
}


// --- Projekt-APIs ------------------------------------------------------
// POST /api/projects/save
async function handleProjectSave(env, request, user_id) {
  const body = await request.json().catch(() => ({}));
  const id = body.id || null;
  const name = body.name || body.project_name || body.title || 'Untitled';
  const content_json = body.content_json || body.content || (body.project ? JSON.stringify(body.project) : '{}');
  // Accept plaintext password in `password` field; if present, hash it server-side
  const plaintextPassword = body.password || body.key || null;
  const is_protected_flag = body.is_protected ? 1 : 0;

  try {
    let protection_hash = null;
    if (plaintextPassword) {
      protection_hash = await hashPassword(plaintextPassword);
    } else if (body.protection_hash) {
      protection_hash = body.protection_hash;
    }

    const updated_at = new Date().toISOString();

    if (id) {
      // Update existing project (ensure ownership)
      const exists = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ? LIMIT 1').bind(id, user_id).first();
      if (!exists || !exists.id) return jsonResponse({ ok: false, error: 'Projekt nicht gefunden oder Zugriff verweigert.' }, 404);
      const query = 'UPDATE projects SET name = ?, content_json = ?, protection_hash = ?, is_protected = ?, updated_at = ? WHERE id = ? AND user_id = ?';
      await env.DB.prepare(query).bind(name, content_json, protection_hash, is_protected_flag, updated_at, id, user_id).run();
      return jsonResponse({ ok: true, id });
    }

    // Create new project. By default we create a UUID id, but if the client
    // requests SQL autoincrement IDs (use_autoincrement=true) we insert
    // without id and then read last_insert_rowid().
    if (body.use_autoincrement) {
      const insertSql = `INSERT INTO projects (user_id, name, content_json, protection_hash, is_protected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      await env.DB.prepare(insertSql).bind(user_id, name, content_json, protection_hash, is_protected_flag, updated_at, updated_at).run();
      // Retrieve last_insert_rowid()
      try {
        const r = await env.DB.prepare('SELECT last_insert_rowid() as id').all();
        const idRow = r && r.results && r.results[0] ? r.results[0] : null;
        const newIdNum = idRow && idRow.id ? idRow.id : null;
        return jsonResponse({ ok: true, id: newIdNum });
      } catch (e) {
        // Fallback to returning success without id
        return jsonResponse({ ok: true, id: null });
      }
    }

    // default: create with UUID id
    const new_id = crypto.randomUUID();
    const insertSql = `INSERT INTO projects (id, user_id, name, content_json, protection_hash, is_protected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await env.DB.prepare(insertSql).bind(new_id, user_id, name, content_json, protection_hash, is_protected_flag, updated_at, updated_at).run();
    return jsonResponse({ ok: true, id: new_id });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'DB Fehler beim Speichern des Projekts', details: err && err.message ? err.message : String(err) }, 500);
  }
}

// GET /api/projects/list
async function handleProjectList(env, request, user_id) {
  try {
    const rows = await env.DB.prepare('SELECT id, name, is_protected, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200').bind(user_id).all();
    const results = rows && rows.results ? rows.results : [];
    return jsonResponse({ ok: true, projects: results });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'DB Fehler beim Auflisten der Projekte', details: err && err.message ? err.message : String(err) }, 500);
  }
}

// GET /api/projects/:id
async function handleProjectLoad(env, request, user_id, project_id) {
  const url = new URL(request.url);
  const provided_password = url.searchParams.get('key') || request.headers.get('x-project-password') || request.headers.get('x-project-key') || null;

  try {
    const project = await env.DB.prepare('SELECT id, name, content_json, protection_hash, is_protected FROM projects WHERE id = ? AND user_id = ? LIMIT 1').bind(project_id, user_id).first();
    if (!project || !project.id) {
      return jsonResponse({ ok: false, error: 'Projekt nicht gefunden oder Zugriff verweigert.' }, 404);
    }

    if (Number(project.is_protected) === 1) {
      if (!provided_password) {
        return jsonResponse({ ok: false, error: 'Zugriff verweigert. Dieses Projekt ist passwortgeschützt.' }, 403);
      }
      const ok = await verifyPassword(provided_password, project.protection_hash);
      if (!ok) return jsonResponse({ ok: false, error: 'Zugriff verweigert. Ungültiger Schlüssel.' }, 403);
    }

    return jsonResponse({ ok: true, content: project.content_json, name: project.name, is_protected: Number(project.is_protected) === 1 ? 1 : 0 });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'DB Fehler beim Laden des Projekts', details: err && err.message ? err.message : String(err) }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const pathname = url.pathname;

    if (pathname === '/api/db/test' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare("SELECT 'Datenbank ist erreichbar' as status").all();
        return jsonResponse({ ok: true, message: 'DB Verbindung erfolgreich.', status: results && results[0] ? results[0].status : null });
      } catch (err) { return jsonResponse({ ok: false, error: 'DB Verbindung fehlgeschlagen', details: err && err.message ? err.message : String(err) }, 500); }
    }

    if (pathname === '/api/tts/generate' && request.method === 'POST') {
      return await handleTtsRequest(request, env);
    }

    if (pathname === '/api/stripe/webhook' && request.method === 'POST') {
      return await handleStripeWebhook(request, env);
    }

    if (pathname === '/api/db/user' && request.method === 'GET') {
      // Return current user's kontingent balances (requires Authorization Bearer token)
      const uid = await getUserId(request, env);
      if (!uid) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      try {
        const row = await env.DB.prepare('SELECT id, kontingent_basis_tts, kontingent_premium_tts FROM users WHERE id = ? LIMIT 1').bind(uid).first();
        return jsonResponse({ ok: true, user: row || { id: uid, kontingent_basis_tts: 0, kontingent_premium_tts: 0 } });
      } catch (err) { return jsonResponse({ ok: false, error: 'DB error', details: err && err.message ? err.message : String(err) }, 500); }
    }

    // Project endpoints
    // POST /api/projects/save  -> save or update project
    if (pathname === '/api/projects/save' && request.method === 'POST') {
      const user_id = await getUserId(request, env);
      if (!user_id) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      return await handleProjectSave(env, request, user_id);
    }

    // GET /api/projects/list -> list user's projects
    if (pathname === '/api/projects/list' && request.method === 'GET') {
      const user_id = await getUserId(request, env);
      if (!user_id) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      return await handleProjectList(env, request, user_id);
    }

    // GET /api/projects/:id -> load full project content (may be protected)
    const m = pathname.match(/^\/api\/projects\/([^\/]+)(?:$|\/)/);
    if (m && request.method === 'GET') {
      const project_id = m[1];
      const user_id = await getUserId(request, env);
      if (!user_id) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      return await handleProjectLoad(env, request, user_id, project_id);
    }

    // Proxy merge endpoint: accepts { segments: [{text, voiceId}], merge: true, provider }
    if (pathname === '/api/tts/merge' && request.method === 'POST') {
      const user_id = await getUserId(request, env);
      if (!user_id) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
      const body = await request.json().catch(() => ({}));
      const provider = (body.provider || 'polly').toLowerCase();
      const segments = Array.isArray(body.segments) ? body.segments : [];
      const merge = !!body.merge;
      if (!segments || segments.length === 0) return jsonResponse({ ok: false, error: 'segments required' }, 400);

      if (provider !== 'polly') return jsonResponse({ ok: false, error: 'Only polly merge supported' }, 501);
      if (!env.POLLY_FIREBASE_URL) return jsonResponse({ ok: false, error: 'POLLY_FIREBASE_URL not configured' }, 500);

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (env.POLLY_FIREBASE_TOKEN) headers['x-worker-auth'] = env.POLLY_FIREBASE_TOKEN;
        // Pass segments and merge flag to Firebase function
        let resp;
        try {
          resp = await fetch(env.POLLY_FIREBASE_URL, { method: 'POST', headers, body: JSON.stringify({ segments, merge: merge }) });
        } catch (fetchErr) {
          console.error('Merge handler: fetch to POLLY_FIREBASE_URL failed', fetchErr && fetchErr.stack ? fetchErr.stack : fetchErr);
          await refundKontingent(env, user_id, 0, 'basis');
          return jsonResponse({ ok: false, error: 'Firebase fetch failed', details: fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr) }, 500);
        }
        if (!resp.ok) {
          let text = '';
          try { text = await resp.text(); } catch (tErr) { text = `failed to read body: ${tErr && tErr.message ? tErr.message : String(tErr)}`; }
          console.error('Merge handler: Firebase proxy returned non-ok', { status: resp.status, bodySnippet: text.slice ? text.slice(0,2000) : String(text) });
          return jsonResponse({ ok: false, error: 'Firebase proxy error', details: { status: resp.status, body: text } }, 500);
        }
        try {
          const arrayBuffer = await resp.arrayBuffer();
          return new Response(arrayBuffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders } });
        } catch (bufferErr) {
          console.error('Merge handler: failed to read arrayBuffer from firebase response', bufferErr && bufferErr.stack ? bufferErr.stack : bufferErr);
          return jsonResponse({ ok: false, error: 'Failed to read audio response', details: bufferErr && bufferErr.message ? bufferErr.message : String(bufferErr) }, 500);
        }
      } catch (err) {
        console.error('Merge handler: unexpected error', err && err.stack ? err.stack : err);
        return jsonResponse({ ok: false, error: 'Proxy merge failed', details: err && err.message ? err.message : String(err) }, 500);
      }
    }

    // Charge endpoint: accept POST { userId, charCount, isPremium }
    if (pathname === '/api/charge' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const userId = body.userId || body.user_id || body.id || null;
        const charCount = Number(body.charCount || body.chars || body.amount || 0);
        const isPremium = !!body.isPremium;
        const referenceTxId = body.referenceTxId || body.reference_tx_id || null;
        if (!userId || !charCount) return jsonResponse({ ok: false, error: 'missing parameters' }, 400);
        const type = isPremium ? 'premium' : 'basis';
        const amount = Math.max(0, Math.floor(charCount));
        const debit = await checkAndDeductKontingent(env, userId, amount, type, referenceTxId);
        if (debit && debit.ok) return jsonResponse({ ok: true, remaining: undefined, deductionId: debit.deductionId, existing: !!debit.existing });
        if (debit && debit.error && debit.error.toLowerCase && debit.error.toLowerCase().includes('insufficient')) return jsonResponse({ ok: false, reason: 'insufficient_credits', details: debit }, 402);
        return jsonResponse({ ok: false, reason: 'charge_failed', details: debit }, 500);
      } catch (e) {
        return jsonResponse({ ok: false, error: String(e) }, 500);
      }
    }

    // Auth validation endpoint (test only)
    if (pathname === '/api/auth/validate' && request.method === 'GET'){
      const auth = request.headers.get('Authorization') || '';
      let token = null;
      if (auth.toLowerCase().startsWith('bearer ')) token = auth.slice(7).trim();
      if (!token) token = url.searchParams.get('token') || null;
      if (!token) return jsonResponse({ ok:false, error: 'missing token' }, 400);
      const user = await getUserIdByToken(token, env);
      if (!user) return jsonResponse({ ok:false, error: 'invalid token' }, 401);
      return jsonResponse({ ok:true, user });
    }

    return new Response('Not found', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
  }
};

async function getUserId(request, env) {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  // Debug: log presence of Authorization header (mask token for safety)
  if (!auth || !auth.startsWith('Bearer ')) {
    console.log('getUserId: no Bearer auth header');
    return null;
  }
  const token = auth.slice(7).trim();
  if (!token) {
    console.log('getUserId: bearer token empty after trim');
    return null;
  }
  try {
    const mask = (t) => (typeof t === 'string' && t.length > 8) ? `${t.slice(0,3)}...${t.slice(-3)}` : '***';
    console.log('getUserId: received Bearer token (masked):', mask(token));
    const row = await env.DB.prepare('SELECT id FROM users WHERE api_token = ? LIMIT 1').bind(token).first();
    if (row && row.id) {
      console.log('getUserId: token matched user id=', row.id);
      return row.id;
    }
    console.log('getUserId: token not found in users table');
    return null;
  } catch (e) {
    console.error('getUserId: DB query failed', e && e.message ? e.message : String(e));
    return null;
  }
}

// Validate a token against the `users` table and return normalized user info.
// Returns null when token invalid. Used by `/api/auth/validate`.
async function getUserIdByToken(token, env){
  if(!token) return null;
  try{
    // detect token column presence
    let hasTokenCol = false;
    try{
      const cols = await env.DB.prepare("PRAGMA table_info(users)").all();
      if(cols && cols.results){ hasTokenCol = cols.results.some(c => c.name === 'token'); }
    }catch(e){ /* ignore */ }

    const selectCols = ['id','api_token','kontingent_basis_tts','quota','quota_used','quota_reset_at'].join(',');
    const whereClause = hasTokenCol ? '(token = ? OR api_token = ?)' : '(api_token = ?)';
    const sql = `SELECT ${selectCols} FROM users WHERE ${whereClause} LIMIT 1`;
    const bindParams = hasTokenCol ? [token, token] : [token];
    const resp = await env.DB.prepare(sql).bind(...bindParams).all();
    const row = (resp && resp.results && resp.results[0]) ? resp.results[0] : null;
    if(!row) return null;
    if((row.quota === null || row.quota === undefined) && row.kontingent_basis_tts !== undefined){ row.quota = row.kontingent_basis_tts; }

    if(row.quota_reset_at){ const now = new Date().toISOString(); if(row.quota_reset_at <= now && (row.quota_used || 0) > 0){
      try{ await env.DB.prepare(`UPDATE users SET quota_used = 0 WHERE id = ?`).bind(row.id).run(); row.quota_used = 0; }catch(e){}
    }}

    return { id: row.id, quota: row.quota || null, quota_used: row.quota_used || 0, quota_reset_at: row.quota_reset_at || null };
  }catch(err){ return null; }
}

async function deductCredits(env, user_id, amount) {
  if (amount <= 0) return { ok: true };
  try {
    const r = await env.DB.prepare('SELECT current_balance FROM accounts WHERE user_id = ?').bind(user_id).first();
    const bal = r && r.current_balance ? Number(r.current_balance) : 0;
    if (bal < amount) return { ok: false, error: 'Insufficient balance' };
    await env.DB.prepare('UPDATE accounts SET current_balance = current_balance - ? WHERE user_id = ?').bind(amount, user_id).run();
    // Log deduction in transactions and return inserted transaction id
    const insertSql = 'INSERT INTO transactions (user_id, type, amount, status) VALUES (?, "DEDUCTION", ?, "SUCCESS")';
    await env.DB.prepare(insertSql).bind(user_id, amount).run();
    // retrieve last inserted deduction for audit
    const row = await env.DB.prepare('SELECT id FROM transactions WHERE user_id = ? AND type = "DEDUCTION" ORDER BY created_at DESC LIMIT 1').bind(user_id).first();
    const deductionId = row && row.id ? row.id : null;
    return { ok: true, deductionId };
  } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) }; }
  
}

// Deduct from user's kontingent fields depending on type ('basis'|'premium')
async function checkAndDeductKontingent(env, user_id, amount, type = 'basis') {
  if (amount <= 0) return { ok: true };
  // support optional idempotency reference
  let referenceTxId = null;
  if (arguments.length >= 5) referenceTxId = arguments[4] || null;
  try {
    const field = (String(type).toLowerCase() === 'premium') ? 'kontingent_premium_tts' : 'kontingent_basis_tts';
    // ensure reference column present (best-effort)
    try{ await ensureReferenceTxColumn(env); }catch(e){}

    // If a referenceTxId is provided, check for an existing transaction to make this idempotent
    if(referenceTxId){
      try{
        const existing = await env.DB.prepare('SELECT id, user_id, type, amount, status, reference_tx_id FROM transactions WHERE reference_tx_id = ? LIMIT 1').bind(referenceTxId).first();
        if(existing && existing.id){
          return { ok:true, existing: true, deductionId: existing.id };
        }
      }catch(e){ /* ignore and continue */ }
    }
    const row = await env.DB.prepare(`SELECT ${field} AS val FROM users WHERE id = ? LIMIT 1`).bind(user_id).first();
    const bal = row && row.val ? Number(row.val) : 0;
    console.log(`checkAndDeductKontingent: user_id=${user_id} field=${field} current_value=${bal} needed=${amount}`);
    if (bal < amount) return { ok: false, error: 'Insufficient kontingent', balance: bal };
    await env.DB.prepare(`UPDATE users SET ${field} = COALESCE(${field},0) - ? WHERE id = ?`).bind(amount, user_id).run();
    try {
      const afterRow = await env.DB.prepare(`SELECT ${field} AS val FROM users WHERE id = ? LIMIT 1`).bind(user_id).first();
      const afterBal = afterRow && afterRow.val ? Number(afterRow.val) : 0;
      console.log(`checkAndDeductKontingent: after deduction user_id=${user_id} ${field}=${afterBal}`);
    } catch (innerErr) {
      console.error('checkAndDeductKontingent: failed to read after-update balance', innerErr && innerErr.stack ? innerErr.stack : innerErr);
    }
    const txType = (String(type).toLowerCase() === 'premium') ? 'DEDUCTION_PREMIUM' : 'DEDUCTION_BASIS';
    // Insert transaction; include reference_tx_id when available
    try{
      if(referenceTxId){
        const insertSql = 'INSERT INTO transactions (user_id, type, amount, status, reference_tx_id) VALUES (?, ?, ?, "SUCCESS", ?)';
        await env.DB.prepare(insertSql).bind(user_id, txType, amount, referenceTxId).run();
      }else{
        const insertSql = 'INSERT INTO transactions (user_id, type, amount, status) VALUES (?, ?, ?, "SUCCESS")';
        await env.DB.prepare(insertSql).bind(user_id, txType, amount).run();
      }
    }catch(e){
      // If insertion fails because column missing, try fallback insert without reference
      try{ const insertSql = 'INSERT INTO transactions (user_id, type, amount, status) VALUES (?, ?, ?, "SUCCESS")'; await env.DB.prepare(insertSql).bind(user_id, txType, amount).run(); }catch(e2){}
    }
    const row2 = await env.DB.prepare('SELECT id FROM transactions WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1').bind(user_id, txType).first();
    const deductionId = row2 && row2.id ? row2.id : null;
    return { ok: true, deductionId };
  } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) }; }
}

// Refund to user's kontingent fields
async function refundKontingent(env, user_id, amount, type = 'basis') {
  if (!user_id || amount <= 0) return { ok: false };
  try {
    const field = (String(type).toLowerCase() === 'premium') ? 'kontingent_premium_tts' : 'kontingent_basis_tts';
    await env.DB.prepare(`UPDATE users SET ${field} = COALESCE(${field},0) + ? WHERE id = ?`).bind(amount, user_id).run();
    await env.DB.prepare('INSERT INTO transactions (user_id, type, amount, status) VALUES (?, ?, ?, "SUCCESS")').bind(user_id, 'REFUND', amount).run();
    const row = await env.DB.prepare('SELECT id FROM transactions WHERE user_id = ? AND type = "REFUND" ORDER BY created_at DESC LIMIT 1').bind(user_id).first();
    const refundId = row && row.id ? row.id : null;
    return { ok: true, refundId };
  } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) }; }
}

// Ensure the `reference_tx_id` column exists on the `transactions` table.
// This is a best-effort helper; failures are non-fatal and will not block deductions.
async function ensureReferenceTxColumn(env){
  try{
    const info = await env.DB.prepare("SELECT name FROM pragma_table_info('transactions') WHERE name = 'reference_tx_id'").all();
    const exists = info && info.results && info.results[0];
    if(!exists){
      await env.DB.prepare("ALTER TABLE transactions ADD COLUMN reference_tx_id TEXT").run();
    }
  }catch(e){
    // ignore errors — this helper is best-effort
  }
}

async function creditRefund(env, user_id, amount) {
  if (!user_id || amount <= 0) return false;
  try {
    await env.DB.prepare('UPDATE accounts SET current_balance = current_balance + ? WHERE user_id = ?').bind(amount, user_id).run();
    const insertSql = 'INSERT INTO transactions (user_id, type, amount, status) VALUES (?, "REFUND", ?, "SUCCESS")';
    await env.DB.prepare(insertSql).bind(user_id, amount).run();
    // retrieve last inserted refund for audit
    const row = await env.DB.prepare('SELECT id FROM transactions WHERE user_id = ? AND type = "REFUND" ORDER BY created_at DESC LIMIT 1').bind(user_id).first();
    const refundId = row && row.id ? row.id : null;
    return { ok: true, refundId };
  } catch (err) { return false; }
}

async function handleTtsRequest(request, env) {
  const user_id = await getUserId(request, env);
  if (!user_id) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const provider = (body.provider || 'openai').toLowerCase();
  const text_to_speak = body.text || '';
  const voice_id = body.voiceId || body.voice || null;
  const voice_type = (body.voice_type || body.voiceType || 'basis').toLowerCase();
  if (!text_to_speak || !voice_id) return jsonResponse({ ok: false, error: 'text and voiceId required' }, 400);

  const cost_in_credits = Math.max(1, Math.ceil(text_to_speak.length / 10));
  console.log('handleTtsRequest: user_id=', user_id, 'provider=', provider, 'voice_id=', voice_id, 'voice_type=', voice_type, 'text_len=', text_to_speak.length, 'cost=', cost_in_credits);
  const deduct = await checkAndDeductKontingent(env, user_id, cost_in_credits, voice_type);
  console.log('handleTtsRequest: deduct result=', JSON.stringify(deduct));
  if (!deduct || !deduct.ok) {
    console.warn('handleTtsRequest: insufficient credits or deduction failed', deduct && deduct.error ? deduct.error : 'unknown');
    return jsonResponse({ ok: false, error: deduct && deduct.error ? deduct.error : 'Insufficient credits', balance: deduct && deduct.balance ? deduct.balance : undefined }, 402);
  }

  try {
    if (provider === 'polly' || provider === 'aws') {
      if (!env.POLLY_FIREBASE_URL) { await refundKontingent(env, user_id, cost_in_credits, voice_type); return jsonResponse({ ok: false, error: 'POLLY_FIREBASE_URL Secret fehlt.' }, 500); }
      const headers = { 'Content-Type': 'application/json' };
      if (env.POLLY_FIREBASE_TOKEN) headers['x-worker-auth'] = env.POLLY_FIREBASE_TOKEN;
      const resp = await fetch(env.POLLY_FIREBASE_URL, { method: 'POST', headers, body: JSON.stringify({ text: text_to_speak, voiceId: voice_id, voice_type }) });
      if (!resp.ok) { await refundKontingent(env, user_id, cost_in_credits, voice_type); return jsonResponse({ ok: false, error: `Firebase Polly Fehler: ${resp.status}` }, 500); }
      const arrayBuffer = await resp.arrayBuffer();
      return new Response(arrayBuffer, { status: 200, headers: { 'Content-Type': 'audio/mpeg', ...corsHeaders } });
    }

    // For now, unsupported providers are rejected
    await refundKontingent(env, user_id, cost_in_credits, voice_type);
    return jsonResponse({ ok: false, error: 'Unsupported TTS provider' }, 400);
  } catch (err) { await refundKontingent(env, user_id, cost_in_credits); return jsonResponse({ ok: false, error: 'TTS failed', details: err && err.message ? err.message : String(err) }, 500); }
}

// --- Sicherer Stripe Webhook Handler ---
async function verifyStripeSignature(payloadText, stripeSigHeader, secret, toleranceSecs = 300) {
  if (!stripeSigHeader || !secret) return false;
  // parse header e.g. "t=1609459200,v1=abcdef...,v0=..."
  // Be robust: handle extra spaces and multiple v1 entries.
  const parts = stripeSigHeader.split(',').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      // accumulate multiple values (e.g. multiple v1)
      if (!acc[k]) acc[k] = [];
      acc[k].push(v);
    }
    return acc;
  }, {});
  const t = parts.t && parts.t[0];
  const v1s = parts.v1 || [];
  if (!t || v1s.length === 0) return false;

  const signedPayload = `${t}.${payloadText}`;

  // compute HMAC SHA256(signedPayload, secret)
  try {
    const enc = new TextEncoder();
    const keyData = enc.encode(secret);
    const msgData = enc.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const sigArray = Array.from(new Uint8Array(sigBuf));
    const computedHex = sigArray.map(b => b.toString(16).padStart(2,'0')).join('');

    // compare against any v1 signature in header (case-insensitive)
    const cmp = computedHex.toLowerCase();
    const matched = v1s.some(s => s.toLowerCase() === cmp);
    if (!matched) return false;

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(t, 10);
    if (isNaN(ts) || Math.abs(now - ts) > toleranceSecs) return false;

    return true;
  } catch (e) {
    console.error('Error verifying stripe signature:', e);
    return false;
  }
}

async function handleStripeWebhook(request, env) {
  const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET fehlt. Webhook unsicher.');
  }

  // Read raw body text for signature verification
  const payloadText = await request.text();
  const sigHeader = request.headers.get('stripe-signature') || request.headers.get('Stripe-Signature') || '';

  // Debug logs: headers and payload summary (avoid leaking full secrets)
  try {
    const shortSig = sigHeader ? sigHeader.slice(0, 64) : '(none)';
    console.log('Stripe webhook incoming - sig present:', !!sigHeader, 'sigPrefix:', shortSig);
    const contentType = request.headers.get('content-type') || request.headers.get('Content-Type') || '';
    console.log('Content-Type:', contentType, 'Payload length:', payloadText ? payloadText.length : 0);
    // log a truncated payload (first 2000 chars) for debugging
    if (payloadText && payloadText.length > 0) console.log('Payload (truncated):', payloadText.slice(0, 2000));
  } catch (e) {
    console.warn('Failed to log incoming webhook headers/payload:', e);
  }

  if (STRIPE_WEBHOOK_SECRET) {
    let ok = false;
    try { ok = await verifyStripeSignature(payloadText, sigHeader, STRIPE_WEBHOOK_SECRET); } catch (e) { ok = false; }
    if (!ok) {
      console.error('Stripe webhook signature verification failed.');
      return new Response('Invalid signature', { status: 400 });
    }
  } else {
    console.warn('Stripe webhook secret not set — skipping signature verification.');
  }

  let event;
  try { event = JSON.parse(payloadText); } catch (err) { console.error('Invalid JSON payload', err); return new Response('Bad Request', { status: 400 }); }
  // Log basic event metadata for debugging
  try {
    console.log('Stripe event parsed - id:', event && event.id ? event.id : '(no-id)', 'type:', event && event.type ? event.type : '(no-type)');
    const cust = event?.data?.object?.customer || event?.data?.object?.customer_id || null;
    console.log('Stripe event customer:', cust);
  } catch (e) { console.warn('Error logging event metadata', e); }

  const stripeEventId = event.id;
  if (!stripeEventId) return new Response('No event id', { status: 400 });

  // Only handle checkout.session.completed per security requirement
  if (event.type !== 'checkout.session.completed') {
    console.log('Ignoring non-checkout event:', event.type);
    return new Response('Ignored', { status: 200 });
  }

  try {
    // Idempotency check — ensure transactions table has stripe_event_id column (migration required)
    const existing = await env.DB.prepare('SELECT id FROM transactions WHERE stripe_event_id = ? LIMIT 1').bind(stripeEventId).first();
    if (existing && existing.id) {
      console.log(`Stripe event ${stripeEventId} already processed (tx ${existing.id}). Ignoring.`);
      return new Response('OK', { status: 200 });
    }
  } catch (err) {
    console.warn('Idempotency check failed (continuing):', err);
  }

  const stripeCustomerId = event.data && event.data.object && event.data.object.customer ? event.data.object.customer : null;
  if (!stripeCustomerId) { console.error('Stripe event missing customer id.'); return new Response('Bad Request', { status: 400 }); }

  const userRow = await env.DB.prepare('SELECT id FROM users WHERE stripe_customer_id = ? LIMIT 1').bind(stripeCustomerId).first();
  const user_id = userRow && userRow.id ? userRow.id : null;
  if (!user_id) { console.error(`User for Stripe customer ${stripeCustomerId} not found.`); return new Response('User not found', { status: 404 }); }

  // Price mapping from env
  const priceMap = {
    [env.PRICE_ID_3_20_CHF || '']: Number(env.PRICEMAP_3_20_CREDITS || 10000)
  };
  let creditsToChange = 0;
  try {
    // Idempotency check — ensure we only apply an event once
    try {
      const existing = await env.DB.prepare('SELECT id FROM transactions WHERE stripe_event_id = ? LIMIT 1').bind(stripeEventId).first();
      if (existing && existing.id) {
        console.log(`Stripe event ${stripeEventId} already processed (tx ${existing.id}). Ignoring.`);
        return new Response('OK', { status: 200 });
      }
    } catch (e) {
      console.warn('Idempotency check failed, continuing:', e);
    }

    // Extract metadata from the checkout.session.completed object
    const metadata = event.data && event.data.object && event.data.object.metadata ? event.data.object.metadata : {};
    const user_id_meta = metadata.user_id || metadata.userId || metadata.customer_user_id || null;
    const char_quantity_meta = metadata.char_quantity || metadata.charQuantity || metadata.chars || null;
    const char_type_meta = metadata.char_type || metadata.charType || metadata.type || null;

    if (!user_id_meta || !char_quantity_meta || !char_type_meta) {
      console.error('Missing required metadata on checkout.session.completed:', { user_id_meta, char_quantity_meta, char_type_meta });
      return new Response('Bad Request - missing metadata', { status: 400 });
    }

    const user_id = Number(user_id_meta);
    const charQuantity = Number(char_quantity_meta);
    const charType = String(char_type_meta).toLowerCase();

    if (!user_id || !Number.isFinite(charQuantity) || charQuantity <= 0) {
      console.error('Invalid metadata values:', { user_id, charQuantity, charType });
      return new Response('Bad Request - invalid metadata', { status: 400 });
    }

    // Verify user exists
    const userRow = await env.DB.prepare('SELECT id FROM users WHERE id = ? LIMIT 1').bind(user_id).first();
    if (!userRow || !userRow.id) {
      console.error(`User id ${user_id} not found.`);
      return new Response('User not found', { status: 404 });
    }

    // Apply credit to the correct kontingent field on users table
    if (charType === 'basis' || charType.toLowerCase() === 'basis') {
      await env.DB.prepare('UPDATE users SET kontingent_basis_tts = COALESCE(kontingent_basis_tts, 0) + ? WHERE id = ?').bind(charQuantity, user_id).run();
      await env.DB.prepare('INSERT INTO transactions (user_id, type, amount, status, stripe_event_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(user_id, 'PURCHASE_BASIS', charQuantity, 'SUCCESS', stripeEventId).run();
      console.log(`Credited BASIS ${charQuantity} chars to user ${user_id}`);
    } else if (charType === 'premium' || charType.toLowerCase() === 'premium') {
      await env.DB.prepare('UPDATE users SET kontingent_premium_tts = COALESCE(kontingent_premium_tts, 0) + ? WHERE id = ?').bind(charQuantity, user_id).run();
      await env.DB.prepare('INSERT INTO transactions (user_id, type, amount, status, stripe_event_id, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').bind(user_id, 'PURCHASE_PREMIUM', charQuantity, 'SUCCESS', stripeEventId).run();
      console.log(`Credited PREMIUM ${charQuantity} chars to user ${user_id}`);
    } else {
      console.error('Unknown char_type in metadata:', charType);
      return new Response('Bad Request - unknown char_type', { status: 400 });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }

}

