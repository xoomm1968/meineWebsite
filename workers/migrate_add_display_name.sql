-- Migration: add display_name column to users if missing
-- SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so we attempt to add it.
ALTER TABLE users ADD COLUMN display_name TEXT;
