-- Migration: Add stripe_event_id column to transactions table
-- Purpose: store Stripe event IDs to enforce idempotency for webhook processing
-- Run with: npx wrangler d1 execute DB --command "ALTER TABLE transactions ADD COLUMN stripe_event_id TEXT;" --remote

-- ALTER TABLE transactions ADD COLUMN stripe_event_id TEXT;
-- NOTE: Column `stripe_event_id` already exists in the production DB;
-- the ALTER TABLE statement is commented out to make this migration idempotent
-- and avoid errors when applied against databases where the column is present.
