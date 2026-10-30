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

INSERT INTO users (id, username, password, name, email, phone, role)
VALUES 
    (1, 'Admin', 'Adminjelszo', 'Adminisztrátor', 'admin@eto.hu', '+36 30 987 6543', 'Admin'),
    (2, 'User1', 'Userjelszo', 'Biztonsági vezető', 'user1@eto.hu', '+36 30 123 4567', 'Biztonsági vezető'),
    (3, 'szeconnect', 'SzeConnect2026!', 'SZE Connect Projektvezető', 'szeconnect.projektmunka@gmail.com', '+36 30 555 9876', 'Biztonsági vezető')
ON CONFLICT (username) DO UPDATE 
SET email = EXCLUDED.email, password = EXCLUDED.password;

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
ON CONFLICT (id) DO UPDATE 
SET report_email = EXCLUDED.report_email;

INSERT INTO matches (id, title, match_date, match_time, venue, status, score, winner)
VALUES 
    (1, 'CSAPAT 2 vs ETO', '2026. 10. 28.', '11:00', 'ETO Park', 'in_progress', NULL, NULL),
    (6, 'CSAPAT 3 vs ETO', '2026. 10. 27.', '10:00', 'ETO Park', 'in_progress', NULL, NULL),
    (7, 'CSAPAT 4 vs ETO', '2026. 11. 15.', '16:00', 'ETO Park', 'in_progress', NULL, NULL),
    (3, 'CSAPAT 1 vs ETO', '2026. 10. 20.', '14:50', 'ETO Park', 'finalized', '0 - 3', 'ETO'),
    (4, 'CSAPAT 5 vs ETO', '2026. 09. 15.', '14:50', 'ETO Park', 'archived', '2 - 2', 'Döntetlen')
ON CONFLICT (id) DO NOTHING;
