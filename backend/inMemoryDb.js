// backend/inMemoryDb.js
// Memóriában futó teszt adatbázis

const inMemoryDb = {
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
  },

  sentEmails: [],

  logEmail(email) {
    const record = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      status: "Elküldve",
      ...email,
    };
    this.sentEmails.push(record);
    console.log("[BACKEND IN-MEMORY DB] E-mail mentve:", record);
    return record;
  },
};

module.exports = inMemoryDb;
