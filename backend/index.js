const express = require("express");
const app = express();
const cors = require("cors");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const matchesData = require("./mock-data/matches.json");

const MOCK_API_KEY = "mock-mlsz-key";

// PDF tárolási könyvtár létrehozása ha nem létezik
const pdfDir = path.join(__dirname, "public", "pdfs");
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

// Logó beolvasása base64 formátumban a PDF-ekhez
let logoBase64 = "";
const logoPath = path.join(__dirname, "public", "logo.png");
if (fs.existsSync(logoPath)) {
  logoBase64 = "data:image/png;base64," + fs.readFileSync(logoPath).toString("base64");
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

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/public", express.static(path.join(__dirname, "public")));

// =========================
// Basic test route
// =========================

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// =========================
// MOCK MLSZ API
// =========================

app.get("/api/mlsz/matches", (req, res) => {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== MOCK_API_KEY) {
    return res.status(401).json({
      error: "Invalid API key",
    });
  }

  const { teamId } = req.query;

  if (teamId) {
    const filtered = matchesData.matches.filter(
      (m) => m.teamId === parseInt(teamId, 10)
    );
    return res.json(filtered);
  }

  res.json(matchesData.matches);
});

app.get("/api/mlsz/matches/:id", (req, res) => {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== MOCK_API_KEY) {
    return res.status(401).json({
      error: "Invalid API key",
    });
  }

  const matchId = parseInt(req.params.id, 10);
  const match = matchesData.matches.find((m) => m.id === matchId);

  if (!match) {
    return res.status(404).json({
      error: "Match not found",
    });
  }

  res.json(match);
});

// =========================
// MATCHES CRUD API (Postgres / In-Memory sync)
// =========================

