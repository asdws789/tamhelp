/**
 * Rába ETO Digitális Eseménynapló — Teljes körű követelmény-ellenőrző E2E tesztprogram
 *
 * Futtatás:
 *   npm --prefix backend test
 *   (vagy: node backend/tests/requirements.test.js)
 *
 * Előfeltétel: a frontend (alapért. http://localhost:5173) és backend (http://localhost:3000)
 * szerverek futnak. A teszt a végén automatikusan visszaállítja az adatbázis / törzsadatok
 * és felhasználók eredeti állapotát.
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const puppeteer = require("puppeteer");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const API_URL = process.env.API_URL || "http://localhost:3000";
const MLSZ_API_KEY = "mock-mlsz-key";

const TEST_ID_OWN_EDIT = 999001;
const TEST_ID_AUTO_12H = 999002;
const TEST_ID_AUTO_ARCHIVE = 999003;
const TEST_ID_MLSZ_SOON = 999101;
const TEST_ID_MLSZ_FAR = 999102;
const TEST_ID_MLSZ_PAST_14H = 999103;

const pad2 = (n) => String(n).padStart(2, "0");

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
    timestamp: d.getTime(),
  };
}

function parseUiDateTime(text) {
  const m = String(text || "").match(/(\d{4})[.\-]?\s*(\d{2})[.\-]?\s*(\d{2})\.?\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(`${y}-${mo}-${d}T${pad2(h)}:${mi}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    console.log(`ÖSSZESÍTÉS: ${passed}/${this.results.length} követelmény teljesült, ${failed} sikertelen.`);
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

// =====================================================================
// PUPPETEER PAGE / DOM SEGÉDFÜGGVÉNYEK
// =====================================================================

function createNetworkController() {
  return {
    mlszListCalls: [],
    mlszIdCalls: [],
    emailCalls: [],
    usersCalls: [],
    mlszListOverride: null,
    mlszByIdOverrides: new Map(),
    pendingEmailRequests: new Map(),
    resetCallLogs() {
      this.mlszListCalls = [];
      this.mlszIdCalls = [];
      this.emailCalls = [];
      this.usersCalls = [];
    },
    clearOverrides() {
      this.mlszListOverride = null;
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

    if (url.startsWith(`${API_URL}/api/mlsz/matches`)) {
      const pathOnly = new URL(url).pathname;
      if (pathOnly === "/api/mlsz/matches") {
        net.mlszListCalls.push({ url, time: Date.now() });
        if (net.mlszListOverride) {
          const orig = await apiJson("/api/mlsz/matches", {
            headers: { "x-api-key": MLSZ_API_KEY },
          });
          const statusFilter = new URL(url).searchParams.get("status");
          let payload = net.mlszListOverride(orig.data, statusFilter);
          if (statusFilter && Array.isArray(payload?.matches)) {
            const filtered = payload.matches.filter((m) => m.status === statusFilter);
            payload = { ...payload, count: filtered.length, matches: filtered };
          }
          return req.respond({
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            contentType: "application/json",
            body: JSON.stringify(payload),
          });
        }
      } else {
        const idStr = pathOnly.split("/").pop();
        net.mlszIdCalls.push({ url, id: idStr, time: Date.now() });
        if (net.mlszByIdOverrides.has(idStr)) {
          return req.respond({
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            contentType: "application/json",
            body: JSON.stringify(net.mlszByIdOverrides.get(idStr)),
          });
        }
      }
      return req.continue();
    }

    if (url === `${API_URL}/api/users` && method === "GET") {
      net.usersCalls.push({ url, time: Date.now() });
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

async function isLoggedIn(page) {
  return page.evaluate(() => Boolean(document.querySelector('button[title="Profil menü"]')));
}

async function logoutUi(page) {
  const logged = await isLoggedIn(page);
  if (!logged) return;
  await page.click('button[title="Profil menü"]');
  await sleep(150);
  await clickButtonByText(page, "Kijelentkezés");
  await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
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

async function loginUi(page, username, password, { expectFail = false } = {}) {
  if (await isLoggedIn(page)) {
    await logoutUi(page);
  }
  await page.waitForSelector('input[type="text"]', { timeout: 5000 });
  const textInput = await page.$('input[type="text"]');
  const passInput = await page.$('input[type="password"]');

  await clearAndType(page, textInput, username);
  await clearAndType(page, passInput, password);

  await page.click('button[type="submit"]');

  if (expectFail) {
    await page.waitForFunction(
      () => document.body.innerText.includes("Hibás felhasználónév vagy jelszó"),
      { timeout: 6000 }
    );
    return;
  }

  await page.waitForSelector('button[title="Profil menü"]', { timeout: 8000 });
  await sleep(500);
}

async function freshReloadAndLogin(page, username, password) {
  await page.goto(FRONTEND_URL, { waitUntil: "networkidle2" });
  await loginUi(page, username, password);
  await sleep(600);
}

async function clickButtonByText(page, text, { exact = true } = {}) {
  const marker = `e2e-btn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const found = await page.evaluate(
    (target, isExact, mk) => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const btn = buttons.find((el) => {
        if (el.offsetParent === null) return false;
        const t = el.textContent.trim().replace(/\s+/g, " ");
        return isExact ? t === target : t.includes(target);
      });
      if (!btn) return false;
      btn.scrollIntoView({ block: "center" });
      btn.setAttribute("data-e2e-click", mk);
      return true;
    },
    text,
    exact,
    marker
  );
  if (!found) throw new Error(`Nem található látható gomb/link: "${text}"`);
  const handle = await page.$(`[data-e2e-click="${marker}"]`);
  await handle.click();
}

async function openSidemenuItem(page, label) {
  const itemVisible = await page.evaluate((lbl) => {
    return Array.from(document.querySelectorAll("div")).some(
      (d) => d.textContent.trim() === lbl && d.className.includes("cursor-pointer") && d.offsetParent !== null
    );
  }, label);

  if (!itemVisible) {
    await page.click('button[aria-label="Menü megnyitása"]');
    await sleep(200);
  }

  const clicked = await page.evaluate((lbl) => {
    const el = Array.from(document.querySelectorAll("div")).find(
      (d) => d.textContent.trim() === lbl && d.className.includes("cursor-pointer") && d.offsetParent !== null
    );
    if (!el) return false;
    el.click();
    return true;
  }, label);

  if (!clicked) throw new Error(`Nem található oldalsáv menüpont: "${label}"`);
  await sleep(300);
}

async function openProfileMenuItem(page, label) {
  await page.click('button[title="Profil menü"]');
  await sleep(200);
  await clickButtonByText(page, label, { exact: false });
  await sleep(300);
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
      .map((tr) => {
        const tds = Array.from(tr.querySelectorAll("td"));
        return {
          text: tr.textContent.trim().replace(/\s+/g, " "),
          teams: tds[0]?.textContent.trim() || "",
          dateTime: tds[1]?.textContent.trim() || "",
          venue: tds[2]?.textContent.trim() || "",
          hasViewBtn: tr.textContent.includes("Megtekintés"),
          hasDownloadBtn: tr.textContent.includes("Letöltés"),
        };
      });
  }, headingText);
}

async function clickHomeSectionRow(page, headingText, matchText) {
  const clicked = await page.evaluate(
    (heading, needle) => {
      const h2 = Array.from(document.querySelectorAll("h2")).find(
        (el) => el.textContent.trim() === heading
      );
      if (!h2 || !h2.nextElementSibling) return false;
      const rows = Array.from(h2.nextElementSibling.querySelectorAll("tbody tr"));
      const tr = rows.find((r) => r.textContent.includes(needle));
      if (!tr) return false;
      tr.click();
      return true;
    },
    headingText,
    matchText
  );
  if (!clicked) throw new Error(`"${headingText}" táblázatban nem található sor: "${matchText}"`);
  await sleep(400);
}

async function clickVisibleTableRow(page, matchText) {
  const clicked = await page.evaluate((needle) => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    const tr = rows.find((r) => r.offsetParent !== null && r.textContent.includes(needle));
    if (!tr) return false;
    tr.click();
    return true;
  }, matchText);
  if (!clicked) throw new Error(`A táblázatban nem található sor: "${matchText}"`);
  await sleep(400);
}

async function fillHeaderField(page, labelText, value) {
  const sel = await page.evaluate((lbl) => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (s) => s.textContent.trim() === lbl && s.offsetParent !== null
    );
    if (!span || !span.parentElement) return null;
    const input = span.parentElement.querySelector("input");
    if (!input) return null;
    input.setAttribute("data-e2e-target", lbl);
    return `input[data-e2e-target="${lbl}"]`;
  }, labelText);

  if (!sel) throw new Error(`Fejléc mező nem található: "${labelText}"`);
  const handle = await page.$(sel);
  await clearAndType(page, handle, value);
}

async function getHeaderFieldValue(page, labelText) {
  return page.evaluate((lbl) => {
    const span = Array.from(document.querySelectorAll("span")).find(
      (s) => s.textContent.trim() === lbl && s.offsetParent !== null
    );
    return span?.parentElement?.querySelector("input")?.value ?? null;
  }, labelText);
}

async function fillLabeledInput(page, labelText, value) {
  const marker = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const found = await page.evaluate(
    (lbl, mk) => {
      const label = Array.from(document.querySelectorAll("label")).find(
        (l) => l.offsetParent !== null && l.textContent.trim().startsWith(lbl)
      );
      if (!label || !label.parentElement) return false;
      const input = label.parentElement.querySelector("input, textarea, select");
      if (!input) return false;
      input.setAttribute("data-e2e-field", mk);
      return true;
    },
    labelText,
    marker
  );
  if (!found) throw new Error(`Űrlap mező nem található: "${labelText}"`);
  const handle = await page.$(`[data-e2e-field="${marker}"]`);
  await clearAndType(page, handle, value);
}

async function checkPdfEndpoint(matchId, label) {
  const inlineRes = await fetch(`${API_URL}/api/matches/${matchId}/pdf`);
  assert(inlineRes.status === 200, `${label}: inline PDF HTTP ${inlineRes.status}`);
  const ct = inlineRes.headers.get("content-type") || "";
  const cd = inlineRes.headers.get("content-disposition") || "";
  assert(ct.includes("application/pdf"), `${label}: hibás Content-Type (${ct})`);
  assert(cd.includes("inline"), `${label}: inline Content-Disposition hiányzik (${cd})`);
  const buf = Buffer.from(await inlineRes.arrayBuffer());
  assert(buf.subarray(0, 5).toString("ascii") === "%PDF-", `${label}: érvénytelen PDF fejléc`);
  assert(buf.length > 1000, `${label}: túl kicsi PDF (${buf.length} bájt)`);

  const dlRes = await fetch(`${API_URL}/api/matches/${matchId}/pdf?download=1`);
  assert(dlRes.status === 200, `${label}: letöltés PDF HTTP ${dlRes.status}`);
  const dlCd = dlRes.headers.get("content-disposition") || "";
  assert(dlCd.includes("attachment"), `${label}: attachment Content-Disposition hiányzik (${dlCd})`);
  const dlBuf = Buffer.from(await dlRes.arrayBuffer());
  assert(dlBuf.subarray(0, 5).toString("ascii") === "%PDF-", `${label}: letöltött fájl nem érvényes PDF`);

  return buf.length;
}

// =====================================================================
// FŐ TESZTFOLYAMAT
// =====================================================================

async function main() {
  console.log("================================================================");
  console.log("Rába ETO Digitális Eseménynapló - Követelmény E2E Tesztprogram");
  console.log(`Frontend: ${FRONTEND_URL} | Backend: ${API_URL}`);
  console.log("================================================================\n");

  // 0. Szerverek elérhetőségének ellenőrzése
  let dbStatus;
  try {
    const dbRes = await apiJson("/api/db/status");
    assert(dbRes.ok, `Backend HTTP ${dbRes.status}`);
    dbStatus = dbRes.data;

    const feRes = await fetch(FRONTEND_URL);
    assert(feRes.ok, `Frontend HTTP ${feRes.status}`);
  } catch (err) {
    console.error(
      `HIBA: A backend (${API_URL}) vagy a frontend (${FRONTEND_URL}) nem elérhető: ${err.message}`
    );
    process.exit(1);
  }

  console.log(
    `Adatbázis mód: ${dbStatus.connected ? "PostgreSQL (Aktív)" : "In-Memory Fallback"}\n`
  );

  // Kezdeti állapot mentése a visszaállításhoz
  const initialMasterData = (await apiJson("/api/master-data")).data;
  const initialUsers = (await apiJson("/api/users")).data;
  const initialMatches = (await apiJson("/api/matches")).data;
  const initialMatchIds = new Set(initialMatches.map((m) => Number(m.id)));
  const initialUserIds = new Set(initialUsers.map((u) => Number(u.id)));

  let pgPool = null;
  if (dbStatus.connected) {
    const env = loadBackendEnv();
    pgPool = new Pool({
      user: env.DB_USER || "postgres",
      host: env.DB_HOST || "localhost",
      database: env.DB_NAME || "esemenynaplodigit",
      password: env.DB_PASSWORD || "postgrespassword",
      port: parseInt(env.DB_PORT || "5432", 10),
    });
  }

  const execPath = getChromeExecutablePath();
  const browser = await puppeteer.launch({
    headless: "new",
    ...(execPath ? { executablePath: execPath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const runner = new TestRunner();
  const net = createNetworkController();
  const page = await browser.newPage();
  await attachControllers(page, net);

  try {
    await page.goto(FRONTEND_URL, { waitUntil: "networkidle2" });

    // -----------------------------------------------------------------
    // T1: Bejelentkezés + API lekérés minden belépéskor + változások updatelése
    // -----------------------------------------------------------------
    await runner.run("T1.1", "Hibás belépés elutasítása, helyes Admin belépés", async () => {
      await loginUi(page, "Admin", "HibasJelszo123", { expectFail: true });
      const stillOnLogin = await page.evaluate(() =>
        Boolean(document.querySelector('button[type="submit"]'))
      );
      assert(stillOnLogin, "Hibás jelszóval sem maradt a bejelentkező oldalon.");

      await loginUi(page, "Admin", "Adminjelszo");
      const headerText = await page.evaluate(() => document.body.innerText);
      assert(headerText.includes("Főnézet") && headerText.includes("Admin"), "Nem jelent meg a főnézet belépés után.");
    });

    await runner.run("T1.2", "MLSZ Mock API lekérése MINDEN bejelentkezéskor", async () => {
      await page.goto(FRONTEND_URL, { waitUntil: "networkidle2" });
      await sleep(300);
      net.resetCallLogs();
      await loginUi(page, "Admin", "Adminjelszo");
      await sleep(800);
      const calls1 = net.mlszListCalls.length;

      await logoutUi(page);
      net.resetCallLogs();
      await loginUi(page, "User1", "Userjelszo");
      await sleep(800);
      const calls2 = net.mlszListCalls.length;

      assert(
        calls1 >= 1 && calls2 >= 1,
        `Az API lekérés nem történt meg minden bejelentkezéskor (1. belépés utáni hívás: ${calls1}, 2. belépés utáni hívás: ${calls2}).`
      );
    });

    await runner.run("T1.3", "Bejelentkezéskor az API-ban módosult meccsadatok frissítése", async () => {
      const targetDbMatch =
        initialMatches.find(
          (m) => m.status === "in_progress" && [1, 6, 7].includes(Number(m.id))
        ) || initialMatches.find((m) => Number(m.id) === 1);
      const targetDbId = Number(targetDbMatch?.id || 6);

      await logoutUi(page);
      net.clearOverrides();
      net.mlszListOverride = (orig) => ({
        ...orig,
        matches: (orig.matches || []).map((m) => {
          if (Number(m.id) === targetDbId) {
            return { ...m, venue: "TESZT_FRISSITETT_STADION", time: "21:15" };
          }
          if (Number(m.id) === 100011) {
            return { ...m, venue: "TESZT_UPCOMING_ARENA", time: "20:30" };
          }
          return m;
        }),
      });

      await loginUi(page, "Admin", "Adminjelszo");
      await sleep(1000);

      const dbMatch = (await apiJson(`/api/matches/${targetDbId}`)).data;
      const bodyText = await page.evaluate(() => document.body.innerText);
      net.clearOverrides();

      assert(
        dbMatch?.venue === "TESZT_FRISSITETT_STADION" ||
          bodyText.includes("TESZT_FRISSITETT_STADION"),
        `A bejelentkezéskor módosult API mérkőzésadat (id=${targetDbId} helyszín/időpont) nem frissült.`
      );
      assert(
        bodyText.includes("TESZT_UPCOMING_ARENA"),
        "A közelgő API mérkőzés módosult helyszíne nem frissült bejelentkezéskor."
      );
    });

    // -----------------------------------------------------------------
    // T2: 4 órás megnyitott intervallum + nem-megnyitott API meccs csak olvasható
    // -----------------------------------------------------------------
    await runner.run("T2.1", "Megnyitott naplók csak a kezdés előtti 4 órás intervallumon belül", async () => {
      net.clearOverrides();
      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      const openRows = await getHomeSectionRows(page, "Megnyitott naplók");

      const now = Date.now();
      const violations = [];
      for (const row of openRows) {
        const dt = parseUiDateTime(row.dateTime);
        if (!dt) continue;
        const hoursUntilStart = (dt.getTime() - now) / (1000 * 60 * 60);
        const hoursSinceStart = -hoursUntilStart;
        if (hoursUntilStart > 4 || hoursSinceStart >= 12) {
          violations.push(`${row.teams} (${row.dateTime}, eltérés: ${hoursUntilStart.toFixed(1)}h)`);
        }
      }

      assert(
        violations.length === 0,
        `${violations.length} mérkőzés szerepel a 'Megnyitott naplók' között a 4 órás nyitási / 12 órás zárási intervallumon kívül: ${violations.slice(0, 3).join("; ")}`
      );
    });

    await runner.run("T2.2", "4 órán túli jövőbeli API meccs csak megtekinthető (nem szerkeszthető)", async () => {
      const farTimes = formatLocalDates(48 * 60 * 60 * 1000);
      net.clearOverrides();
      net.mlszListOverride = (orig) => ({
        ...orig,
        matches: [
          ...(orig.matches || []),
          {
            id: TEST_ID_MLSZ_FAR,
            teamId: 323805,
            competition: "NB I",
            homeTeam: "[E2E] Távoli Csapat",
            awayTeam: "ETO",
            date: farTimes.isoDate,
            time: farTimes.time,
            venue: "Távoli Teszt Stadion",
            status: "scheduled",
            score: null,
            winner: null,
          },
        ],
      });

      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      await clickHomeSectionRow(page, "Következő mérkőzések", "[E2E] Távoli Csapat");

      const check = await page.evaluate(() => {
        const text = [
          document.body.innerText,
          ...Array.from(document.querySelectorAll("input, textarea")).map((i) => i.value || ""),
        ].join("\n");
        const visibleButtons = Array.from(document.querySelectorAll("button"))
          .filter((b) => b.offsetParent !== null)
          .map((b) => b.textContent.trim());
        const visibleInputs = Array.from(document.querySelectorAll("input, select, textarea"))
          .filter((el) => el.offsetParent !== null);
        return {
          hasDetails: text.includes("Távoli Csapat") && text.includes("ETO"),
          hasEditInputs: visibleInputs.length > 0,
          hasSaveBtn: visibleButtons.includes("Mentés"),
          hasFinalizeBtn: visibleButtons.includes("Véglegesítés"),
          hasAddEventBtn: visibleButtons.some((t) => t.includes("Esemény hozzáadása")),
        };
      });

      await clickButtonByText(page, "Vissza").catch(() => openSidemenuItem(page, "Főnézet"));
      await sleep(300);
      const openRowsAfter = await getHomeSectionRows(page, "Megnyitott naplók");
      const movedToOpen = openRowsAfter.some((r) => r.text.includes("[E2E] Távoli Csapat"));
      net.clearOverrides();

      assert(check.hasDetails, "A jövőbeli mérkőzés adatai nem jelentek meg.");
      assert(
        !check.hasEditInputs && !check.hasSaveBtn && !check.hasFinalizeBtn && !check.hasAddEventBtn,
        "A 4 órán túli jövőbeli API meccs szerkeszthető módban nyílt meg csak olvasható helyett."
      );
      assert(!movedToOpen, "A jövőbeli meccs megtekintés után átkerült a Megnyitott naplók közé.");
    });

    await runner.run("T2.3", "Kezdés előtti 4 órán belüli API meccs megjelenik Megnyitottként és szerkeszthető", async () => {
      const soonTimes = formatLocalDates(2 * 60 * 60 * 1000);
      net.clearOverrides();
      net.mlszListOverride = (orig) => ({
        ...orig,
        matches: [
          ...(orig.matches || []),
          {
            id: TEST_ID_MLSZ_SOON,
            teamId: 323805,
            competition: "NB I",
            homeTeam: "[E2E] 2h Belüli Csapat",
            awayTeam: "ETO",
            date: soonTimes.isoDate,
            time: soonTimes.time,
            venue: "ETO Park",
            status: "scheduled",
            score: null,
            winner: null,
          },
        ],
      });

      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      const openRows = await getHomeSectionRows(page, "Megnyitott naplók");
      const foundInOpen = openRows.some((r) => r.text.includes("[E2E] 2h Belüli Csapat"));
      net.clearOverrides();

      assert(
        foundInOpen,
        "A kezdés előtti 4 órán belüli (+2h) API mérkőzés nem jelent meg automatikusan a 'Megnyitott naplók' listában."
      );
    });

    // -----------------------------------------------------------------
    // T3: Megnyitott meccs mentése lezárás nélkül és szerkesztés folytatása
    // -----------------------------------------------------------------
    await runner.run("T3", "Megnyitott meccs mentése lezárás nélkül, újranyitás és szerkesztés folytatása", async () => {
      net.clearOverrides();
      const tSoon = formatLocalDates(90 * 60 * 1000);
      const createRes = await apiJson("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: TEST_ID_OWN_EDIT,
          teamId: 323805,
          competition: "NB I",
          homeTeam: "[E2E] Nyitott Teszt",
          awayTeam: "ETO",
          title: "[E2E] Nyitott Teszt vs ETO",
          date: tSoon.huDate,
          time: tSoon.time,
          venue: "ETO Park",
          status: "in_progress",
          meta: {
            competitionName: "NB I",
            homeTeam: "[E2E] Nyitott Teszt",
            awayTeam: "ETO",
            matchDate: tSoon.huDate,
            matchTime: tSoon.time,
            venue: "ETO Park",
            eventLogLeader: "Kezdeti Vezető",
          },
        }),
      });
      assert(createRes.ok, `Tesztmeccs létrehozás hiba: HTTP ${createRes.status}`);

      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      await clickHomeSectionRow(page, "Megnyitott naplók", "[E2E] Nyitott Teszt vs ETO");

      await fillHeaderField(page, "Eseménynapló vezető", "Mentett Vezető E2E");
      await clickButtonByText(page, "+ Esemény hozzáadása");
      await sleep(200);

      // Kitöltjük az első látható esemény leírását
      const descMarker = await page.evaluate(() => {
        const areas = Array.from(document.querySelectorAll('textarea[placeholder="Esemény leírása..."]'));
        const visible = areas.find((a) => a.offsetParent !== null);
        if (!visible) return false;
        visible.setAttribute("data-e2e-ev-desc", "1");
        return true;
      });
      assert(descMarker, "Az esemény leírás mező nem található.");
      const descHandle = await page.$('textarea[data-e2e-ev-desc="1"]');
      await descHandle.type("Első mentett teszt esemény");

      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("sikeresen mentésre kerültek"),
        { timeout: 6000 }
      );

      // Ellenőrizzük, hogy továbbra is megnyitott maradt, majd újranyitjuk reload után
      await clickButtonByText(page, "Vissza");
      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      const openRows = await getHomeSectionRows(page, "Megnyitott naplók");
      assert(
        openRows.some((r) => r.text.includes("[E2E] Nyitott Teszt vs ETO")),
        "Mentés után eltűnt a Megnyitott naplók közül."
      );

      await clickHomeSectionRow(page, "Megnyitott naplók", "[E2E] Nyitott Teszt vs ETO");
      const savedLeader = await getHeaderFieldValue(page, "Eseménynapló vezető");
      const savedDesc = await page.evaluate(() => {
        const areas = Array.from(document.querySelectorAll('textarea[placeholder="Esemény leírása..."]'));
        return areas.find((a) => a.offsetParent !== null)?.value || "";
      });
      assert(savedLeader === "Mentett Vezető E2E", `Mentett fejléc nem maradt meg (${savedLeader})`);
      assert(savedDesc === "Első mentett teszt esemény", `Mentett esemény nem maradt meg (${savedDesc})`);

      // Folytatható a szerkesztés
      await fillHeaderField(page, "Eseménynapló vezető", "Folytatott Vezető E2E");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("sikeresen mentésre kerültek"),
        { timeout: 6000 }
      );
    });

    // -----------------------------------------------------------------
    // T4.1 & T5: Manuális lezárás + Automatikus e-mail küldés
    // -----------------------------------------------------------------
    await runner.run("T4.1", "Manuális lezárás kötelező végeredmény megadásával", async () => {
      await clickButtonByText(page, "Véglegesítés");
      await page.waitForFunction(
        () => document.body.innerText.includes("Eseménynapló véglegesítése"),
        { timeout: 4000 }
      );

      // Üres végeredmény validálása
      await clickButtonByText(page, "Lezárás és mentés");
      await sleep(250);
      const modalErr = await page.evaluate(() => document.body.innerText.includes("végeredményt"));
      assert(modalErr, "A véglegesítő modal engedte üres végeredménnyel a lezárást.");

      // Végeredmény beírása és lezárás
      const scoreInput = await page.$('input[placeholder="pl. 2 - 1"]');
      await scoreInput.type("2 - 1");
      net.resetCallLogs();
      await clickButtonByText(page, "Lezárás és mentés");

      await page.waitForFunction(
        () => document.body.innerText.includes("Lezárt eseménynapló"),
        { timeout: 8000 }
      );
      await sleep(500);

      const updated = (await apiJson(`/api/matches/${TEST_ID_OWN_EDIT}`)).data;
      assert(updated.status === "finalized", `Státusz nem 'finalized' lett (${updated.status})`);
      assert(updated.score === "2 - 1", `Végeredmény nem mentődött (${updated.score})`);
    });

    await runner.run("T5", "Lezáráskor automatikus e-mail küldés a rendszer e-mail címére", async () => {
      // Várunk kicsit, hogy az SMTP kérés biztosan befejeződjön
      const start = Date.now();
      while (Date.now() - start < 10000) {
        const found = net.emailCalls.find((c) => Number(c.payload?.matchId) === TEST_ID_OWN_EDIT);
        if (found && found.status !== null) break;
        await sleep(300);
      }

      const call = net.emailCalls.find((c) => Number(c.payload?.matchId) === TEST_ID_OWN_EDIT);
      assert(call, "Lezáráskor nem történt POST /api/send-email kérés.");
      assert(
        call.payload?.to === initialMasterData.reportEmail,
        `Az e-mail nem a törzsadatokban megadott címre ment (${call.payload?.to} !== ${initialMasterData.reportEmail})`
      );
      assert(
        call.status === 200 && call.response?.success === true,
        `Az e-mail küldés szerveroldali válasza sikertelen volt: HTTP ${call.status} (${JSON.stringify(call.response)})`
      );
    });

    // -----------------------------------------------------------------
    // T6: Lezárt napló nem szerkeszthető, komment menthető, PDF view/download
    // -----------------------------------------------------------------
    await runner.run("T6", "Lezárt napló szerkesztése tiltva, komment menthető, PDF megtekinthető/letölthető", async () => {
      const uiState = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input, select"))
          .filter((el) => el.offsetParent !== null);
        const btns = Array.from(document.querySelectorAll("button, a"))
          .filter((b) => b.offsetParent !== null)
          .map((b) => b.textContent.trim());
        return {
          editableInputCount: inputs.length,
          hasSaveBtn: btns.includes("Mentés"),
          hasFinalizeBtn: btns.includes("Véglegesítés"),
          hasPdfViewBtn: btns.some((t) => t.includes("PDF Megtekintése")),
          hasPdfDlBtn: btns.some((t) => t.includes("PDF Letöltése")),
        };
      });

      assert(uiState.editableInputCount === 0, "A lezárt nézetben maradt szerkeszthető input/select.");
      assert(!uiState.hasSaveBtn && !uiState.hasFinalizeBtn, "A lezárt nézetben még látható Mentés/Véglegesítés gomb.");
      assert(uiState.hasPdfViewBtn && uiState.hasPdfDlBtn, "Hiányzik a PDF Megtekintése / Letöltése gomb a lezárt nézetből.");

      // Komment hozzáadása és mentése
      const noteText = `E2E lezárt komment ${Date.now()}`;
      const ta = await page.$('textarea[placeholder*="lezárt"]');
      assert(ta, "Nem található megjegyzés szövegmező a lezárt nézetben.");
      await ta.type(noteText);
      await clickButtonByText(page, "Megjegyzés mentése");
      await page.waitForFunction(
        (txt) => document.body.innerText.includes(txt),
        { timeout: 6000 },
        noteText
      );

      // Ellenőrzés Lezárt nézetben reload után
      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      await openSidemenuItem(page, "Lezárt");
      const closedHasPdfBtns = await page.evaluate((titleNeedle) => {
        const tr = Array.from(document.querySelectorAll("table tbody tr")).find(
          (r) => r.offsetParent !== null && r.textContent.includes(titleNeedle)
        );
        return tr ? tr.textContent.includes("Megtekintés") && tr.textContent.includes("Letöltés") : false;
      }, "[E2E] Nyitott Teszt vs ETO");
      assert(closedHasPdfBtns, "A Lezárt táblázat sorában nem szerepelnek a PDF gombok.");

      await clickVisibleTableRow(page, "[E2E] Nyitott Teszt vs ETO");
      const persistedNote = await page.evaluate(
        (txt) => document.body.innerText.includes(txt),
        noteText
      );
      assert(persistedNote, "A mentett komment nem töltődött vissza oldal-újratöltés után.");

      await checkPdfEndpoint(TEST_ID_OWN_EDIT, "Lezárt PDF");
    });

    // -----------------------------------------------------------------
    // T4.2: Automatikus lezárás 12 óra után az API eredményével
    // -----------------------------------------------------------------
    await runner.run("T4.2", "Automatikus lezárás 12 óra után API végeredménnyel és e-mail küldéssel", async () => {
      const t14h = formatLocalDates(-14 * 60 * 60 * 1000);
      await apiJson("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: TEST_ID_AUTO_12H,
          teamId: 323805,
          competition: "NB I",
          homeTeam: "[E2E] 12h Lezárandó",
          awayTeam: "ETO",
          title: "[E2E] 12h Lezárandó vs ETO",
          date: t14h.huDate,
          time: t14h.time,
          venue: "ETO Park",
          status: "in_progress",
          meta: {
            competitionName: "NB I",
            homeTeam: "[E2E] 12h Lezárandó",
            awayTeam: "ETO",
            matchDate: t14h.huDate,
            matchTime: t14h.time,
          },
        }),
      });

      net.clearOverrides();
      net.resetCallLogs();
      net.mlszByIdOverrides.set(String(TEST_ID_AUTO_12H), {
        id: TEST_ID_AUTO_12H,
        teamId: 323805,
        competition: "NB I",
        homeTeam: "[E2E] 12h Lezárandó",
        awayTeam: "ETO",
        date: t14h.isoDate,
        time: t14h.time,
        venue: "ETO Park",
        status: "ended",
        score: "0 - 4",
        winner: "ETO",
      });

      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      await sleep(3000);

      const m12h = (await apiJson(`/api/matches/${TEST_ID_AUTO_12H}`)).data;
      net.clearOverrides();

      assert(m12h.status === "finalized", `14 órás mérkőzés nem záródott le automatikusan (status=${m12h.status})`);
      assert(m12h.score === "0 - 4" && m12h.winner === "ETO", `Nem az API eredményét kapta meg (${m12h.score} / ${m12h.winner})`);

      const autoMail = net.emailCalls.find((c) => Number(c.payload?.matchId) === TEST_ID_AUTO_12H);
      assert(autoMail, "Automatikus 12 órás lezáráskor nem indult e-mail küldés.");
    });

    // -----------------------------------------------------------------
    // T7: Archiváltnak számít 1 hét után + komment tiltva + meglévő látható + PDF
    // -----------------------------------------------------------------
    await runner.run("T7.1", "Automatikus archiválás a meccs kezdetétől számított 1 hét (7 nap) után", async () => {
      const t8d = formatLocalDates(-8 * 24 * 60 * 60 * 1000);
      await apiJson("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: TEST_ID_AUTO_ARCHIVE,
          teamId: 323805,
          competition: "NB I",
          homeTeam: "[E2E] 8 Napos Meccs",
          awayTeam: "ETO",
          title: "[E2E] 8 Napos Meccs vs ETO",
          date: t8d.huDate,
          time: t8d.time,
          venue: "ETO Park",
          status: "finalized",
          score: "1 - 1",
          winner: "Döntetlen",
          meta: {
            competitionName: "NB I",
            homeTeam: "[E2E] 8 Napos Meccs",
            awayTeam: "ETO",
            matchDate: t8d.huDate,
            matchTime: t8d.time,
            score: "1 - 1",
            winner: "Döntetlen",
          },
        }),
      });

      await freshReloadAndLogin(page, "Admin", "Adminjelszo");
      await openSidemenuItem(page, "Archivált");
      const inArchivedUi = await page.evaluate(() =>
        document.body.innerText.includes("[E2E] 8 Napos Meccs vs ETO")
      );
      const dbMatch = (await apiJson(`/api/matches/${TEST_ID_AUTO_ARCHIVE}`)).data;

      assert(
        inArchivedUi && dbMatch.status === "archived",
        `A 8 napos mérkőzés nem vált automatikusan Archiválttá (jelenlegi státusz: ${dbMatch.status}, Archivált listában látható: ${inArchivedUi}).`
      );
    });

    await runner.run("T7.2", "Archivált nézetben komment hozzáadása tiltva, meglévő látható, PDF működik", async () => {
      await openSidemenuItem(page, "Archivált");
      const tableHasBtns = await page.evaluate(() => {
        const tr = Array.from(document.querySelectorAll("table tbody tr")).find(
          (r) => r.offsetParent !== null && r.textContent.includes("CSAPAT 5 vs ETO")
        );
        return tr ? tr.textContent.includes("Megtekintés") && tr.textContent.includes("Letöltés") : false;
      });
      assert(tableHasBtns, "Az Archivált táblázatból hiányoznak a PDF gombok (id=4).");

      await clickVisibleTableRow(page, "CSAPAT 5 vs ETO");
      const state = await page.evaluate(() => {
        const text = document.body.innerText;
        const textareas = Array.from(document.querySelectorAll("textarea")).filter(
          (t) => t.offsetParent !== null
        );
        const btns = Array.from(document.querySelectorAll("button, a"))
          .filter((b) => b.offsetParent !== null)
          .map((b) => b.textContent.trim());
        return {
          hasExistingNote: text.includes("Archiválva a hatósági ellenőrzést követően."),
          hasCommentTextarea: textareas.length > 0,
          hasSaveNoteBtn: btns.some((b) => b.includes("Megjegyzés mentése")),
          hasPdfView: btns.some((b) => b.includes("PDF Megtekintése")),
          hasPdfDl: btns.some((b) => b.includes("PDF Letöltése")),
        };
      });

      assert(state.hasExistingNote, "Az archivált meccs meglévő kommentje nem látható.");
      assert(!state.hasCommentTextarea && !state.hasSaveNoteBtn, "Archivált meccsnél is elérhető komment írása!");
      assert(state.hasPdfView && state.hasPdfDl, "Archivált nézetből hiányzik a PDF Megtekintése / Letöltése.");
      await checkPdfEndpoint(4, "Archivált PDF");
    });

    // -----------------------------------------------------------------
    // T8: Admin jogosultságok
    // -----------------------------------------------------------------
    await runner.run("T8", "Admin: törzsadatok, szerződtetett partnerek, elérhetőségek, felhasználók, saját adatok szerkesztése", async () => {
      await openProfileMenuItem(page, "Admin felület");

      // 1) Törzsadatok + szerződtetett partnerek + elérhetőségek
      await clickButtonByText(page, "Törzsadatok");
      await page.click('button[title="Törzsadatok szerkesztése"]');
      await sleep(150);

      await fillLabeledInput(page, "Rendező szervezet", "E2E Teszt Klub");
      await fillLabeledInput(page, "Főrendező", "E2E Főrendező");
      await fillLabeledInput(page, "Egészségügyi biztosító", "E2E EÜ Partner Kft.");
      await fillLabeledInput(page, "Katasztrófavédelmi biztosító", "E2E Katvéd Partner Kft.");
      await fillLabeledInput(page, "Szervezeti telefonszám", "+36 96 777 888");
      await fillLabeledInput(page, "Szervezeti cím", "9027 Győr, Teszt út 1.");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("törzsadatok sikeresen mentve"),
        { timeout: 6000 }
      );

      const savedMd = (await apiJson("/api/master-data")).data;
      assert(savedMd.healthcareProvider === "E2E EÜ Partner Kft.", `Partner szerkesztés nem mentődött (${savedMd.healthcareProvider}).`);
      assert(savedMd.phone === "+36 96 777 888" && savedMd.address === "9027 Győr, Teszt út 1.", `Elérhetőségek nem mentődtek (${savedMd.phone}, ${savedMd.address}).`);

      // Visszaállítás
      await apiJson("/api/master-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initialMasterData),
      });

      // 2) Más felhasználók kezelése (szerkesztés, létrehozás, törlés)
      await clickButtonByText(page, "Felhasználók");
      await sleep(200);
      await clickVisibleTableRow(page, "user1@eto.hu");
      await page.click('button[title="Felhasználó szerkesztése"]');
      await fillLabeledInput(page, "Telefonszám", "+36 30 999 0000");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("Felhasználó adatai frissítve"),
        { timeout: 6000 }
      );

      const user1After = (await apiJson("/api/users")).data.find((u) => u.username === "User1");
      assert(user1After?.phone === "+36 30 999 0000", "Más felhasználó adatainak szerkesztése sikertelen.");

      // Új felhasználó + törlés
      await clickButtonByText(page, "Új felhasználó");
      await fillLabeledInput(page, "Név", "E2E Teszt Felhasználó");
      await fillLabeledInput(page, "E-mail", "e2e_temp@eto.hu");
      await fillLabeledInput(page, "Telefonszám", "+36 30 111 0000");
      await fillLabeledInput(page, "Felhasználónév", "e2e_test_temp");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("Új felhasználó elmentve"),
        { timeout: 6000 }
      );

      const createdTemp = (await apiJson("/api/users")).data.find((u) => u.username === "e2e_test_temp");
      assert(createdTemp, "Admin új felhasználó létrehozása sikertelen.");
      await clickButtonByText(page, "Felhasználó törlése");
      await page.waitForFunction(
        () => document.body.innerText.includes("Felhasználó törölve"),
        { timeout: 6000 }
      );

      // 3) Admin saját adatai szerkeszthetők
      await openProfileMenuItem(page, "Profil megtekintése");
      await page.click('button[title="Profil szerkesztése"]');
      await fillLabeledInput(page, "Név", "Adminisztrátor E2E");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("profil adatai sikeresen mentésre kerültek"),
        { timeout: 6000 }
      );

      const adminAfter = (await apiJson("/api/users")).data.find((u) => u.username === "Admin");
      assert(adminAfter?.name === "Adminisztrátor E2E", "Admin saját profil szerkesztése sikertelen.");
    });

    // -----------------------------------------------------------------
    // T9: Biztonsági felelős (sima user) jogosultságok
    // -----------------------------------------------------------------
    await runner.run("T9", "Biztonsági felelős: csak saját adatokat szerkeszthet, nem látja a többi felhasználót", async () => {
      await logoutUi(page);
      net.resetCallLogs();
      await loginUi(page, "User1", "Userjelszo");

      // Profil menüben nincs Admin felület
      await page.click('button[title="Profil menü"]');
      await sleep(200);
      const hasAdminMenu = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.offsetParent !== null && b.textContent.includes("Admin felület")
        )
      );
      assert(!hasAdminMenu, "Sima user profil menüjében megjelent az Admin felület.");

      // Profil megtekintése megnyitása
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => b.offsetParent !== null && b.textContent.includes("Profil megtekintése")
        );
        if (btn) btn.click();
      });
      await sleep(500);

      const profileAudit = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasRegisteredTable = text.includes("Regisztrált felhasználók");
        const leaksOtherUsers =
          text.includes("admin@eto.hu") ||
          text.includes("Adminisztrátor") ||
          text.includes("SZE Connect Projektvezető");
        const hasOrgEditBtn = Boolean(document.querySelector('button[title="Törzsadatok szerkesztése"]'));
        const hasOwnEditBtn = Boolean(document.querySelector('button[title="Profil szerkesztése"]'));
        return { hasRegisteredTable, leaksOtherUsers, hasOrgEditBtn, hasOwnEditBtn };
      });

      assert(!profileAudit.hasRegisteredTable && !profileAudit.leaksOtherUsers, "Sima user látja a többi felhasználót a felületen!");
      assert(!profileAudit.hasOrgEditBtn, "Sima user látja a törzsadatok szerkesztése gombot!");
      assert(profileAudit.hasOwnEditBtn, "Sima user nem látja a saját profil szerkesztés gombját.");

      // Saját adatok szerkesztése sima userként
      await page.click('button[title="Profil szerkesztése"]');
      await fillLabeledInput(page, "Név", "Biztonsági vezető E2E");
      await clickButtonByText(page, "Mentés");
      await page.waitForFunction(
        () => document.body.innerText.includes("profil adatai sikeresen mentésre kerültek"),
        { timeout: 6000 }
      );

      const user1Updated = (await apiJson("/api/users")).data.find((u) => u.username === "User1");
      assert(user1Updated?.name === "Biztonsági vezető E2E", "Sima user saját profil mentése sikertelen.");
    });

    const allPassed = runner.summary();
    process.exitCode = allPassed ? 0 : 1;
  } finally {
    // -----------------------------------------------------------------
    // TELJES VISSZAÁLLÍTÁS (ADATBÁZIS ÉS FELHASZNÁLÓK)
    // -----------------------------------------------------------------
    console.log("\nTesztadatok takarítása és eredeti állapot visszaállítása...");
    await browser.close().catch(() => {});

    await apiJson("/api/master-data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initialMasterData),
    }).catch(() => {});

    for (const origUser of initialUsers) {
      await apiJson(`/api/users/${origUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: origUser.username,
          name: origUser.name,
          email: origUser.email,
          phone: origUser.phone,
          role: origUser.role,
        }),
      }).catch(() => {});
    }

    const currentUsers = (await apiJson("/api/users")).data;
    if (Array.isArray(currentUsers)) {
      for (const u of currentUsers) {
        if (!initialUserIds.has(Number(u.id))) {
          await apiJson(`/api/users/${u.id}`, { method: "DELETE" }).catch(() => {});
        }
      }
    }

    if (pgPool) {
      try {
        const keepIds = Array.from(initialMatchIds);
        await pgPool.query("DELETE FROM sent_emails WHERE match_id >= 999000 OR NOT (match_id = ANY($1::int[]))", [keepIds]);
        await pgPool.query("DELETE FROM matches WHERE NOT (id = ANY($1::int[]))", [keepIds]);
        await pgPool.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true)");
        await pgPool.query("SELECT setval(pg_get_serial_sequence('notes', 'id'), COALESCE((SELECT MAX(id) FROM notes), 1), true)");
        await pgPool.query("SELECT setval(pg_get_serial_sequence('sent_emails', 'id'), COALESCE((SELECT MAX(id) FROM sent_emails), 1), true)");
        console.log("PostgreSQL tesztadatok sikeresen visszaállítva.");
      } catch (cleanErr) {
        console.warn("Figyelmeztetés a PostgreSQL takarításkor:", cleanErr.message);
      } finally {
        await pgPool.end().catch(() => {});
      }
    }
  }
}

main().catch((err) => {
  console.error("Végzetes teszt hiba:", err);
  process.exit(1);
});
