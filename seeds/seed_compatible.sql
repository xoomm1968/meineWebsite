-- Seed compatible with existing DB schema (integer user id, required password_hash)

INSERT OR IGNORE INTO users (id, email, password_hash, display_name, api_token) VALUES (9999, 'test@example.com', 'seeded_pw_hash', 'Seed User', 'TEST_API_TOKEN_12345');
INSERT OR IGNORE INTO accounts (user_id, current_balance) VALUES (9999, 1000);
