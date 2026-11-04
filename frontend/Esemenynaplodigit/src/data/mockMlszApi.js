// mockMlszApi.js
import { inMemoryDb } from "./inMemoryDb";

export const MOCK_MLSZ_MATCHES = [
  {
    id: 1,
    teamId: 323805,
    competition: "NB III Nyugat",
    homeTeam: "CSAPAT 2",
    awayTeam: "ETO",
    date: "2026. 04. 09.",
    time: "14:50",
    venue: "ETO Park",
    status: "ended",
    score: "1 - 2",
    winner: "ETO",
  },
  {
    id: 6,
    teamId: 323805,
    competition: "NB III Nyugat",
    homeTeam: "CSAPAT 2",
    awayTeam: "ETO",
    date: "2026. 04. 23.",
    time: "14:50",
    venue: "ETO Park",
    status: "ended",
    score: "2 - 0",
    winner: "CSAPAT 2",
  },
  {
    id: 7,
    teamId: 323805,
    competition: "NB III Nyugat",
    homeTeam: "CSAPAT 2",
    awayTeam: "ETO",
    date: "2026. 06. 09.",
    time: "14:50",
    venue: "ETO Park",
    status: "ended",
    score: "1 - 1",
    winner: "Döntetlen",
  },
  {
    id: 3,
    teamId: 323805,
    competition: "NB III Nyugat",
    homeTeam: "CSAPAT 1",
    awayTeam: "ETO",
    date: "2026. 03. 09.",
    time: "14:50",
    venue: "ETO Park",
    status: "ended",
    score: "0 - 3",
    winner: "ETO",
  },
  {
    id: 4,
    teamId: 323805,
    competition: "NB III Nyugat",
    homeTeam: "CSAPAT 5",
    awayTeam: "ETO",
    date: "2026. 02. 09.",
    time: "14:50",
    venue: "ETO Park",
    status: "ended",
    score: "2 - 2",
    winner: "Döntetlen",
  },
];

/**
 * Parse match date and time into a Date object.
 * Handles formats: "2026. 04. 09." + "14:50", "2026-04-09" + "14:50", etc.
 */
export function getMatchStartDateTime(match) {
  if (!match || !match.date) return null;

  try {
    const rawDate = match.date.replace(/\./g, "-").replace(/\s+/g, "").trim();
    // rawDate might end with a trailing '-' if original was "2026. 04. 09."
    const cleanDate = rawDate.endsWith("-") ? rawDate.slice(0, -1) : rawDate;
    const timeStr = match.time ? match.time.replace(".", ":").trim() : "00:00";

    const parts = cleanDate.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const [hours, minutes] = timeStr.split(":").map((v) => parseInt(v, 10) || 0);
      return new Date(year, month, day, hours, minutes, 0);
    }

    return new Date(`${cleanDate}T${timeStr}:00`);
  } catch (err) {
    console.error("Nem sikerült elemezni a meccs időpontját:", err);
    return null;
  }
}

/**
 * Ellenőrzi, hogy eltelt-e legalább 12 óra a meccs kezdete óta.
 */
export function isMatchOlderThan12Hours(match) {
  const matchDate = getMatchStartDateTime(match);
  if (!matchDate || isNaN(matchDate.getTime())) return false;

  const now = new Date();
  const twelveHoursInMs = 12 * 60 * 60 * 1000;
  return now.getTime() - matchDate.getTime() >= twelveHoursInMs;
}

/**
 * Eredmény lekérése a Mock MLSZ API-ból.
 * Először a backendet kísérli meg elérni, hiba esetén a beépített mock adatokat használja.
 */
export async function fetchMatchResultFromMockApi(matchId) {
  try {
    const response = await fetch(`http://localhost:3000/api/mlsz/matches/${matchId}`, {
      headers: {
        "x-api-key": "mock-mlsz-key",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.score) {
        return {
          score: data.score,
          winner: data.winner || "Ismeretlen",
          source: "backend-mock-api",
        };
      }
    }
  } catch {
    // Backend nem érhető el vagy hiba történt, fallback a beépített adatokra
  }

  const fallback = MOCK_MLSZ_MATCHES.find((m) => m.id === Number(matchId));
  if (fallback) {
    return {
      score: fallback.score,
      winner: fallback.winner,
      source: "local-mock-api",
    };
  }

  // Generikus alapértelmezett eredmény, ha nincs specifikus meccs adat
  return {
    score: "2 - 1",
    winner: "ETO",
    source: "default-mock",
  };
}

/**
 * Automatikus e-mail küldés szimulációja az eseménynapló lezárásakor.
 */
export async function sendEventLogClosedEmail({
  match,
  result,
  currentUserEmail = "szeconnect.projektmunka@gmail.com",
  reportEmail = "szeconnect.projektmunka@gmail.com",
  html = null,
}) {
  const to = reportEmail;
  const subject = `[Eseménynapló Lezárva] ${match?.title || "Mérkőzés"} - Végeredmény: ${result?.score || "N/A"}`;
  const message = `
Tisztelt Címzett!

Az alábbi mérkőzés digitális eseménynaplója lezárásra került:
- Mérkőzés: ${match?.title || "N/A"}
- Dátum: ${match?.date || "N/A"} ${match?.time || ""}
- Végeredmény: ${result?.score || "N/A"}
- Győztes: ${result?.winner || "N/A"}
- Lezárás módja: ${result?.isAuto ? "Automatikus lezárás (12 órával a meccs kezdete után)" : "Manuális véglegesítés"}
- Kezelő / Értesített e-mail: ${currentUserEmail}

Üdvözlettel:
Rába ETO Digitális Eseménynapló Rendszer
  `.trim();

  // Rögzítés a memóriabeli adatbázisban
  inMemoryDb.logEmail({
    to,
    cc: currentUserEmail,
    subject,
    message,
    matchId: match?.id,
    matchTitle: match?.title,
    result,
  });

  try {
    const res = await fetch("http://localhost:3000/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        to,
        subject,
        message,
        matchId: match?.id,
        result,
        html,
      }),
    });
    if (res.ok) {
      console.log(`[EMAIL ELKÜLDVE] Siker: ${to}`);
    }
  } catch {
    // Backend offline esetén is regisztráljuk kliens oldalon
    console.log(`[EMAIL ELKÜLDVE - kliens szimuláció] Címzett: ${to}, Másolat: ${currentUserEmail}`);
  }

  return {
    success: true,
    to,
    cc: currentUserEmail,
    subject,
  };
}
