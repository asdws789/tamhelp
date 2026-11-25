# Rába ETO Digitális Eseménynapló — Rendszerdokumentáció és Műszaki Összefoglaló

Ez a dokumentáció a teljes forráskód ([backend](./backend/index.js), [adatbázis-réteg](./backend/db/index.js), [séma](./backend/db/schema.sql), [frontend](./frontend/Esemenynaplodigit/src/App.jsx)) alapján foglalja össze a rendszer felépítését, működését, biztonsági állapotát és továbbfejlesztési irányait.

---

## 1. Adatbázis felépítése (ER-diagram felosztásban)

A PostgreSQL séma ([`schema.sql`](./backend/db/schema.sql)) **6 táblából** áll, amelyek relációs szempontból két élesen elkülönülő csoportra oszlanak: egy fizikailag összekötött eseménynapló-magra, valamint három független (idegen kulcs nélküli) támogató/audit táblára.

### 1.1. Összekötött relációs mag (Fizikai ER-kapcsolatok)

A mérkőzések és az azokhoz tartozó biztonsági bejegyzések alkotják a szigorú szülő–gyermek hierarchiát (`1 : N`):

* **`matches` (Szülő entitás — 1 oldal)**
  * Elsődleges kulcs: `id INT PRIMARY KEY` *(szándékosan nem `SERIAL`, hogy közvetlenül átvehesse a külső MLSZ API mérkőzésazonosítóit, pl. `100011`, illetve a saját/teszt azonosítókat)*
  * Fő attribútumok: `title VARCHAR(200)`, `team_id INT`, `competition VARCHAR(150)`, `home_team VARCHAR(100)`, `away_team VARCHAR(100)`, `match_date VARCHAR(50)`, `match_time VARCHAR(20)`, `venue VARCHAR(150)`, `status VARCHAR(50) DEFAULT 'in_progress'`, `score VARCHAR(20)`, `winner VARCHAR(100)`, `meta JSONB`, `created_at`, `updated_at`.
  * Kapcsolatok:
    * **`matches` (1) ──< `events` (N)** (`events.match_id REFERENCES matches(id) ON DELETE CASCADE`)
    * **`matches` (1) ──< `notes` (N)** (`notes.match_id REFERENCES matches(id) ON DELETE CASCADE`)

