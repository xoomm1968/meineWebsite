Dev stubs and Playwright harness

Diese Datei beschreibt die lokalen Entwicklertools und Stubs, die ich hinzugefügt habe, um `HHHoerbuch Prox20 Kkopie.html` lokal zu testen ohne ein Backend.

Was wurde hinzugefügt
- In `HHHoerbuch Prox20 Kkopie.html`:
  - Dev fetch-stub (aktiv bei `localhost` oder mit `HHB_LOCAL_STUB=1` oder `?hhb_local_stub=1`) der folgende Endpunkte mockt:
    - `GET /api/db/user` → `{ ok: true, user: { kontingent_basis_tts, kontingent_premium_tts } }`
    - `POST /api/tts/generate`, `/api/tts/merge`, `/api/tts/proxy` → generiert kurze WAV-Antworten per OfflineAudioContext (playable)
    - `POST /api/tts-proxy` → liefert JSON `{ data: 'data:audio/wav;base64,...' }`
  - Defensive Fallbacks und Fixes: `window.hhbApiUrl`-Fallback, `window.SpeecherDatas`-Fallback, Fix für Top-Level-`await` und einen Regex/Syntax-Fix.

- `playwright_console.js`:
  - erweitert um: seeded `localStorage` (`apiToken`, `hhb_api_token`), erzwungenen Convert-Run (füllt Kurzskript, klickt Convert), erweiterte Console-Logs, Screenshots vor/nach Konvertierung, und ein Script-Syntax-Check.

Warum das nützlich ist
- Du kannst die UI- und Konvertierungs-Workflows lokal testen ohne Backend.
- Die generierten WAVs sind kurz, aber abspielbar; dadurch werden Player/Download/Blob-Handling getestet.

Wie testen
1. Server starten:

```bash
cd "/Users/aaa_1/Desktop/Projekt Hörbuch-Generator"
python3 -m http.server 8123 --bind 127.0.0.1
```

2. Playwright laufen lassen (Node + Playwright installiert):

```bash
node playwright_console.js
```

3. Alternativ Browser öffnen:

`http://127.0.0.1:8123/HHHoerbuch%20Prox20%20Kkopie.html`

(Optional: `localStorage.setItem('HHB_LOCAL_STUB','1')` oder `?hhb_local_stub=1` in URL erzwingt Stub.)

Hinweis
- Diese Stubs sind nur für lokale Entwicklung gedacht. Entferne sie vor dem Deployment oder halte sie hinter einer DEV-Flag.
- Wenn du echte hörbare TTS möchtest, kann ich stattdessen einen kleinen Express-Mock-Server erstellen, der echte MP3-Dateien liefert.
