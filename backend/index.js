const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const matchesData = require("./mock-data/matches.json");

const app = express();
const PORT = 3000;
const MOCK_API_KEY = "mock-mlsz-key";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Logó beolvasása base64 formátumban, hogy a PDF-ben mindig hibátlanul jelenjen meg
let logoBase64 = "";
const logoPath = path.join(__dirname, "public", "logo.png");
if (fs.existsSync(logoPath)) {
  logoBase64 =
    "data:image/png;base64," + fs.readFileSync(logoPath).toString("base64");
} else {
  console.warn("[PDF] Figyelmeztetés: A logó fájl nem található:", logoPath);
}

// =========================
// GMAIL SMTP TRANSPORTER
// =========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "szeconnect.projektmunka@gmail.com",
    pass: "duli abug msfw lnxh",
  },
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPersonField(field, fallbackName = "", fallbackPhone = "") {
  if (field && typeof field === "object") {
    const first = field.name || field.organization || fallbackName || "";
    const second = field.phone || field.person || fallbackPhone || "";
    if (field.organization !== undefined || field.person !== undefined) {
      if (first && second) return `${first} / ${second}`;
      return first || second || "—";
    }
    return `${first} ${second}`.trim() || "—";
  }
  const str = String(field || "").trim();
  if (str) return str;
  return `${fallbackName} ${fallbackPhone}`.trim() || "—";
}