app.get("/api/matches", async (req, res) => {
  try {
    const matches = await db.getMatches();
    res.json(matches);
  } catch (err) {
    console.error("[API GET MATCHES HIBA]", err);
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
    console.error("[API GET MATCH BY ID HIBA]", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/matches/:id", async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { status, score, winner } = req.body;
    const updated = await db.updateMatch(matchId, { status, score, winner });
    console.log(
      `[DB MATCH FRISSÍTVE] Match #${matchId} -> status: ${status}, score: ${score}, winner: ${winner}`
    );
    res.json({ success: true, match: updated });
  } catch (err) {
    console.error("[API PUT MATCH HIBA]", err);
    res.status(500).json({ error: err.message });
  }
});

// ===================================
// PDF GENERÁLÓ ÉS KISZOLGÁLÓ FÜGGVÉNYEK
// ===================================

function buildStandaloneMatchPdfHtml(match, customHtml = null) {
  if (customHtml) {
    return `
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="UTF-8" />
        <title>${match?.title || "Eseménynapló"}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm; }
          body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 0; color: #000000; background: #ffffff; }
        </style>
      </head>
      <body>
        ${customHtml}
      </body>
      </html>
    `;
  }

  // Pontos kinézet a mintakép alapján
  const title = match?.title || "RabaETO – Nem RábaETO";
  const date = match?.date || "2026.04.12.";
  const time = match?.time || "14.52";
  const competition = match?.competition || "Mérkőzéselnevezés";

  return `
    <!DOCTYPE html>
    <html lang="hu">
    <head>
      <meta charset="UTF-8" />
      <title>Eseménynapló</title>
      <style>
        @page { size: A4 portrait; margin: 12mm 16mm; }
        body {
          font-family: "Times New Roman", Times, serif;
          margin: 0;
          padding: 20px 25px;
          color: #000000;
          background: #ffffff;
          font-size: 11pt;
          line-height: 1.35;
        }
        .header-container {
          position: relative;
          min-height: 100px;
          margin-bottom: 28px;
        }
        .logo-box {
          position: absolute;
          right: 0;
          top: 0;
        }
        .logo-box img {
          height: 95px;
          width: auto;
          display: block;
        }
        .title-box {
          text-align: center;
          padding-top: 28px;
        }
        .title-box h1 {
          font-family: "Times New Roman", Times, serif;
          font-size: 22pt;
          font-weight: bold;
          margin: 0;
          color: #000000;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          font-family: "Times New Roman", Times, serif;
          font-size: 11pt;
        }
        .meta-table td.label {
          width: 53%;
          font-weight: bold;
          color: #000000;
          padding: 3px 8px 3px 0;
          vertical-align: top;
        }
        .meta-table td.value {
          width: 47%;
          font-weight: normal;
          color: #000000;
          padding: 3px 0;
          vertical-align: top;
        }
        .events-table {
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
          font-family: "Times New Roman", Times, serif;
          font-size: 10pt;
          border: 1.5px solid #000000;
        }
        .events-table th {
          background-color: #DDE3EA;
          border: 1px solid #000000;
          padding: 7px 6px;
          font-weight: bold;
          color: #000000;
          vertical-align: middle;
        }
        .events-table td {
          border: 1px solid #000000;
          padding: 6px 8px;
          color: #000000;
          vertical-align: top;
          line-height: 1.3;
        }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
      </style>
    </head>
    <body>
      <div class="header-container">
        ${logoBase64 ? `<div class="logo-box"><img src="${logoBase64}" alt="ETO Logo" /></div>` : ""}
        <div class="title-box">
          <h1>Eseménynapló</h1>
        </div>
      </div>

      <table class="meta-table">
        <tbody>
          <tr>
            <td class="label">Versenyrendszer megnevezése:</td>
            <td class="value">${competition}</td>
          </tr>
          <tr>
            <td class="label">Mérkőző csapatok megnevezése (hazai / vendég):</td>
            <td class="value">${title}</td>
          </tr>
          <tr>
            <td class="label">Mérkőzés ideje:</td>
            <td class="value">${date} ${time}</td>
          </tr>
          <tr>
            <td class="label">Biztonsági felelős megnevezése és elérhetősége:</td>
            <td class="value">Valaki 03635379</td>
          </tr>
          <tr>
            <td class="label">Rendező vagy rendező szerv megnevezése:</td>
            <td class="value">Szervező</td>
          </tr>
          <tr>
            <td class="label">Főrendező megnevezése:</td>
            <td class="value">Valaki2 03654892</td>
          </tr>
          <tr>
            <td class="label">Eseménynaplót vezető megnevezése és elérhetősége:</td>
            <td class="value">Valaki3</td>
          </tr>
          <tr>
            <td class="label">Egészségügyi biztosításért felelős szervezet és személy:</td>
            <td class="value">Szervezet – Személy</td>
          </tr>
          <tr>
            <td class="label">Katasztrófavédelmi biztosításért felelős szervezet és személy:</td>
            <td class="value">Katasztrofavédelmisek – Valaki4</td>
          </tr>
          ${
            match?.score
              ? `
          <tr>
            <td class="label">Hivatalos végeredmény és győztes:</td>
            <td class="value"><strong>${match.score}</strong> (Győztes: ${match.winner || "N/A"})</td>
          </tr>
          `
              : ""
          }
        </tbody>
      </table>

      <table class="events-table">
        <thead>
          <tr>
            <th class="text-center" style="width: 45px;">SSZ</th>
            <th class="text-center" style="width: 65px;">Időpont</th>
            <th class="text-left" style="width: 125px;">Eseményt jelentő</th>
            <th class="text-left">Esemény leírása</th>
            <th class="text-left" style="width: 125px;">Intézkedést meghatározó</th>
            <th class="text-left" style="width: 135px;">Intézkedés / eredmény</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="text-center">1</td>
            <td class="text-center">14:55</td>
            <td>Valaki5</td>
            <td>Esemény leírása, hosszasan elemezve</td>
            <td>Valaki5</td>
            <td>Intézkedés eredménye</td>
          </tr>
          <tr>
            <td class="text-center">2</td>
            <td class="text-center">15:10</td>
            <td>Valaki6</td>
            <td>Esemény leírása</td>
            <td>Valaki6</td>
            <td>Intézkedés eredménye</td>
          </tr>
          <tr>
            <td class="text-center">3</td>
            <td class="text-center">15:42</td>
            <td>Valaki7</td>
            <td>Esemény leírása</td>
            <td>Valaki7</td>
            <td>Intézkedés eredménye</td>
          </tr>
          <tr>
            <td class="text-center">4</td>
            <td class="text-center">16:20</td>
            <td>Valaki8</td>
            <td>Esemény leírása</td>
            <td>Valaki8</td>
            <td>Intézkedés eredménye</td>
          </tr>
        </tbody>
      </table>
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
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// PDF elmentése és generálása egy adott meccshez
app.post("/api/matches/:id/pdf", async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { html } = req.body;
    const match = await db.getMatchById(matchId);

    const fullHtml = buildStandaloneMatchPdfHtml(match, html);
    const pdfBuffer = await renderPdfBuffer(fullHtml);

    const filePath = path.join(pdfDir, `match-${matchId}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);

    console.log(`[PDF SIKERESEN MENTVE] match-${matchId}.pdf`);
    res.json({
      success: true,
      url: `/api/matches/${matchId}/pdf`,
    });
  } catch (err) {
    console.error("[PDF GENERÁLÁSI HIBA]", err);
    res.status(500).json({ error: err.message });
  }
});

