-- schema.sql
-- Rába ETO Digitális Eseménynapló PostgreSQL Adatbázis Séma és Kezdőadatok

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'Biztonsági vezető',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS master_data (
    id SERIAL PRIMARY KEY,
    organization VARCHAR(150) NOT NULL,
    official_email VARCHAR(150) NOT NULL,
    report_email VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    address VARCHAR(255),
    organizer VARCHAR(150),
    chief_organizer VARCHAR(150),
    healthcare_provider VARCHAR(200),
    disaster_protection_provider VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS matches (
    id INT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    team_id INT,
    competition VARCHAR(150),
    home_team VARCHAR(100),
    away_team VARCHAR(100),
    match_date VARCHAR(50) NOT NULL,
    match_time VARCHAR(20) NOT NULL,
    venue VARCHAR(150) DEFAULT 'ETO Park Győr',
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    score VARCHAR(20),
    winner VARCHAR(100),
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(100) PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    sequence_number INT NOT NULL,
    event_type VARCHAR(100),
    time VARCHAR(20),
    reporter_name VARCHAR(100),
    reporter_mode VARCHAR(50),
    event_description TEXT,
    decision_maker VARCHAR(100),
    decision_maker_mode VARCHAR(50),
    action_type VARCHAR(100),
    action_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    match_id INT REFERENCES matches(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_by VARCHAR(100),
    created_at VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    match_id INT,
    recipient VARCHAR(150) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    result JSONB,
    status VARCHAR(50) DEFAULT 'Elküldve',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =======================================================
-- KEZDŐADATOK BESZÚRÁSA (SEED DATA)
-- =======================================================

-- Kezdő felhasználók jelszavai sóval ellátott scrypt hash formátumban
INSERT INTO users (id, username, password, name, email, phone, role)
VALUES 
    (1, 'Admin', 'scrypt$4689508c9f9cf5f5ed994603fe1019cf$446702fa08118a3dfa5f8af2af9ec5ba5e7775dbc0ca3258c1f07fb06b99d287d02abc32698e1af2c77dc28b568d3e13261d29ab61a20b34fa297d921003e90e', 'Adminisztrátor', 'admin@eto.hu', '+36 30 987 6543', 'Admin'),
    (2, 'User1', 'scrypt$67abcafc9df0f8d20d79d35430072b46$89649bc349934acf65744e5f9f3fd83b7283e7606f2e40b1991a67df0013e14f46a128cfc22a28187ce10437c2bf74800db480f18becfd6d1acdde26ffa13477', 'Biztonsági vezető', 'user1@eto.hu', '+36 30 123 4567', 'Biztonsági vezető'),
    (3, 'szeconnect', 'scrypt$5b17fa0d8ab18a18bb4c68c9622e9385$a983444c24c17ed77d1854c7122727af2ea07c55de81df4fb7fdef39daa5266b6eea115b451ee8b82c6771bf14199ce8ee03dbb9e64fbc3b959d14cabab05df9', 'SZE Connect Projektvezető', 'szeconnect.projektmunka@gmail.com', '+36 30 555 9876', 'Biztonsági vezető')
ON CONFLICT (username) DO NOTHING;

INSERT INTO master_data (id, organization, official_email, report_email, phone, address, organizer, chief_organizer, healthcare_provider, disaster_protection_provider)
VALUES (
    1,
    'Rába ETO SE Győr',
    'szeconnect.projektmunka@gmail.com',
    'szeconnect.projektmunka@gmail.com',
    '+36 96 123 456',
    '9027 Győr, ETO Park',
    'Rába ETO SE Győr',
    'Főnév Sándor',
    'ETO Egészségügyi Partner Kft.',
    'ETO Katasztrófavédelmi Partner Kft.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO matches (id, title, team_id, competition, home_team, away_team, match_date, match_time, venue, status, score, winner, meta)
VALUES 
    (1, 'CSAPAT 2 vs ETO', 323805, 'NB I', 'CSAPAT 2', 'ETO', '2026. 11. 18.', '17:00', 'ETO Park', 'in_progress', NULL, NULL, '{"competitionName":"NB I","homeTeam":"CSAPAT 2","awayTeam":"ETO","matchDate":"2026. 11. 18.","matchTime":"17:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Nagy Péter"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Kovács János"}}'::jsonb),
    (6, 'CSAPAT 3 vs ETO', 323805, 'Magyar Kupa', 'CSAPAT 3', 'ETO', '2026. 11. 25.', '18:00', 'ETO Park', 'in_progress', NULL, NULL, '{"competitionName":"Magyar Kupa","homeTeam":"CSAPAT 3","awayTeam":"ETO","matchDate":"2026. 11. 25.","matchTime":"18:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":""},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":""}}'::jsonb),
    (7, 'CSAPAT 4 vs ETO', 323805, 'NB I', 'CSAPAT 4', 'ETO', '2026. 12. 02.', '16:00', 'ETO Park', 'in_progress', NULL, NULL, '{"competitionName":"NB I","homeTeam":"CSAPAT 4","awayTeam":"ETO","matchDate":"2026. 12. 02.","matchTime":"16:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":""},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":""}}'::jsonb),
    (3, 'CSAPAT 1 vs ETO', 323805, 'NB I', 'CSAPAT 1', 'ETO', '2026. 10. 20.', '14:50', 'ETO Park', 'finalized', '0 - 3', 'ETO', '{"competitionName":"NB I","homeTeam":"CSAPAT 1","awayTeam":"ETO","matchDate":"2026. 10. 20.","matchTime":"14:50","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Szabó Anna"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Kiss Gábor"},"score":"0 - 3","winner":"ETO"}'::jsonb),
    (4, 'CSAPAT 5 vs ETO', 323805, 'NB I', 'CSAPAT 5', 'ETO', '2026. 09. 15.', '14:50', 'ETO Park', 'archived', '2 - 2', 'Döntetlen', '{"competitionName":"NB I","homeTeam":"CSAPAT 5","awayTeam":"ETO","matchDate":"2026. 09. 15.","matchTime":"14:50","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Adminisztrátor","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Horváth Béla"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Nagy őrnagy"},"score":"2 - 2","winner":"Döntetlen"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE matches SET competition = 'NB I', home_team = 'CSAPAT 2', away_team = 'ETO', match_date = '2026. 11. 18.', match_time = '17:00', status = 'in_progress', score = NULL, winner = NULL, meta = '{"competitionName":"NB I","homeTeam":"CSAPAT 2","awayTeam":"ETO","matchDate":"2026. 11. 18.","matchTime":"17:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Nagy Péter"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Kovács János"}}'::jsonb WHERE id = 1 AND (meta IS NULL OR meta = '{}'::jsonb);
UPDATE matches SET competition = 'Magyar Kupa', home_team = 'CSAPAT 3', away_team = 'ETO', match_date = '2026. 11. 25.', match_time = '18:00', status = 'in_progress', score = NULL, winner = NULL, meta = '{"competitionName":"Magyar Kupa","homeTeam":"CSAPAT 3","awayTeam":"ETO","matchDate":"2026. 11. 25.","matchTime":"18:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":""},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":""}}'::jsonb WHERE id = 6 AND (meta IS NULL OR meta = '{}'::jsonb);
UPDATE matches SET competition = 'NB I', home_team = 'CSAPAT 4', away_team = 'ETO', match_date = '2026. 12. 02.', match_time = '16:00', meta = '{"competitionName":"NB I","homeTeam":"CSAPAT 4","awayTeam":"ETO","matchDate":"2026. 12. 02.","matchTime":"16:00","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":""},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":""}}'::jsonb WHERE id = 7 AND (meta IS NULL OR meta = '{}'::jsonb);
UPDATE matches SET competition = 'NB I', home_team = 'CSAPAT 1', away_team = 'ETO', meta = '{"competitionName":"NB I","homeTeam":"CSAPAT 1","awayTeam":"ETO","matchDate":"2026. 10. 20.","matchTime":"14:50","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Biztonsági vezető","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Szabó Anna"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Kiss Gábor"},"score":"0 - 3","winner":"ETO"}'::jsonb WHERE id = 3 AND (meta IS NULL OR meta = '{}'::jsonb);
UPDATE matches SET competition = 'NB I', home_team = 'CSAPAT 5', away_team = 'ETO', meta = '{"competitionName":"NB I","homeTeam":"CSAPAT 5","awayTeam":"ETO","matchDate":"2026. 09. 15.","matchTime":"14:50","venue":"ETO Park","organizer":"Rába ETO SE Győr","securityOfficer":{"name":"Biztonsági vezető","phone":"+36 30 123 4567"},"headOrganizer":{"name":"Főnév Sándor","phone":"+36 96 123 456"},"eventLogLeader":"Adminisztrátor","medicalService":{"organization":"ETO Egészségügyi Partner Kft.","person":"Dr. Horváth Béla"},"disasterProtection":{"organization":"ETO Katasztrófavédelmi Partner Kft.","person":"Nagy őrnagy"},"score":"2 - 2","winner":"Döntetlen"}'::jsonb WHERE id = 4 AND (meta IS NULL OR meta = '{}'::jsonb);

INSERT INTO events (id, match_id, sequence_number, event_type, time, reporter_name, reporter_mode, event_description, decision_maker, decision_maker_mode, action_type, action_result, created_by)
VALUES
    ('seed-m3-e1', 3, 1, 'Belépés és Rendbontás', '14:25', 'Kapu 1. Szolgálatvezető', 'lista', 'Vendégszektor beengedése során kisebb torlódás alakult ki a kapuknál.', 'Biztonsági vezető', 'lista', 'Plusz beléptető sáv megnyitása', 'Torlódás 5 percen belül megszűnt', 'Biztonsági vezető'),
    ('seed-m3-e2', 3, 2, 'Egészségügyi Esemény', '15:18', 'Mentőszolgálat', 'lista', 'Hazai drukker enyhe rosszulléte a keleti lelátón.', 'Ügyeletes orvos', 'lista', 'Helyszíni ellátás és folyadékpótlás', 'Állapota stabilizálódott, a mérkőzést végignézte', 'Biztonsági vezető'),
    ('seed-m4-e1', 4, 1, 'Pirotechnika', '16:12', 'Szektorfelügyelő', 'lista', 'Vendégszektorban egy füstgyertya került meggyújtásra a gól után.', 'Rendezvénybiztonsági parancsnok', 'lista', 'Kamerafelvétel rögzítése, szóbeli figyelmeztetés', 'További rendbontás nem történt', 'Adminisztrátor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO notes (id, match_id, text, created_by, created_at)
VALUES
    (1, 3, 'A mérkőzés rendben lezajlott, utólagos jegyzőkönyvi kiegészítés szükséges a 2-es kapu forgalmáról.', 'Biztonsági vezető', '2026. 10. 20. 17:15'),
    (2, 4, 'Archiválva a hatósági ellenőrzést követően.', 'Adminisztrátor', '2026. 09. 16. 09:30')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
SELECT setval(pg_get_serial_sequence('master_data', 'id'), COALESCE((SELECT MAX(id) FROM master_data), 1), true);
SELECT setval(pg_get_serial_sequence('matches', 'id'), COALESCE((SELECT MAX(id) FROM matches), 1), true);
SELECT setval(pg_get_serial_sequence('notes', 'id'), COALESCE((SELECT MAX(id) FROM notes), 1), true);
SELECT setval(pg_get_serial_sequence('sent_emails', 'id'), COALESCE((SELECT MAX(id) FROM sent_emails), 1), true);
