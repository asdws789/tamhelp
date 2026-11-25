// In-memory fallback adatbázis, ha a PostgreSQL nem érhető el.
// Struktúrája és metódusai pontosan megegyeznek a PostgreSQL adatréteggel.
const { hashPassword, verifyPassword } = require("./db/password");

const DEFAULT_MASTER_DATA = {
  id: 1,
  organization: "Rába ETO SE Győr",
  officialEmail: "szeconnect.projektmunka@gmail.com",
  organizationEmail: "szeconnect.projektmunka@gmail.com",
  reportEmail: "szeconnect.projektmunka@gmail.com",
  phone: "+36 96 123 456",
  organizationPhone: "+36 96 123 456",
  address: "9027 Győr, ETO Park",
  organizationAddress: "9027 Győr, ETO Park",
  organizer: "Rába ETO SE Győr",
  chiefOrganizer: "Főnév Sándor",
  healthcareProvider: "ETO Egészségügyi Partner Kft.",
  disasterProtectionProvider: "ETO Katasztrófavédelmi Partner Kft.",
};

const inMemoryDb = {
  users: [
    {
      id: 1,
      username: "Admin",
      password: hashPassword("Adminjelszo"),
      name: "Adminisztrátor",
      email: "admin@eto.hu",
      phone: "+36 30 987 6543",
      role: "Admin",
    },
    {
      id: 2,
      username: "User1",
      password: hashPassword("Userjelszo"),
      name: "Biztonsági vezető",
      email: "user1@eto.hu",
      phone: "+36 30 123 4567",
      role: "Biztonsági vezető",
    },
    {
      id: 3,
      username: "szeconnect",
      password: hashPassword("SzeConnect2026!"),
      name: "SZE Connect Projektvezető",
      email: "szeconnect.projektmunka@gmail.com",
      phone: "+36 30 555 9876",
      role: "Biztonsági vezető",
    },
  ],

  masterData: { ...DEFAULT_MASTER_DATA },

  matches: [
    {
      id: 1,
      teamId: 323805,
      competition: "NB I",
      homeTeam: "CSAPAT 2",
      awayTeam: "ETO",
      title: "CSAPAT 2 vs ETO",
      date: "2026. 11. 18.",
      time: "17:00",
      venue: "ETO Park",
      status: "in_progress",
      score: null,
      winner: null,
      meta: {
        competitionName: "NB I",
        homeTeam: "CSAPAT 2",
        awayTeam: "ETO",
        matchDate: "2026. 11. 18.",
        matchTime: "17:00",
        venue: "ETO Park",
        organizer: "Rába ETO SE Győr",
        securityOfficer: { name: "Biztonsági vezető", phone: "+36 30 123 4567" },
        headOrganizer: { name: "Főnév Sándor", phone: "+36 96 123 456" },
        eventLogLeader: "Biztonsági vezető",
        medicalService: { organization: "ETO Egészségügyi Partner Kft.", person: "Dr. Nagy Péter" },
        disasterProtection: { organization: "ETO Katasztrófavédelmi Partner Kft.", person: "Kovács János" },
      },
      events: [],
      notes: [],
    },
    {
      id: 6,
      teamId: 323805,
      competition: "Magyar Kupa",
      homeTeam: "CSAPAT 3",
      awayTeam: "ETO",
      title: "CSAPAT 3 vs ETO",
      date: "2026. 11. 25.",
      time: "18:00",
      venue: "ETO Park",
      status: "in_progress",
      score: null,
      winner: null,
      meta: {
        competitionName: "Magyar Kupa",
        homeTeam: "CSAPAT 3",
        awayTeam: "ETO",
        matchDate: "2026. 11. 25.",
        matchTime: "18:00",
        venue: "ETO Park",
        organizer: "Rába ETO SE Győr",
        securityOfficer: { name: "Biztonsági vezető", phone: "+36 30 123 4567" },
        headOrganizer: { name: "Főnév Sándor", phone: "+36 96 123 456" },
        eventLogLeader: "Biztonsági vezető",
        medicalService: { organization: "ETO Egészségügyi Partner Kft.", person: "" },
        disasterProtection: { organization: "ETO Katasztrófavédelmi Partner Kft.", person: "" },
      },
      events: [],
      notes: [],
    },
    {
      id: 7,
      teamId: 323805,
      competition: "NB I",
      homeTeam: "CSAPAT 4",
      awayTeam: "ETO",
      title: "CSAPAT 4 vs ETO",
      date: "2026. 12. 02.",
      time: "16:00",
      venue: "ETO Park",
      status: "in_progress",
      score: null,
      winner: null,
      meta: {
        competitionName: "NB I",
        homeTeam: "CSAPAT 4",
        awayTeam: "ETO",
        matchDate: "2026. 12. 02.",
        matchTime: "16:00",
        venue: "ETO Park",
        organizer: "Rába ETO SE Győr",
        securityOfficer: { name: "Biztonsági vezető", phone: "+36 30 123 4567" },
        headOrganizer: { name: "Főnév Sándor", phone: "+36 96 123 456" },
        eventLogLeader: "Biztonsági vezető",
        medicalService: { organization: "ETO Egészségügyi Partner Kft.", person: "" },
        disasterProtection: { organization: "ETO Katasztrófavédelmi Partner Kft.", person: "" },
      },
      events: [],
      notes: [],
    },
    {
      id: 3,
      teamId: 323805,
      competition: "NB I",
      homeTeam: "CSAPAT 1",
      awayTeam: "ETO",
      title: "CSAPAT 1 vs ETO",
      date: "2026. 10. 20.",
      time: "14:50",
      venue: "ETO Park",
      status: "finalized",
      score: "0 - 3",
      winner: "ETO",
      meta: {
        competitionName: "NB I",
        homeTeam: "CSAPAT 1",
        awayTeam: "ETO",
        matchDate: "2026. 10. 20.",
        matchTime: "14:50",
        venue: "ETO Park",
        organizer: "Rába ETO SE Győr",
        securityOfficer: { name: "Biztonsági vezető", phone: "+36 30 123 4567" },
        headOrganizer: { name: "Főnév Sándor", phone: "+36 96 123 456" },
        eventLogLeader: "Biztonsági vezető",
        medicalService: { organization: "ETO Egészségügyi Partner Kft.", person: "Dr. Szabó Anna" },
        disasterProtection: { organization: "ETO Katasztrófavédelmi Partner Kft.", person: "Kiss Gábor" },
        score: "0 - 3",
        winner: "ETO",
      },
      events: [
        {
          id: "seed-m3-e1",
          sequenceNumber: 1,
          eventType: "Belépés és Rendbontás",
          time: "14:25",
          reporterName: "Kapu 1. Szolgálatvezető",
          reporterMode: "lista",
          eventDescription:
            "Vendégszektor beengedése során kisebb torlódás alakult ki a kapuknál.",
          decisionMaker: "Biztonsági vezető",
          decisionMakerMode: "lista",
          actionType: "Plusz beléptető sáv megnyitása",
          actionResult: "Torlódás 5 percen belül megszűnt",
          createdAt: "2026-10-20T14:25:00.000Z",
          createdBy: "Biztonsági vezető",
        },
        {
          id: "seed-m3-e2",
          sequenceNumber: 2,
          eventType: "Egészségügyi Esemény",
          time: "15:18",
          reporterName: "Mentőszolgálat",
          reporterMode: "lista",
          eventDescription: "Hazai drukker enyhe rosszulléte a keleti lelátón.",
          decisionMaker: "Ügyeletes orvos",
          decisionMakerMode: "lista",
          actionType: "Helyszíni ellátás és folyadékpótlás",
          actionResult: "Állapota stabilizálódott, a mérkőzést végignézte",
          createdAt: "2026-10-20T15:18:00.000Z",
          createdBy: "Biztonsági vezető",
        },
      ],
      notes: [
        {
          id: 1,
          matchId: 3,
          text: "A mérkőzés rendben lezajlott, utólagos jegyzőkönyvi kiegészítés szükséges a 2-es kapu forgalmáról.",
          createdBy: "Biztonsági vezető",
          createdAt: "2026. 10. 20. 17:15",
        },
      ],
    },
    {
      id: 4,
      teamId: 323805,
      competition: "NB I",
      homeTeam: "CSAPAT 5",
      awayTeam: "ETO",
      title: "CSAPAT 5 vs ETO",
      date: "2026. 09. 15.",
      time: "14:50",
      venue: "ETO Park",
      status: "archived",
      score: "2 - 2",
      winner: "Döntetlen",
      meta: {
        competitionName: "NB I",
        homeTeam: "CSAPAT 5",
        awayTeam: "ETO",
        matchDate: "2026. 09. 15.",
        matchTime: "14:50",
        venue: "ETO Park",
        organizer: "Rába ETO SE Győr",
        securityOfficer: { name: "Biztonsági vezető", phone: "+36 30 123 4567" },
        headOrganizer: { name: "Főnév Sándor", phone: "+36 96 123 456" },
        eventLogLeader: "Adminisztrátor",
        medicalService: { organization: "ETO Egészségügyi Partner Kft.", person: "Dr. Horváth Béla" },
        disasterProtection: { organization: "ETO Katasztrófavédelmi Partner Kft.", person: "Nagy őrnagy" },
        score: "2 - 2",
        winner: "Döntetlen",
      },
      events: [
        {
          id: "seed-m4-e1",
          sequenceNumber: 1,
          eventType: "Pirotechnika",
          time: "16:12",
          reporterName: "Szektorfelügyelő",
          reporterMode: "lista",
          eventDescription:
            "Vendégszektorban egy füstgyertya került meggyújtásra a gól után.",
          decisionMaker: "Rendezvénybiztonsági parancsnok",
          decisionMakerMode: "lista",
          actionType: "Kamerafelvétel rögzítése, szóbeli figyelmeztetés",
          actionResult: "További rendbontás nem történt",
          createdAt: "2026-09-15T16:12:00.000Z",
          createdBy: "Adminisztrátor",
        },
      ],
      notes: [
        {
          id: 2,
          matchId: 4,
          text: "Archiválva a hatósági ellenőrzést követően.",
          createdBy: "Adminisztrátor",
          createdAt: "2026. 09. 16. 09:30",
        },
      ],
    },
  ],

  sentEmails: [],

  _sanitizeUser(u) {
    if (!u) return null;
    const { password, ...safeUser } = u;
    return { ...safeUser };
  },

  getUsers() {
    return this.users.map((u) => this._sanitizeUser(u));
  },

  findUser(username, password) {
    const user = this.users.find(
      (u) =>
        u.username.toLowerCase() === String(username || "").trim().toLowerCase() &&
        verifyPassword(password, u.password)
    );
    return this._sanitizeUser(user);
  },

  createUser(userData) {
    const nextId =
      this.users.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0) + 1;
    const newUser = {
      id: nextId,
      username: String(userData.username || "").trim(),
      password: hashPassword(userData.password || "Eto2026!"),
      name: String(userData.name || "").trim(),
      email: String(userData.email || "").trim(),
      phone: String(userData.phone || "").trim(),
      role: userData.role || "Biztonsági vezető",
    };
    this.users.push(newUser);
    return this._sanitizeUser(newUser);
  },

  updateUser(id, userData) {
    const idx = this.users.findIndex((u) => String(u.id) === String(id));
    if (idx === -1) return null;
    const current = this.users[idx];
    this.users[idx] = {
      ...current,
      username: userData.username !== undefined ? userData.username : current.username,
      name: userData.name !== undefined ? userData.name : current.name,
      email: userData.email !== undefined ? userData.email : current.email,
      phone: userData.phone !== undefined ? userData.phone : current.phone,
      role: userData.role !== undefined ? userData.role : current.role,
      password:
        userData.password && String(userData.password).trim() !== ""
          ? hashPassword(userData.password)
          : current.password,
    };
    return this._sanitizeUser(this.users[idx]);
  },

  updateUserPassword(id, currentPassword, newPassword) {
    const idx = this.users.findIndex((u) => String(u.id) === String(id));
    if (idx === -1) return { error: "A felhasználó nem található." };
    if (!verifyPassword(currentPassword, this.users[idx].password)) {
      return { error: "A jelenlegi jelszó hibás." };
    }
    this.users[idx].password = hashPassword(newPassword);
    return { ok: true };
  },

  deleteUser(id) {
    const idx = this.users.findIndex((u) => String(u.id) === String(id));
    if (idx === -1) return { deleted: false };
    this.users.splice(idx, 1);
    return { deleted: true };
  },

  getMasterData() {
    return { ...this.masterData };
  },

  updateMasterData(data) {
    const organization = data.organization ?? data.organizer ?? this.masterData.organization;
    const officialEmail =
      data.organizationEmail ?? data.officialEmail ?? this.masterData.officialEmail;
    const phone = data.organizationPhone ?? data.phone ?? this.masterData.phone;
    const address =
      data.organizationAddress ?? data.address ?? this.masterData.address;
    const normalized = {
      ...data,
      organization,
      officialEmail,
      organizationEmail: officialEmail,
      phone,
      organizationPhone: phone,
      address,
      organizationAddress: address,
      organizer: data.organizer ?? organization,
    };
    this.masterData = {
      ...this.masterData,
      ...normalized,
      id: 1,
    };
    return { ...this.masterData };
  },

  getMatches() {
    return this.matches.map((m) => ({
      ...m,
      meta: m.meta ? { ...m.meta } : {},
      events: Array.isArray(m.events) ? [...m.events] : [],
      notes: Array.isArray(m.notes) ? [...m.notes] : [],
    }));
  },

  getMatchById(id) {
    const match = this.matches.find((m) => String(m.id) === String(id));
    if (!match) return null;
    return {
      ...match,
      meta: match.meta ? { ...match.meta } : {},
      events: Array.isArray(match.events) ? [...match.events] : [],
      notes: Array.isArray(match.notes) ? [...match.notes] : [],
    };
  },

  createMatch(matchData) {
    const existing = this.getMatchById(matchData.id);
    if (existing) return existing;

    const newMatch = {
      id: Number(matchData.id) || Date.now(),
      teamId: matchData.teamId || 323805,
      competition: matchData.competition || matchData.meta?.competition || "",
      homeTeam: matchData.homeTeam || matchData.meta?.homeTeam || "",
      awayTeam: matchData.awayTeam || matchData.meta?.awayTeam || "",
      title: matchData.title || `${matchData.homeTeam || ""} vs ${matchData.awayTeam || ""}`,
      date: matchData.date || matchData.matchDate || "",
      time: matchData.time || matchData.matchStartTime || "",
      venue: matchData.venue || "",
      status: matchData.status || "in_progress",
      score: matchData.score || null,
      winner: matchData.winner || null,
      meta: matchData.meta ? { ...matchData.meta } : {},
      events: Array.isArray(matchData.events) ? [...matchData.events] : [],
      notes: Array.isArray(matchData.notes) ? [...matchData.notes] : [],
    };
    this.matches.push(newMatch);
    return this.getMatchById(newMatch.id);
  },

  updateMatch(id, data) {
    let idx = this.matches.findIndex((m) => String(m.id) === String(id));
    if (idx === -1) {
      if (!data.title) return null;
      this.createMatch({ id: Number(id) || id, ...data });
      idx = this.matches.findIndex((m) => String(m.id) === String(id));
      if (idx === -1) return null;
    }

    const current = this.matches[idx];
    this.matches[idx] = {
      ...current,
      title: data.title !== undefined ? data.title : current.title,
      date: data.date !== undefined ? data.date : current.date,
      time: data.time !== undefined ? data.time : current.time,
      venue: data.venue !== undefined ? data.venue : current.venue,
      status: data.status !== undefined ? data.status : current.status,
      score: data.score !== undefined ? data.score : current.score,
      winner: data.winner !== undefined ? data.winner : current.winner,
      meta: data.meta ? { ...(current.meta || {}), ...data.meta } : current.meta,
      events: Array.isArray(data.events) ? [...data.events] : current.events || [],
    };
    return this.getMatchById(id);
  },

  addNote(matchId, { text, createdBy }) {
    const match = this.matches.find((m) => String(m.id) === String(matchId));
    if (!match) return null;
    if (!Array.isArray(match.notes)) match.notes = [];

    const maxId = this.matches.reduce(
      (max, m) =>
        Math.max(
          max,
          ...(Array.isArray(m.notes) ? m.notes.map((n) => Number(n.id) || 0) : [0])
        ),
      0
    );

    const note = {
      id: maxId + 1,
      matchId: match.id,
      text: String(text || "").trim(),
      createdBy: createdBy || "Rendszer",
      createdAt: new Date().toLocaleString("hu-HU"),
    };
    match.notes.push(note);
    return { ...note };
  },

  logEmail(emailRecord) {
    const record = {
      id: Date.now(),
      ...emailRecord,
      timestamp: new Date().toISOString(),
    };
    this.sentEmails.unshift(record);
    return record;
  },

  getSentEmails() {
    return this.sentEmails;
  },
};

module.exports = inMemoryDb;
