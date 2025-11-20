-- seed_projects.sql
INSERT OR IGNORE INTO projects (id, owner_id, name, description, json_blob) VALUES
('project_demo_1', 'user_demo_1', 'Demo Projekt', 'Projekt zum Testen der D1-Integration', '{"title":"Demo Projekt","version":1}');
