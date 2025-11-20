-- Test data for D1 (SQLite compatible)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  api_token TEXT UNIQUE,
  email TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY,
  current_balance INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  type TEXT,
  amount INTEGER,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert a test user
INSERT OR IGNORE INTO users (id, api_token, email) VALUES ('test-user-1', 'TEST_API_TOKEN_12345', 'test@example.com');
INSERT OR IGNORE INTO accounts (user_id, current_balance) VALUES ('test-user-1', 1000);
