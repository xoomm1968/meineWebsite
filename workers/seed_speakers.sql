-- seed_speakers.sql
INSERT OR IGNORE INTO speakers (id, project_id, provider, provider_voice_id, name, meta) VALUES
('speaker_demo_1', 'project_demo_1', 'elevenlabs', 'eleven_demo_voice_1', 'Demo Stimme 1', '{"gender":"female","lang":"de-DE","notes":"Teststimme"}');