function buildMatchPdfHtml(match, masterData = {}) {
  const m = match || {};
  const meta = m.meta && typeof m.meta === "object" ? m.meta : {};

  const titleParts = String(m.title || "").includes(" vs ")
    ? String(m.title).split(" vs ").map((s) => s.trim())
    : [];
  const homeTeam = meta.homeTeam || m.homeTeam || titleParts[0] || "Hazai csapat";
  const awayTeam = meta.awayTeam || m.awayTeam || titleParts[1] || "Vendég csapat";
  const competitionName =
    meta.competitionName || meta.competition || m.competition || "NB I";
  const matchDate = meta.matchDate || m.date || "—";
  const matchTime = meta.matchTime || meta.matchStartTime || m.time || "";
  const dateTimeStr = `${matchDate} ${matchTime}`.trim() || "—";

  const organizer = meta.organizer || masterData.organizer || masterData.organization || "—";
  const securityInfo = formatPersonField(
    meta.securityOfficer,
    meta.safetyOfficer || "",
    ""
  );
  const headOrganizerInfo = formatPersonField(
    meta.headOrganizer,
    meta.chiefOrganizer || masterData.chiefOrganizer || "",
    masterData.phone || ""
  );
  const eventLogLeader = meta.eventLogLeader || "—";

  const medicalInfo = meta.medicalService
    ? formatPersonField(meta.medicalService)
    : meta.healthcareProvider || masterData.healthcareProvider || "—";

  const disasterInfo = meta.disasterProtection
    ? formatPersonField(meta.disasterProtection)
    : meta.fireService || masterData.disasterProtectionProvider || "—";

  const score = m.score || meta.score || "";
  const winner = m.winner || meta.winner || "";
  const events = Array.isArray(m.events) ? m.events : [];
  const notes = Array.isArray(m.notes) ? m.notes : [];

  const eventsRowsHtml =
    events.length > 0
      ? events
          .map(
            (ev, idx) => `
          <tr>
            <td style="text-align:center;">${escapeHtml(ev.sequenceNumber || idx + 1)}</td>
            <td style="text-align:center;">${escapeHtml(ev.time || "—")}</td>
            <td>${escapeHtml(ev.reporterName || "—")}</td>
            <td>${escapeHtml(ev.eventDescription || ev.eventType || "—")}</td>
            <td>${escapeHtml(ev.decisionMaker || "—")}</td>
            <td>${escapeHtml(ev.actionResult || ev.actionType || "—")}</td>
          </tr>
        `
          )
          .join("")
      : `
        <tr>
          <td colspan="6" style="text-align:center; padding: 14px; color: #555;">
            A mérkőzés során rendkívüli esemény nem került rögzítésre.
          </td>
        </tr>
      `;

  const notesHtml =
    notes.length > 0
      ? `
      <div class="notes-section">
        <h2>Utólagos megjegyzések</h2>
        <ul>
          ${notes
            .map(
              (n) => `
            <li>
              <strong>${escapeHtml(n.createdBy || "Rendszer")}</strong>
              <span class="note-date">(${escapeHtml(n.createdAt || "")})</span>:
              ${escapeHtml(n.text)}
            </li>
          `
            )
            .join("")}
        </ul>
      </div>
    `
      : "";

  return `
    <!DOCTYPE html>
    <html lang="hu">
    <head>
      <meta charset="UTF-8" />
      <title>Eseménynapló - ${escapeHtml(m.title || `${homeTeam} vs ${awayTeam}`)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 14mm 16mm 14mm 16mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: "Times New Roman", Times, serif;
          color: #000000;
          margin: 0;
          padding: 0;
          font-size: 11pt;
          line-height: 1.35;
        }
        .header-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 88px;
          margin-bottom: 18px;
        }
        .logo-box {
          position: absolute;
          left: 0;
          top: 0;
        }
        .logo-box img {
          height: 84px;
          width: auto;
          object-fit: contain;
        }
        .title-box h1 {
          margin: 0;
          font-size: 20pt;
          font-weight: bold;
          letter-spacing: 0.2px;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .meta-table td {
          padding: 3px 6px 3px 0;
          vertical-align: top;
          font-size: 11pt;
        }
        .meta-table td.label {
          width: 53%;
          font-weight: bold;
        }
        .meta-table td.value {
          width: 47%;
          font-weight: normal;
        }
        .events-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10pt;
          border: 1.5px solid #000000;
        }
        .events-table thead tr {
          background-color: #DDE3EA;
        }
        .events-table th {
          border: 1px solid #000000;
          padding: 7px 6px;
          font-weight: bold;
          text-align: left;
          vertical-align: top;
        }
        .events-table td {
          border: 1px solid #000000;
          padding: 6px;
          vertical-align: top;
          word-break: break-word;
        }
        .notes-section {
          margin-top: 22px;
          border-top: 1px solid #888;
          padding-top: 10px;
          font-size: 10.5pt;
        }
        .notes-section h2 {
          font-size: 12pt;
          margin: 0 0 8px 0;
        }
        .notes-section ul {
          margin: 0;
          padding-left: 18px;
        }
        .notes-section li {
          margin-bottom: 4px;
        }
        .note-date {
          color: #444;
          font-size: 9.5pt;
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        ${logoBase64 ? `<div class="logo-box"><img src="${logoBase64}" alt="ETO Logó" /></div>` : ""}
        <div class="title-box">
          <h1>Eseménynapló</h1>
        </div>
      </div>

      <table class="meta-table">
        <tbody>
          <tr>
            <td class="label">Versenyrendszer megnevezése:</td>
            <td class="value">${escapeHtml(competitionName)}</td>
          </tr>
          <tr>
            <td class="label">Mérkőző csapatok megnevezése (hazai / vendég):</td>
            <td class="value">${escapeHtml(homeTeam)} - ${escapeHtml(awayTeam)}</td>
          </tr>
          <tr>
            <td class="label">Mérkőzés ideje:</td>
            <td class="value">${escapeHtml(dateTimeStr)}</td>
          </tr>
          <tr>
            <td class="label">Biztonsági felelős megnevezése és elérhetősége:</td>
            <td class="value">${escapeHtml(securityInfo)}</td>
          </tr>
          <tr>
            <td class="label">Rendező vagy rendező szerv megnevezése:</td>
            <td class="value">${escapeHtml(organizer)}</td>
          </tr>
          <tr>
            <td class="label">Főrendező megnevezése:</td>
            <td class="value">${escapeHtml(headOrganizerInfo)}</td>
          </tr>
          <tr>
            <td class="label">Eseménynaplót vezető megnevezése és elérhetősége:</td>
            <td class="value">${escapeHtml(eventLogLeader)}</td>
          </tr>
          <tr>
            <td class="label">Egészségügyi biztosításért felelős szervezet és személy:</td>
            <td class="value">${escapeHtml(medicalInfo)}</td>
          </tr>
          <tr>
            <td class="label">Katasztrófavédelmi biztosításért felelős szervezet és személy:</td>
            <td class="value">${escapeHtml(disasterInfo)}</td>
          </tr>
          ${
            score || winner
              ? `
          <tr>
            <td class="label">Hivatalos végeredmény és győztes:</td>
            <td class="value"><strong>${escapeHtml(score || "N/A")}</strong> (Győztes: ${escapeHtml(winner || "N/A")})</td>
          </tr>`
              : ""
          }
        </tbody>
      </table>

      <table class="events-table">
        <thead>
          <tr>
            <th style="width:40px; text-align:center;">SSZ</th>
            <th style="width:55px; text-align:center;">Időpont</th>
            <th style="width:118px;">Eseményt jelentő</th>
            <th>Esemény leírása</th>
            <th style="width:132px;">Intézkedést meghatározó</th>
            <th style="width:130px;">Intézkedés / eredmény</th>
          </tr>
        </thead>
        <tbody>
          ${eventsRowsHtml}
        </tbody>
      </table>

      ${notesHtml}
    </body>
    </html>
  `;
}

