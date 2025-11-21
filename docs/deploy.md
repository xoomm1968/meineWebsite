# Deployment & Exposing the Backend (Quick Guide)

This guide covers three common flows to expose and run the `server/` scaffold for development and production.

1) Local dev & Cloudflare Tunnel (quick external testing)

- Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
- Start your server locally (in project root):

```bash
cd server
npm install
npm start
```

- Create a tunnel to expose local port 6789:

```bash
cloudflared tunnel --url http://localhost:6789
```

- The command prints a public URL (https://xxxxx.trycloudflare.com). Use that as the backend base URL for remote testing.

Notes: cloudflared is meant for testing and demos. For production, use a proper hosting target.

2) Deploy to Cloud Run (recommended for serverful Node apps)

- Create a Dockerfile or use the Node runtime. Example simple Dockerfile:

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node","index.js"]
```

- Build & deploy to Cloud Run (gcloud):

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT/hhb-backend
gcloud run deploy hhb-backend --image gcr.io/YOUR_PROJECT/hhb-backend --platform managed --allow-unauthenticated --region=YOUR_REGION --set-env-vars="APP_API_TOKEN=your_secret,OPENAI_API_KEY=..."
```

- Protect endpoints with `APP_API_TOKEN` and send `x-api-token` header from the frontend.

3) Render / Fly / DigitalOcean App

- All support Node.js deployments with env var secrets. Set `APP_API_TOKEN` and provider keys in the platform's secret settings.

Security & Production Checklist
- Never commit `.env` with real keys. Use secret stores.
- Add rate-limiting and request logging.
- For TTS providers, prefer server-to-server streaming or pre-signed uploads to object store for large audio.
- Use TLS and restrict CORS to your frontend origin.

Next steps
- Add CI/CD pipeline to build and deploy container.
- Implement persistent storage for marketplace items and job queue (Postgres + Redis recommended).
- Replace in-memory JOBS with a proper queue.
