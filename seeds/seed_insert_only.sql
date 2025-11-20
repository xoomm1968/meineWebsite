-- Minimal seed: nur INSERTS (vermeidet CREATE TABLE / Schema-Änderungen)

INSERT OR IGNORE INTO users (id, api_token, email) VALUES ('test-user-1', 'TEST_API_TOKEN_12345', 'test@example.com');
INSERT OR IGNORE INTO accounts (user_id, current_balance) VALUES ('test-user-1', 1000);
