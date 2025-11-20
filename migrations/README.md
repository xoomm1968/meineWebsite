Migration: `20251120_add_reference_tx_id.sql`
============================================

Zweck
-----
Diese Migration fügt die Spalte `reference_tx_id` zur Tabelle `transactions` hinzu. Die Spalte wird verwendet, um idempotente Abbuchungen zu unterstützen: bei wiederholten (retry-)Requests mit derselben `reference_tx_id` wird die bereits existierende Transaktion erkannt und eine Doppelabbuchung verhindert.

Wichtig für Production
----------------------
- Bevor du die Migration in Produktion ausführst, überprüfe, ob bereits vorhandene Daten Duplikate in `reference_tx_id` enthalten (sollte nicht vorkommen, da die Spalte neu ist). Falls Duplikate existieren, müssen diese bereinigt werden, bevor ein UNIQUE-Index gesetzt wird.
- Nach dem Hinzufügen der Spalte wird empfohlen, einen eindeutigen Index auf `reference_tx_id` anzulegen, um versehentliche doppelte Einträge zu verhindern.

Sichere Reihenfolge (empfohlen)
-------------------------------
1. Backup der Produktionstabelle `transactions` erstellen (Snapshot/export).
2. Prüfen auf vorhandene Duplikate:

   ```sql
   SELECT reference_tx_id, COUNT(*) AS cnt
   FROM transactions
   WHERE reference_tx_id IS NOT NULL
   GROUP BY reference_tx_id
   HAVING cnt > 1;
   ```

   - Wenn die Abfrage NULL zurückliefert, sind keine Duplikate vorhanden.
   - Falls Zeilen zurückkommen: Duplikate untersuchen und entscheiden, welche Zeilen konsolidiert oder entfernt werden müssen.

3. Migration ausführen (Wrangler D1 remote):

   ```bash
   # im Projekt-Root
   npx wrangler d1 migrations apply db-elite-pro --remote --env production
   ```

   Alternativ: Falls du direkte SQL-Ausführung bevorzugst, führe die Statements in einer Transaktion aus:

   ```sql
   BEGIN;
   ALTER TABLE transactions ADD COLUMN reference_tx_id TEXT;
   COMMIT;
   ```

4. Optional: Eindeutigen Index erstellen (nur wenn keine Duplikate vorhanden):

   ```sql
   CREATE UNIQUE INDEX idx_transactions_reference_tx_id ON transactions(reference_tx_id);
   ```

   Hinweis: Manche SQLite-Versionen unterstützen `CREATE UNIQUE INDEX IF NOT EXISTS ...`. Falls nicht, prüfe vorher mit `sqlite_master` ob der Index bereits existiert.

Fallback / Runtime-Option
-------------------------
- Der Worker enthält eine *best-effort* Hilfsfunktion (`ensureReferenceTxColumn`) die beim Start oder vor der ersten Nutzung versucht, die Spalte hinzuzufügen. Das ist praktisch für lokale Tests, ersetzt aber nicht eine bewusste, geplante Migration in Production.

Risiken & Empfehlungen
----------------------
- Nie blind ALTER TABLE in einer produktiven DB ausführen ohne Backup.
- Wenn die Tabelle `transactions` sehr groß ist, kann das Hinzufügen einer Spalte und das Erstellen eines Indexes die DB-Operationen beeinträchtigen; plane Wartungsfenster oder verwende D1-spezifische Migrations-Strategien.
- Nach der Migration: Führe automatisierte Integrationstests aus (charge + retry mit `referenceTxId`), um das Idempotency-Verhalten zu bestätigen.

Kontakt
-------
Falls du möchtest, helfe ich bei der Prüfung der Produktionstabelle auf Duplikate, beim Erstellen der Migration oder beim Ausführen eines sicheren Rollouts.