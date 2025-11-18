Anleitung: Argon2 für Cloudflare Worker integrieren

Ziel
- Binde eine Worker-kompatible Argon2-Implementierung ein (empfohlen) und setze `globalThis.argon2` so, dass die vorhandenen Helfer `hashPassword` und `verifyPassword` in `worker_main.js` diese verwenden.

Option A — Empfohlen (Bundling mit npm + esbuild/webpack)
1. Lokales Projekt (im Repo-Root) initialisieren, falls noch nicht vorhanden:
   npm init -y
2. Argon2-Browser installieren (Beispiel):
   npm install argon2-browser --save

3. Erstelle eine kleine Initialisierungsdatei `worker-setup-argon2.mjs` (siehe Beispiel weiter unten), die `globalThis.argon2` setzt.
4. Bundle deinen Worker mit einem Bundler (z. B. esbuild, webpack, rollup) so dass `worker_main.js` und die argon2-Initialisierung im Build enthalten sind.

Beispiel `worker-setup-argon2.mjs`:

```js
import argon2 from 'argon2-browser';

// argon2-browser bietet hash(...) und verify(...) helpers
// Wir mapen eine kleine API auf globalThis.argon2
await argon2.ready;

globalThis.argon2 = {
  hash: async (password) => {
    // salt wird intern oder explizit gesetzt; hier generieren wir einen 16-Byte salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const res = await argon2.hash({ pass: password, salt, time: 2, mem: 65536, hashLen: 32 });
    // res.encoded enthält das PHC-format (z.B. $argon2id$v=19$m=65536,t=2,p=1$...)
    return res.encoded || res.hashHex || res.hash;
  },
  verify: async (encoded, password) => {
    try {
      const r = await argon2.verify({ pass: password, encoded });
      return r && r.verified === true;
    } catch (e) {
      return false;
    }
  }
};
```

Wichtig:
- Bundle unbedingt die argon2-Bibliothek in deinen Worker-Build. Cloudflare Worker kann keine Node-APIs verwenden — das Bundle darf keine Node-spezifischen Abhängigkeiten enthalten.
- Teste lokal mit `wrangler dev` oder in deinem CI bevor du in Produktion gehst.

Option B — CDN / direkten Import
- Theoretisch möglich, aber weniger zuverlässig. Besser: Bundle per npm.

Fallback
- Der Code in `worker_main.js` verwendet bereits einen PBKDF2-Fallback, falls `globalThis.argon2` nicht verfügbar ist. PBKDF2 ist weniger ideal als Argon2, funktioniert aber als sichere Übergangslösung.

Weiteres
- Parameter-Tuning (Argon2 memory/time) hängt von deinem Sicherheits-/Kostenprofil ab. Für Worker empfiehlt sich moderate memory/time, teste die Latenz.
- Wenn du möchtest, kann ich die Build-Skripte (`package.json` mit `build`-Task`) und ein Beispiel `wrangler.toml` hinzufügen.