// PDF letöltése vagy megnyitása böngészőből
app.get("/api/matches/:id/pdf", async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const filePath = path.join(pdfDir, `match-${matchId}.pdf`);

    // Ha még nem létezik a fájl, generáljuk le gyorsan az adatbázis adatai alapján!
    if (!fs.existsSync(filePath)) {
      const match = await db.getMatchById(matchId);
      if (!match) {
        return res.status(404).send("A megadott mérkőzés nem található.");
      }
      const fullHtml = buildStandaloneMatchPdfHtml(match);
      const pdfBuffer = await renderPdfBuffer(fullHtml);
      fs.writeFileSync(filePath, pdfBuffer);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="esemenynaplo-${matchId}.pdf"`
    );
    res.sendFile(filePath);
  } catch (err) {
    console.error("[PDF LETÖLTÉSI HIBA]", err);
    res.status(500).send("Nem sikerült megnyitni a PDF összefoglalót: " + err.message);
  }
});

// =========================
// EMAIL NOTIFICATION (PDF Csatolmánnyal és Közvetlen Linkkel)
// =========================

app.post("/api/send-email", async (req, res) => {
  const { to, subject, message, matchId, result, html } = req.body;
  const recipient = to || "szeconnect.projektmunka@gmail.com";

  const logged = await db.logEmail({
    to: recipient,
    subject: subject || "Rába ETO Digitális Eseménynapló Értesítés",
    message,
    matchId,
    result,
  });

  console.log(`[EMAIL DISPATCH] To: ${recipient} | Subject: ${subject}`);

  // PDF előkészítése és mentése ha van matchId
  let pdfAttachment = null;
  if (matchId) {
    try {
      const match = await db.getMatchById(matchId);
      const fullHtml = buildStandaloneMatchPdfHtml(match, html);
      const pdfBuffer = await renderPdfBuffer(fullHtml);

      // Elmentjük a szerverre is a közvetlen linkes eléréshez
      const filePath = path.join(pdfDir, `match-${matchId}.pdf`);
      fs.writeFileSync(filePath, pdfBuffer);

      pdfAttachment = {
        filename: `esemenynaplo-${matchId}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      };
      console.log(`[EMAIL PDF CSATOLVA] match-${matchId}.pdf`);
    } catch (pdfErr) {
      console.warn("[EMAIL PDF GENERÁLÁS FIGYELMEZTETÉS]", pdfErr.message);
    }
  }

  const pdfDirectUrl = matchId ? `http://localhost:3000/api/matches/${matchId}/pdf` : null;

  try {
    const mailOptions = {
      from: {
        name: "Rába ETO Digitális Eseménynapló",
        address: "szeconnect.projektmunka@gmail.com",
      },
      to: recipient,
      subject: subject || "Rába ETO Digitális Eseménynapló Értesítés",
      text: message,
      html: `
        <!DOCTYPE html>
        <html lang="hu">
        <head>
          <meta charset="UTF-8" />
          <title>${subject || "Rába ETO Értesítés"}</title>
        </head>
        <body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f9fafb;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #2E7D32; color: #ffffff; padding: 18px 24px; text-align: center;">
              <h2 style="margin: 0; font-size: 20px; font-weight: bold;">Rába ETO Digitális Eseménynapló</h2>
            </div>
            <div style="padding: 24px;">
              <h3 style="color: #111827; margin-top: 0; font-size: 17px;">${subject || "Értesítés"}</h3>
              <p style="white-space: pre-wrap; font-size: 14px; color: #374151; line-height: 1.6;">${message}</p>
              ${
                result
                  ? `
                <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px 18px; border-radius: 6px; margin-top: 18px;">
                  <p style="margin: 0; font-weight: bold; color: #15803d; font-size: 16px;">Végeredmény: ${result.score}</p>
                  <p style="margin: 4px 0 0 0; color: #374151; font-size: 14px;">Győztes: <strong>${result.winner}</strong></p>
                </div>
              `
                  : ""
              }

              ${
                pdfDirectUrl
                  ? `
                <div style="margin-top: 24px; padding: 16px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center;">
                  <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #1e293b;">
                    Hivatalos Eseménynapló Dokumentum (PDF)
                  </p>
                  <a href="${pdfDirectUrl}" target="_blank" style="display: inline-block; background-color: #2E7D32; color: #ffffff; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
                    📄 PDF Összefoglaló Megnyitása
                  </a>
                  <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">
                    (A PDF fájl közvetlenül a levélhez is csatolva van)
                  </p>
                </div>
              `
                  : ""
              }
            </div>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 0 24px;" />
            <div style="padding: 16px 24px; text-align: center;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                Ez egy automatikus rendszerértesítés a Rába ETO Digitális Eseménynapló Rendszerből.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    if (pdfAttachment) {
      mailOptions.attachments = [pdfAttachment];
    }

    const info = await transporter.sendMail(mailOptions);

    console.log(`[EMAIL SIKERESEN ELKÜLDVE] MessageId: ${info.messageId}`);
    res.json({
      success: true,
      message: "Email sent successfully via Gmail SMTP with PDF attachment",
      messageId: info.messageId,
      email: logged,
      pdfUrl: pdfDirectUrl,
    });
  } catch (err) {
    console.error("[EMAIL KÜLDÉSI HIBA]", err);
    res.status(500).json({
      success: false,
      error: err.message,
      email: logged,
    });
  }
});

app.get("/api/db/emails", async (req, res) => {
  const emails = await db.getSentEmails();
  res.json(emails);
});

app.get("/api/db/status", (req, res) => {
  res.json({
    connected: db.isPostgresConnected(),
    type: db.isPostgresConnected() ? "PostgreSQL" : "In-Memory Database",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "esemenynaplodigit",
  });
});

app.get("/api/users", async (req, res) => {
  const users = await db.getUsers();
  res.json(users);
});

// Régi közvetlen generálás kompatibilitásként megőrizve
app.post("/generate-pdf", async (req, res) => {
  try {
    const { html } = req.body;
    if (!html) {
      return res.status(400).send("Missing HTML content");
    }

    const pdf = await renderPdfBuffer(html);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=esemenynaplo.pdf",
    });
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).send("PDF generation failed");
  }
});

// =========================
// START SERVER
// =========================

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
