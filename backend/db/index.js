// PostgreSQL adatbázis kapcsolat és fallback in-memory adatbázisra.
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
  connectionTimeoutMillis: 2500,
};

let pool = null;
let isPostgresConnected = false;

try {
  pool = new Pool(config);
  pool.on("error", (err) => {
    console.warn("[DB] Váratlan PostgreSQL pool hiba:", err.message);
  });
} catch (err) {
  console.warn("[DB] Pool létrehozási hiba:", err.message);
}

function toSafeTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapEventRow(row) {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    eventType: row.event_type || "",
    time: row.time || "",
    reporterName: row.reporter_name || "",
    reporterMode: row.reporter_mode || "",
    eventDescription: row.event_description || "",
    decisionMaker: row.decision_maker || "",
    decisionMakerMode: row.decision_maker_mode || "",
    actionType: row.action_type || "",
    actionResult: row.action_result || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    createdBy: row.created_by || "",
  };
}

function mapNoteRow(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    text: row.text,
    createdBy: row.created_by || "",
    createdAt: row.created_at || "",
  };
}

function mapMasterDataRow(row) {
  if (!row) return inMemoryDb.getMasterData();
  const officialEmail = row.official_email || "";
  const phone = row.phone || "";
  const address = row.address || "";
  return {
    id: row.id,
    organization: row.organization || "",
    officialEmail,
    organizationEmail: officialEmail,
    reportEmail: row.report_email || "",
    phone,
    organizationPhone: phone,
    address,
    organizationAddress: address,
    organizer: row.organizer || "",
    chiefOrganizer: row.chief_organizer || "",
    healthcareProvider: row.healthcare_provider || "",
    disasterProtectionProvider: row.disaster_protection_provider || "",
  };
}

function mapMatchRow(row, events = [], notes = []) {
  return {
    id: row.id,
    title: row.title,
    teamId: row.team_id,
    competition: row.competition,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    date: row.match_date,
    time: row.match_time,
    venue: row.venue,
    status: row.status,
    score: row.score,
    winner: row.winner,
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    events,
    notes,
  };
}

const MATCH_SELECT_SQL = `
  SELECT id, title, team_id, competition, home_team, away_team,
         match_date, match_time, venue, status, score, winner, meta
  FROM matches
`;

async function checkAndInitPostgres() {
  if (!pool) return false;
  try {
    const client = await pool.connect();
    console.log("[DB] Sikeres kapcsolódás a PostgreSQL adatbázishoz!");

    const schemaPath = path.join(__dirname, "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, "utf-8");
      await client.query(sql);
      console.log("[DB] PostgreSQL séma és kezdőadatok sikeresen ellenőrizve/létrehozva.");
    }

    client.release();
    isPostgresConnected = true;
    return true;
  } catch (err) {
    console.warn(
      "[DB] PostgreSQL kapcsolat sikertelen (átállás in-memory adatbázisra). Hiba:",
      err.message
    );
    isPostgresConnected = false;
    return false;
  }
}

const initPromise = checkAndInitPostgres();

