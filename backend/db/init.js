// backend/db/init.js
// Futtatható paranccsal: npm run db:init
// Létrehozza a táblákat és feltölti a kezdőadatokat a PostgreSQL adatbázisban.

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

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
  password: process.env.DB_PASSWORD || "postgrespassword",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: "postgres", // Először a postgres alap adatbázishoz csatlakozunk
};

async function init() {
  console.log("PostgreSQL adatbázis előkészítése...");
  const client = new Client(config);

  try {
    await client.connect();
    console.log("Kapcsolódva a PostgreSQL szerverhez.");

    const dbName = process.env.DB_NAME || "esemenynaplodigit";
    const checkDb = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (checkDb.rowCount === 0) {
      console.log(`'${dbName}' adatbázis nem létezik, létrehozás folyamatban...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`'${dbName}' adatbázis sikeresen létrehozva.`);
    } else {
      console.log(`'${dbName}' adatbázis már létezik.`);
    }
    await client.end();

    // Most csatlakozunk a konkrét esemenynaplodigit adatbázishoz a táblák létrehozásához
    const appDbClient = new Client({
      ...config,
      database: dbName,
    });
    await appDbClient.connect();

    const schemaPath = path.join(__dirname, "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");
    await appDbClient.query(sql);
    console.log("A táblák és a kezdőadatok (users, matches, master_data) sikeresen létrejöttek!");

    await appDbClient.end();
    console.log("PostgreSQL inicializálás befejeződött.");
  } catch (err) {
    console.error("Hiba az inicializálás során:", err.message);
    process.exit(1);
  }
}

init();
