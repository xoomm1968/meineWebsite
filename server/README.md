HHB Backend Scaffold

This is a minimal Node/Express scaffold to support local development for the Hörbuch Studio Pro frontend.

Features
- /api/health - health check
- /api/marketplace - sample marketplace items
- /api/tts-proxy - POST stub for TTS proxy (echoes payload; placeholder dataUrl)
- /api/jobs - simple job creation and status endpoint (in-memory)

Quickstart
1. Install dependencies

```bash
cd server
npm install
```

2. Create a `.env` from `.env.example` and fill real keys if you want to enable provider forwarding.

3. Start the server

```bash
npm start
```

4. Health check

```bash
curl http://localhost:6789/api/health
```

Expose locally for remote testing (Cloudflare Tunnel)
- Install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- Run:

```bash
cloudflared tunnel --url http://localhost:6789
```

This will give you a public URL you can share for testing.

Notes & Next Steps
- This scaffold intentionally does not forward to real provider APIs. To proxy to OpenAI/ElevenLabs, implement calls inside `/api/tts-proxy` and use environment variables for keys.
- For production deployment prefer Cloud Run / Render / Fly with secrets stored in the platform.