function getChromeExecutablePath() {
  const possiblePaths = [
    process.env.CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function renderPdfBuffer(html) {
  const execPath = getChromeExecutablePath();
  const launchOptions = {
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  if (execPath) {
    launchOptions.executablePath = execPath;
  }

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
    });
  } finally {
    await browser.close();
  }
}

async function generateMatchPdfBuffer(matchId, fallbackMatchData = null) {
  const dbMatch = await db.getMatchById(matchId);
  const match = dbMatch || fallbackMatchData;
  if (!match) return null;
  const masterData = await db.getMasterData();
  const html = buildMatchPdfHtml(match, masterData);
  return {
    match,
    buffer: await renderPdfBuffer(html),
  };
}

// =========================
// MOCK MLSZ API
// =========================
app.get("/api/mlsz/matches", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== MOCK_API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  let result = matchesData.matches;
  const { teamId, competition, status } = req.query;

  if (teamId) {
    result = result.filter((m) => String(m.teamId) === String(teamId));
  }
  if (competition) {
    result = result.filter(
      (m) => m.competition.toLowerCase() === competition.toLowerCase()
    );
  }
  if (status) {
    result = result.filter((m) => m.status === status);
  }

  res.json({
    source: "mock-mlsz-api",
    count: result.length,
    matches: result,
  });
});

app.get("/api/mlsz/matches/:id", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== MOCK_API_KEY) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  const match = matchesData.matches.find((m) => String(m.id) === req.params.id);
  if (!match) {
    return res.status(404).json({ error: "Match not found" });
  }
  res.json(match);
});