* **`events` (Gyermek entitás — N oldal)**
  * Elsődleges kulcs: `id VARCHAR(100) PRIMARY KEY` *(UUID vagy generált szöveges azonosító, pl. `seed-m3-e1`)*
  * Idegen kulcs: `match_id INT REFERENCES matches(id) ON DELETE CASCADE`
  * Fő attribútumok: `sequence_number INT NOT NULL`, `event_type VARCHAR(100)`, `time VARCHAR(20)`, `reporter_name VARCHAR(100)`, `reporter_mode VARCHAR(50)`, `event_description TEXT`, `decision_maker VARCHAR(100)`, `decision_maker_mode VARCHAR(50)`, `action_type VARCHAR(100)`, `action_result TEXT`, `created_at`, `created_by VARCHAR(100)`.
  * Megjegyzés: Az adatréteg mentéskor ([`updateMatch`](./backend/db/index.js#L446-L552)) tranzakcióban törli és újraírja az adott `match_id`-hoz tartozó `events` sorokat, lekéréskor pedig `sequence_number ASC, id ASC` szerint rendezi őket.

* **`notes` (Gyermek entitás — N oldal)**
  * Elsődleges kulcs: `id SERIAL PRIMARY KEY`
  * Idegen kulcs: `match_id INT REFERENCES matches(id) ON DELETE CASCADE`
  * Fő attribútumok: `text TEXT NOT NULL`, `created_by VARCHAR(100)`, `created_at VARCHAR(50)` *(formázott magyar időbélyegként tárolva a `hu-HU` szerint)*.

> [!NOTE]
> Az `ON DELETE CASCADE` miatt egy mérkőzés törlésekor az összes hozzátartozó biztonsági esemény (`events`) és utólagos megjegyzés (`notes`) automatikusan törlődik árva rekordok nélkül.

---

### 1.2. Nem összekötött táblák indoklása és felhasználása

Három tábla szándékosan **nem** rendelkezik fizikai `FOREIGN KEY` kényszerrel más táblák felé:

1. **`users` (Felhasználók és jogosultságok)**
   * **Oszlopok:** `id SERIAL PRIMARY KEY`, `username VARCHAR(100) UNIQUE NOT NULL`, `password VARCHAR(255) NOT NULL`, `name VARCHAR(150) NOT NULL`, `email VARCHAR(150) NOT NULL`, `phone VARCHAR(50)`, `role VARCHAR(50) NOT NULL DEFAULT 'Biztonsági vezető'`, `created_at`.
   * **Jelszótárolás:** A `password` oszlop kizárólag sóval ellátott kriptográfiai **`scrypt`** jelszó-hasht tárol `scrypt$<32 hex só>$<128 hex kulcs>` formátumban ([`backend/db/password.js`](./backend/db/password.js)). Már a [`schema.sql`](./backend/db/schema.sql) kezdőadatai is hashelve szerepelnek, a régebbi plaintext sorokat pedig az alkalmazás induláskor és a `db:init` futtatásakor (`migratePlaintextPasswords`) automatikusan migrálja.
   * **Miért nincs összekötve `events` / `notes` / `matches` táblákkal?**
     * Ha egy biztonsági vezetőt később törölnek vagy átneveznek az `AdminPage`-en, egy fizikai FK kényszer megakadályozná a törlést, vagy `ON DELETE SET NULL` mellett elveszne a dokumentációból, hogy **ki** rögzítette az eseményt.
     * Ehelyett a rendszer **szöveges pillanatfelvételt** tárol az `events.created_by`, `notes.created_by` és a `matches.meta.eventLogLeader` mezőkben. Így a lezárt és archivált hivatalos naplók utólag sem változnak meg egy adminisztrátori felhasználó-módosítás miatt.
   * **Felhasználása:** Bejelentkezés [`scrypt` + `timingSafeEqual` ellenőrzéssel](./backend/db/index.js#L182-L200), profiladatok és jelszó frissítése ([`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx)), felhasználók CRUD kezelése ([`AdminPage.jsx`](./frontend/Esemenynaplodigit/src/components/AdminPage.jsx)).

2. **`master_data` (Szervezeti törzsadatok és partnerek)**
   * **Oszlopok:** `id SERIAL PRIMARY KEY`, `organization`, `official_email`, `report_email`, `phone`, `address`, `organizer`, `chief_organizer`, `healthcare_provider`, `disaster_protection_provider`.
   * **Miért nincs összekötve a `matches` táblával?**
     * Egyrészt **globális singleton konfigurációs rekordként** működik (az alkalmazás mindig az `id = 1` sort olvassa és frissíti: [`updateMasterData`](./backend/db/index.js#L300-L335)).
     * Másrészt a klub szerződött egészségügyi vagy katasztrófavédelmi partnere, illetve a főrendező szezon közben változhat. Ha a régi meccsek FK-val erre a sorra hivatkoznának, egy partnercsere visszamenőleg átírná a múltbeli, hivatalosan lezárt eseménynaplókat és PDF-eket. Ehelyett létrehozáskor ([`buildNewMatchPayload`](./frontend/Esemenynaplodigit/src/App.jsx#L58-L93)) átmásolódnak az aktuális értékek a `matches.meta` `JSONB` oszlopába, a `report_email` pedig dinamikusan az e-mail értesítések küldésekor olvasódik ki.
   * **Felhasználása:** Új napló előtöltése, lezáráskori e-mail címzett feloldása (`report_email`), Admin/Profil nézetek szervezeti blokkjai, PDF tartalék (`fallback`) adatok ([`buildMatchPdfHtml`](./backend/index.js#L62-L97)).

3. **`sent_emails` (E-mail küldési auditnapló)**
   * **Oszlopok:** `id SERIAL PRIMARY KEY`, `match_id INT`, `recipient VARCHAR(150) NOT NULL`, `subject VARCHAR(255) NOT NULL`, `message TEXT NOT NULL`, `result JSONB`, `status VARCHAR(50) DEFAULT 'Elküldve'`, `created_at`.
   * **Miért nincs fizikai FK `match_id`-n?**
     * Laza logikai hivatkozásként szolgál: így egy olyan e-mail is naplózható, amelyiknek nincs `match_id`-ja (`NULL`), illetve ha egy teszt- vagy hibás mérkőzés törlésre kerül a `matches` táblából, a postázási auditnapló megmarad (vagy függetlenül takarítható).
   * **Felhasználása:** Minden `POST /api/send-email` kérés naplózása a PostgreSQL-be és az in-memory tárolóba (`GET /api/sent-emails`).

---

### 1.3. Fontosabb összekötő elemek és kulcsok a táblákban

| Elem / Oszlop | Tábla | Típus / Kényszer | Funkció |
| :--- | :--- | :--- | :--- |
| `id` | `matches` | `INT PRIMARY KEY` | Nem csak belső kulcs, hanem a Mock MLSZ API és a helyi DB közötti szinkronkulcs; erre épülnek a `/api/matches/:id`, `/pdf` és `/notes` végpontok is. |
| `match_id` | `events` | `INT REFERENCES matches(id) ON DELETE CASCADE` | Összeköti az eseményeket a mérkőzéssel és garantálja a kaszkádolt törlést. |
| `sequence_number` | `events` | `INT NOT NULL` | A mérkőzésen belüli sorszámozást (`SSZ`) és determinisztikus rendezési sorrendet biztosítja. |
| `match_id` | `notes` | `INT REFERENCES matches(id) ON DELETE CASCADE` | Összeköti az utólagos megjegyzéseket a lezárt/archivált naplóval, kaszkádolt törléssel. |
| `match_id` | `sent_emails` | `INT` (laza kulcs) | Összekapcsolja a kiküldött értesítést a meccsel (audit + PDF hivatkozás generálása `/api/matches/:id/pdf`). |
| `team_id` | `matches` | `INT` | Külső szinkronkulcs az MLSZ csapatok szűréséhez (pl. `323805` – Rába ETO SE Győr, `323807` – ETO Akadémia). |
| `username` | `users` | `VARCHAR(100) UNIQUE NOT NULL` | A hitelesítés egyedi azonosítója (`LOWER(username)` alapú keresés a bejelentkezésnél). |
| `meta` | `matches` | `JSONB` | Félig strukturált dokumentum-tároló a fejléc-pillanatfelvételhez (`securityOfficer`, `headOrganizer`, `medicalService`, `disasterProtection`, `competitionName`, csapatok, eredmény). |

---

## 2. Státuszok és szerepkörök összefoglalása

### 2.1. A rendszer által alkalmazott státuszok

A mérkőzések és eseménynaplók életciklusában összesen **5 státuszérték** jelenik meg: **4 alkalmazásbeli eseménynapló-státusz** és **1 kizárólag a Mock MLSZ API válaszában használt mérkőzés-státusz**:

1. **`scheduled`** *(Közelgő / Még nem nyitott — 4 órán kívüli)*: A mérkőzés kezdéséig még több mint 4 óra van hátra (`hoursSinceStart < -4`). Az API-ból származó vagy adatbázisban már szereplő jövőbeli meccsek ebben a nézetben nyílnak meg.
2. **`in_progress`** *(Megnyitott)*: A mérkőzés a kezdés előtti 4 órás ablakban van, és még nem telt el 12 óra a kezdéstől (`-4 <= hoursSinceStart < 12`). Csak ekkor szerkeszthető a napló.
3. **`finalized`** *(Lezárt)*: Manuális véglegesítéssel vagy 12 óra elteltével automatikusan lezárt napló. Módosítani már nem lehet, csak utólagos komment adható hozzá, illetve PDF nézhető/tölthető le.
4. **`archived`** *(Archivált)*: Manuális archiválással vagy 1 hét (7 nap, `>= 168 óra`) elteltével létrejövő végső, teljesen írásvédett (megjegyzés-tiltott) állapot.
5. **`ended`** *(Csak külső Mock MLSZ API státusz)*: A [`matches.json`](./backend/mock-data/matches.json) állományban a lejátszott mérkőzéseket jelöli. Ha az alkalmazás automatikusan zár vagy archivál egy nyitott meccset, innen veszi le a végeredményt (`score`, `winner`).

*(Ezen felül technikai naplóstátuszként létezik a `sent_emails.status` oszlop, amely a sémában alapértelmezetten `'Elküldve'`, a `backend/index.js` naplózásakor pedig `'sent'` értéket kap.)*

---

### 2.2. Felhasználói szerepkörök és státusz-hozzárendelés

A rendszer **2 szerepkört** kezel ([`schema.sql`](./backend/db/schema.sql), [`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx), [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx)):
* **`Admin`**
* **`Biztonsági vezető`** (alapértelmezett szerepkör a DB sémában és az új felhasználók felvételénél)

**Melyik státuszhoz milyen szerepkörök tartoznak?**
Az eseménynaplók életciklus-státuszai (`scheduled`, `in_progress`, `finalized`, `archived`) **nincsenek szerepkörhöz kötve**: mind az `Admin`, mind a `Biztonsági vezető` látja és kezeli az összes fenti naplóstátusz műveleteit (megtekintés, aktív napló szerkesztése/mentése/lezárása, lezárt napló kommentelése/archiválása, PDF letöltés). A két szerepkör közötti jogosultsági eltérés a **rendszer-adminisztrációra és felhasználókezelésre** vonatkozik:
* **`Biztonsági vezető`:** csak saját profiladatait és saját jelszavát módosíthatja; nem látja a többi felhasználót, nem érheti el az Admin felületet és nem szerkesztheti a törzsadatokat/szerződött partnereket.
* **`Admin`:** mindent elér, amit a biztonsági vezető, továbbá látja az összes felhasználót a Profil nézetben, és az Admin felületen létrehozhat/módosíthat/törölhet felhasználókat, valamint szerkesztheti a törzsadatokat, partnereket és értesítési e-mail címeket.

*(Fontos tényszerű megjegyzés: a szerepkör-ellenőrzés jelenleg kizárólag a frontend UI-ban történik, a backend REST végpontok (`/api/users`, `/api/master-data`) jelenleg nem végeznek szerepkör- vagy token-ellenőrzést.)*

---

### 2.3. Státusz- és szerepkör-ellenőrzések helye a kódban

| Státusz / Szerepkör | Funkció | Fájl és pontos ellenőrzési pont |
| :--- | :--- | :--- |
| **`scheduled`** | Táblalistázás és kizárás a nyitottakból | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L312-L322) (`isMatchBeforeOpenWindow`, `syncMatchesAndLifecycle`), [`mockMlszApi.js`](./frontend/Esemenynaplodigit/src/data/mockMlszApi.js#L46-L50) |
| **`scheduled`** | Megnyitás tiltása (csak olvasható mód) | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L532-L540) (`handleClick`), [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1339) (`isScheduledReadOnly`) |
| **`in_progress`** | Automatikus nyitás 4 órás ablakban | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L220-L223) (`isMatchWithin4HourOpenWindow`) |
| **`in_progress`** | MLSZ adatszinkron engedélyezése | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L113-L116) (`syncChangedMlszSchedule` átugorja a `finalized` és `archived` sorokat) |
| **`in_progress`** | Szerkesztés, mentés, véglegesítés guard | [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1336-L1628) (`isEditable`: `updateMeta`, `addEvent`, `updateEvent`, `deleteEvent`, `handleSave`, `handleOpenFinalizeModal`) |
| **`finalized`** | Automatikus 12 órás lezárás + e-mail | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L265-L307) (`isMatchOlderThan12Hours && !isMatchOlderThan1Week`) |
| **`finalized`** | Komment hozzáadás, PDF, kézi archiválás | [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1495-L1850) (`addNote` csak `isFinalized`-ban engedélyezett, PDF + `Archiválás` gomb) |
| **`finalized`** | Szerveroldali tartalommódosítás tiltása | [`backend/index.js`](./backend/index.js#L586-L594) (`PUT /api/matches/:id` → `403`, kivéve `{ status: "archived" }`) |
| **`archived`** | Automatikus 7 napos archiválás | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L233-L264) (`isMatchOlderThan1Week`) |
| **`archived`** | Írásvédelem és komment-tiltás | [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1717-L1995) (`isArchived` → csak meglévő kommentek látszanak), [`backend/index.js`](./backend/index.js#L581-L621) (`PUT` és `POST .../notes` → `403`) |
| **`ended`** | Mock API lekérdezési szűrés | [`backend/index.js`](./backend/index.js#L406-L425) (`GET /api/mlsz/matches?status=...`), [`matches.json`](./backend/mock-data/matches.json) |
| **`Admin` szerepkör** | Admin menü, nézet és felhasználólista | [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L512-L514) (`navigateTo`), [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L1028-L1126) (Profil menü + Admin nézet renderelés) |
| **`Admin` szerepkör** | Más felhasználók és törzsadatok kezelése | [`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx#L123-L133) (`GET /api/users` hívás letiltása nem-Adminnak), [`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx#L173-L1353) (`isAdmin`) |

---

## 3. Az automatizálás tesztelése (12 órás lezárás és 1 hetes archiválás)

Készült egy dedikált, önállóan futtatható automatizálási E2E tesztprogram a [`backend/tests/automation.test.js`](./backend/tests/automation.test.js) fájlban (dokumentálva a [`backend/tests/README.md`](./backend/tests/README.md#L79-L90) alatt).

### Futtatási parancs
```bash
npm --prefix backend run test:automation
```

### Főbb jellemzők
* **Önálló szerverkezelés:** Ha a backend (`3000`) vagy a frontend (`5173`) éppen nem fut, a teszt átmenetileg elindítja őket, majd a `finally` blokkban leállítja a saját maga által indított folyamatokat (`taskkill /T /F` Windows-on), és visszaállítja a PostgreSQL teszt előtti állapotát.
* **Külön tesztazonosító-tartomány:** `998001`–`998005` (így nem ütközik a [`requirements.test.js`](./backend/tests/requirements.test.js) `999xxx` azonosítóival).
* **Ellenőrzött automatizálási esetek (`A1`–`A5`) — valós futási eredmény: `5/5 PASS` (PostgreSQL aktív):**
  * **`A1` (`-11h`):** A 12 órás küszöb előtti mérkőzés `in_progress` marad, megjelenik a `Megnyitott naplók` között, és nem küld e-mailt (**PASS**).
  * **`A2` (`-13h`):** A 12 órán túli nyitott mérkőzés bejelentkezéskor automatikusan `finalized` lesz, átveszi a Mock MLSZ API eredményét (`1 - 3 / ETO`), megjelenik a `Lezárt de nem archivált` táblában, és valódi Gmail SMTP e-mailt küld (`HTTP 200`, `success: true`) a törzsadatokban megadott címre a 12 órás indoklással (**PASS**).
  * **`A3` (`-6 nap`):** Az 1 hetes küszöb előtti lezárt napló `finalized` státuszban marad (`Lezárt` listában látható, `Archivált`-ban nem) (**PASS**).
  * **`A4` (`-8 nap`):** Az 1 héten túli lezárt napló automatikusan `archived` állapotba lép, megjelenik az `Archivált` nézetben, és a szerver HTTP `403`-mal elutasítja mind a módosítást (`PUT`), mind az új kommentet (`POST /notes`) (**PASS**).
  * **`A5` (`-9 nap`):** A nyitva maradt, 1 héten túli napló (`in_progress`) közvetlenül `archived` státuszba kerül az MLSZ API végeredményével (`2 - 2 / Döntetlen`), felesleges 12 órás e-mail küldése nélkül (**PASS**).

---

## 4. Rendszerleírás — A program működése egyes helyzetekben

1. **Alkalmazás indulása és DB-kapcsolódás:** A backend induláskor (`db.ready()`) megpróbál csatlakozni a PostgreSQL-hez és futtatja a [`schema.sql`](./backend/db/schema.sql)-t. Siker esetén PostgreSQL módban, hiba esetén automatikusan in-memory módban indul ([`backend/db/index.js`](./backend/db/index.js#L128-L152)). A frontend a `/api/db/status` lekérdezésével zöld vagy sárga jelvényben mutatja az aktuális adatbázis-állapotot ([`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L915-L929)).
2. **Bejelentkezés és MLSZ API szinkronizáció:** A [`LoginPage.jsx`](./frontend/Esemenynaplodigit/src/components/LoginPage.jsx) `POST /api/login`-on hitelesít (backend kiesésekor kliensoldali `inMemoryDb.findUser` fallbackkel). Sikeres belépéskor lefut a [`syncMatchesAndLifecycle`](./frontend/Esemenynaplodigit/src/App.jsx#L168-L323): letölti a friss törzsadatokat, a DB meccseket és a teljes MLSZ Mock API listát. A még nem lezárt/archivált DB mérkőzésekben átvezeti az API-ban módosult helyszínt, időpontot, csapatokat vagy versenysorozatot ([`syncChangedMlszSchedule`](./frontend/Esemenynaplodigit/src/App.jsx#L113-L165)).
3. **4 órán kívüli jövőbeli mérkőzés:** Ha a kezdés még `> 4 órára` van, a mérkőzés a `Következő mérkőzések` táblába kerül. Kattintáskor a [`handleClick`](./frontend/Esemenynaplodigit/src/App.jsx#L532-L540) csak olvasható `scheduled` módban nyitja meg az [`EventLogEditor`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1717-L1844) előnézetét (nincsenek szerkesztőmezők, mentés/lezárás/PDF gombok, és nem történik DB írás).
4. **4 órás nyitási ablakba lépő mérkőzés:** Ha az API-ból érkező meccs a `[kezdés - 4 óra, kezdés + 12 óra)` sávban van, szinkronizációkor automatikusan bekerül a DB-be `in_progress` státusszal (`POST /api/matches`), a törzsadatokból előtöltve a partnereket és a főrendezőt.
5. **Aktív eseménynapló szerkesztése és mentése:** A `Megnyitott naplók` listából nyitott mérkőzésnél a felhasználó szerkesztheti a fejlécet, eseményeket adhat hozzá/módosíthat/törölhet (`Mentés` gomb → `PUT /api/matches/:id`). Lezárás nélkül mentett piszkozat később újranyitva folytatható.
6. **Manuális lezárás:** A `Véglegesítés` gomb megnyit egy modalt (előre felajánlja az API-ból lekért eredményt, ha van), kötelezi a győztes és a végeredmény megadását, majd `finalized` státuszra állítja a meccset (`PUT /api/matches/:id`) és elindítja a PDF-es e-mail értesítést.
7. **Automatikus lezárás 12 óra után:** Ha egy `in_progress` meccs kezdése `12 óránál` régebbi (de `7 napnál` fiatalabb), szinkronizációkor automatikusan lekéri az eredményt a `/api/mlsz/matches/:id`-ről, `finalized` állapotra menti, és elküldi a lezáró e-mailt.
8. **Lezárt állapot (`finalized`):** Szerkesztés tiltva; látható a csak olvasható A4 előnézet, a `PDF Megtekintése`, a `PDF Letöltése`, az `Archiválás` gomb és az utólagos megjegyzések blokk (`POST /api/matches/:id/notes`).
9. **Automatikus archiválás 1 hét után (`archived`):** Ha a kezdéstől eltelt legalább `7 nap` (`168 óra`), a rendszer automatikusan `archived` státuszra állítja (nyitva maradt meccsnél előbb az API eredményt is pótolva). Ebben a nézetben komment már nem adható hozzá, csak a meglévők látszanak és a PDF nyitható/menthető.
10. **Profil és Admin műveletek:** `Admin` felhasználóként az Admin felületen kezelhetők a felhasználók és a törzsadatok/partnerek (`PUT /api/master-data`), `Biztonsági vezető` esetén csak a saját profil és jelszó szerkeszthető.

---

## 5. Az e-mail küldési funkció működése (elbeszélő leírás)

Amikor egy mérkőzés biztonsági eseménynaplója lezárásra kerül — akár úgy, hogy a felhasználó a véglegesítő ablakban megadja a győztest és a végeredményt, akár úgy, hogy a rendszer észleli a kezdési időponttól eltelt 12 órát és az MLSZ Mock API-ból lekérdezi a végeredményt —, a frontend meghívja a [`sendEventLogClosedEmail`](./frontend/Esemenynaplodigit/src/data/mockMlszApi.js#L96-L134) függvényt. Ez összerakja a lezárás okától függő magyar nyelvű tárgyat és kísérőszöveget, majd a címzettként átadott `masterData.reportEmail` értékkel, a mérkőzés azonosítójával (`matchId`) és a végeredmény-objektummal (`score`, `winner`) együtt egy `POST /api/send-email` kérést küld az Express backend felé.

A backend ([`backend/index.js`](./backend/index.js#L657-L763)) beolvassa az adatbázisból az aktuális `masterData` rekordot, és ha a kérésben nem érkezett explicit címzett, a tárolt `reportEmail` címet veszi célba. Első lépésként a `db.logEmail` révén rögzíti a küldési szándékot a `sent_emails` táblában (valamint az in-memory naplóban), majd összeállítja a PDF megtekintési és letöltési URL-eket. Ezt követően meghívja a `generateMatchPdfBuffer(matchId)` függvényt, amely a legfrissebb adatbázis-adatok alapján Puppeteerrel valós időben legenerál egy teljes PDF dokumentumot, és `esemenynaplo-<matchId>.pdf` néven becsatolja a levél mellékletébe. Végül az X-XSS-védett (`escapeHtml`) HTML és szöveges levéltörzzsel — amely tartalmazza a végeredményt és két közvetlen akciógombot is a PDF eléréséhez — a `Nodemailer` Gmail SMTP `transporter` ténylegesen kiküldi az e-mailt, a sikerességről pedig JSON visszajelzést küld a kliensnek.

---

## 6. A projektben használt technológiák

| Réteg | Technológia / Csomag | Verzió / Részletek | Szerep |
| :--- | :--- | :--- | :--- |
| **Frontend keretrendszer** | React (`react`, `react-dom`) | `19.2.5` | Komponens-alapú SPA felhasználói felület és állapotkezelés |
| **Build eszköz** | Vite (`vite`, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler`) | `Vite 8.0.10` / `plugin-react 6.0.1` | Gyors fejlesztői szerver (HMR), React Compiler és produkciós bundle |
| **Stílus & ikonok** | Tailwind CSS (`@tailwindcss/vite`, `tailwindcss`), `lucide-react` | `Tailwind 4.2.4`, `lucide-react 1.16.0` | Reszponzív CSS elrendezés és UI ikonok |
| **Kódminőség** | ESLint (`eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`) | `ESLint 10.2.1` | Statikus JS/React kódellenőrzés |
| **Backend futtató & API** | Node.js + Express (`express`, `cors`) | `Express 5.2.1`, `cors 2.8.6` | REST API végpontok, statikus erőforrások és üzleti vezérlés |
| **Adatbázis** | PostgreSQL + `pg` (`node-postgres`), `Docker Compose` | `postgres:16-alpine`, `pg 8.23.1` | Perzisztens relációs + JSONB adattárolás, fallback in-memory motorral |
| **Kriptográfia & Jelszóvédelem** | Node.js beépített `crypto` modul (`scrypt`, `randomBytes`, `timingSafeEqual`) | Node.js core API | Sóval ellátott jelszó-hashelés és időzítésbiztos ellenőrzés |
| **PDF motor & E2E** | Puppeteer (`puppeteer`) + rendszer Chrome/Edge | `puppeteer 25.1.0` | Headless Chromium alapú HTML→A4 PDF renderelés és E2E böngészőtesztelés |
| **E-mail küldés** | Nodemailer (`nodemailer`) + Gmail SMTP | `nodemailer 7.0.9` | Hivatalos értesítő e-mailek küldése dinamikus PDF melléklettel |

---

## 7. Adatbiztonsági értékelés

### Jelenleg beépített védelmek
* **Sóval ellátott jelszó-hashelés (`scrypt`):** A felhasználói jelszavak sem a PostgreSQL `users` táblában, sem a szerveroldali [`backend/inMemoryDb.js`](./backend/inMemoryDb.js) fallbackban nem szerepelnek nyílt szövegként. Minden jelszó egyedi 16 bájtos véletlen sóval (`crypto.randomBytes`) és 64 bájtos `scrypt` kulccsal (`N=16384, r=8, p=1`) tárolódik ([`backend/db/password.js`](./backend/db/password.js)), az ellenőrzés pedig `crypto.timingSafeEqual` segítségével történik; a meglévő plaintext rekordok induláskor/`db:init`-kor automatikusan migrálódnak.
* **SQL Injection elleni védelem:** A [`backend/db/index.js`](./backend/db/index.js) minden lekérdezése kizárólag paraméterezett `$1, $2, ...` lekérdezéseket használ (`pool.query(..., [...])`), nincs szöveges SQL-összefűzés.
* **XSS elleni védelem:** A PDF- és e-mail HTML generátor ([`escapeHtml`](./backend/index.js#L38-L45)) szűri a speciális HTML karaktereket (`& < > " '`), a React JSX pedig alapértelmezetten escape-eli a megjelenített tartalmakat.
* **Szerveroldali állapot-integritás:** A `PUT /api/matches/:id` és `POST /api/matches/:id/notes` HTTP `403`-mal megakadályozza a már lezárt (`finalized`) naplók utólagos tartalmi módosítását, valamint az archivált (`archived`) naplók módosítását és kommentelését.
* **Jelszóhashek elrejtése a válaszokból:** Sem a felhasználói `SELECT`/`RETURNING` lekérdezések, sem a `POST /api/login` (`findUser`) nem küldik vissza a jelszó mezőt vagy a hash-t a kliensnek.
* **Mock API kulcs ellenőrzés:** Az `/api/mlsz/matches` végpontok ellenőrzik az `x-api-key` fejlécet (`401`).

### Jelenlegi sebezhetőségek és élesítés előtti kötelező teendők
1. **Szerveroldali hitelesítés (AuthN) és jogosultságkezelés (RBAC) hiánya:** A `POST /api/login` nem ad ki JWT tokent vagy `HttpOnly` munkamenet-sütit, a backend API végpontok (`GET/POST/PUT/DELETE /api/users`, `PUT /api/master-data`, `PUT /api/matches/:id`, `POST /api/send-email`, `GET .../pdf`) hitelesítés nélkül hívhatók közvetlenül. Élesítéshez JWT/Session middleware és szerepkör-ellenőrzés (`requireRole("Admin")`) kell minden backend végpont elé.
2. **Kódba égetett hitelesítő adatok (Secrets) és kliensoldali tesztfiókok:**
   * A [`backend/index.js`](./backend/index.js#L30-L36) közvetlenül a kódban tartalmazza a `GMAIL_USER` és `GMAIL_APP_PASSWORD` értékét (pedig a [`.env.example`](./backend/.env.example) már előkészítette ezeket `process.env`-re).
   * A [`frontend/Esemenynaplodigit/src/data/inMemoryDb.js`](./frontend/Esemenynaplodigit/src/data/inMemoryDb.js#L4-L32) a böngésző JS bundle-jébe csomagolva tárolja a tesztjelszavakat offline fallbackhez — éles buildből ezt teljes egészében el kell távolítani.
3. **Hálózati és szállítási biztonság:** A `cors()` jelenleg minden origót engedélyez (`*`), nincs HTTPS/TLS, nincs `helmet` biztonsági HTTP-fejléc és nincs brute-force elleni rate limiting (pl. `express-rate-limit` a `/api/login`-ra).
4. **Adatvédelem (GDPR):** A személyes elérhetőségek (telefonszám, e-mail, felelősök adatai) védelme érdekében szükséges a titkosított tárolás/átvitel, auditnaplózás és hozzáférés-korlátozás a PDF végpontokon is.

---

## 8. Hiányzó funkciók az éles működéshez

### 8.1. Telefonon történő elérhetőség és stabil mobil működés
* **Hardkódolt `localhost:3000` címek eltávolítása:** A [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx), [`LoginPage.jsx`](./frontend/Esemenynaplodigit/src/components/LoginPage.jsx), [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx), [`AdminPage.jsx`](./frontend/Esemenynaplodigit/src/components/AdminPage.jsx), [`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx), [`mockMlszApi.js`](./frontend/Esemenynaplodigit/src/data/mockMlszApi.js) és az e-mailek PDF linkjei ([`backend/index.js`](./backend/index.js#L672-L675)) jelenleg `http://localhost:3000`-ra mutatnak, ami telefonról nem érhető el. Be kell vezetni a `VITE_API_BASE_URL` (frontend) és `PUBLIC_BASE_URL` (backend) környezeti változókat (vagy reverse proxy alatti relatív `/api/...` útvonalakat).
* **Publikus hosztolás és HTTPS:** A frontend statikus buildet és a Node backendet nyilvános szerverre (pl. VPS / Render / Railway / felhő) kell telepíteni HTTPS tanúsítvánnyal.
* **Perzisztens munkamenet:** Jelenleg `currentUser` kizárólag React `useState`-ben él ([`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L17)), így telefonon egy oldalfrissítés vagy böngésző-háttérbe küldés azonnal kilépteti a felhasználót. Token/süti alapú munkamenet-megőrzés szükséges.
* **Mobil UX, PWA és offline térerő-védelem:** A mérkőzéstáblák (`min-w-[600px]`) vízszintesen görgethetők telefonon — kényelmesebbé tehetők mobilon kártyás nézettel, PWA manifesttel/Service Workerrel és `localStorage`/`IndexedDB` piszkozat-mentéssel arra az esetre, ha egy stadionban átmenetileg megszakad a mobilinternet.

### 8.2. E-mail küldés bármilyen e-mail címre
* **UI és választási szabadság:** Jelenleg a lezárás automatikusan csak a `masterData.reportEmail` címet használja ([`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx#L1668), [`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx#L304)). Szükséges egy felületi címzettválasztó/szabadszöveges beviteli mező (pl. a véglegesítő modalban és utólagos e-mail küldő gombbal a lezárt/archivált nézetben), valamint opcionális `CC`/`BCC` és több címzett támogatása.
* **Backend címvalidáció és visszaélés-védelem:** A `/api/send-email` végpont ugyan technikailag elfogadja a `req.body.to` mezőt, de címformátum-ellenőrzés, hitelesítés és rate limit nélkül nyitott spam-továbbítóvá válhatna élesben.
* **Megbízható SMTP szolgáltató és kézbesíthetőség:** Személyes Gmail SMTP helyett (amely szigorú napi küldési limitet és Google-fiók tiltást kockáztat idegen címzetteknél) dedikált tranzakciós szolgáltató (SendGrid, AWS SES, Mailgun, Resend vagy céges domain SMTP) javasolt beállított **SPF, DKIM és DMARC** rekordokkal, illetve sikertelen küldés esetén újrapróbálkozási sorral.

### 8.3. Valódi MLSZ API-val való munka (Mock helyett)
* **Backend adapter és kulcsvédelem:** Jelenleg a frontend közvetlenül hívja a mock API-t, és a JS-ben tárolja az `x-api-key`-t ([`mockMlszApi.js`](./frontend/Esemenynaplodigit/src/data/mockMlszApi.js#L1-L2)). Valódi integrációnál a backendnek kell kommunikálnia az MLSZ API-val (API kulcs / OAuth2 token `.env`-ből), és egy egységes DTO-adapterrel a rendszer belső sémájára fordítani a mezőket (időzóna, dátumformátum, félbeszakadt/elhalasztott státuszok, hosszabbításos eredmények).
* **Szerveroldali időzített háttérfeladat (`node-cron`):** Jelenleg a 4 órás nyitás, a 12 órás automatikus lezárás és az 1 hetes archiválás **csak akkor fut le**, ha valaki megnyitja a weblapot vagy bejelentkezik ([`syncMatchesAndLifecycle`](./frontend/Esemenynaplodigit/src/App.jsx#L168-L323)). Éles rendszerben egy szerveroldali ütemező (pl. `node-cron` 5–10 perces futással) szükséges, hogy akkor is pontosan megtörténjen a 12 órás lezárás, az MLSZ eredmény-lekérés, az e-mail küldés és a 7 napos archiválás, ha éppen senki nincs belépve.
* **Gyorsítótár és hibakezelés:** Rate-limit és külső API kiesés ellen cache réteg, timeoutok és újrapróbálkozási stratégia kell.

---

## 9. Külső rendszerekkel való integráció (Működés, Limitációk, Fejlesztés)

| Integrált rendszer | Alkalmazás módja | Jelenlegi limitációk | Továbbfejlesztési lehetőség |
| :--- | :--- | :--- | :--- |
| **Mock MLSZ API** *(saját Express útvonalak: `/api/mlsz/matches`)* | JSON fájlból ([`matches.json`](./backend/mock-data/matches.json)) szolgál ki 25 tesztmeccset `x-api-key` ellenőrzéssel; szűrés `teamId`, `competition`, `status` szerint. | Statikus helyi JSON; nincs valós idejű szinkron; a kulcs a frontend kódban van; az időablakos szinkron csak kliens-betöltéskor fut. | Backend oldali MLSZ HTTP kliens + adapter réteg + szerveroldali `node-cron` ütemezés + webhook vagy gyorsítótár. |
| **Gmail SMTP (`Nodemailer`)** | `nodemailer.createTransport({ service: "gmail", ... })` azonnali PDF melléklettel és HTML levéltesttel. | A felhasználónév és App Password hardkódolva van a [`backend/index.js`](./backend/index.js#L33-L34)-ben (`.env` helyett); Gmail napi kvótakorlát; nincs újrapróbálkozás (retry). | Titkok kiemelése `process.env`-be; váltás dedikált tranzakciós e-mail szolgáltatóra + feladat-sor (`BullMQ`/DB queue). |
| **PostgreSQL 16 + In-Memory Fallback** | `pg.Pool` kapcsolatkészlet ([`backend/db/index.js`](./backend/db/index.js)); sikertelen csatlakozáskor átállás memóriabeli tárolóra ([`backend/inMemoryDb.js`](./backend/inMemoryDb.js)). | In-memory módban szerver-újraindításkor az adatok elvesznek; a frontend még külön saját kliens-oldali `inMemoryDb.js`-t is tart fenn. | Élesben a csendes in-memory fallback tiltása (vagy szigorú írásvédett hibajelzés), DB migrációs eszköz (Prisma/Knex/node-pg-migrate) bevezetése. |
| **Headless Chrome/Edge (`Puppeteer`)** | HTML dokumentum renderelése A4 PDF bufferbe ([`renderPdfBuffer`](./backend/index.js#L356-L383)). | Minden egyes PDF kérésnél új böngészőpéldányt indít (`puppeteer.launch` → lassú, nagy CPU/RAM igény terhelésnél); rendszer-Chrome meglétét feltételezi. | Közös böngésző-példány újrafelhasználása (browser pool), vagy könnyűsúlyú/streamelt PDF generátor (PDFKit), illetve generált PDF-ek cache-elése `finalized`/`archived` állapotban. |

---

## 10. Rendszer architektúra (Backend logika és Frontend kivitelezés)

A rendszer **háromrétegű kliens–szerver architektúrát** követ (`SPA Frontend ↔ REST API Backend ↔ Relációs/JSONB Adatbázis`), kibővítve egy kliens– és szerveroldali fallback mechanizmussal:

### Backend felépítés (`backend/`)
* **API & vezérlési réteg ([`index.js`](./backend/index.js)):** Express 5 szerver `3000`-es porton (`cors`, `express.json`). Kezeli a Mock MLSZ API-t, a felhasználó-autentikációt és CRUD-ot, a törzsadatokat, a mérkőzések és kommentek életciklusát (szerveroldali `403` állapotvédelemmel), a PDF végpontot és a Gmail SMTP küldést.
* **Jelszó-biztonsági modul ([`db/password.js`](./backend/db/password.js)):** Sóval ellátott `scrypt` jelszó-hashelés (`hashPassword`), időzítésbiztos ellenőrzés (`verifyPassword`) és meglévő plaintext rekordok automatikus migrációja (`migratePlaintextPasswords`).
* **Adatelérési absztrakció ([`db/index.js`](./backend/db/index.js)):** Egyetlen egységes interfészen (`db`) keresztül kezeli a PostgreSQL `pg.Pool` lekérdezéseket és az [`inMemoryDb.js`](./backend/inMemoryDb.js) memóriabeli objektumot; induláskor lefuttatja a [`schema.sql`](./backend/db/schema.sql) `CREATE TABLE IF NOT EXISTS` és idempotens kezdőadat (`seed`) utasításait, majd a jelszó-migrációt.
* **Adatbázis inicializáló ([`db/init.js`](./backend/db/init.js)):** Külön `npm run db:init` szkript az adatbázis létrehozására, sématelepítésre és a jelszó-migráció futtatására.

### Frontend felépítés (`frontend/Esemenynaplodigit/src/`)
* **Központi állapotkezelő és életciklus-vezérlő ([`App.jsx`](./frontend/Esemenynaplodigit/src/App.jsx)):** Kezeli a bejelentkezett felhasználót, a nézeteket (`home`, `upcoming`, `closed`, `archived`, `profile`, `admin`), a menüsávokat és a `syncMatchesAndLifecycle` motort (4 órás nyitás, MLSZ változáskövetés, 12 órás auto-lezárás, 7 napos auto-archiválás).
* **Komponensek (`components/`):**
  * [`LoginPage.jsx`](./frontend/Esemenynaplodigit/src/components/LoginPage.jsx): Bejelentkező felület backend + kliens fallbackkel.
  * [`EventLogEditor.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogEditor.jsx): Kettős üzemmódú komponens — `in_progress` állapotban teljes interaktív szerkesztő (`Mentés`, `+ Esemény hozzáadása`, véglegesítő modal), míg `scheduled`, `finalized` és `archived` állapotban csak olvasható dokumentum-előnézet a megfelelő műveleti sávval és kommentkezeléssel.
  * [`EventLogDocument.jsx`](./frontend/Esemenynaplodigit/src/components/EventLogDocument.jsx): A4-szerű nyomtatható dokumentumnézet `Times New Roman` tipográfiával, az előnézeti képhez és a PDF sablonhoz igazítva.
  * [`ProfilePage.jsx`](./frontend/Esemenynaplodigit/src/components/ProfilePage.jsx): Saját adatok és jelszó módosítása, `Admin` esetén regisztrált felhasználók listája és nézetváltása.
  * [`AdminPage.jsx`](./frontend/Esemenynaplodigit/src/components/AdminPage.jsx): Teljes felhasználó CRUD, törzsadatok és szerződött partnerek szerkesztése (`aliasMap` szinkronizációval), rendszerinformációk.
* **Adat- és API-réteg (`data/`):** [`mockMlszApi.js`](./frontend/Esemenynaplodigit/src/data/mockMlszApi.js) (időablak-kalkulátorok, MLSZ API hívások, e-mail segéd), [`inMemoryDb.js`](./frontend/Esemenynaplodigit/src/data/inMemoryDb.js), [`EventLogData.js`](./frontend/Esemenynaplodigit/src/data/EventLogData.js).

---

## 11. A PDF generálás működési elve

A PDF összefoglalók előállítása kizárólag a szerveroldalon történik ([`backend/index.js`](./backend/index.js#L17-L395)), így garantáltan megegyezik a böngészőben megtekintett, a letöltött és az e-mailben csatolt dokumentum tartalma:

1. **Logó előtöltése (`Base64`):** A szerver indulásakor beolvassa a `backend/public/logo.png` fájlt és `data:image/png;base64,...` karakterláncként memóriában tartja (`logoBase64`). Ennek köszönhetően a PDF renderelésekor a Chromiumnak nem kell külső HTTP kéréssel képet betöltenie — a logó e-mail csatolmányban és archívumban is garantáltan megjelenik.
2. **Adatok összegyűjtése (`generateMatchPdfBuffer`):** Lekéri a mérkőzés adatait (`events`, `notes`, `meta`, `score`, `winner`) a `db.getMatchById(matchId)` segítségével, valamint az aktuális törzsadatokat (`db.getMasterData()`).
3. **HTML/CSS dokumentumsablon összeállítása (`buildMatchPdfHtml`):**
   * `@page { size: A4 portrait; margin: 14mm 16mm; }` CSS nyomtatási szabályokkal és `Times New Roman` betűtípussal felépít egy hivatalos jegyzőkönyv-formátumú HTML dokumentumot.
   * Beágyazza a bal felső logót, a középre igazított *„Eseménynapló”* címet, a kétoszlopos mérkőzés-fejlécet, a fekete keretes eseménytáblát (`SSZ`, `Időpont`, `Eseményt jelentő`, `Esemény leírása`, `Intézkedést meghatározó`, `Intézkedés / eredmény`), valamint ha vannak utólagos megjegyzések (`notes`), azokat is listázza. Minden dinamikus érték `escapeHtml`-en halad át.
4. **Renderelés Headless Chromiummal (`renderPdfBuffer`):** A `getChromeExecutablePath()` megkeresi a gépen elérhető Chrome/Edge binárist (`CHROME_BIN` vagy standard útvonalak), elindít egy headless Puppeteer böngészőt, betölti a HTML-t (`page.setContent(html, { waitUntil: "load" })`), és `page.pdf({ format: "A4", printBackground: true })` paranccsal `Buffer`-t készít, majd a `finally` blokkban lezárja a böngészőt.
5. **Kiszolgálás 3 csatornán:**
   * `GET /api/matches/:id/pdf` → `Content-Disposition: inline` (új böngészőfülön közvetlen megnyitás, `Cache-Control: no-store`).
   * `GET /api/matches/:id/pdf?download=1` → `Content-Disposition: attachment; filename="esemenynaplo-<id>.pdf"` (fájl letöltés).
   * `POST /api/send-email` → memóriabeli `attachments` csatolmányként továbbítja a Gmail SMTP felé.

---

## 12. Funkcionális és nem funkcionális követelmények, illetve mit ellenőriz a rendszer

### 12.1. Funkcionális követelmények teljesülése
* **Hitelesítés és MLSZ szinkron:** Bejelentkezés felhasználónév/jelszó párral; minden bejelentkezéskor MLSZ API lekérdezés és az aktív/közelgő mérkőzések adatfrissítése.
* **Időablak alapú naplókezelés:** Csak a `[kezdés - 4h, kezdés + 12h)` tartományba eső meccsek számítanak megnyitottnak és szerkeszthetőnek; a 4 órán kívüli meccsek csak megtekinthetők.
* **Szerkesztés, piszkozat mentés, lezárás:** Piszkozat mentése és folytatása; kötelező végeredményhez kötött manuális véglegesítés; automatikus 12 órás lezárás az API eredményével.
* **Értesítés és PDF:** Lezáráskor automatikus e-mail kiküldés a beállított címre PDF melléklettel; lezárt és archivált nézetekben PDF megtekintés/letöltés.
* **Kommentelés és archiválás:** Lezárt állapotban utólagos kommentek menthetők; 1 hét után automatikus archiválás történik, ahol új komment már nem adható, csak a meglévők olvashatók.
* **Szerepkör-elkülönítés:** `Admin` szerkeszti a törzsadatokat, partnereket, elérhetőségeket és felhasználókat; `Biztonsági vezető` csak saját adatait módosíthatja és nem látja a többieket.

### 12.2. Nem funkcionális követelmények
* **Megbízhatóság és hibatűrés:** Dupla fallback architektúra (PostgreSQL kiesésekor szerveroldali In-Memory DB; backend kiesésekor kliensoldali `inMemoryDb.js`), tranzakcionális (`BEGIN/COMMIT/ROLLBACK`) eseménymentés.
* **Adatkonzisztencia:** A frontend nézetek (Főnézet, Következő, Lezárt, Archivált) és a PDF egyaránt közvetlenül az adatbázis állapotából táplálkoznak; a lezárt/archivált tartalmat `403`-as backend ellenőrzés védi.
* **Használhatóság és hordozhatóság:** Tailwind alapú reszponzív kialakítás, magyar nyelvű hiba- és visszajelző üzenetek, Docker Compose opció vagy natív lokális PostgreSQL támogatás.
* **Biztonsági korlát (fejlődési pont):** Funkcionálisan teljes az alkalmazás (a szerveroldali és adatbázis-beli jelszavak immár `scrypt`-tel hasheltek), ugyanakkor produkciós környezet előtti további követelmény a szerveroldali token-alapú AuthN/RBAC és a titkok környezeti változóba mozgatása.

### 12.3. Mit és hogyan ellenőriz a rendszer?
* **Futásidejű (runtime) ellenőrzések:**
  * API kulcs ellenőrzés az MLSZ végpontokon (`x-api-key`, `401`).
  * Hitelesítéskor és jelszócserekor sóval ellátott `scrypt` + `crypto.timingSafeEqual` jelszóhash-ellenőrzés (`findUser`, `updateUserPassword`).
  * Kötelező mezők validálása: felhasználó létrehozáskor (`400`), kommentnél nem üres szöveg (`400`), manuális lezárásnál győztes és végeredmény megléte (modal validáció).
  * Státusz-gárdák mind UI (`isEditable`, `isFinalized`, `isArchived`, `isScheduledReadOnly`), mind API szinten (`403` finalized/archived `PUT` és archived `POST .../notes` esetén).
  * Adatbázis elérhetőségének folyamatos visszajelzése (`/api/db/status`, `/health`).
* **Automatizált E2E teszt-ellenőrzések (20 független teszteset):**
  * [`requirements.test.js`](./backend/tests/requirements.test.js) (`npm --prefix backend test`): **15/15 PASS** — végigellenőrzi a teljes üzleti logikát (`T1.1`–`T9`), a PDF bináris fejléceket és `Content-Disposition` értékeket, a hálózati szivárgásmentességet (`GET /api/users` tilalma sima usernél) és a PostgreSQL állapot-visszaállítást.
  * [`automation.test.js`](./backend/tests/automation.test.js) (`npm --prefix backend run test:automation`): **5/5 PASS** — dedikáltan igazolja a `-11h / -13h / -6d / -8d / -9d` időhatárok, a 12 órás lezárás + SMTP e-mail és az 1 hetes archiválás + `403` szervervédelem működését.