const db = {
  ready: () => initPromise,
  isPostgresConnected: () => isPostgresConnected,

  // --- FELHASZNÁLÓK ---
  async getUsers() {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, username, name, email, phone, role FROM users ORDER BY id ASC"
        );
        return res.rows;
      } catch (err) {
        console.error("[DB] Hiba a felhasználók lekérésekor:", err.message);
      }
    }
    return inMemoryDb.getUsers();
  },

  async findUser(username, password) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          "SELECT id, username, name, email, phone, role FROM users WHERE LOWER(username) = LOWER($1) AND password = $2",
          [String(username || "").trim(), password]
        );
        return res.rows[0] || null;
      } catch (err) {
        console.error("[DB] Hiba a bejelentkezésnél:", err.message);
      }
    }
    return inMemoryDb.findUser(username, password);
  },

  async createUser(userData) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          `INSERT INTO users (username, password, name, email, phone, role)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, username, name, email, phone, role`,
          [
            String(userData.username || "").trim(),
            userData.password || "Eto2026!",
            String(userData.name || "").trim(),
            String(userData.email || "").trim(),
            String(userData.phone || "").trim(),
            userData.role || "Biztonsági vezető",
          ]
        );
        return res.rows[0];
      } catch (err) {
        console.error("[DB] Hiba felhasználó létrehozásakor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.createUser(userData);
  },

  async updateUser(id, userData) {
    if (isPostgresConnected) {
      try {
        const hasPassword =
          userData.password !== undefined && String(userData.password).trim() !== "";
        const res = await pool.query(
          `UPDATE users SET
             username = COALESCE($1, username),
             name = COALESCE($2, name),
             email = COALESCE($3, email),
             phone = COALESCE($4, phone),
             role = COALESCE($5, role),
             password = CASE WHEN $6::boolean THEN $7 ELSE password END
           WHERE id = $8
           RETURNING id, username, name, email, phone, role`,
          [
            userData.username ?? null,
            userData.name ?? null,
            userData.email ?? null,
            userData.phone ?? null,
            userData.role ?? null,
            hasPassword,
            hasPassword ? userData.password : null,
            id,
          ]
        );
        return res.rows[0] || null;
      } catch (err) {
        console.error("[DB] Hiba felhasználó frissítésekor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.updateUser(id, userData);
  },

  async updateUserPassword(id, currentPassword, newPassword) {
    if (isPostgresConnected) {
      try {
        const check = await pool.query(
          "SELECT password FROM users WHERE id = $1",
          [id]
        );
        if (check.rowCount === 0) return { error: "A felhasználó nem található." };
        if (check.rows[0].password !== currentPassword) {
          return { error: "A jelenlegi jelszó hibás." };
        }
        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
          newPassword,
          id,
        ]);
        return { ok: true };
      } catch (err) {
        console.error("[DB] Hiba jelszó módosításakor:", err.message);
        return { error: err.message };
      }
    }
    return inMemoryDb.updateUserPassword(id, currentPassword, newPassword);
  },

  async deleteUser(id) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query("DELETE FROM users WHERE id = $1", [id]);
        return { deleted: res.rowCount > 0 };
      } catch (err) {
        console.error("[DB] Hiba felhasználó törlésekor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.deleteUser(id);
  },

  // --- TÖRZSAADATOK ---
  async getMasterData() {
    if (isPostgresConnected) {
      try {
        const res = await pool.query("SELECT * FROM master_data ORDER BY id ASC LIMIT 1");
        return mapMasterDataRow(res.rows[0]);
      } catch (err) {
        console.error("[DB] Hiba a törzsadatok lekérésekor:", err.message);
      }
    }
    return inMemoryDb.getMasterData();
  },

  async updateMasterData(data) {
    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          `UPDATE master_data SET
             organization = COALESCE($1, organization),
             official_email = COALESCE($2, official_email),
             report_email = COALESCE($3, report_email),
             phone = COALESCE($4, phone),
             address = COALESCE($5, address),
             organizer = COALESCE($6, organizer),
             chief_organizer = COALESCE($7, chief_organizer),
             healthcare_provider = COALESCE($8, healthcare_provider),
             disaster_protection_provider = COALESCE($9, disaster_protection_provider)
           WHERE id = 1
           RETURNING *`,
          [
            data.organization ?? data.organizer ?? null,
            data.organizationEmail ?? data.officialEmail ?? null,
            data.reportEmail ?? null,
            data.organizationPhone ?? data.phone ?? null,
            data.organizationAddress ?? data.address ?? null,
            data.organizer ?? data.organization ?? null,
            data.chiefOrganizer ?? null,
            data.healthcareProvider ?? null,
            data.disasterProtectionProvider ?? null,
          ]
        );
        return mapMasterDataRow(res.rows[0]);
      } catch (err) {
        console.error("[DB] Hiba a törzsadatok mentésekor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.updateMasterData(data);
  },

  // --- MÉRKŐZÉSEK, ESEMÉNYEK, MEGJEGYZÉSEK ---
  async getMatches() {
    if (isPostgresConnected) {
      try {
        const [matchesRes, eventsRes, notesRes] = await Promise.all([
          pool.query(`${MATCH_SELECT_SQL} ORDER BY id ASC`),
          pool.query(
            "SELECT * FROM events ORDER BY match_id ASC, sequence_number ASC, id ASC"
          ),
          pool.query("SELECT * FROM notes ORDER BY match_id ASC, id ASC"),
        ]);

        const eventsByMatch = new Map();
        for (const row of eventsRes.rows) {
          const list = eventsByMatch.get(row.match_id) || [];
          list.push(mapEventRow(row));
          eventsByMatch.set(row.match_id, list);
        }

        const notesByMatch = new Map();
        for (const row of notesRes.rows) {
          const list = notesByMatch.get(row.match_id) || [];
          list.push(mapNoteRow(row));
          notesByMatch.set(row.match_id, list);
        }

        return matchesRes.rows.map((row) =>
          mapMatchRow(
            row,
            eventsByMatch.get(row.id) || [],
            notesByMatch.get(row.id) || []
          )
        );
      } catch (err) {
        console.error("[DB] Hiba a mérkőzések lekérésekor:", err.message);
      }
    }
    return inMemoryDb.getMatches();
  },

  async getMatchById(id) {
    if (isPostgresConnected) {
      try {
        const matchRes = await pool.query(
          `${MATCH_SELECT_SQL} WHERE id = $1`,
          [id]
        );
        if (matchRes.rowCount === 0) return null;

        const [eventsRes, notesRes] = await Promise.all([
          pool.query(
            "SELECT * FROM events WHERE match_id = $1 ORDER BY sequence_number ASC, id ASC",
            [id]
          ),
          pool.query("SELECT * FROM notes WHERE match_id = $1 ORDER BY id ASC", [
            id,
          ]),
        ]);

        return mapMatchRow(
          matchRes.rows[0],
          eventsRes.rows.map(mapEventRow),
          notesRes.rows.map(mapNoteRow)
        );
      } catch (err) {
        console.error("[DB] Hiba a mérkőzés lekérésekor:", err.message);
      }
    }
    return inMemoryDb.getMatchById(id);
  },

  async createMatch(matchData) {
    if (isPostgresConnected) {
      try {
        const title =
          matchData.title ||
          `${matchData.homeTeam || ""} vs ${matchData.awayTeam || ""}`.trim() ||
          "Mérkőzés";
        await pool.query(
          `INSERT INTO matches (
             id, title, team_id, competition, home_team, away_team,
             match_date, match_time, venue, status, score, winner, meta
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO NOTHING`,
          [
            matchData.id,
            title,
            matchData.teamId || 323805,
            matchData.competition || matchData.meta?.competition || "",
            matchData.homeTeam || matchData.meta?.homeTeam || "",
            matchData.awayTeam || matchData.meta?.awayTeam || "",
            matchData.date || matchData.matchDate || "",
            matchData.time || matchData.matchStartTime || "",
            matchData.venue || "",
            matchData.status || "in_progress",
            matchData.score || null,
            matchData.winner || null,
            JSON.stringify(matchData.meta || {}),
          ]
        );
        return this.getMatchById(matchData.id);
      } catch (err) {
        console.error("[DB] Hiba a mérkőzés létrehozásakor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.createMatch(matchData);
  },

  async updateMatch(id, data) {
    if (isPostgresConnected) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const existingRes = await client.query(
          `${MATCH_SELECT_SQL} WHERE id = $1`,
          [id]
        );
        if (existingRes.rowCount === 0) {
          await client.query("ROLLBACK");
          client.release();
          if (data.title || data.homeTeam) {
            await this.createMatch({ id, ...data });
            return this.updateMatch(id, data);
          }
          return null;
        }

        const existingRow = existingRes.rows[0];
        const mergedMeta = data.meta
          ? { ...(existingRow.meta || {}), ...data.meta }
          : existingRow.meta || {};

        const computedTitle =
          data.title !== undefined
            ? data.title
            : data.meta?.homeTeam && data.meta?.awayTeam
              ? `${data.meta.homeTeam} vs ${data.meta.awayTeam}`
              : existingRow.title;

        await client.query(
          `UPDATE matches SET
             title = COALESCE($1, title),
             competition = COALESCE($2, competition),
             home_team = COALESCE($3, home_team),
             away_team = COALESCE($4, away_team),
             match_date = COALESCE($5, match_date),
             match_time = COALESCE($6, match_time),
             venue = COALESCE($7, venue),
             status = COALESCE($8, status),
             score = COALESCE($9, score),
             winner = COALESCE($10, winner),
             meta = $11,
             updated_at = NOW()
           WHERE id = $12`,
          [
            computedTitle ?? null,
            data.meta?.competition ?? data.competition ?? null,
            data.meta?.homeTeam ?? data.homeTeam ?? null,
            data.meta?.awayTeam ?? data.awayTeam ?? null,
            data.date ?? data.meta?.matchDate ?? null,
            data.time ?? data.meta?.matchStartTime ?? null,
            data.venue ?? data.meta?.venue ?? null,
            data.status ?? null,
            data.score ?? null,
            data.winner ?? null,
            JSON.stringify(mergedMeta),
            id,
          ]
        );

        if (Array.isArray(data.events)) {
          await client.query("DELETE FROM events WHERE match_id = $1", [id]);
          for (let i = 0; i < data.events.length; i++) {
            const ev = data.events[i];
            const evId = String(ev.id || `${id}-ev-${i + 1}`);
            await client.query(
              `INSERT INTO events (
                 id, match_id, sequence_number, event_type, time,
                 reporter_name, reporter_mode, event_description,
                 decision_maker, decision_maker_mode, action_type,
                 action_result, created_at, created_by
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                evId,
                id,
                Number(ev.sequenceNumber) || i + 1,
                ev.eventType || "",
                ev.time || "",
                ev.reporterName || "",
                ev.reporterMode || "",
                ev.eventDescription || "",
                ev.decisionMaker || "",
                ev.decisionMakerMode || "",
                ev.actionType || "",
                ev.actionResult || "",
                toSafeTimestamp(ev.createdAt),
                ev.createdBy || "",
              ]
            );
          }
        }

        await client.query("COMMIT");
        client.release();
        return this.getMatchById(id);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
        console.error("[DB] Hiba a mérkőzés frissítésekor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.updateMatch(id, data);
  },

  async addNote(matchId, { text, createdBy }) {
    const cleanText = String(text || "").trim();
    if (!cleanText) return null;
    const timestampStr = new Date().toLocaleString("hu-HU");

    if (isPostgresConnected) {
      try {
        const res = await pool.query(
          `INSERT INTO notes (match_id, text, created_by, created_at)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [matchId, cleanText, createdBy || "Rendszer", timestampStr]
        );
        return mapNoteRow(res.rows[0]);
      } catch (err) {
        console.error("[DB] Hiba a megjegyzés mentésekor:", err.message);
        throw err;
      }
    }
    return inMemoryDb.addNote(matchId, { text: cleanText, createdBy });
  },

  // --- E-MAILEK ---
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
            emailRecord.result,
            emailRecord.status || "sent",
          ]
        );
      } catch (err) {
        console.error("[DB] Hiba az e-mail naplózásakor:", err.message);
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
        console.error("[DB] Hiba a küldött e-mailek lekérésekor:", err.message);
      }
    }
    return inMemoryDb.getSentEmails();
  },
};

module.exports = db;
