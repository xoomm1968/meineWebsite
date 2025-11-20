-- D1 compatible SQL (SQLite-like)
CREATE TABLE IF NOT EXISTS marketplace_items (
  id TEXT PRIMARY KEY,
  provider TEXT,
  provider_id TEXT,
  title TEXT,
  description TEXT,
  meta JSON,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS speakers (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider TEXT,
  provider_voice_id TEXT,
  name TEXT,
  meta JSON,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  name TEXT,
  json_blob JSON,
  created_at TEXT,
  updated_at TEXT
);
