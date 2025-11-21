-- Idempotent D1 schema for Hörbuch-Generator
-- Creates minimal tables expected by workers/d1-api.js

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_token TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One-row-per-user account table
CREATE TABLE IF NOT EXISTS accounts (
  user_id INTEGER PRIMARY KEY,
  current_balance INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  meta TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Marketplace items used by /api/marketplace/voices and import route
CREATE TABLE IF NOT EXISTS marketplace_items (
  id TEXT PRIMARY KEY,
  provider TEXT,
  provider_id TEXT,
  title TEXT,
  description TEXT,
  meta TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Optional: ensure at least one test user and account if not exists
-- Seed a local test user. Use display_name if available (some installations use display_name instead of name).
-- Insert a test user; include a minimal password_hash because some schemas enforce NOT NULL.
INSERT INTO users (
  api_token,
  display_name,
  email,
  password_hash
) SELECT 'test-token-123', 'Local Test', 'local@example.test', '' WHERE NOT EXISTS (SELECT 1 FROM users WHERE api_token = 'test-token-123');

INSERT INTO accounts (user_id, current_balance) SELECT u.id, 1000 FROM users u WHERE u.api_token = 'test-token-123' AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id);

-- Done
