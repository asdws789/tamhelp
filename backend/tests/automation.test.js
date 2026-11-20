/**
 * Rába ETO Digitális Eseménynapló — Automatizálási (12 órás lezárás & 1 hetes archiválás) E2E tesztprogram
 *
 * Futtatás:
 *   npm --prefix backend run test:automation
 *   (vagy: node backend/tests/automation.test.js)
 *
 * Működés:
 *   Ha a backend (http://localhost:3000) vagy a frontend (http://localhost:5173) nem fut,
 *   a teszt átmenetileg elindítja őket a vizsgálat idejére, majd a finally blokkban
 *   kizárólag az általa indított szervereket állítja le, és visszaállítja a DB állapotát.
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const { Pool } = require("pg");
const puppeteer = require("puppeteer");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const API_URL = process.env.API_URL || "http://localhost:3000";
const MLSZ_API_KEY = "mock-mlsz-key";

const AUTO_ID_11H = 998001;
const AUTO_ID_13H = 998002;
const AUTO_ID_6D = 998003;
const AUTO_ID_8D_FIN = 998004;
const AUTO_ID_9D_OPEN = 998005;
const ALL_TEST_MATCH_IDS = [
  AUTO_ID_11H,
  AUTO_ID_13H,
  AUTO_ID_6D,
  AUTO_ID_8D_FIN,
  AUTO_ID_9D_OPEN,
];

const pad2 = (n) => String(n).padStart(2, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatLocalDates(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return {
    isoDate: `${yyyy}-${mm}-${dd}`,
    huDate: `${yyyy}. ${mm}. ${dd}.`,
    time: `${hh}:${min}`,
  };
}

function loadBackendEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }
  return env;
}

function getChromeExecutablePath() {
  const possible = [
    process.env.CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return possible.find((p) => fs.existsSync(p));
}

async function isReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilReachable(url, label, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isReachable(url)) return;
    await sleep(400);
  }
  throw new Error(`${label} nem válaszolt ${timeoutMs / 1000} másodpercen belül (${url}).`);
}

function stopSpawnedProcess(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // Ha már leállt, nincs teendő
  }
}

async function ensureServersRunning() {
  const startedProcs = [];
  const backendDir = path.resolve(__dirname, "..");
  const frontendDir = path.resolve(__dirname, "..", "..", "frontend", "Esemenynaplodigit");

  if (!(await isReachable(`${API_URL}/api/db/status`))) {
    console.log("Backend nem fut -> ideiglenes indítás...");
    const backendProc = spawn(process.execPath, ["index.js"], {
      cwd: backendDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    startedProcs.push({ name: "Backend", proc: backendProc });
    await waitUntilReachable(`${API_URL}/api/db/status`, "Backend API");
  }

  if (!(await isReachable(FRONTEND_URL))) {
    const fePort = new URL(FRONTEND_URL).port || "5173";
    console.log("Frontend nem fut -> ideiglenes indítás...");
    const isWin = process.platform === "win32";
    const cmd = isWin ? "cmd.exe" : "npm";
    const args = isWin
      ? ["/c", "npm", "run", "dev", "--", "--port", fePort, "--strictPort"]
      : ["run", "dev", "--", "--port", fePort, "--strictPort"];
    const frontendProc = spawn(cmd, args, {
      cwd: frontendDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    startedProcs.push({ name: "Frontend", proc: frontendProc });
    await waitUntilReachable(FRONTEND_URL, "Frontend Vite szerver");
  }

  return startedProcs;
}

async function apiJson(pathname, options = {}) {
  const res = await fetch(`${API_URL}${pathname}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, data: json };
}

class TestRunner {
  constructor() {
    this.results = [];
  }

  async run(id, name, fn) {
    process.stdout.write(`  [FUT ] ${id} - ${name}... `);
    try {
      const detail = await fn();
      this.results.push({ id, name, passed: true, detail: detail || "OK" });
      console.log(`\x1b[32mPASS\x1b[0m${detail ? ` (${detail})` : ""}`);
    } catch (err) {
      const msg = err?.message || String(err);
      this.results.push({ id, name, passed: false, detail: msg });
      console.log(`\x1b[31mFAIL\x1b[0m`);
      console.log(`         Ok: ${msg}`);
    }
  }

  summary() {
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.length - passed;
    console.log("\n================================================================");
    console.log(`AUTOMATIZÁLÁSI ÖSSZESÍTÉS: ${passed}/${this.results.length} teszt teljesült, ${failed} sikertelen.`);
    console.log("================================================================");
    if (failed > 0) {
      console.log("\nSikertelen ellenőrzések:");
      for (const r of this.results.filter((x) => !x.passed)) {
        console.log(`  - [FAIL] ${r.id} (${r.name}): ${r.detail}`);
      }
    }
    return failed === 0;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function createNetworkController() {
  return {
    emailCalls: [],
    mlszByIdOverrides: new Map(),
    pendingEmailRequests: new Map(),
    resetCallLogs() {
      this.emailCalls = [];
    },
    clearOverrides() {
      this.mlszByIdOverrides.clear();
    },
  };
}

async function attachControllers(page, net) {
  await page.setViewport({ width: 1440, height: 900 });
  page.on("dialog", async (dialog) => {
    await dialog.accept().catch(() => {});
  });

  await page.setRequestInterception(true);

  page.on("request", async (req) => {
    const url = req.url();
    const method = req.method();

    if (method === "OPTIONS") {
      return req.continue();
    }

    if (url.startsWith(`${API_URL}/api/mlsz/matches/`)) {
      const idStr = new URL(url).pathname.split("/").pop();
      if (net.mlszByIdOverrides.has(idStr)) {
        return req.respond({
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          contentType: "application/json",
          body: JSON.stringify(net.mlszByIdOverrides.get(idStr)),
        });
      }
      return req.continue();
    }

    if (url === `${API_URL}/api/send-email` && method === "POST") {
      let body = null;
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        body = req.postData();
      }
      const entry = { time: Date.now(), payload: body, status: null, response: null };
      net.emailCalls.push(entry);
      net.pendingEmailRequests.set(req, entry);
      return req.continue();
    }

    return req.continue();
  });

  page.on("response", async (res) => {
    const req = res.request();
    const entry = net.pendingEmailRequests.get(req);
    if (entry) {
      net.pendingEmailRequests.delete(req);
      entry.status = res.status();
      try {
        entry.response = await res.json();
      } catch {
        entry.response = null;
      }
    }
  });
}

async function clearAndType(page, handle, value) {
  await handle.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value !== undefined && value !== null && value !== "") {
    await handle.type(String(value));
  }
}

async function isLoggedIn(page) {
  return page.evaluate(() => Boolean(document.querySelector('button[title="Profil menü"]')));
}

async function logoutUi(page) {
  if (!(await isLoggedIn(page))) return;
  await page.click('button[title="Profil menü"]');
  await sleep(150);
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.offsetParent !== null && b.textContent.trim() === "Kijelentkezés"
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (clicked) {
    await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
  }
}

async function loginUi(page, username, password) {
  if (await isLoggedIn(page)) {
    await logoutUi(page);
  }
  await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  const textInput = await page.$('input[type="text"]');
  const passInput = await page.$('input[type="password"]');

  await clearAndType(page, textInput, username);
  await clearAndType(page, passInput, password);
  await page.click('button[type="submit"]');

  await page.waitForSelector('button[title="Profil menü"]', { timeout: 8000 });
  await sleep(600);
}

async function freshReloadAndLogin(page, username, password) {
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle2" });
  await loginUi(page, username, password);
}

async function getHomeSectionRows(page, headingText) {
  return page.evaluate((heading) => {
    const h2 = Array.from(document.querySelectorAll("h2")).find(
      (el) => el.textContent.trim() === heading
    );
    if (!h2 || !h2.nextElementSibling) return [];
    const rows = Array.from(h2.nextElementSibling.querySelectorAll("tbody tr"));
    return rows
      .filter((tr) => !tr.textContent.includes("Nincs megjeleníthető mérkőzés"))
      .map((tr) => tr.textContent.trim().replace(/\s+/g, " "));
  }, headingText);
}

async function openSidemenuItem(page, label) {
  const itemVisible = await page.evaluate((lbl) => {
    return Array.from(document.querySelectorAll("div")).some(
      (d) =>
        d.textContent.trim() === lbl &&
        d.className.includes("cursor-pointer") &&
        d.offsetParent !== null
    );
  }, label);

  if (!itemVisible) {
    await page.click('button[aria-label="Menü megnyitása"]');
    await sleep(200);
  }

  const clicked = await page.evaluate((lbl) => {
    const el = Array.from(document.querySelectorAll("div")).find(
      (d) =>
        d.textContent.trim() === lbl &&
        d.className.includes("cursor-pointer") &&
        d.offsetParent !== null
    );
    if (!el) return false;
    el.click();
    return true;
  }, label);

  if (!clicked) throw new Error(`Nem található oldalsáv menüpont: "${label}"`);
  await sleep(300);
}

async function createTestMatch(id, homeTeam, offsetMs, status, extras = {}) {
  const t = formatLocalDates(offsetMs);
  const title = `${homeTeam} vs ETO`;
  const res = await apiJson("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      teamId: 323805,
      competition: "NB I",
      homeTeam,
      awayTeam: "ETO",
      title,
      date: t.huDate,
      time: t.time,
      venue: "ETO Park",
      status,
      score: extras.score || null,
      winner: extras.winner || null,
      meta: {
        competitionName: "NB I",
        homeTeam,
        awayTeam: "ETO",
        matchDate: t.huDate,
        matchTime: t.time,
        ...(extras.score ? { score: extras.score } : {}),
        ...(extras.winner ? { winner: extras.winner } : {}),
      },
    }),
  });
  assert(res.ok, `Tesztmérkőzés (id=${id}) létrehozása sikertelen: HTTP ${res.status}`);
  return { t, title };
}

async function cleanupTestRows(pgPool) {
  if (!pgPool) return;
  try {
    await pgPool.query("DELETE FROM sent_emails WHERE match_id = ANY($1::int[])", [
      ALL_TEST_MATCH_IDS,
    ]);
    await pgPool.query("DELETE FROM matches WHERE id = ANY($1::int[])", [
      ALL_TEST_MATCH_IDS,
    ]);
    await pgPool.query(
      "SELECT setval(pg_get_serial_sequence('notes', 'id'), COALESCE((SELECT MAX(id) FROM notes), 1), true)"
    );
    await pgPool.query(
      "SELECT setval(pg_get_serial_sequence('sent_emails', 'id'), COALESCE((SELECT MAX(id) FROM sent_emails), 1), true)"
    );
    await pgPool.query(
      "SELECT setval(pg_get_serial_sequence('matches', 'id'), COALESCE((SELECT MAX(id) FROM matches), 1), true)"
    );
  } catch (err) {
    console.warn("Figyelmeztetés a PostgreSQL takarításkor:", err.message);
  }
}

async function main() {
  console.log("================================================================");
  console.log("Rába ETO Digitális Eseménynapló - Automatizálási E2E Teszt");
  console.log("  Fókusz: 12 órás automatikus lezárás & 1 hetes archiválás");
  console.log(`  Frontend: ${FRONTEND_URL} | Backend: ${API_URL}`);
  console.log("================================================================\n");

  let startedProcs = [];
  let browser = null;
  let pgPool = null;

  try {
    startedProcs = await ensureServersRunning();

    const dbRes = await apiJson("/api/db/status");
    assert(dbRes.ok, `Backend HTTP ${dbRes.status}`);
    const dbStatus = dbRes.data;
    console.log(
      `Adatbázis mód: ${dbStatus.connected ? "PostgreSQL (Aktív)" : "In-Memory Fallback"}\n`
    );

    if (dbStatus.connected) {
      const env = loadBackendEnv();
      pgPool = new Pool({
        user: env.DB_USER || "postgres",
        host: env.DB_HOST || "localhost",
        database: env.DB_NAME || "esemenynaplodigit",
        password: env.DB_PASSWORD || "postgrespassword",
        port: parseInt(env.DB_PORT || "5432", 10),
      });
      await cleanupTestRows(pgPool);
    }

    const initialMasterData = (await apiJson("/api/master-data")).data;

    const execPath = getChromeExecutablePath();
    browser = await puppeteer.launch({
      headless: "new",
      ...(execPath ? { executablePath: execPath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const net = createNetworkController();
    await attachControllers(page, net);

    const runner = new TestRunner();

    // -----------------------------------------------------------------
    // A1: 12 órás küszöb előtti mérkőzés (-11h) NEM záródik le
    // -----------------------------------------------------------------
    await runner.run(
      "A1",
      "12 órás küszöb előtti meccs (-11h) aktív marad és nem küld e-mailt",
      async () => {
        await createTestMatch(
          AUTO_ID_11H,
          "[AUTO] 11h Meccs",
          -11 * 60 * 60 * 1000,
          "in_progress"
        );

        net.clearOverrides();
        net.resetCallLogs();
        await freshReloadAndLogin(page, "Admin", "Adminjelszo");
        await sleep(2500);

        const matchAfter = (await apiJson(`/api/matches/${AUTO_ID_11H}`)).data;
        const openRows = await getHomeSectionRows(page, "Megnyitott naplók");
        const emailSent = net.emailCalls.some(
          (c) => Number(c.payload?.matchId) === AUTO_ID_11H
        );

        assert(
          matchAfter?.status === "in_progress",
          `A -11 órás meccs státusza nem 'in_progress' maradt (${matchAfter?.status})`
        );
        assert(
          openRows.some((r) => r.includes("[AUTO] 11h Meccs")),
          "A -11 órás meccs nem jelent meg a 'Megnyitott naplók' táblázatban."
        );
        assert(!emailSent, "A -11 órás meccsre nem szabadott volna e-mailt küldeni.");
        return "in_progress megőrizve";
      }
    );

    // -----------------------------------------------------------------
    // A2: 12 órán túli mérkőzés (-13h) automatikus lezárása API végeredménnyel + e-mail
    // -----------------------------------------------------------------
    await runner.run(
      "A2",
      "12 órán túli meccs (-13h) automatikus lezárása API végeredménnyel és e-maillel",
      async () => {
        const { t } = await createTestMatch(
          AUTO_ID_13H,
          "[AUTO] 13h Meccs",
          -13 * 60 * 60 * 1000,
          "in_progress"
        );

        net.clearOverrides();
        net.resetCallLogs();
        net.mlszByIdOverrides.set(String(AUTO_ID_13H), {
          id: AUTO_ID_13H,
          teamId: 323805,
          competition: "NB I",
          homeTeam: "[AUTO] 13h Meccs",
          awayTeam: "ETO",
          date: t.isoDate,
          time: t.time,
          venue: "ETO Park",
          status: "ended",
          score: "1 - 3",
          winner: "ETO",
        });

        await freshReloadAndLogin(page, "Admin", "Adminjelszo");

        const deadline = Date.now() + 12000;
        let call = null;
        let dbMatch = null;
        while (Date.now() < deadline) {
          call = net.emailCalls.find((c) => Number(c.payload?.matchId) === AUTO_ID_13H);
          dbMatch = (await apiJson(`/api/matches/${AUTO_ID_13H}`)).data;
          if (call && call.status !== null && dbMatch?.status === "finalized") break;
          await sleep(300);
        }
        net.clearOverrides();

        const closedRows = await getHomeSectionRows(page, "Lezárt de nem archivált");

        assert(
          dbMatch?.status === "finalized",
          `A -13 órás meccs nem záródott le automatikusan (status=${dbMatch?.status})`
        );
        assert(
          dbMatch?.score === "1 - 3" && dbMatch?.winner === "ETO",
          `Nem az API végeredményét kapta meg (${dbMatch?.score} / ${dbMatch?.winner})`
        );
        assert(
          closedRows.some((r) => r.includes("[AUTO] 13h Meccs")),
          "A lezárt meccs nem jelent meg a 'Lezárt de nem archivált' táblázatban."
        );
        assert(call, "Automatikus 12 órás lezáráskor nem történt POST /api/send-email kérés.");
        assert(
          call.payload?.to === initialMasterData.reportEmail,
          `Az e-mail nem a törzsadatokban beállított címre ment (${call.payload?.to} !== ${initialMasterData.reportEmail})`
        );
        assert(
          call.status === 200 && call.response?.success === true,
          `Az e-mail küldés szerver oldalon sikertelen volt: HTTP ${call.status} (${JSON.stringify(call.response)})`
        );
        assert(
          String(call.payload?.message || "").includes("12 óra"),
          "Az e-mail szövege nem tartalmazza a 12 órás automatikus lezárás indoklását."
        );
        return "finalized + SMTP 200 OK";
      }
    );

    // -----------------------------------------------------------------
    // A3: 1 hetes küszöb előtti lezárt meccs (-6 nap) NEM archiválódik még
    // -----------------------------------------------------------------
    await runner.run(
      "A3",
      "1 hetes küszöb előtti lezárt meccs (-6 nap) Lezárt státuszban marad",
      async () => {
        await createTestMatch(
          AUTO_ID_6D,
          "[AUTO] 6 Napos Lezárt",
          -6 * 24 * 60 * 60 * 1000,
          "finalized",
          { score: "2 - 0", winner: "ETO" }
        );

        net.clearOverrides();
        net.resetCallLogs();
        await freshReloadAndLogin(page, "Admin", "Adminjelszo");
        await sleep(2500);

        const dbMatch = (await apiJson(`/api/matches/${AUTO_ID_6D}`)).data;
        assert(
          dbMatch?.status === "finalized",
          `A 6 napos lezárt meccs idő előtt átállt (${dbMatch?.status})`
        );

        await openSidemenuItem(page, "Lezárt");
        const inClosed = await page.evaluate(() =>
          document.body.innerText.includes("[AUTO] 6 Napos Lezárt")
        );
        await openSidemenuItem(page, "Archivált");
        const inArchived = await page.evaluate(() =>
          document.body.innerText.includes("[AUTO] 6 Napos Lezárt")
        );

        assert(inClosed, "A 6 napos meccs nem látható a 'Lezárt' menüpontban.");
        assert(!inArchived, "A 6 napos meccs már megjelent az 'Archivált' menüpontban.");
        return "finalized megőrizve";
      }
    );

    // -----------------------------------------------------------------
    // A4: 1 hetes (7 napos) automatikus archiválás (-8 nap, finalized -> archived) + 403 védelem
    // -----------------------------------------------------------------
    await runner.run(
      "A4",
      "1 hetes küszöb utáni lezárt meccs (-8 nap) automatikusan archiválódik + szervervédelem",
      async () => {
        await createTestMatch(
          AUTO_ID_8D_FIN,
          "[AUTO] 8 Napos Lezárt",
          -8 * 24 * 60 * 60 * 1000,
          "finalized",
          { score: "1 - 1", winner: "Döntetlen" }
        );

        net.clearOverrides();
        net.resetCallLogs();
        await freshReloadAndLogin(page, "Admin", "Adminjelszo");
        await sleep(2500);

        const dbMatch = (await apiJson(`/api/matches/${AUTO_ID_8D_FIN}`)).data;
        assert(
          dbMatch?.status === "archived",
          `A 8 napos meccs nem archiválódott automatikusan (status=${dbMatch?.status})`
        );

        await openSidemenuItem(page, "Archivált");
        const inArchived = await page.evaluate(() =>
          document.body.innerText.includes("[AUTO] 8 Napos Lezárt")
        );
        assert(inArchived, "Az automatikusan archivált meccs nem látható az 'Archivált' nézetben.");

        const putBlocked = await apiJson(`/api/matches/${AUTO_ID_8D_FIN}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venue: "Tiltott" }),
        });
        assert(
          putBlocked.status === 403,
          `Archivált meccs PUT módosítása nem kapott 403-at (${putBlocked.status})`
        );

        const noteBlocked = await apiJson(`/api/matches/${AUTO_ID_8D_FIN}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "Tiltott komment", createdBy: "Teszt" }),
        });
        assert(
          noteBlocked.status === 403,
          `Archivált meccs új megjegyzése nem kapott 403-at (${noteBlocked.status})`
        );
        return "archived + 403 OK";
      }
    );

    // -----------------------------------------------------------------
    // A5: 1 hetes archiválás nyitva maradt naplónál (-9 nap, in_progress -> archived)
    // -----------------------------------------------------------------
    await runner.run(
      "A5",
      "1 hetes küszöb utáni nyitott meccs (-9 nap) közvetlenül archiválódik API eredménnyel",
      async () => {
        const { t } = await createTestMatch(
          AUTO_ID_9D_OPEN,
          "[AUTO] 9 Napos Nyitott",
          -9 * 24 * 60 * 60 * 1000,
          "in_progress"
        );

        net.clearOverrides();
        net.resetCallLogs();
        net.mlszByIdOverrides.set(String(AUTO_ID_9D_OPEN), {
          id: AUTO_ID_9D_OPEN,
          teamId: 323805,
          competition: "NB I",
          homeTeam: "[AUTO] 9 Napos Nyitott",
          awayTeam: "ETO",
          date: t.isoDate,
          time: t.time,
          venue: "ETO Park",
          status: "ended",
          score: "2 - 2",
          winner: "Döntetlen",
        });

        await freshReloadAndLogin(page, "Admin", "Adminjelszo");
        await sleep(2500);
        net.clearOverrides();

        const dbMatch = (await apiJson(`/api/matches/${AUTO_ID_9D_OPEN}`)).data;
        const spuriousEmail = net.emailCalls.some(
          (c) => Number(c.payload?.matchId) === AUTO_ID_9D_OPEN
        );

        assert(
          dbMatch?.status === "archived",
          `A 9 napos nyitott meccs nem archiválódott közvetlenül (status=${dbMatch?.status})`
        );
        assert(
          dbMatch?.score === "2 - 2" && dbMatch?.winner === "Döntetlen",
          `Nem az API végeredményét kapta meg archiváláskor (${dbMatch?.score} / ${dbMatch?.winner})`
        );
        assert(
          !spuriousEmail,
          "A >= 7 napos napló közvetlen archiválásakor nem szabadott volna 12 órás lezáró e-mailt küldeni."
        );
        return "archived közvetlenül + API eredmény";
      }
    );

    const allPassed = runner.summary();
    process.exitCode = allPassed ? 0 : 1;
  } finally {
    console.log("\nAutomatizálási teszt takarítása...");
    if (browser) await browser.close().catch(() => {});
    if (pgPool) {
      await cleanupTestRows(pgPool);
      await pgPool.end().catch(() => {});
      console.log("PostgreSQL tesztadatok sikeresen törölve.");
    }
    for (const item of startedProcs) {
      stopSpawnedProcess(item.proc);
      console.log(`Ideiglenes ${item.name} szerver leállítva.`);
    }
  }
}

main().catch((err) => {
  console.error("Végzetes teszt hiba:", err);
  process.exit(1);
});
