-- Add optional reference_tx_id to transactions for idempotency
-- This migration is safe to run on DBs that do NOT yet have the column.
-- If the column already exists the ALTER will fail; prefer running the worker which will
-- attempt to add the column at runtime if allowed by your deployment.

BEGIN;
ALTER TABLE transactions ADD COLUMN reference_tx_id TEXT;
COMMIT;
