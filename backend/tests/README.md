# Rába ETO Digitális Eseménynapló — Követelmény-ellenőrző E2E Tesztprogram

Ez a dokumentum a [`requirements.test.js`](./requirements.test.js) végponttól végpontig (End-to-End) tesztelő program működését, szerkezetét és futtatását foglalja össze.

## A tesztprogram lényege

A [`requirements.test.js`](./requirements.test.js) egy **Puppeteer** alapú automatizált böngészős és API-szintű követelmény-ellenőrző tesztcsomag, amely egy valós felhasználói munkamenetet szimulálva ellenőrzi a teljes alkalmazás (React frontend + Express backend + PostgreSQL adatbázis + Mock MLSZ API) elvárt üzleti logikáját.

A tesztprogram **15 különálló ellenőrzési ponton** (`T1.1`–`T9`) megy végig sorban:
- a böngészőben ténylegesen bejelentkezik, kattint, űrlapokat tölt ki és nézeteket ellenőriz,
- hálózati elfogással (`page.setRequestInterception(true)`) naplózza az API-hívásokat és determinisztikusan szimulálja a közelgő (4 órán belüli/túli), a lejárt (12 órás) és az archiválandó (1 hetes) mérkőzések időadatait és API-változásait,
- közvetlen API-hívásokkal (`GET /api/matches/:id/pdf`, `PUT`, `POST`) ellenőrzi a PDF-generálást és a háttérvédelmeket,
- futás végén (`finally` blokkban) automatikusan visszaállítja az adatbázist, a törzsadatokat és a felhasználókat a teszt előtti eredeti állapotukra.

---

## Előfeltételek

1. **Futó szerverek:**
   - Backend API (`http://localhost:3000`): `npm --prefix backend start` (vagy `node backend/index.js`)
   - Frontend (`http://localhost:5173`): `npm --prefix frontend/Esemenynaplodigit run dev`
2. **Adatbázis:** Aktív PostgreSQL kapcsolat ajánlott (ennek hiányában a backend in-memory módban fut), a teszt automatikusan detektálja a `/api/db/status` végponton keresztül.
3. **Böngésző:** Telepített Google Chrome vagy Microsoft Edge (vagy a `CHROME_BIN` környezeti változóval megadott bináris).

---

## Futtatás

```bash
npm --prefix backend test
```

Alternatívaként közvetlenül Node-dal is indítható:

```bash
node backend/tests/requirements.test.js
```

### Támogatott környezeti változók

| Változó | Alapértelmezett érték | Leírás |
| --- | --- | --- |
| `FRONTEND_URL` | `http://localhost:5173` | A frontend alkalmazás URL-je |
| `API_URL` | `http://localhost:3000` | A backend API alap URL-je |
| `CHROME_BIN` | automatikus keresés | Egyedi Chrome/Edge futtatható fájl útvonala |

---

## Mit ellenőriz a 15 teszteset?

| Azonosító | Vizsgált követelmény |
| --- | --- |
| `T1.1` | Hibás belépés elutasítása, helyes Admin belépés elfogadása |
| `T1.2` | Az MLSZ Mock API (`/api/mlsz/matches`) lekérése **minden** bejelentkezéskor megtörténik |
| `T1.3` | Bejelentkezéskor az MLSZ API-ban módosult meccsadatok (helyszín, időpont) frissülnek az adatbázisban és a felületen |
| `T2.1` | A `Megnyitott naplók` nézetben csak a kezdés előtti 4 órás intervallumon belüli és 12 óránál fiatalabb mérkőzések szerepelnek |
| `T2.2` | A kezdés előtt 4 óránál távolabbi API mérkőzés csak megtekinthető (nincs szerkesztés, mentés, lezárás, és nem íródik át aktívvá) |
| `T2.3` | A kezdés előtti 4 órán belüli API mérkőzés automatikusan megnyitottként jelenik meg és szerkeszthető |
| `T3` | Megnyitott eseménynapló piszkozat mentése lezárás nélkül (`Mentés`), majd újranyitás után a módosítások folytathatók |
| `T4.1` | Manuális lezárás csak a mérkőzés végeredményének megadásával lehetséges |
| `T5` | Lezáráskor automatikusan e-mail küldés indul (`/api/send-email`) a törzsadatokban beállított jelentési címre |
| `T6` | Lezárt (`finalized`) napló már nem szerkeszthető (API-szinten is tiltott), de komment hozzáadható/menthető, valamint a PDF megtekinthető és letölthető |
| `T4.2` | A kezdéstől számított 12 óra elteltével a napló automatikusan lezáródik az MLSZ API végeredményével és e-mail értesítéssel |
| `T7.1` | A meccs kezdete után 1 héttel (7 nappal) a napló automatikusan `archived` (Archivált) állapotba kerül |
| `T7.2` | Archivált állapotban új komment már nem adható hozzá, a meglévő megjegyzés látható, a PDF megtekintése/letöltése működik |
| `T8` | `Admin` szerepkörrel szerkeszthetők a törzsadatok, partnerek, elérhetőségek, felhasználók és a saját profil |
| `T9` | Sima felhasználó (`Biztonsági vezető`) csak a saját adatait módosíthatja, és nem látja a többi felhasználót (sem UI-ban, sem hálózati kéréssel) |

---

## Biztonságos visszaállítás (Cleanup)

A teszt induláskor elmenti az eredeti törzsadatokat, felhasználókat és mérkőzéseket, majd a tesztek befejezése után (hiba esetén is):
- törli a létrehozott tesztmérkőzéseket (`999xxx`) és tesztfelhasználókat,
- visszaállítja az eredeti törzsadatokat,
- PostgreSQL használata esetén közvetlen SQL-lel is garantálja az érintett táblák és szekvenciák eredeti állapotát.
