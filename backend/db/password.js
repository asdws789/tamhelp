// Jelszavak biztonságos scrypt hashelése, ellenőrzése és meglévő plaintext sorok migrációja.
const crypto = require("crypto");

const SCRYPT_PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };
const HASH_PATTERN = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;

/** Returns true if value already matches `scrypt$<32 hex salt>$<128 hex key>`. */
function isPasswordHashed(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/** Hashes a plaintext password using a random 16-byte salt and scrypt. */
function hashPassword(plainPassword) {
  if (isPasswordHashed(plainPassword)) {
    return plainPassword;
  }
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = crypto
    .scryptSync(String(plainPassword ?? ""), salt, KEY_LENGTH, SCRYPT_OPTIONS)
    .toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${derivedKey}`;
}

/** Verifies a plaintext candidate against a stored scrypt hash using constant-time comparison. */
function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== "string" || !isPasswordHashed(storedHash)) {
    return false;
  }
  const [, salt, expectedHex] = storedHash.split("$");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  const derivedBuf = crypto.scryptSync(
    plainPassword,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );
  if (derivedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, derivedBuf);
}

/** Migrates any remaining plaintext passwords in the PostgreSQL `users` table to scrypt hashes. */
async function migratePlaintextPasswords(client) {
  const res = await client.query("SELECT id, password FROM users ORDER BY id ASC");
  let migratedCount = 0;

  for (const row of res.rows) {
    if (!isPasswordHashed(row.password)) {
      const hashed = hashPassword(row.password || "");
      await client.query("UPDATE users SET password = $1 WHERE id = $2", [
        hashed,
        row.id,
      ]);
      migratedCount += 1;
    }
  }

  if (migratedCount > 0) {
    console.log(
      `[DB] ${migratedCount} felhasználó jelszava sikeresen hashelve lett (scrypt).`
    );
  }
  return migratedCount;
}

module.exports = {
  isPasswordHashed,
  hashPassword,
  verifyPassword,
  migratePlaintextPasswords,
};
