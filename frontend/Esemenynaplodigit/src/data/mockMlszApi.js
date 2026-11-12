const API_BASE = "http://localhost:3000";
const MLSZ_API_KEY = "mock-mlsz-key";

export function getMatchStartDateTime(match) {
  if (!match?.date) return null;

  const normalizedDate = String(match.date)
    .replace(/\s+/g, "")
    .replace(/\.$/, "")
    .replace(/\./g, "-");

  const normalizedTime = String(match.time || "00:00").trim();
  const [hour = "00", minute = "00"] = normalizedTime.split(":");

  const dt = new Date(
    `${normalizedDate}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function isMatchOlderThan12Hours(match) {
  const startDt = getMatchStartDateTime(match);
  if (!startDt) return false;
  const diffHours = (Date.now() - startDt.getTime()) / (1000 * 60 * 60);
  return diffHours >= 12;
}

/** Formats an ISO or dot-separated date string into Hungarian format (`YYYY. MM. DD.`). */
export function formatMlszDateToHu(dateStr) {
  if (!dateStr) return "";
  const cleaned = String(dateStr).replace(/\s+/g, "").replace(/\.$/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return `${cleaned.replace(/-/g, ". ")}.`;
  }
  return dateStr;
}

/** Returns hours elapsed since kickoff (negative before kickoff, positive after). */
function getHoursSinceKickoff(match) {
  const startDt = getMatchStartDateTime(match);
  if (!startDt) return null;
  return (Date.now() - startDt.getTime()) / (1000 * 60 * 60);
}

/** True when kickoff is still more than 4 hours in the future. */
export function isMatchBeforeOpenWindow(match) {
  const hoursSinceStart = getHoursSinceKickoff(match);
  if (hoursSinceStart === null) return false;
  return hoursSinceStart < -4;
}

/** True when match is within 4 hours before kickoff and less than 12 hours after kickoff. */
export function isMatchWithin4HourOpenWindow(match) {
  const hoursSinceStart = getHoursSinceKickoff(match);
  if (hoursSinceStart === null) return false;
  return hoursSinceStart >= -4 && hoursSinceStart < 12;
}

/** True when kickoff was at least 7 days (168 hours) ago. */
export function isMatchOlderThan1Week(match) {
  const hoursSinceStart = getHoursSinceKickoff(match);
  if (hoursSinceStart === null) return false;
  return hoursSinceStart >= 24 * 7;
}

export async function fetchAllMlszMatches(filters = {}) {
  const params = new URLSearchParams();
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.status) params.set("status", filters.status);
  if (filters.competition) params.set("competition", filters.competition);

  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE}/api/mlsz/matches${query}`, {
    headers: { "x-api-key": MLSZ_API_KEY },
  });
  if (!response.ok) {
    throw new Error(`MLSZ API hiba: ${response.status}`);
  }
  return response.json();
}

export async function fetchMatchResultFromMockApi(matchId) {
  try {
    const response = await fetch(`${API_BASE}/api/mlsz/matches/${matchId}`, {
      headers: { "x-api-key": MLSZ_API_KEY },
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // Ha a backend ideiglenesen nem elérhető, null-lal térünk vissza
  }
  return null;
}

export async function sendEventLogClosedEmail({
  match,
  result,
  recipientEmail,
  reason = "manual",
}) {
  const recipient = recipientEmail || "szeconnect.projektmunka@gmail.com";
  const subject = `[Rába ETO Eseménynapló] Lezárt mérkőzés: ${match.title} (${match.date})`;

  const message =
    reason === "auto-12h"
      ? `Tisztelt Címzett!\n\nA "${match.title}" (${match.date} ${match.time}, ${match.venue}) mérkőzés kezdési időpontjától eltelt több mint 12 óra, ezért a rendszer a biztonsági eseménynaplót automatikusan lezárta és letöltötte a hivatalos végeredményt az MLSZ Mock API-ból.\n\nÜdvözlettel:\nRába ETO Digitális Eseménynapló Rendszer`
      : `Tisztelt Címzett!\n\nA "${match.title}" (${match.date} ${match.time}, ${match.venue}) mérkőzés biztonsági eseménynaplója végleges lezárásra került.\n\nÜdvözlettel:\nRába ETO Digitális Eseménynapló Rendszer`;

  try {
    const response = await fetch(`${API_BASE}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipient,
        subject,
        message,
        matchId: match.id,
        result: {
          score: result?.score || "N/A",
          winner: result?.winner || "N/A",
        },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    return await response.json();
  } catch (err) {
    console.warn("[Email] Backend /api/send-email hiba:", err);
    return { ok: false, error: err.message };
  }
}
