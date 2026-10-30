const express = require("express");
const app = express();
const cors = require("cors");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const db = require("./db");

const matchesData = require("./mock-data/matches.json");

const MOCK_API_KEY = "mock-mlsz-key";

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
app.use(express.json());


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
      error: "Invalid API key"
    });
  }

  const { teamId } = req.query;

  let matches = matchesData.matches;

  if (teamId) {
    matches = matches.filter(
      match => match.teamId === Number(teamId)
    );
  }

  res.json({
    matches
  });
});


app.get("/api/mlsz/matches/:id", (req, res) => {
  const apiKey = req.headers["x-api-key"];

  if (apiKey !== MOCK_API_KEY) {
    return res.status(401).json({
      error: "Invalid API key"
    });
  }

  const matchId = Number(req.params.id);

  const match = matchesData.matches.find(
    match => match.id === matchId
  );

  if (!match) {
    return res.status(404).json({
      error: "Match not found"
    });
  }

  if (match.status === "cancelled") {
    return res.status(400).json({ error: "Match cancelled" });
  }

  if (match.status === "ended") {
    // Return final match result if available
  }

  res.json(match);
});


// =========================
// EMAIL NOTIFICATION
// =========================

app.post("/api/send-email", async (req, res) => {
  const { to, subject, message, matchId, result } = req.body;
  const recipient = to || "szeconnect.projektmunka@gmail.com";

  const logged = await db.logEmail({
    to: recipient,
    subject: subject || "Rába ETO Digitális Eseménynapló Értesítés",
    message,
    matchId,
    result,
  });

  console.log(`[EMAIL DISPATCH] To: ${recipient} | Subject: ${subject}`);

  try {
    const info = await transporter.sendMail({
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
    });

    console.log(`[EMAIL SIKERESEN ELKÜLDVE] MessageId: ${info.messageId}`);
    res.json({
      success: true,
      message: "Email sent successfully via Gmail SMTP",
      messageId: info.messageId,
      email: logged,
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


// =========================
// PDF GENERATION
// =========================

app.post("/generate-pdf", async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).send("Missing HTML content");
    }

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=file.pdf",
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
