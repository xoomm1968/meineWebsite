D1 / Cloudflare Worker — DB Setup für HHHoerbuch

Diese Anleitung hilft dir, die D1-Datenbank (Cloudflare) einzurichten, das Schema einzuspielen und Beispiel-Daten zu laden.

Vorbedingungen
- Cloudflare-Account mit Workers-Zugang
- D1 ist in deinem Account aktiviert
- `wrangler` ist installiert (optional, für CLI)

Dateien
- `workers/schema_full.sql` — vollständiges Schema (Tabellen, Indexes, View)
- `workers/init_sample_data.sql` — Beispiel-Daten zum Testen

Option A — Dashboard (empfohlen, visuell)
1. Gehe zu Cloudflare Dashboard → Workers & D1 → D1 Databases.
2. Erstelle oder wähle eine D1-DB aus.
3. Öffne die SQL-Konsole ("Run SQL") und kopiere den Inhalt von `workers/schema_full.sql` hinein. Führe das Script aus.
4. Anschließend kopiere `workers/init_sample_data.sql` und führe es aus, um Beispiel-Daten einzufügen.
5. Prüfe die Daten mit: SELECT * FROM marketplace_items LIMIT 10;

Option B — Wrangler CLI (sofern verfügbar)
1. Melde dich an: `wrangler login`
2. Falls noch nicht vorhanden, erstelle eine D1 DB:
   - `wrangler d1 create HHB_D1_DB`
3. Wende das Schema an (wrangler-Versionabhängig):
   - `wrangler d1 apply HHB_D1_DB --file workers/schema_full.sql`
   - Falls `apply` nicht verfügbar, öffne Dashboard und führe die SQL aus dort.
4. Lade die Seed-Daten:
   - `wrangler d1 execute HHB_D1_DB --file workers/init_sample_data.sql`
   (CLI-Befehle können je nach wrangler-Version variieren; falls ein Befehl fehlt, nutze Dashboard SQL-Runner.)

Worker Secrets
- Lege dein ElevenLabs-API-Key als Worker-Secret an, damit die Preview-Route funktioniert:
  - `wrangler secret put ELEVENLABS_API_KEY`
  - oder: im Dashboard → Worker → Settings → Variables & Secrets

Testing
- Nach Deployment des Workers (z. B. `wrangler publish`) teste die Endpunkte:
  - `GET https://<your-worker>.workers.dev/api/marketplace/voices?provider=elevenlabs`
  - `GET https://<your-worker>.workers.dev/api/marketplace/preview?provider=elevenlabs&voiceId=eleven_demo_voice_1&text=Hallo%20Welt`

- Beispiel: Stimmenliste sollte die `market_demo_1` und `market_demo_2` Einträge zurückgeben.

Frontend
- Sobald du die Worker-URL hast, kannst du `HHHoerbuch Prox20 Kkopie.html` so anpassen, dass API-Aufrufe an diese URL gehen. Ich kann das für dich patchen, wenn du möchtest.

Support
- Wenn du mir deine Worker-URL gibst, kann ich:
  - die Frontend-Base-URL automatisch setzen,
  - einen Test-Request ausführen (falls public reachable),
  - oder Beispiel-Antworten erzeugen.
