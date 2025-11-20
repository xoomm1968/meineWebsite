# Firebase Polly Function

Dies ist eine Firebase Cloud Function, die AWS Polly als Proxy bereitstellt.

## Setup

1. **AWS-Zugangsdaten setzen**
   - Trage deine AWS-Keys in `.env` im `functions`-Ordner ein (siehe `.env.example`).
   - Alternativ: Setze die Keys als Umgebungsvariablen in der Firebase-Konsole.

2. **Abhängigkeiten installieren**
   ```bash
   cd functions
   npm install
   ```

## Optional: Schutz per Header-Token
Wenn du möchtest, dass nur dein Worker die Firebase-Function aufrufen darf, setze ein Token auf beiden Seiten:

- In Cloud Functions (als Umgebungsvariable oder `functions.config`):
   - Mit `firebase functions:config:set polly.token="DEIN_TOKEN"` oder setze `POLLY_FIREBASE_TOKEN` in der Cloud Functions Umgebungsvariablen.
- In deinem Cloudflare Worker: setze ein Secret `POLLY_FIREBASE_TOKEN` (siehe Worker-README unten). Der Worker sendet es als Header `x-worker-auth`.

Beispiel: setze den Config-Wert und deploye:
```bash
firebase functions:config:set polly.token="meinGeheimesToken"
firebase deploy --only functions
```

3. **Deploy**
   ```bash
   firebase deploy --only functions
   ```

4. **Testen**
   - POST an `https://<dein-projekt>.cloudfunctions.net/synthesize`
   - Body: `{ "text": "Hallo Welt", "voiceId": "Vicki" }`
   - Response: MP3-Audio

## Hinweise zur Sicherheit
- Verwende `functions.config` oder Cloud Functions environment variables, nicht Quellcode-Keys.
- Wenn du `polly.token` setzt, wird die Function nur Aufrufe mit dem passenden `x-worker-auth`-Header akzeptieren.

## Hinweise
- Die Funktion akzeptiert nur POST.
- CORS ist aktiviert (alle Ursprünge).
- Die AWS-Keys sollten sicher gespeichert werden (nie ins Repo committen!).
