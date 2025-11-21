-- Fügt den Benutzer ein (ignoriert den Eintrag, falls er schon existiert)
INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (1, 'test@app.com', 'test');

-- FÜGT DIE FEHLENDE SPALTE API_TOKEN HINZU (falls nicht vorhanden)
-- Dies wird den Fehler des fehlenden API-Tokens beheben, falls die Tabelle unvollständig ist.
ALTER TABLE users ADD COLUMN api_token TEXT;

-- Setzt den Token und das Guthaben (5000 Credits) für den Test-User
UPDATE users SET api_token = 'testtoken' WHERE id = 1;

REPLACE INTO accounts (user_id, current_balance) VALUES (1, 5000);
