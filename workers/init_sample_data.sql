-- Setup: ensure accounts table exists and insert a test user + starting balance
CREATE TABLE IF NOT EXISTS accounts (
	user_id TEXT PRIMARY KEY,
	current_balance INTEGER DEFAULT 0
);

-- Add password_hash column to users table if missing. Note: ALTER TABLE ADD COLUMN
-- will fail if column already exists in some SQLite versions; this is usually fine
-- on a fresh DB. If it errors, run the ALTER manually after inspecting PRAGMA table_info('users').
-- NOTE: password_hash column likely already exists; we skip ALTER to avoid duplicate column errors.
-- If you need to add the column on an older DB that doesn't have it, run the ALTER manually after
-- checking with PRAGMA table_info('users').

-- Fügt Benutzer-ID 1 in die users-Tabelle ein (ignoriert, wenn schon vorhanden).
INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('1', 'test@app.com', 'test');

-- Setzt oder aktualisiert das Startguthaben (5000 Credits) für diesen Benutzer.
REPLACE INTO accounts (user_id, current_balance) VALUES ('1', 5000);
