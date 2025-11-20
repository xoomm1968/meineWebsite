Worker consolidation
====================

Status
------
- `worker_main.js` ist die primäre/autoritative Worker-Implementierung (genutzt von `wrangler dev`).
- `d1-api.js` bleibt als Quell-Backup im Repo, ist aber nicht die aktive Entry-Point-Datei.

Warum diese Entscheidung
------------------------
- `worker_main.js` enthält die aktuell getestete, laufende Logik (charge endpoint, idempotency, project endpoints).
- `wrangler.toml` ist bereits konfiguriert mit `main = "worker_main.js"`.

Empfohlene Aktionen
-------------------
- Entfernen oder Archivieren von `d1-api.js` sobald du sicher bist, dass alle gewünschten Änderungen in `worker_main.js` zusammengeführt wurden.
- Führe lokale Tests mit `npx wrangler dev` und den vorhandenen curl-/script-Tests aus, um Endpunkte zu validieren.

How to switch entry point
-------------------------
Wenn du stattdessen `d1-api.js` als Worker-Entrypoint verwenden möchtest, öffne `wrangler.toml` und setze:

```
main = "d1-api.js"
```

Anschließend: `npx wrangler dev` neu starten.

Weitere Hinweise
----------------
- Migrationsdateien bleiben die autoritativen Schema-Änderungen. Nutze `migrations/20251120_add_reference_tx_id.sql` oder die Runtime-Helfer im Worker (best-effort) um `reference_tx_id` hinzuzufügen.
- Falls du möchtest, kann ich die Inhalte von `d1-api.js` und `worker_main.js` zusammenführen (diff + merge) und `d1-api.js` automatisch archivieren. Sag Bescheid, wenn ich das übernehmen soll.
