-- Full D1-compatible SQL schema for HHHoerbuch marketplace and project data
-- Run in Cloudflare D1 console or via `wrangler d1` apply

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  description TEXT,
  json_blob JSON,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS speakers (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  provider TEXT,
  provider_voice_id TEXT,
  name TEXT,
  meta JSON,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_items (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT,
  title TEXT,
  description TEXT,
  meta JSON,
  price_cents INTEGER DEFAULT 0,
  visibility TEXT DEFAULT 'public', -- public, private, unlisted
  created_at TEXT DEFAULT (datetime('now'))
);

-- Optional: normalized lookup from provider+provider_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_provider_pid ON marketplace_items(provider, provider_id);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_speakers_project ON speakers(project_id);

-- Lightweight migrations table (optional) to keep track of applied migrations
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  name TEXT,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- Views for convenient access
CREATE VIEW IF NOT EXISTS marketplace_public AS
SELECT id, provider, provider_id, title, description, meta, price_cents, created_at
FROM marketplace_items
WHERE visibility = 'public';

-- Example function-like convenience: none supported in D1/SQLite; keep SQL simple
