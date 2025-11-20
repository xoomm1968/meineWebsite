Deployment checklist — Hörbuch Generator

Ziel: Worker → Firebase Function → AWS Polly (TTS)

Schritte (lokal, auf deinem Rechner):

1) Firebase Cloud Function: AWS-Zugangsdaten setzen
- Möglichkeit A (functions.config):
  firebase functions:config:set aws.access_key_id="AKIA..." aws.secret_access_key="..." aws.region="eu-central-1"
  firebase deploy --only functions

- Möglichkeit B (Console / env): setze `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` in der Cloud Functions Umgebungsvariablen.

2) Optional: Schütze die Function mit einem Token
- Setze Token in Firebase:
  firebase functions:config:set polly.token="meinGeheimesToken"
  firebase deploy --only functions

3) Worker: Secrets in Cloudflare setzen
- POLLY_FIREBASE_URL (Pflicht):
  npx wrangler secret put POLLY_FIREBASE_URL --env production
  # Wert: https://us-central1-polly-stimme-hoerbuch-elite.cloudfunctions.net/synthesize

- POLLY_FIREBASE_TOKEN (optional, wenn du Token gesetzt hast):
  npx wrangler secret put POLLY_FIREBASE_TOKEN --env production
  # Gib das gleiche Token wie in step 2.

- Weitere Secrets (falls gebraucht): OPENAI_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY, AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (nur wenn du direkt in Worker nutzen willst)

4) Worker deployen
- Publish:
  npx wrangler publish --env production

5) Testen (End-to-end)
- Beispiel-cURL (ersetze Werte):
  curl -X POST "https://<DEIN_WORKER_URL>/api/tts/generate" \
    -H "Authorization: Bearer <USER_API_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"provider":"polly","voiceId":"Vicki","text":"Hallo, das ist ein Test."}' \
    --output sample.mp3

- Play (macOS):
  open sample.mp3

Fehlerbehebung
- 401 von Firebase: Token nicht gesetzt oder falscher Header; prüfe `POLLY_FIREBASE_TOKEN` in Cloudflare und `polly.token` in functions.config.
- 500 von Firebase mit AWS-Fehler: prüfe AWS Keys in functions.config oder Umgebungsvariablen.
- Worker 502 / CORS: Worker sendet CORS headers; prüfen in Browser-DevTools.

Wenn du möchtest, führe ich die verbleibenden Schritte für dich direkt in den Dateien (ich kann keine CLI-Befehle lokal ausführen):
- A) Patch Worker, um zusätzliche Logging/diagnostics einzubauen.
- B) Erzeuge Beispiel-User in D1 (SQL) mit API-Token für Tests.
- C) Bereite ein `firebase deploy`-Command-Skript vor.

Sag mir, welche der optionalen Schritte ich jetzt automatisch für dich erledigen soll.