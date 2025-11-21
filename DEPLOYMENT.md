# Deployment notes — Finalized E2E auth & DB robustness

Status
- Worker deployed at: `https://hoerbuch-studio-pro.xoomm290268.workers.dev`
- Latest worker build: version deployed during session (see `wrangler` output in CI logs).

What changed
- Token → userId resolution: `/api/charge` now resolves `userId` from `Authorization: Bearer <token>` when the request body omits `userId`.
- `getUserIdByToken` made schema-robust: selects only columns present in the `users` table to avoid PRAGMA/SELECT failures across schema variants.
- Transactions lookup resilient: falls back to `ORDER BY id DESC` when `created_at` is not present.
- Idempotency supported: `/api/charge` accepts `reference_tx_id` (or `referenceTxId`) and will return existing transaction when present.
- Temporary debug endpoints (used for tests) were added then removed; no debug endpoints remain in the deployed code.

Operational notes
- Database: Cloudflare D1 `db-elite-pro` (production). The worker binds as `env.DB`.
- If you change the DB schema, prefer running explicit migrations rather than relying on runtime `PRAGMA` checks.
- Secrets: verify that all required secrets exist in the Worker (`npx wrangler secret list --name hoerbuch-studio-pro`).

Rollback / Backup
- A safety backup branch was created and pushed: `backup/squash-20251121005839` (contains pre-history-rewrite state).

Next recommended steps
- Revoke the compromised Google service-account key if not already done (file `server/google-tts-key.json` contains a private key and should be removed from the repo/history and rotated).
- Verify Stripe keys and webhook secrets are set and test a real checkout flow in a non-production Stripe test mode.
- Consider running `wrangler d1` migrations to add `reference_tx_id` and `created_at` columns explicitly to `transactions`.

How to redeploy locally
1. Ensure `wrangler` is installed and you have appropriate account access.
2. Run (from repo root):
```
npx wrangler deploy worker_main.js --name hoerbuch-studio-pro
```

Contact
- For questions about these changes, review `worker_main.js` (charge logic) and the commit `fix(deploy): Finalize E2E auth flow and database query robustness`.
# Deployment-Checkliste — Hörbuch Studio Pro

Diese Datei fasst die erforderlichen Schritte zusammen, um den finalen Cloud-Worker (`worker_main.js`) in Produktion zu bringen, die Live-URL zu ermitteln und die Node.js-Proxy-Umgebung auf die korrekte Worker-URL zu konfigurieren.

Alle Befehle sind für macOS / Linux `bash`-Shells formuliert.

## 1) Voraussetzungen
- Installiere `wrangler` (Cloudflare Workers CLI) falls noch nicht geschehen:

```bash
npm install -g wrangler
# oder: corepack enable && corepack prepare yarn@stable --activate
```

- Authentifiziere `wrangler` mit deinem Cloudflare-Account:

```bash
wrangler login
```

## 2) Dateien prüfen
- Vergewissere dich, dass die finale Worker-Datei im Projekt vorliegt:

```bash
ls -la worker_main.js
# Falls die Datei an einem anderen Ort liegt: passe den Pfad entsprechend an
```

- Optional: Schnell-Sanity-Check (Syntax / simple lint):

```bash
node -c worker_main.js || true  # nodal syntax-check (falls node unterstützt)
# oder eslint, falls im Projekt konfiguriert ist
```

## 3) Worker veröffentlichen (Cloudflare Workers)
Variante A — direkt mit `wrangler` Datei veröffentlichen:

```bash
# Setze den gewünschten Worker-Namen (einzigartig in deinem Account)
WRKR_NAME="your-worker-name"

# Publish (einmalig oder bei Aktualisierungen)
wrangler publish worker_main.js --name "$WRKR_NAME"
```

Hinweis: Wenn du ein `wrangler.toml` verwendest, kann `wrangler publish` ohne Dateipfad genügen und das Deployment wird aus der Konfiguration gesteuert.

Variante B — Deployment über `wrangler.toml` (empfohlen für wiederholbare Deploys)

