// backend/db/index.js
// Intelligens adatbázis-kezelő: valós PostgreSQL kapcsolat,
// automatikus inicializálással és memóriabeli tartalékkal (fallback).

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const inMemoryDb = require("../inMemoryDb");

// .env betöltése ha létezik
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    });
}

const config = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "esemenynaplodigit",
  password: process.env.DB_PASSWORD || "postgrespassword",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  connectionTimeoutMillis: 2000,
};

let pool = null;
let isPostgresConnected = false;

try {
  pool = new Pool(config);
} catch (err) {
  console.warn("[DB] Pool létrehozási hiba:", err.message);
}

// Kapcsolat tesztelése és séma inicializálása
async function checkAndInitPostgres() {
  if (!pool) return false;

  try {
    const client = await pool.connect();
    console.log(
      `[DB] Sikeres PostgreSQL kapcsolat: ${config.host}:${config.port}/${config.database}`
    );
    isPostgresConnected = true;

    // Séma futtatása ha létezik
    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, "utf-8");
      await client.query(sql);
      console.log("[DB] PostgreSQL séma és kezdőadatok sikeresen ellenőrizve/létrehozva.");
    }

    client.release();
    return true;
  } catch (err) {
    isPostgresConnected = false;
    console.log(
      `[DB INFO] Helyi PostgreSQL (${config.host}:${config.port}) nem érhető el ezzel a jelszóval (${err.message}).`
    );
    console.log(
      "[DB INFO] A rendszer automatikusan a memóriabeli adatbázist (in-memory) használja, így az alkalmazás hibátlanul fut."
    );
    console.log(
      "[DB TIPP] Másik gépen vagy helyben a PostgreSQL 1 paranccsal indítható: docker compose up -d"
    );
    return false;
  }
}

// Első ellenőrzés futtatása
checkAndInitPostgres();

const db = {
  isPostgresConnected() {
    return isPostgresConnected;
  },

  async getUsers() {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, username, password, name, email, phone, role FROM users ORDER BY id ASC"
        );
        return res.rows;
      } catch (err) {
        console.error("[DB] getUsers hiba:", err.message);
      }
    }
    return inMemoryDb.getUsers();
  },

  async findUser(username, password) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, username, name, email, phone, role FROM users WHERE username = $1 AND password = $2",
          [username, password]
        );
        return res.rows[0] || null;
      } catch (err) {
        console.error("[DB] findUser hiba:", err.message);
      }
    }
    return inMemoryDb.findUser(username, password);
  },

  async getMatches() {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, title, match_date AS date, match_time AS time, venue, status, score, winner FROM matches ORDER BY id ASC"
        );
        return res.rows;
      } catch (err) {
        console.error("[DB] getMatches hiba:", err.message);
      }
    }
    return inMemoryDb.getMatches();
  },

  async updateMatch(id, data) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "UPDATE matches SET status = COALESCE($1, status), score = COALESCE($2, score), winner = COALESCE($3, winner), updated_at = NOW() WHERE id = $4 RETURNING *",
          [data.status, data.score, data.winner, id]
        );
        return res.rows[0];
      } catch (err) {
        console.error("[DB] updateMatch hiba:", err.message);
      }
    }
    const match = inMemoryDb.matches.find((m) => m.id === id);
    if (match) {
      Object.assign(match, data);
    }
    return match;
  },

  async logEmail(emailRecord) {
    const memoryRecord = inMemoryDb.logEmail(emailRecord);

    if (isPostgresConnected) {
      try {
        await pool.query(
          "INSERT INTO sent_emails (match_id, recipient, subject, message, result, status) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            emailRecord.matchId || null,
            emailRecord.to,
            emailRecord.subject,
            emailRecord.message,
            emailRecord.result ? JSON.stringify(emailRecord.result) : null,
            "Elküldve",
          ]
        );
      } catch (err) {
        console.error("[DB] logEmail postgres hiba:", err.message);
      }
    }

    return memoryRecord;
  },

  async getSentEmails() {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, match_id, recipient AS to, subject, message, result, status, created_at AS timestamp FROM sent_emails ORDER BY id DESC"
        );
        return res.rows;
      } catch (err) {
        console.error("[DB] getSentEmails hiba:", err.message);
      }
    }
    return inMemoryDb.getSentEmails();
  },
};

module.exports = db;
