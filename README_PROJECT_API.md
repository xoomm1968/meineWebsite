Projekt-API Hinweise

- Endpunkte bereits implementiert in `worker_main.js`:
  - POST `/api/projects/save`  -> Speichern/Aktualisieren
  - GET `/api/projects/list`  -> Liste der Projekte (Metadaten)
  - GET `/api/projects/:id`    -> Laden des Inhalts (passwortgeschützt möglich)

ID-Strategien
- Standard: neue Projekte erhalten eine `UUID` (Feld `id` wird gesetzt).
- Optional: wenn du eine bestehende DB mit `INTEGER PRIMARY KEY AUTOINCREMENT` benutzt,
  kannst du den Request beim Anlegen so senden:

  { "name": "...", "content_json": "...", "use_autoincrement": true }

  In diesem Fall macht der Worker ein `INSERT` ohne `id` und liest danach `SELECT last_insert_rowid()`.
  Die Antwort enthält dann das numerische ID-Feld.

Passwortschutz
- Beim Speichern kannst du ein Klartext-Passwort im Feld `password` (oder `key`) senden.
  Der Worker hasht das Passwort serverseitig (Argon2 wenn verfügbar; ansonsten PBKDF2-Fallback)
  und speichert nur den Hash in `protection_hash`.
- Beim Laden (`GET /api/projects/:id`) sendest du das Klartext-Passwort als Query-Parameter `?key=...` oder als Header `x-project-password`.
  Der Worker vergleicht den Klartext mit dem gespeicherten Hash sicher.

Argon2 Integration
- Für starke Sicherheit installiere und bundle eine Worker-kompatible Argon2-Implementierung
  (z. B. `argon2-browser`) und füge ein Modul `worker_argon2.mjs` oder eine Initialisierung, die
  `globalThis.argon2.hash` und `globalThis.argon2.verify` bereitstellt.
- Der Worker versucht, `./worker_argon2.mjs` dynamisch zu importieren; wenn das Modul geliefert
  wird, verwendet er Argon2. Andernfalls fällt er auf PBKDF2 zurück.

Testskript
- Verwende das mitgelieferte `test_project_endpoints.sh` zum Durchtesten der Endpunkte.
  Beispiel:

  ```bash
  API_HOST=https://localhost:8787 API_TOKEN=<token> ./test_project_endpoints.sh
  ```

Sicherheitshinweis
- Lege niemals Klartext-Passwörter dauerhaft ab. Verwende starke Hash-Parameter beim Bundle der Argon2-Implementierung.
- Wenn du Probleme beim Bundling oder mit dem Worker-Environment hast, kann ich dir beim Setup von `esbuild`/`wrangler` helfen.
