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
