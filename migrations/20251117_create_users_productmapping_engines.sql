-- Migration: Create users, product_mapping and engines tables for Basis/Premium accounting
-- Run with: npx wrangler d1 execute DB --command "<sql>" --remote

-- 1) users table with separate balances
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  guthaben_basis INTEGER DEFAULT 0 NOT NULL,
  guthaben_premium INTEGER DEFAULT 0 NOT NULL
);

-- 2) product_mapping: map Stripe Price IDs to credits and type
CREATE TABLE IF NOT EXISTS product_mapping (
  stripe_price_id VARCHAR(255) PRIMARY KEY,
  package_name VARCHAR(255) NOT NULL,
  credits_granted INTEGER NOT NULL,
  credit_type VARCHAR(10) CHECK (credit_type IN ('BASIS', 'PREMIUM')) NOT NULL
);

-- Example insert for testing (uncomment and run manually if desired):
-- INSERT INTO product_mapping (stripe_price_id, package_name, credits_granted, credit_type) 
-- VALUES ('STRIPE_ID_PREMIUM_20K', 'Premium Pro', 20000, 'PREMIUM');

-- 3) engines: map engine/voice to consumption type
CREATE TABLE IF NOT EXISTS engines (
  engine_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  consumption_type VARCHAR(10) CHECK (consumption_type IN ('BASIS', 'PREMIUM')) NOT NULL
);

-- Example inserts (uncomment to seed):
-- INSERT INTO engines (engine_id, name, consumption_type) VALUES ('ELEVENLABS', 'ElevenLabs Standard', 'PREMIUM');
-- INSERT INTO engines (engine_id, name, consumption_type) VALUES ('OPENAI_TTS', 'OpenAI (Standard)', 'BASIS');
