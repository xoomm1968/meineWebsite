Cloudflare Worker + D1 API for Hörbuch Studio Pro

What this does
- Implements a small Worker that exposes API endpoints and reads/writes to a D1 database binding `AUDIO_STORAGE`.
- Endpoints:
  - GET /api/marketplace/voices -> list marketplace_items rows (normalized JSON)
  - GET /api/marketplace/preview?provider=elevenlabs&voiceId=... -> calls ElevenLabs TTS and returns base64 data-url
  - POST /api/marketplace/import -> insert a marketplace item into D1

Setup & Deploy (quick)
1) Install Wrangler (Cloudflare CLI): https://developers.cloudflare.com/workers/cli-wrangler/install

2) Configure `wrangler.toml`:
   - set `account_id` and (optionally) `zone_id`.
   - configure D1 binding in Cloudflare dashboard or via wrangler for the environment pointing to the D1 database name.

3) Add secrets (ElevenLabs key) and bindings:

```bash
# login first
wrangler login
# set secret
wrangler secret put ELEVENLABS_API_KEY
# or via dashboard
```

4) Publish
```bash
wrangler publish workers/d1-api.js --name hhb-d1-api
```

Local dev
```bash
wrangler dev workers/d1-api.js
```

D1 Schema (example)
- Create a D1 database (hhb_d1) and run the SQL in `workers/schema.sql` (see file in repo).

Notes
- Ensure `ELEVENLABS_API_KEY` is set as a Worker secret to enable `preview` endpoint.
- For production, configure auth in front (JWT/API token) to protect endpoints.
