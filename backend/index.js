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
    // Ha kaptunk egyedi HTML-t az EventLogEditorból
    return `
      <!DOCTYPE html>
      <html lang="hu">
      <head>
        <meta charset="UTF-8" />
        <title>${match?.title || "Eseménynapló"} - Összefoglaló</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 0; color: #111827; }
          img { max-height: 65px; height: auto; }
        </style>
      </head>
      <body>
        ${customHtml}
      </body>
      </html>
    `;
  }

  // Alapértelmezett hivatalos összefoglaló sablon
  const title = match?.title || "Rába ETO Mérkőzés";
  const date = match?.date || "N/A";
  const time = match?.time || "";
  const venue = match?.venue || "ETO Park Győr";
  const score = match?.score || "N/A";
  const winner = match?.winner || "N/A";
  const statusText = match?.status === "finalized" ? "Lezárt eseménynapló" : "Eseménynapló";

  return `
    <!DOCTYPE html>
    <html lang="hu">
    <head>
      <meta charset="UTF-8" />
      <title>${title} - Hivatalos Eseménynapló</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 20px; color: #111827; background: #fff; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #2E7D32; padding-bottom: 16px; margin-bottom: 24px; }
        .title { font-size: 24px; font-weight: bold; color: #1f2937; margin: 0; }
        .subtitle { font-size: 13px; color: #4b5563; margin-top: 4px; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; background: #e5e7eb; color: #374151; }
        .badge-finalized { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; }
        .card-label { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
        .card-value { font-size: 15px; font-weight: bold; color: #111827; }
        .result-box { background: #f0fdf4; border: 2px solid #2E7D32; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; text-align: center; }
        .result-score { font-size: 26px; font-weight: 800; color: #15803d; margin: 0; }
        .result-winner { font-size: 14px; color: #374151; margin-top: 4px; font-weight: 600; }
        .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">Digitális Eseménynapló Összefoglaló</h1>
          <p class="subtitle">Rába ETO SE Hivatalos Jegyzőkönyv</p>
        </div>
        ${logoBase64 ? `<img src="${logoBase64}" alt="Rába ETO Logo" style="height: 60px; object-fit: contain;" />` : ""}
      </div>

      <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <span class="badge badge-finalized">${statusText}</span>
        <span style="font-size: 13px; color: #6b7280;">Azonosító: #${match?.id || ""}</span>
      </div>

      <div class="result-box">
        <div class="card-label">Hivatalos Végeredmény</div>
        <div class="result-score">${score}</div>
        <div class="result-winner">Győztes csapat: <strong>${winner}</strong></div>
      </div>

      <div class="grid">
        <div class="card">
          <div class="card-label">Mérkőző Felek</div>
          <div class="card-value">${title}</div>
        </div>
        <div class="card">
          <div class="card-label">Időpont</div>
          <div class="card-value">${date} ${time}</div>
        </div>
        <div class="card">
          <div class="card-label">Helyszín</div>
          <div class="card-value">${venue}</div>
        </div>
        <div class="card">
          <div class="card-label">Rendező Szervezet</div>
          <div class="card-value">Rába ETO SE Győr</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 24px;">
        <div class="card-label">Biztonsági és Szervezői Záradék</div>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #374151; line-height: 1.5;">
          A mérkőzés digitális eseménynaplója hivatalosan lezárásra került. Az események és a biztonsági bejegyzések ellenőrzése megtörtént.
        </p>
      </div>

      <div class="footer">
        Ez a dokumentum a Rába ETO Digitális Eseménynapló rendszer által automatikusan generált hivatalos PDF összefoglaló.
        <br />Kelt: ${new Date().toLocaleDateString("hu-HU")}
      </div>
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
