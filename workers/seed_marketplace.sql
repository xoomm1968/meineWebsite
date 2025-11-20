-- seed_marketplace.sql
INSERT OR IGNORE INTO marketplace_items (id, provider, provider_id, title, description, meta, price_cents, visibility) VALUES
('market_demo_1', 'elevenlabs', 'eleven_demo_voice_1', 'Demo Stimme 1', 'Beispielstimme aus ElevenLabs', '{"lang":"de-DE","samples":[] }', 0, 'public');

INSERT OR IGNORE INTO marketplace_items (id, provider, provider_id, title, description, meta, price_cents, visibility) VALUES
('market_demo_2', 'elevenlabs', 'eleven_demo_voice_2', 'Demo Stimme 2', 'Zweite Beispielstimme', '{"lang":"en-US","samples":[] }', 0, 'public');
