-- Migration: Add missing columns to transactions
-- WARNING: ALTER TABLE ADD COLUMN will fail if the column already exists in SQLite.
-- Run this only if you're ok with potential errors when columns already exist.

ALTER TABLE transactions ADD COLUMN status TEXT;
ALTER TABLE transactions ADD COLUMN timestamp TEXT;
