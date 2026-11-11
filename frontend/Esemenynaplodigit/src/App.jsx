import { useEffect, useState, useRef } from "react";
import { User, Menu, FileText, Download } from "lucide-react";

import LoginPage from "./components/LoginPage";
import EventLogEditor from "./components/EventLogEditor";
import ProfilePage from "./components/ProfilePage";
import AdminPage from "./components/AdminPage";
import { inMemoryDb } from "./data/inMemoryDb";
import {
  isMatchOlderThan12Hours,
  fetchMatchResultFromMockApi,
  fetchAllMlszMatches,
  sendEventLogClosedEmail,
} from "./data/mockMlszApi";

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState("home");
  const [matches, setMatches] = useState([]);
  const [archived, setArchived] = useState([]);
  const [closed, setClosed] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [masterData, setMasterData] = useState(() => inMemoryDb.masterData || {});

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  /*
   * Az éppen megnyitott eseménynapló aktuális státusza.
   *
   * in_progress -> Megnyitott
   * finalized   -> Lezárt
   * archived    -> Archivált
   */
  const [editorStatus, setEditorStatus] = useState(null);

  const [profileMenuOpen, setProfileMenuOpen] =
    useState(false);

  const [dbStatus, setDbStatus] = useState({
    connected: false,
    type: "In-Memory",
  });

  const autoClosedIdsRef = useRef(new Set());

  const loadMatches = async () => {
    let allMatches = [];
    try {
      const res = await fetch("http://localhost:3000/api/matches");
      if (res.ok) {
        allMatches = await res.json();
      }
    } catch {
      // Backend nem elérhető, fallback in-memory
    }

    if (allMatches.length === 0) {
      allMatches = inMemoryDb.getMatches();
    }

    setMatches(allMatches.filter((m) => m.status === "in_progress"));
    setClosed(allMatches.filter((m) => m.status === "finalized"));
    setArchived(allMatches.filter((m) => m.status === "archived"));

    try {
      const mlszRes = await fetchAllMlszMatches({ status: "scheduled" });
      const existingIds = new Set(allMatches.map((m) => String(m.id)));
      const scheduled = (mlszRes.matches || [])
        .filter((m) => !existingIds.has(String(m.id)))
        .map((m) => ({
          ...m,
          title: `${m.homeTeam} vs ${m.awayTeam}`,
          date: m.date ? `${m.date.replace(/-/g, ". ")}.` : "",
        }));
      setUpcomingMatches(scheduled);
    } catch {
      setUpcomingMatches([]);
    }
  };

  useEffect(() => {
    fetch("http://localhost:3000/api/db/status")
      .then((res) => res.json())
      .then((data) => setDbStatus(data))
      .catch(() =>
        setDbStatus({ connected: false, type: "In-Memory Database" })
      );

    fetch("http://localhost:3000/api/master-data")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setMasterData(data);
      })
      .catch(() => {});

    loadMatches();
  }, []);

  const syncMatchInState = (updatedMatch) => {
    if (!updatedMatch) return;
    const idStr = String(updatedMatch.id);
    setMatches((prev) => {
      const rest = prev.filter((m) => String(m.id) !== idStr);
      return updatedMatch.status === "in_progress" ? [updatedMatch, ...rest] : rest;
    });
    setClosed((prev) => {
      const rest = prev.filter((m) => String(m.id) !== idStr);
      return updatedMatch.status === "finalized" ? [updatedMatch, ...rest] : rest;
    });
    setArchived((prev) => {
      const rest = prev.filter((m) => String(m.id) !== idStr);
      return updatedMatch.status === "archived" ? [updatedMatch, ...rest] : rest;
    });
    if (selectedLog && String(selectedLog.id) === idStr) {
      setSelectedLog(updatedMatch);
      setEditorStatus(updatedMatch.status);
    }
  };

  const handleSaveMatch = (updatedMatch) => {
    syncMatchInState(updatedMatch);
  };

  const handleNoteAdded = (matchId, note) => {
    const appendNote = (m) =>
      String(m.id) === String(matchId)
        ? { ...m, notes: [...(m.notes || []), note] }
        : m;
    setClosed((prev) => prev.map(appendNote));
    setArchived((prev) => prev.map(appendNote));
    setSelectedLog((prev) =>
      prev && String(prev.id) === String(matchId) ? appendNote(prev) : prev
    );
  };

  /*
   * Mérkőzés archiválása
   */
  const handleArchiveMatch = async (matchId) => {
    let updatedMatch = null;
    try {
      const res = await fetch(`http://localhost:3000/api/matches/${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        updatedMatch = await res.json();
      }
    } catch (err) {
      console.warn("[App] Nem sikerült az archiválás backend mentése:", err);
    }

    if (!updatedMatch) {
      updatedMatch =
        closed.find((m) => String(m.id) === String(matchId)) || selectedLog;
      if (updatedMatch) {
        updatedMatch = { ...updatedMatch, status: "archived" };
      }
    }

    syncMatchInState(updatedMatch);
  };

  /*
   * Mérkőzés véglegesítése (manuális vagy automatikus)
   */
  const handleFinalizeMatch = async (matchId, resultData) => {
    let updatedMatch = null;
    try {
      const res = await fetch(`http://localhost:3000/api/matches/${matchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "finalized",
          score: resultData?.score || null,
          winner: resultData?.winner || null,
          ...(resultData?.meta ? { meta: resultData.meta } : {}),
          ...(Array.isArray(resultData?.events)
            ? { events: resultData.events }
            : {}),
        }),
      });
      if (res.ok) {
        updatedMatch = await res.json();
      }
    } catch (err) {
      console.warn("[App] Nem sikerült a backend adatbázis frissítése:", err);
    }

    inMemoryDb.updateMatch(matchId, {
      status: "finalized",
      score: resultData?.score,
      winner: resultData?.winner,
    });

    if (!updatedMatch) {
      const base =
        matches.find((m) => String(m.id) === String(matchId)) || selectedLog;
      if (base) {
        updatedMatch = {
          ...base,
          status: "finalized",
          score: resultData?.score || base.score,
          winner: resultData?.winner || base.winner,
          meta: resultData?.meta || base.meta,
          events: resultData?.events || base.events,
        };
      }
    }

    syncMatchInState(updatedMatch);
  };

  /*
   * Automatikus lezárás ellenőrzése: 12 órával a meccs kezdete után
   * az eredményt a Mock MLSZ API-ból szerezzük be, és kiküldjük az e-mailt.
   */
  useEffect(() => {
    if (matches.length === 0) return;

    matches.forEach(async (m) => {
      if (
        m.status === "in_progress" &&
        isMatchOlderThan12Hours(m) &&
        !autoClosedIdsRef.current.has(m.id)
      ) {
        autoClosedIdsRef.current.add(m.id);
        const result = await fetchMatchResultFromMockApi(m.id);
        const autoResult = {
          winner: result?.winner || "Ismeretlen",
          score: result?.score || "N/A",
          isAuto: true,
        };
        await handleFinalizeMatch(m.id, autoResult);
        await sendEventLogClosedEmail({
          match: m,
          result: autoResult,
          recipientEmail: masterData?.reportEmail || "szeconnect.projektmunka@gmail.com",
          reason: "auto-12h",
        });
      }
    });
  }, [matches, masterData]);

  /*
   * Aktuális menüpont / eseménynapló státusz megnevezése.
   *
   * Ha nincs megnyitva eseménynapló:
   *   az aktuális menüpont neve jelenik meg.
   *
   * Ha meg van nyitva eseménynapló:
   *   in_progress -> Megnyitott
   *   finalized   -> Lezárt
   *   archived    -> Archivált
   */
  const getViewTitle = () => {
    if (selectedLog) {
      switch (editorStatus) {
        case "in_progress":
          return "Megnyitott";

        case "finalized":
          return "Lezárt";

        case "archived":
          return "Archivált";

        default:
          return "Eseménynapló";
      }
    }

    switch (view) {
      case "home":
        return "Főnézet";

      case "upcoming":
        return "Következő";

      case "closed":
        return "Lezárt";

      case "archived":
        return "Archivált";

      case "profile":
        return "Profil";

      case "admin":
        return "Admin felület";

      default:
        return "Főnézet";
    }
  };

  /*
   * Navigáció főmenüpontok között.
   */
  const navigateTo = (newView) => {
    // Sima felhasználó nem navigálhat az admin felületre
    if (newView === "admin" && currentUser?.role !== "Admin") {
      return;
    }

    setSelectedLog(null);
    setEditorStatus(null);
    setView(newView);

    // Mobilon a menü automatikusan bezáródik.
    setMenuOpen(false);

    // Profilmenü bezárása.
    setProfileMenuOpen(false);
  };

  /*
   * Mérkőzés kiválasztása: friss adatokat kérünk a backendtől ha elérhető.
   */
  const handleClick = async (match) => {
    setSelectedLog(match);
    setEditorStatus(match.status);
    setMenuOpen(false);

    try {
      const res = await fetch(`http://localhost:3000/api/matches/${match.id}`);
      if (res.ok) {
        const fresh = await res.json();
        setSelectedLog(fresh);
        setEditorStatus(fresh.status);
      }
    } catch {
      // Offline fallback: marad a meglévő objektum
    }
  };

  /*
   * Következő (MLSZ) mérkőzés megnyitása / importálása az adatbázisba.
   */
  const handleOpenUpcomingMatch = async (mlszMatch) => {
    const newMatchPayload = {
      id: mlszMatch.id,
      teamId: mlszMatch.teamId || 323805,
      competition: mlszMatch.competition,
      homeTeam: mlszMatch.homeTeam,
      awayTeam: mlszMatch.awayTeam,
      title: mlszMatch.title,
      date: mlszMatch.date,
      time: mlszMatch.time,
      venue: mlszMatch.venue,
      status: "in_progress",
      meta: {
        competitionName: mlszMatch.competition || "",
        homeTeam: mlszMatch.homeTeam || "",
        awayTeam: mlszMatch.awayTeam || "",
        matchDate: mlszMatch.date || "",
        matchTime: mlszMatch.time || "",
        venue: mlszMatch.venue || "",
        organizer: masterData?.organizer || masterData?.organization || "Rába ETO SE Győr",
        headOrganizer: {
          name: masterData?.chiefOrganizer || "",
          phone: masterData?.phone || "",
        },
        medicalService: {
          organization: masterData?.healthcareProvider || "",
          person: "",
        },
        disasterProtection: {
          organization: masterData?.disasterProtectionProvider || "",
          person: "",
        },
      },
    };

    try {
      const res = await fetch("http://localhost:3000/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMatchPayload),
      });
      if (res.ok) {
        const created = await res.json();
        setMatches((prev) => [
          created,
          ...prev.filter((m) => String(m.id) !== String(created.id)),
        ]);
        setUpcomingMatches((prev) =>
          prev.filter((m) => String(m.id) !== String(created.id))
        );
        handleClick(created);
        return;
      }
    } catch (err) {
      console.warn("[App] Nem sikerült az MLSZ meccs mentése DB-be:", err);
    }

    handleClick({ ...newMatchPayload, events: [], notes: [] });
  };

  /*
   * Eseménynapló bezárása.
   */
  const handleBackFromEditor = () => {
    setSelectedLog(null);
    setEditorStatus(null);
  };

  /*
   * Bejelentkezés előtt a LoginPage jelenik meg.
   */
  if (!currentUser) {
    return (
      <LoginPage
        onLogin={(user) => {
          setCurrentUser(user);
          setView("home");
          setSelectedLog(null);
          setEditorStatus(null);
        }}
      />
    );
  }

  /*
   * Mérkőzéstábla.
   *
   * Mobilon a táblázat vízszintesen görgethető,
   * így nem törik össze a layout kis képernyőn.
   */
  const renderTable = (data, isClosed = false, onRowClick = handleClick) => (
    <div className="w-full overflow-x-auto rounded-2xl shadow">
      <table className="w-full min-w-[600px] text-sm bg-white">
        <thead className="bg-[#2E7D32] text-white text-left">
          <tr>
            <th className="p-3">Csapatok</th>
            <th className="p-3">Időpont</th>
            <th className="p-3">Helyszín</th>
            {isClosed && <th className="p-3 text-right">PDF Összefoglaló</th>}
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={isClosed ? 4 : 3}
                className="p-6 text-center text-gray-500 italic"
              >
                Nincs megjeleníthető mérkőzés.
              </td>
            </tr>
          ) : (
            data.map((m) => (
              <tr
                key={m.id}
                onClick={() => onRowClick(m)}
                className="border-t cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="p-3 font-medium">
                  {m.title}
                  {m.score && (
                    <span className="ml-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                      {m.score} ({m.winner})
                    </span>
                  )}
                </td>

                <td className="p-3 whitespace-nowrap">
                  {m.date} {m.time}
                </td>

                <td className="p-3 whitespace-nowrap">
                  {m.venue || "ETO Park Győr"}
                </td>

                {isClosed && (
                  <td
                    className="p-3 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `http://localhost:3000/api/matches/${m.id}/pdf`,
                            "_blank"
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2E7D32] hover:bg-[#256629] text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                        title="PDF összefoglaló megtekintése új lapon"
                      >
                        <FileText size={14} />
                        <span>Megtekintés</span>
                      </button>

                      <a
                        href={`http://localhost:3000/api/matches/${m.id}/pdf?download=1`}
                        download={`esemenynaplo-${m.id}.pdf`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                        title="PDF letöltése"
                      >
                        <Download size={14} />
                        <span>Letöltés</span>
                      </a>
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  /*
   * Oldal.
   */
  return (
    <div className="min-h-screen flex bg-gray-100 relative">

      {/* =====================================================
          SIDEMENU
          ===================================================== */}

      <div
        className={`
          bg-[#C19A5B]
          text-black
          p-4
          transition-all
          duration-300
          z-50

          fixed
          inset-y-0
          left-0

          w-64

          ${
            menuOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }

          md:relative
          md:translate-x-0

          ${
            menuOpen
              ? "md:w-64"
              : "md:w-16"
          }
        `}
      >

        {/* Menü nyitása / bezárása */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="
            mb-6
            p-1
            rounded
            hover:bg-[#b08b50]
            transition-colors
          "
          aria-label="Menü megnyitása"
        >
          <Menu />
        </button>

        {menuOpen && (
          <div className="space-y-2">

            {/* FŐNÉZET */}
            <div
              onClick={() => navigateTo("home")}
              className={`
                cursor-pointer
                p-2
                rounded
                transition-colors
                ${
                  view === "home"
                    ? "bg-[#b08b50] font-semibold"
                    : "hover:bg-[#b08b50]"
                }
              `}
            >
              Főnézet
            </div>

            {/* KÖVETKEZŐ */}
            <div
              onClick={() => navigateTo("upcoming")}
              className={`
                cursor-pointer
                p-2
                rounded
                transition-colors
                ${
                  view === "upcoming"
                    ? "bg-[#b08b50] font-semibold"
                    : "hover:bg-[#b08b50]"
                }
              `}
            >
              Következő
            </div>

            {/* LEZÁRT */}
            <div
              onClick={() => navigateTo("closed")}
              className={`
                cursor-pointer
                p-2
                rounded
                transition-colors
                ${
                  view === "closed"
                    ? "bg-[#b08b50] font-semibold"
                    : "hover:bg-[#b08b50]"
                }
              `}
            >
              Lezárt
            </div>

            {/* ARCHIVÁLT */}
            <div
              onClick={() => navigateTo("archived")}
              className={`
                cursor-pointer
                p-2
                rounded
                transition-colors
                ${
                  view === "archived"
                    ? "bg-[#b08b50] font-semibold"
                    : "hover:bg-[#b08b50]"
                }
              `}
            >
              Archivált
            </div>

            {/* ADATBÁZIS STÁTUSZ */}
            <div className="mt-8 pt-4 border-t border-black/15 text-xs">
              <div className="text-black/70 font-medium mb-1">Adatbázis:</div>
              <div className="flex items-center gap-1.5 font-bold">
                <span
                  className={`w-2 h-2 rounded-full ${
                    dbStatus.connected ? "bg-green-800" : "bg-amber-800"
                  }`}
                />
                <span>
                  {dbStatus.connected
                    ? "PostgreSQL (Aktív)"
                    : "In-Memory (Teszt mód)"}
                </span>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* =====================================================
          MOBILE BACKDROP
          ===================================================== */}

      {menuOpen && (
        <div
          className="
            fixed
            inset-0
            bg-black/40
            z-40
            md:hidden
          "
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* =====================================================
          FŐ TARTALOM
          ===================================================== */}

      <div className="flex-1 flex flex-col min-w-0">

        {/* ===================================================
            FEJLÉC
            =================================================== */}

        <div className="bg-[#2E7D32] text-white">

          {/* Felső fejléc */}
          <div className="px-3 sm:px-4 py-2 flex justify-between items-center">

            {/* LOGO + NÉV */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">

              {/* MOBILE MENU BUTTON */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="
                  md:hidden
                  p-2
                  rounded
                  hover:bg-[#256628]
                  transition-colors
                  flex-shrink-0
                "
                aria-label="Menü"
              >
                <Menu size={28} />
              </button>

              <img
                src="/logo.png"
                className="h-9 sm:h-12 w-auto flex-shrink-0"
                alt="Rába ETO"
              />

              <span
                className="
                  font-semibold
                  text-2xl
                  sm:text-[42px]
                  truncate
                "
              >
                Rába ETO
              </span>

            </div>

        {/* PROFIL IKON + FELHASZNÁLÓNÉV + DB PILL */}
        <div className="relative flex-shrink-0 flex items-center gap-2 sm:gap-3">

          {/* DB STATUS PILL */}
          <div
            title={`Adatbázis forrás: ${dbStatus.type}`}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              dbStatus.connected
                ? "bg-green-100 text-green-900 border border-green-300"
                : "bg-amber-100 text-amber-900 border border-amber-300"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                dbStatus.connected ? "bg-green-600" : "bg-amber-600"
              }`}
            />
            <span>{dbStatus.connected ? "DB: PostgreSQL" : "DB: In-Memory"}</span>
          </div>

          <span className="text-sm sm:text-base font-medium text-white">
            {currentUser?.username || "Username"}
          </span>

          <button 
            onClick={() => { 
              setProfileMenuOpen(
                !profileMenuOpen
              ); 
            }}
                className="
                  bg-[#C19A5B]
                  p-2
                  sm:p-3
                  rounded-full
                  hover:bg-[#b08b50]
                  transition-colors
                "
                title="Profil menü"
              >
                <User
                  className="text-black"
                  size={32}
                />
              </button>

              {/* PROFIL MENÜ */}
              {profileMenuOpen && (
                <div
                  className="
                    absolute
                    right-0
                    top-full
                    mt-2
                    w-64
                    max-w-[calc(100vw-1.5rem)]
                    bg-white
                    text-black
                    rounded-xl
                    shadow-lg
                    overflow-hidden
                    z-50
                  "
                >

                  {/* PROFIL MEGTEKINTÉSE */}
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigateTo("profile");
                    }}
                    className="
                      w-full
                      text-left
                      px-4
                      py-3
                      hover:bg-gray-100
                      transition-colors
                    "
                  >
                    <div className="font-semibold">
                      Profil megtekintése
                    </div>

                    <div className="text-sm text-gray-500">
                      Felhasználói és szervezeti adatok
                    </div>
                  </button>

                  {/* KIJELENTKEZÉS */}
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentUser(null);
                      setView("home");
                      setSelectedLog(null);
                      setEditorStatus(null);
                      setProfileMenuOpen(false);
                      setMenuOpen(false);
                    }}
                    className="
                      flex
                      w-full
                      items-center
                      gap-3
                      px-4
                      py-3
                      text-left
                      text-sm
                      text-gray-700
                      hover:bg-gray-50
                    "
                  >
                    Kijelentkezés
                  </button>

                  {/* ADMIN FELÜLET - Csak Admin jogosultsággal jelenik meg */}
                  {currentUser?.role === "Admin" && (
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigateTo("admin");
                      }}
                      className="
                        w-full
                        text-left
                        px-4
                        py-3
                        hover:bg-gray-100
                        transition-colors
                        border-t
                      "
                    >
                      <div className="font-semibold">
                        Admin felület
                      </div>

                      <div className="text-sm text-gray-500">
                        Adminisztráció és beállítások
                      </div>
                    </button>
                  )}

                </div>
              )}

            </div>

          </div>

          {/* =================================================
              ALSÓ FEJLÉC SÁV
              ================================================= */}

          <div
            className="
              bg-[#256628]
              px-4
              sm:px-6
              py-2
              text-white
              text-base
              sm:text-lg
              font-semibold
            "
          >
            {getViewTitle()}
          </div>

        </div>

        {/* =====================================================
            OLDAL TARTALMA
            ===================================================== */}

        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 min-w-0">

          {/* =================================================
              ESEMÉNYNAPLÓ
              ================================================= */}

          {selectedLog && (
            <EventLogEditor
              match={selectedLog}
              eventLogStatus={selectedLog?.status}
              currentUser={currentUser}
              masterData={masterData}
              onBack={handleBackFromEditor}
              onStatusChange={setEditorStatus}
              onSaveMatch={handleSaveMatch}
              onNoteAdded={handleNoteAdded}
              onFinalizeMatch={handleFinalizeMatch}
              onArchiveMatch={handleArchiveMatch}
            />
          )}

          {/* =================================================
              PROFIL
              ================================================= */}

          {!selectedLog &&
            view === "profile" && (
              <ProfilePage
                currentUser={currentUser}
                masterData={masterData}
                onUserUpdated={setCurrentUser}
              />
            )}

          {/* =================================================
              ADMIN FELÜLET
              ================================================= */}

          {!selectedLog &&
            view === "admin" &&
            currentUser?.role === "Admin" && (
              <div className="bg-white rounded-2xl shadow p-4 sm:p-6">

                <h2
                  className="
                    text-xl
                    sm:text-2xl
                    font-semibold
                    mb-4
                  "
                >
                  Admin felület
                </h2>

                <AdminPage
                  dbStatus={dbStatus}
                  mlszMatchesCount={
                    upcomingMatches.length +
                    matches.length +
                    closed.length +
                    archived.length
                  }
                  onMasterDataUpdated={setMasterData}
                />

              </div>
            )}

          {/* =================================================
              FŐNÉZET
              ================================================= */}

          {!selectedLog &&
            view === "home" && (
              <>

                {/* MEGNYITOTT NAPLÓK */}
                <div>
                  <h2
                    className="
                      font-semibold
                      mb-2
                      bg-[#C19A5B]
                      text-black
                      px-3
                      py-2
                      rounded
                    "
                  >
                    Megnyitott naplók
                  </h2>

                  {renderTable(matches, false)}
                </div>

                {/* LEZÁRT NAPLÓK */}
                <div>
                  <h2
                    className="
                      font-semibold
                      mb-2
                      bg-[#C19A5B]
                      text-black
                      px-3
                      py-2
                      rounded
                    "
                  >
                    Lezárt de nem archivált
                  </h2>

                  {renderTable(closed, true)}
                </div>

                {/* KÖVETKEZŐ MÉRKŐZÉSEK */}
                <div>
                  <h2
                    className="
                      font-semibold
                      mb-2
                      bg-[#C19A5B]
                      text-black
                      px-3
                      py-2
                      rounded
                    "
                  >
                    Következő mérkőzések
                  </h2>

                  {renderTable(upcomingMatches, false, handleOpenUpcomingMatch)}
                </div>

              </>
            )}

          {/* =================================================
              KÖVETKEZŐ
              ================================================= */}

          {!selectedLog &&
            view === "upcoming" &&
            renderTable([...matches, ...upcomingMatches], false, (m) =>
              m.status === "scheduled" ? handleOpenUpcomingMatch(m) : handleClick(m)
            )}

          {/* =================================================
              LEZÁRT
              ================================================= */}

          {!selectedLog &&
            view === "closed" &&
            renderTable(closed, true)}

          {/* =================================================
              ARCHIVÁLT
              ================================================= */}

          {!selectedLog &&
            view === "archived" &&
            renderTable(archived, true)}

        </div>
      </div>
    </div>
  );
}

export default App;