// =========================
// HITELESÍTÉS & FELHASZNÁLÓK
// =========================
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await db.findUser(username, password);
    if (!user) {
      return res.status(401).json({ error: "Hibás felhasználónév vagy jelszó." });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { username, name, email, phone, role, password } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: "Felhasználónév és név megadása kötelező." });
    }
    const created = await db.createUser({ username, name, email, phone, role, password });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const updated = await db.updateUser(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Felhasználó nem található." });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/users/:id/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Mindkét jelszó mező kitöltése kötelező." });
    }
    const result = await db.updateUserPassword(
      req.params.id,
      currentPassword,
      newPassword
    );
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const result = await db.deleteUser(req.params.id);
    if (!result.deleted) {
      return res.status(404).json({ error: "Felhasználó nem található." });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// TÖRZSAADATOK (MASTER DATA)
// =========================
app.get("/api/master-data", async (req, res) => {
  try {
    const data = await db.getMasterData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/master-data", async (req, res) => {
  try {
    const updated = await db.updateMasterData(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// MÉRKŐZÉSEK, ESEMÉNYEK, MEGJEGYZÉSEK
// =========================
app.get("/api/matches", async (req, res) => {
  try {
    const matches = await db.getMatches();
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/matches/:id", async (req, res) => {
  try {
    const match = await db.getMatchById(req.params.id);
    if (!match) {
      return res.status(404).json({ error: "Match not found" });
    }
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/matches", async (req, res) => {
  try {
    const created = await db.createMatch(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/matches/:id", async (req, res) => {
  try {
    const existing = await db.getMatchById(req.params.id);
    if (existing) {
      if (existing.status === "archived") {
        return res.status(403).json({
          error: "Archivált eseménynapló már nem módosítható.",
        });
      }
      if (existing.status === "finalized") {
        if (req.body?.status === "archived") {
          const archived = await db.updateMatch(req.params.id, { status: "archived" });
          return res.json(archived);
        }
        return res.status(403).json({
          error: "Lezárt eseménynapló tartalma már nem módosítható.",
        });
      }
    }

    const updated = await db.updateMatch(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Match not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/matches/:id/notes", async (req, res) => {
  try {
    const { text, createdBy } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "A megjegyzés szövege nem lehet üres." });
    }
    const existing = await db.getMatchById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Match not found" });
    }
    if (existing.status === "archived") {
      return res.status(403).json({
        error: "Archivált eseménynaplóhoz már nem adható hozzá megjegyzés.",
      });
    }
    const note = await db.addNote(req.params.id, { text, createdBy });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================
// PDF LETÖLTÉS / MEGTEKINTÉS ADATBÁZISBÓL
// =========================
app.get("/api/matches/:id/pdf", async (req, res) => {
  try {
    const matchId = req.params.id;
    const isDownload = req.query.download === "1" || req.query.download === "true";

    const result = await generateMatchPdfBuffer(matchId);
    if (!result) {
      return res.status(404).json({ error: "A kért mérkőzés nem található." });
    }

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="esemenynaplo-${matchId}.pdf"`,
      "Cache-Control": "no-store",
    });
    res.send(result.buffer);
  } catch (err) {
    console.error("[PDF] Generálási hiba:", err);
    res.status(500).json({ error: "Hiba történt a PDF generálásakor." });
  }
});

// =========================
// E-MAIL KÜLDÉS (GMAIL SMTP + ADATBÁZIS-ALAPÚ PDF CSATOLMÁNY)
// =========================
app.post("/api/send-email", async (req, res) => {
  try {
    const { to, subject, message, matchId, result } = req.body;
    const masterData = await db.getMasterData();
    const recipient = to || masterData.reportEmail || "szeconnect.projektmunka@gmail.com";

    const logged = await db.logEmail({
      to: recipient,
      subject,
      message,
      matchId,
      result,
      status: "sent",
    });

    const viewPdfUrl = matchId ? `http://localhost:${PORT}/api/matches/${matchId}/pdf` : null;
    const downloadPdfUrl = matchId
      ? `http://localhost:${PORT}/api/matches/${matchId}/pdf?download=1`
      : null;

    const attachments = [];
    if (matchId) {
      try {
        const pdfData = await generateMatchPdfBuffer(matchId);
        if (pdfData && pdfData.buffer) {
          attachments.push({
            filename: `esemenynaplo-${matchId}.pdf`,
            content: pdfData.buffer,
            contentType: "application/pdf",
          });
        }
      } catch (pdfErr) {
        console.warn("[EMAIL PDF] Nem sikerült a PDF csatolmány legenerálása:", pdfErr.message);
      }
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; line-height: 1.5;">
        <div style="background-color: #2E7D32; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">Rába ETO Digitális Eseménynapló</h2>
        </div>
        <div style="padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="white-space: pre-line;">${escapeHtml(message || "")}</p>
          ${
            result
              ? `
            <div style="background-color: #f8f9fa; padding: 12px; border-left: 4px solid #2E7D32; margin: 16px 0;">
              <strong>Hivatalos végeredmény:</strong> ${escapeHtml(result.score || "N/A")}<br/>
              <strong>Győztes:</strong> ${escapeHtml(result.winner || "N/A")}
            </div>
          `
              : ""
          }
          ${
            viewPdfUrl
              ? `
            <div style="margin: 22px 0; text-align: center;">
              <a href="${viewPdfUrl}" target="_blank" style="display: inline-block; background-color: #2E7D32; color: #ffffff; padding: 11px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 4px;">
                PDF Megtekintése
              </a>
              <a href="${downloadPdfUrl}" target="_blank" style="display: inline-block; background-color: #1F5B23; color: #ffffff; padding: 11px 18px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 4px;">
                PDF Letöltése
              </a>
            </div>
          `
              : ""
          }
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666; margin: 0;">
            A lezárt eseménynapló PDF formátumban ehhez az e-mailhez is csatolásra került.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: {
        name: "Rába ETO Digitális Eseménynapló",
        address: "szeconnect.projektmunka@gmail.com",
      },
      to: recipient,
      subject: subject || "Rába ETO Digitális Eseménynapló értesítés",
      text: `${message || ""}\n\n${
        result ? `Eredmény: ${result.score} (Győztes: ${result.winner})\n\n` : ""
      }${viewPdfUrl ? `PDF megtekintése: ${viewPdfUrl}\nPDF letöltése: ${downloadPdfUrl}` : ""}`,
      html: htmlBody,
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({
      success: true,
      message: "Email sent successfully via Gmail SMTP with PDF attachment",
      messageId: info.messageId,
      email: logged,
      pdfUrl: viewPdfUrl,
      downloadUrl: downloadPdfUrl,
    });
  } catch (err) {
    console.error("[EMAIL HIBA] Gmail SMTP küldés sikertelen:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send email via Gmail",
      error: err.message,
    });
  }
});

app.get("/api/sent-emails", async (req, res) => {
  res.json(await db.getSentEmails());
});

// =========================
// RENDSZER ÁLLAPOT
// =========================
app.get("/api/db/status", (req, res) => {
  res.json({
    connected: db.isPostgresConnected(),
    type: db.isPostgresConnected() ? "PostgreSQL" : "In-Memory Database",
  });
});

app.get("/health", async (req, res) => {
  const users = await db.getUsers();
  res.json({
    status: "ok",
    dbConnected: db.isPostgresConnected(),
    usersCount: users.length,
    mlszMockMatchesCount: matchesData.matches.length,
  });
});

db.ready().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT} (http://localhost:${PORT})`);
    console.log(`Mock MLSZ API: http://localhost:${PORT}/api/mlsz/matches`);
    console.log(
      `Adatbázis állapot: ${db.isPostgresConnected() ? "PostgreSQL aktív" : "In-Memory fallback"}`
    );
  });
});
