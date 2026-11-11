// Frontend in-memory fallback adatbázis, ha a backend szerver átmenetileg nem elérhető.

export const inMemoryDb = {
  users: [
    {
      id: 1,
      username: "Admin",
      password: "Adminjelszo",
      name: "Adminisztrátor",
      email: "admin@eto.hu",
      phone: "+36 30 987 6543",
      role: "Admin",
    },
    {
      id: 2,
      username: "User1",
      password: "Userjelszo",
      name: "Biztonsági vezető",
      email: "user1@eto.hu",
      phone: "+36 30 123 4567",
      role: "Biztonsági vezető",
    },
    {
      id: 3,
      username: "szeconnect",
      password: "SzeConnect2026!",
      name: "SZE Connect Projektvezető",
      email: "szeconnect.projektmunka@gmail.com",
      phone: "+36 30 555 9876",
      role: "Biztonsági vezető",
    },
  ],

  masterData: {
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
  },

  matches: [
    {
      id: 1,
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
      },
      events: [],
      notes: [],
    },
    {
      id: 6,
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
      },
      events: [],
      notes: [],
    },
    {
      id: 7,
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
      },
      events: [],
      notes: [],
    },
    {
      id: 3,
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
        score: "0 - 3",
        winner: "ETO",
      },
      events: [],
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
        score: "2 - 2",
        winner: "Döntetlen",
      },
      events: [],
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

  getUsers() {
    return this.users.map(({ password, ...u }) => u);
  },

  findUser(username, password) {
    const user = this.users.find(
      (u) =>
        u.username.toLowerCase() === String(username || "").trim().toLowerCase() &&
        u.password === password
    );
    if (!user) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  },

  getMatches() {
    return this.matches;
  },

  updateMatch(id, data) {
    const idx = this.matches.findIndex((m) => String(m.id) === String(id));
    if (idx !== -1) {
      this.matches[idx] = { ...this.matches[idx], ...data };
      return this.matches[idx];
    }
    return null;
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
};
