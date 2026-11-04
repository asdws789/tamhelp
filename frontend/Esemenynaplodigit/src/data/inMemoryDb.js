// inMemoryDb.js
// Memóriában futó teszt adatbázis (In-Memory Database)

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
    organization: "Rába ETO SE Győr",
    officialEmail: "szeconnect.projektmunka@gmail.com",
    reportEmail: "szeconnect.projektmunka@gmail.com",
    phone: "+36 96 123 456",
    address: "9027 Győr, ETO Park",
    organizer: "Rába ETO SE Győr",
    chiefOrganizer: "Főnév Sándor",
    healthcareProvider: "ETO Egészségügyi Partner Kft.",
    disasterProtectionProvider: "ETO Katasztrófavédelmi Partner Kft.",
  },

  matches: [
    {
      id: 1,
      title: "CSAPAT 2 vs ETO",
      date: "2026. 10. 28.",
      time: "11:00",
      venue: "ETO Park",
      status: "in_progress",
      events: [],
    },
    {
      id: 6,
      title: "CSAPAT 3 vs ETO",
      date: "2026. 10. 27.",
      time: "10:00",
      venue: "ETO Park",
      status: "in_progress",
      events: [],
    },
    {
      id: 7,
      title: "CSAPAT 4 vs ETO",
      date: "2026. 11. 15.",
      time: "16:00",
      venue: "ETO Park",
      status: "in_progress",
      events: [],
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
    },
  ],

  sentEmails: [],

  // Adatbázis műveletek
  getUsers() {
    return this.users;
  },

  findUser(username, password) {
    return this.users.find(
      (u) => u.username === username && u.password === password
    );
  },

  getMatches() {
    return this.matches;
  },

  updateMatch(id, data) {
    const match = this.matches.find((m) => String(m.id) === String(id));
    if (match) {
      Object.assign(match, data);
    }
    return match;
  },

  getMasterData() {
    return this.masterData;
  },

  logEmail(emailRecord) {
    const record = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: "Elküldve",
      ...emailRecord,
    };
    this.sentEmails.push(record);
    console.log("[IN-MEMORY DB] E-mail rögzítve:", record);
    return record;
  },

  getSentEmails() {
    return this.sentEmails;
  },
};