1. Erstelle / überprüfe `wrangler.toml` mit Account/Name/Entwicklungs-Settings.
2. Führe aus:

```bash
wrangler publish --env production
```

## 4) Worker-URL ermitteln
- Nach erfolgreichem Publish gibt `wrangler` typischerweise eine URL aus, z. B.:

```
Published your-worker-name (your-account) at https://your-worker-name.your-subdomain.workers.dev
```

- Alternativ im Cloudflare-Dashboard prüfen: `dash.cloudflare.com` → Workers → Dein Worker → Routes / Subdomain.

## 5) Proxy-Update: Umgebungsvariable `WORKER_URL`
- In deinem Node.js-Proxy / Backend musst du die Live-URL des Workers als Umgebungsvariable definieren.

Beispiel (temporär in der Shell):

```bash
export WORKER_URL="https://your-worker-name.your-subdomain.workers.dev"
# starte dann den Proxy-Prozess in derselben Shell
node server.js
```

Beispiel (.env für Deploy-System z. B. systemd, Docker, Heroku):

.env (lokal)
```
WORKER_URL=https://your-worker-name.your-subdomain.workers.dev
```

Für systemd als Unit-Environment:

```ini
[Service]
Environment=WORKER_URL=https://your-worker-name.your-subdomain.workers.dev
ExecStart=/usr/bin/node /path/to/server.js
```

Für Docker Compose `docker-compose.yml`:

```yaml
services:
  proxy:
    image: your-proxy-image
    environment:
      - WORKER_URL=https://your-worker-name.your-subdomain.workers.dev
```

## 6) Verifikation nach Deploy
1. Prüfe, ob Worker erreichbar ist (curl):

```bash
curl -I "$WORKER_URL"     # sollte HTTP 200 oder 204/302 je nach Worker-Logik zurückgeben
```

2. Lasse deinen Node-Proxy mit gesetzter `WORKER_URL` laufen und rufe eine bekannte Route auf, die über den Worker proxied.

```bash
# Beispiel: lokale Proxy-Route, die /api/tts-proxy an den Worker weiterleitet
curl -v http://localhost:3000/api/tts-proxy -d '{"test":true}' -H 'Content-Type: application/json'
```

3. Simuliere 402-Fehler und verifiziere Frontend-Handling (Smoke-Test, siehe `HHHoerbuch Prox20 Kkopie.html` Kommentar).

## 7) Sicherheits- & Produktionshinweise
- Setze sensible Werte (API-Keys, STRIPE keys etc.) als Secrets in Cloudflare oder im Deploy-System, nicht in Quellcode.
- Aktiviere CORS-Whitelisting falls nötig und sichere den Worker-Endpunkt gegen unerwünschte Loops.
- Falls du Routing/Custom Domain verwendest, konfiguriere DNS & Worker-Routes im Dashboard.

## 8) Rollback / Versionierung
- Tagge Releases im Git (z. B. `git tag v1.0.0 && git push --tags`).
- Halte einen einfachen Rollback-Plan bereit (z. B. vorherige Worker-Version erneut `wrangler publish` oder Route auf vorherige Version umstellen).

## 9) Quick-Checklist (Kurzfassung)
- [ ] `worker_main.js` vorhanden und final
- [ ] `wrangler` installiert & eingeloggt (`wrangler login`)
- [ ] `wrangler publish ...` erfolgreich ausgeführt
- [ ] Live-URL notiert (z. B. `https://your-worker-name.workers.dev`)
- [ ] `WORKER_URL` in Proxy-Umgebung gesetzt
- [ ] Proxy/Frontend gegen Live-Worker getestet (inkl. 402-Flow)

---
Wenn du möchtest, kann ich jetzt:
- die Datei `wrangler.toml` erzeugen (mit minimaler Konfiguration) und ein Beispiel `package.json`-script hinzufügen, oder
- direkt den `wrangler publish`-Befehl für dich ausführen (nur falls du mir bestätigst, dass das Konto und die CLI-Session eingerichtet sind).
