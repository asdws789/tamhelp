import {
  useEffect,
  useRef,
  useState,
} from "react";

import EventLogDocument from "./EventLogDocument";
import logo from "../assets/logo.png";
import {
  eventMeta,
  eventRows,
} from "../data/EventLogData";
import {
  fetchMatchResultFromMockApi,
  sendEventLogClosedEmail,
} from "../data/mockMlszApi";

const CUSTOM_VALUE = "__custom__";

const EVENT_OPTIONS = [
  "Meccs kezdete",
  "Félidő",
  "Meccs vége",
  "Mentők megérkezése",
  "Tűzeset",
  "Lesérülés",
];

const ACTION_OPTIONS = [
  "Nincs intézkedés",
  "Orvosi ellátás",
  "Mentő hívása",
  "Játék megszakítása",
  "Játék folytatása",
  "Rendőrség értesítése",
  "Tűzoltóság értesítése",
];

/* ============================================================
   SEGÉDFÜGGVÉNYEK
   ============================================================ */

const getNow = () => {
  const now = new Date();

  return {
    iso: now.toISOString(),
    time: now.toLocaleTimeString("hu-HU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};

const createEmptyEvent = (events) => {
  const maxSequenceNumber = events.reduce(
    (max, event) =>
      Math.max(
        max,
        Number(event.sequenceNumber) || 0
      ),
    0
  );

  return {
    id:
      typeof crypto !== "undefined" &&
      crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now(),

    sequenceNumber: maxSequenceNumber + 1,

    eventType: "",
    time: "",

    reporterName: "",
    reporterMode: "",

    eventDescription: "",

    decisionMaker: "",
    decisionMakerMode: "",

    actionType: "",
    actionResult: "",

    createdAt: "",
    lastModifiedAt: "",
    createdBy: "",
  };
};

/*
 * Régebbi adatok kompatibilitása.
 *
 * Ha a korábbi verzióban az actionResult tartalmazta
 * magát a kiválasztott intézkedést, áthelyezzük actionType-ba.
 */
const normalizeEvent = (event) => {
  const normalized = {
    ...event,
  };

  if (
    !normalized.actionType &&
    ACTION_OPTIONS.includes(normalized.actionResult)
  ) {
    normalized.actionType =
      normalized.actionResult;

    normalized.actionResult = "";
  }

  return normalized;
};

/* ============================================================
   AUTOMATIKUSAN NÖVEKVŐ TEXTAREA
   ============================================================ */

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  rows = 1,
  className = "",
}) {
  const textareaRef = useRef(null);

  const resize = () => {
    const element = textareaRef.current;

    if (!element) return;

    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => {
        onChange(event);
        requestAnimationFrame(resize);
      }}
      placeholder={placeholder}
      rows={rows}
      className={`
        block
        w-full
        min-h-[30px]
        resize-none
        overflow-hidden
        rounded-[5px]
        border
        border-transparent
        bg-transparent
        px-[7px]
        py-[6px]
        text-[13px]
        leading-[1.4]
        text-gray-800
        outline-none
        transition
        duration-150
        placeholder:text-gray-400
        hover:bg-[#f7f9fb]
        focus:border-[#b8c3d4]
        focus:bg-white
        ${className}
      `}
    />
  );
}

/* ============================================================
   PERSON SELECTOR
   ============================================================ */

function PersonSelector({
  event,
  index,
  updateEvent,
  nameField,
  modeField,
  placeholder,
  currentUserName = "Felhasználó",
}) {
  const hasEvent = Boolean(event.eventType);

  const isCustom =
    event[modeField] === "custom";

  const setCurrentUser = () => {
    updateEvent(
      index,
      nameField,
      hasEvent ? currentUserName : ""
    );

    updateEvent(
      index,
      modeField,
      hasEvent ? "current_user" : ""
    );
  };

  const setCustom = () => {
    updateEvent(
      index,
      nameField,
      ""
    );

    updateEvent(
      index,
      modeField,
      "custom"
    );
  };

  if (isCustom) {
    return (
      <div className="flex w-full flex-col gap-1">
        <input
          type="text"
          autoFocus
          value={event[nameField] || ""}
          onChange={(eventObject) =>
            updateEvent(
              index,
              nameField,
              eventObject.target.value
            )
          }
          placeholder={placeholder}
          className="
            min-h-[30px]
            w-full
            rounded-[5px]
            border
            border-transparent
            bg-transparent
            px-[7px]
            py-[5px]
            text-[13px]
            text-gray-800
            outline-none
            transition
            hover:bg-[#f7f9fb]
            focus:border-[#b8c3d4]
            focus:bg-white
          "
        />

        <button
          type="button"
          onClick={setCurrentUser}
          className="
            self-start
            text-[11px]
            text-gray-400
            underline
            hover:text-gray-600
          "
        >
          Vissza a saját felhasználóhoz
        </button>
      </div>
    );
  }

  return (
    <select
      value={
        hasEvent &&
        event[nameField] === currentUserName
          ? currentUserName
          : ""
      }
      onChange={(eventObject) => {
        if (
          eventObject.target.value ===
          "__custom__"
        ) {
          setCustom();
          return;
        }

        setCurrentUser();
      }}
      className="
        min-h-[30px]
        w-full
        cursor-pointer
        rounded-[5px]
        border
        border-transparent
        bg-white
        px-[7px]
        py-[5px]
        pr-[26px]
        text-[13px]
        text-gray-800
        outline-none
        transition
        hover:bg-[#f7f9fb]
        focus:border-[#b8c3d4]
      "
    >
      <option value="">
        —
      </option>

      {hasEvent && (
        <option value={currentUserName}>
          {currentUserName}
        </option>
      )}

      <option value="__custom__">
        Saját megadás...
      </option>
    </select>
  );
}

/* ============================================================
   SELECTOR SEGÉD
   ============================================================ */

function OptionSelector({
  value,
  customText,
  options,
  placeholder,
  customLabel,
  onChange,
}) {
  const isCustom =
    value === CUSTOM_VALUE;

  /*
   * CUSTOM USE CASE
   *
   * Ha az "Egyéb / saját..." opció van kiválasztva,
   * akkor maga az input tartalmazza az egyedi szöveget.
   */
  if (isCustom) {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          autoFocus
          value={customText || ""}
          onChange={(event) =>
            onChange(
              CUSTOM_VALUE,
              event.target.value
            )
          }
          placeholder={customLabel}
          className="
            min-h-[32px]
            w-full
            rounded-[5px]
            border
            border-transparent
            bg-transparent
            px-[7px]
            py-[5px]
            text-[13px]
            text-gray-800
            outline-none
            transition
            hover:bg-[#f7f9fb]
            focus:border-[#b8c3d4]
            focus:bg-white
          "
        />

        <button
          type="button"
          onClick={() =>
            onChange("", "")
          }
          className="
            self-start
            text-[11px]
            text-gray-400
            underline
            hover:text-gray-600
          "
        >
          Vissza a listához
        </button>
      </div>
    );
  }

  /*
   * NORMAL USE CASE
   *
   * Az előre definiált opciók közül választunk.
   */
  return (
    <select
      value={
        options.includes(value)
          ? value
          : ""
      }
      onChange={(event) => {
        const selected =
          event.target.value;

        if (
          selected === CUSTOM_VALUE
        ) {
          onChange(
            CUSTOM_VALUE,
            ""
          );
        } else {
          onChange(
            selected,
            ""
          );
        }
      }}
      className="
        min-h-[32px]
        w-full
        cursor-pointer
        rounded-[5px]
        border
        border-transparent
        bg-white
        px-[7px]
        py-[5px]
        pr-[26px]
        text-[13px]
        text-gray-800
        outline-none
        transition
        hover:bg-[#f7f9fb]
        focus:border-[#b8c3d4]
        focus:bg-white
      "
    >
      <option value="">
        {placeholder}
      </option>

      {options.map((option) => (
        <option
          key={option}
          value={option}
        >
          {option}
        </option>
      ))}

      <option value={CUSTOM_VALUE}>
        {customLabel}
      </option>
    </select>
  );
}

/* ============================================================
   FEJLÉC MEZŐ
   ============================================================ */

function HeaderField({
  label,
  children,
  first = false,
}) {
  return (
    <div
      className="
        grid
        min-h-[38px]
        grid-cols-[minmax(135px,175px)_minmax(0,1fr)]
        items-center
        gap-x-3
        border-b
        border-[#edf0f4]
        py-[6px]
      "
    >
      <span
        className={`
          min-w-0
          leading-[1.2]
          font-semibold
          text-[#2E7D32]
          ${
            first
              ? "text-[14px]"
              : "text-[13px]"
          }
        `}
      >
        {label}
      </span>

      <div className="min-w-0 w-full">
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   ESEMÉNY / INTÉZKEDÉS MEZŐK
   ============================================================ */

const getEventType = (event) =>
  event.eventType || "";

const getAction = (event) =>
  event.actionType || "";

/* ============================================================
   EVENT ROW - DESKTOP
   ============================================================ */

function EventRow({
  event,
  index,
  updateEvent,
  deleteEvent,
  currentUserName,
}) {
  return (
    <tr className="align-top">

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          text-center
          align-middle
          font-semibold
          text-[#6b7280]
        "
      >
        {event.sequenceNumber}
      </td>

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          align-top
        "
      >
        <span
          className="
            block
            px-[7px]
            py-[5px]
            text-center
            text-[13px]
            tabular-nums
            text-gray-700
          "
        >
          {event.time || "—"}
        </span>
      </td>

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          align-top
        "
      >
        <PersonSelector
          event={event}
          index={index}
          updateEvent={updateEvent}
          nameField="reporterName"
          modeField="reporterMode"
          placeholder="Kitöltő neve..."
          currentUserName={currentUserName}
        />
      </td>

      {/* ======================================================
          ESEMÉNY
         ====================================================== */}

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          align-top
        "
      >
        <div className="flex w-full flex-col gap-[5px]">

          <OptionSelector
            value={getEventType(event)}
            customText={
              event.eventDescription || ""
            }
            options={EVENT_OPTIONS}
            placeholder="Válasszon eseményt..."
            customLabel="Egyéb / saját esemény..."
            onChange={(
              value,
              customText
            ) => {
              if (
                value === CUSTOM_VALUE
              ) {
                updateEvent(
                  index,
                  "eventType",
                  CUSTOM_VALUE
                );

                if (
                  customText !== undefined
                ) {
                  updateEvent(
                    index,
                    "eventDescription",
                    customText
                  );
                }

                return;
              }

              updateEvent(
                index,
                "eventType",
                value
              );

              updateEvent(
                index,
                "eventDescription",
                ""
              );
            }}
          />

          {event.eventType !== CUSTOM_VALUE && (
            <AutoResizeTextarea
              value={
                event.eventDescription || ""
              }
              onChange={(eventObject) =>
                updateEvent(
                  index,
                  "eventDescription",
                  eventObject.target.value
                )
              }
              placeholder="Esemény leírása..."
            />
          )}

        </div>
      </td>

      {/* ======================================================
          INTÉZKEDÉST MEGHATÁROZÓ
         ====================================================== */}

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          align-top
        "
      >
        <PersonSelector
          event={event}
          index={index}
          updateEvent={updateEvent}
          nameField="decisionMaker"
          modeField="decisionMakerMode"
          placeholder="Intézkedést meghatározó személy neve..."
          currentUserName={currentUserName}
        />
      </td>

      {/* ======================================================
          INTÉZKEDÉS
         ====================================================== */}

      <td
        className="
          border-b
          border-r
          border-[#e4e7ec]
          bg-white
          p-2
          align-top
        "
      >
        <div className="flex w-full flex-col gap-[5px]">

          <OptionSelector
            value={getAction(event)}
            customText={
              event.actionResult || ""
            }
            options={ACTION_OPTIONS}
            placeholder="Válasszon intézkedést..."
            customLabel="Egyéb / saját intézkedés..."
            onChange={(
              value,
              customText
            ) => {
              if (
                value === CUSTOM_VALUE
              ) {
                updateEvent(
                  index,
                  "actionType",
                  CUSTOM_VALUE
                );

                if (
                  customText !== undefined
                ) {
                  updateEvent(
                    index,
                    "actionResult",
                    customText
                  );
                }

                return;
              }

              updateEvent(
                index,
                "actionType",
                value
              );

              updateEvent(
                index,
                "actionResult",
                ""
              );
            }}
          />

          {event.actionType !== CUSTOM_VALUE && (
            <AutoResizeTextarea
              value={
                event.actionResult || ""
              }
              onChange={(eventObject) =>
                updateEvent(
                  index,
                  "actionResult",
                  eventObject.target.value
                )
              }
              placeholder="Intézkedés / eredmény leírása..."
            />
          )}

        </div>
      </td>

      {/* ======================================================
          TÖRLÉS
         ====================================================== */}

      <td
        className="
          border-b
          border-[#e4e7ec]
          bg-white
          p-[5px]
          text-center
          align-middle
        "
      >
        <button
          type="button"
          onClick={() =>
            deleteEvent(index)
          }
          title="Esemény törlése"
          aria-label="Esemény törlése"
          className="
            inline-flex
            h-7
            w-7
            items-center
            justify-center
            rounded-[6px]
            border
            border-[#e0e4ea]
            bg-white
            text-[18px]
            leading-none
            text-[#8b95a5]
            transition
            hover:border-[#e3bcbc]
            hover:bg-[#fff5f5]
            hover:text-[#b42318]
          "
        >
          ×
        </button>
      </td>

    </tr>
  );
}

/* ============================================================
   EVENT CARD - MOBILE
   ============================================================ */

function EventCard({
  event,
  index,
  updateEvent,
  deleteEvent,
  currentUserName,
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-[#C19A5B]
        bg-white
        p-3
        shadow-[0_1px_3px_rgba(0,0,0,0.05)]
      "
    >
      <div
        className="
          mb-3
          flex
          items-center
          justify-between
          gap-3
          border-b
          border-[#edf0f4]
          pb-2
        "
      >
        <div className="flex items-center gap-2">
          <span
            className="
              flex
              h-7
              w-7
              items-center
              justify-center
              rounded-full
              bg-[#C19A5B]
              text-xs
              font-bold
              text-black
            "
          >
            {event.sequenceNumber}
          </span>

          <span
            className="
              text-xs
              font-semibold
              text-gray-500
            "
          >
            Esemény
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="
              text-xs
              font-semibold
              tabular-nums
              text-[#2E7D32]
            "
          >
            {event.time || "Időpont: —"}
          </span>

          <button
            type="button"
            onClick={() =>
              deleteEvent(index)
            }
            className="
              flex
              h-7
              w-7
              items-center
              justify-center
              rounded-md
              border
              border-[#e0e4ea]
              bg-white
              text-lg
              text-[#8b95a5]
              hover:border-[#e3bcbc]
              hover:bg-[#fff5f5]
              hover:text-[#b42318]
            "
            aria-label="Esemény törlése"
          >
            ×
          </button>
        </div>
      </div>

      <MobileField label="Kitöltő">
        <PersonSelector
          event={event}
          index={index}
          updateEvent={updateEvent}
          nameField="reporterName"
          modeField="reporterMode"
          placeholder="Kitöltő neve..."
          currentUserName={currentUserName}
        />
      </MobileField>

      <MobileField label="Esemény">
        <OptionSelector
          value={getEventType(event)}
          customText={
            event.eventDescription || ""
          }
          options={EVENT_OPTIONS}
          placeholder="Válasszon eseményt..."
          customLabel="Egyéb / saját esemény..."
          onChange={(
            value,
            customText
          ) => {
            if (
              value === CUSTOM_VALUE
            ) {
              updateEvent(
                index,
                "eventType",
                CUSTOM_VALUE
              );

              if (
                customText !== undefined
              ) {
                updateEvent(
                  index,
                  "eventDescription",
                  customText
                );
              }

              return;
            }

            updateEvent(
              index,
              "eventType",
              value
            );

            updateEvent(
              index,
              "eventDescription",
              ""
            );
          }}
        />
      </MobileField>

      {event.eventType !== CUSTOM_VALUE && (
        <MobileField label="Esemény leírása">
          <AutoResizeTextarea
            value={
              event.eventDescription || ""
            }
            onChange={(eventObject) =>
              updateEvent(
                index,
                "eventDescription",
                eventObject.target.value
              )
            }
            placeholder="Esemény leírása..."
            className="
              border
              border-[#e1e5eb]
              bg-[#fafbfc]
            "
          />
        </MobileField>
      )}

      <MobileField label="Intézkedést meghatározó személy">
        <PersonSelector
          event={event}
          index={index}
          updateEvent={updateEvent}
          nameField="decisionMaker"
          modeField="decisionMakerMode"
          placeholder="Személy neve..."
          currentUserName={currentUserName}
        />
      </MobileField>

      <MobileField
        label="Intézkedés / eredmény"
      >
        <OptionSelector
          value={getAction(event)}
          customText={
            event.actionResult || ""
          }
          options={ACTION_OPTIONS}
          placeholder="Válasszon intézkedést..."
          customLabel="Egyéb / saját intézkedés..."
          onChange={(
            value,
            customText
          ) => {
            if (
              value === CUSTOM_VALUE
            ) {
              updateEvent(
                index,
                "actionType",
                CUSTOM_VALUE
              );

              if (
                customText !== undefined
              ) {
                updateEvent(
                  index,
                  "actionResult",
                  customText
                );
              }

              return;
            }

            updateEvent(
              index,
              "actionType",
              value
            );

            updateEvent(
              index,
              "actionResult",
              ""
            );
          }}
        />
      </MobileField>

      {event.actionType !== CUSTOM_VALUE && (
        <MobileField
          label="Intézkedés / eredmény leírása"
          last
        >
          <AutoResizeTextarea
            value={
              event.actionResult || ""
            }
            onChange={(eventObject) =>
              updateEvent(
                index,
                "actionResult",
                eventObject.target.value
              )
            }
            placeholder="Intézkedés / eredmény leírása..."
            className="
              border
              border-[#e1e5eb]
              bg-[#fafbfc]
            "
          />
        </MobileField>
      )}

      {event.actionType === CUSTOM_VALUE && (
        <div className="pb-1" />
      )}
    </div>
  );
}

/* ============================================================
   MOBILE FIELD
   ============================================================ */

function MobileField({
  label,
  children,
  last = false,
}) {
  return (
    <div
      className={`
        ${!last ? "mb-3" : ""}
      `}
    >
      <label
        className="
          mb-1
          block
          text-[11px]
          font-bold
          uppercase
          tracking-wide
          text-[#2E7D32]
        "
      >
        {label}
      </label>

      {children}
    </div>
  );
}

/* ============================================================
   FŐ KOMPONENS
   ============================================================ */

function buildMetaFromMatch(match, masterData) {
  const savedMeta =
    match?.meta && typeof match.meta === "object" ? match.meta : {};

  const defaultHome = match?.title?.includes(" vs ")
    ? match.title.split(" vs ")[0].trim()
    : match?.homeTeam || eventMeta.homeTeam;
  const defaultAway = match?.title?.includes(" vs ")
    ? match.title.split(" vs ")[1].trim()
    : match?.awayTeam || eventMeta.awayTeam;

  return {
    ...eventMeta,
    competitionName:
      savedMeta.competitionName ||
      savedMeta.competition ||
      match?.competition ||
      match?.title ||
      eventMeta.competitionName,
    homeTeam: savedMeta.homeTeam || defaultHome,
    awayTeam: savedMeta.awayTeam || defaultAway,
    matchDate: savedMeta.matchDate || match?.date || eventMeta.matchDate,
    matchTime: savedMeta.matchTime || match?.time || eventMeta.matchTime,
    venue: savedMeta.venue || match?.venue || "",
    organizer:
      savedMeta.organizer ||
      masterData?.organizer ||
      masterData?.organization ||
      eventMeta.organizer,
    eventLogLeader:
      savedMeta.eventLogLeader || eventMeta.eventLogLeader || "",
    winner: savedMeta.winner || match?.winner || "",
    score: savedMeta.score || match?.score || "",
    securityOfficer: {
      name:
        savedMeta.securityOfficer?.name ??
        eventMeta.securityOfficer?.name ??
        "",
      phone:
        savedMeta.securityOfficer?.phone ??
        eventMeta.securityOfficer?.phone ??
        "",
    },
    headOrganizer: {
      name:
        savedMeta.headOrganizer?.name ??
        masterData?.chiefOrganizer ??
        eventMeta.headOrganizer?.name ??
        "",
      phone:
        savedMeta.headOrganizer?.phone ??
        masterData?.phone ??
        eventMeta.headOrganizer?.phone ??
        "",
    },
    medicalService: {
      organization:
        savedMeta.medicalService?.organization ??
        masterData?.healthcareProvider ??
        eventMeta.medicalService?.organization ??
        "",
      person:
        savedMeta.medicalService?.person ??
        eventMeta.medicalService?.person ??
        "",
    },
    disasterProtection: {
      organization:
        savedMeta.disasterProtection?.organization ??
        masterData?.disasterProtectionProvider ??
        eventMeta.disasterProtection?.organization ??
        "",
      person:
        savedMeta.disasterProtection?.person ??
        eventMeta.disasterProtection?.person ??
        "",
    },
  };
}

function EventLogEditor({
  match,
  eventLogStatus = "in_progress",
  currentUser,
  masterData,
  onBack,
  onStatusChange,
  onSaveMatch,
  onNoteAdded,
  onFinalizeMatch,
  onArchiveMatch,
}) {
  const activeUserName =
    currentUser?.name || currentUser?.username || "Biztonsági vezető";

  const [status, setStatus] = useState(
    () => match?.status || eventLogStatus || "in_progress"
  );

  const [meta, setMeta] = useState(() => buildMetaFromMatch(match, masterData));

  const [events, setEvents] = useState(() => {
    if (Array.isArray(match?.events) && match.events.length > 0) {
      return match.events.map((event) => normalizeEvent(event));
    }
    return [];
  });

  const [notes, setNotes] = useState(() =>
    Array.isArray(match?.notes) ? match.notes : []
  );

  const [newNote, setNewNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  /* ==========================================================
     VÉGLEGESÍTŐ MODAL ÉS ÉRTESÍTÉSEK
     ========================================================== */

  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [modalWinner, setModalWinner] = useState("");
  const [modalScore, setModalScore] = useState("");
  const [modalError, setModalError] = useState("");
  const [emailNotification, setEmailNotification] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Sync local state when a different match is opened or updated from DB
  useEffect(() => {
    if (!match) return;
    setStatus(match.status || eventLogStatus || "in_progress");
    setMeta(buildMetaFromMatch(match, masterData));
    setEvents(
      Array.isArray(match.events)
        ? match.events.map((event) => normalizeEvent(event))
        : []
    );
    setNotes(Array.isArray(match.notes) ? match.notes : []);
    setSaveFeedback(null);
  }, [match?.id]);

  useEffect(() => {
    if (match?.status && match.status !== status) {
      setStatus(match.status);
    }
    if (Array.isArray(match?.notes)) {
      setNotes(match.notes);
    }
  }, [match?.status, match?.notes]);

  /* ==========================================================
     APP STÁTUSZ SZINKRONIZÁLÁSA
     ========================================================== */

  useEffect(() => {
    if (typeof onStatusChange === "function") {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  /* ==========================================================
     STÁTUSZ
     ========================================================== */

  const isEditable = status === "in_progress";
  const isFinalized = status === "finalized";
  const isArchived = status === "archived";

  /* ==========================================================
     META MÓDOSÍTÁS
     ========================================================== */

  const updateMeta = (
    field,
    value
  ) => {
    if (!isEditable) return;

    setMeta((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateNestedMeta = (
    parent,
    field,
    value
  ) => {
    if (!isEditable) return;

    setMeta((previous) => ({
      ...previous,

      [parent]: {
        ...(previous[parent] || {}),
        [field]: value,
      },
    }));
  };

  /* ==========================================================
     ESEMÉNY HOZZÁADÁSA
     ========================================================== */

  const addEvent = () => {
    if (!isEditable) return;

    setEvents((previous) => [
      ...previous,
      createEmptyEvent(previous),
    ]);
  };

  /* ==========================================================
     ESEMÉNY MÓDOSÍTÁSA
     ========================================================== */

  const updateEvent = (
    index,
    field,
    value
  ) => {
    if (!isEditable) return;

    setEvents((previous) =>
      previous.map(
        (event, currentIndex) => {
          if (
            currentIndex !== index
          ) {
            return event;
          }

          const updatedEvent = {
            ...event,
            [field]: value,
          };

          const hasEventData =
            Boolean(
              updatedEvent.eventType?.trim()
            ) ||
            Boolean(
              updatedEvent.eventDescription?.trim()
            ) ||
            Boolean(
              updatedEvent.actionType?.trim()
            ) ||
            Boolean(
              updatedEvent.actionResult?.trim()
            );

          if (
            !event.time &&
            hasEventData
          ) {
            const now = getNow();

            updatedEvent.time =
              now.time;

            if (
              updatedEvent.reporterMode !==
              "custom"
            ) {
              updatedEvent.reporterName =
                activeUserName;

              updatedEvent.reporterMode =
                "current_user";
            }

            if (
              updatedEvent.decisionMakerMode !==
              "custom"
            ) {
              updatedEvent.decisionMaker =
                activeUserName;

              updatedEvent.decisionMakerMode =
                "current_user";
            }

            updatedEvent.createdBy =
              activeUserName;

            updatedEvent.createdAt =
              now.iso;

            updatedEvent.lastModifiedAt =
              now.iso;
          } else if (event.time) {
            updatedEvent.lastModifiedAt =
              new Date().toISOString();
          }

          return updatedEvent;
        }
      )
    );
  };

  /* ==========================================================
     ESEMÉNY TÖRLÉSE
     ========================================================== */

  const deleteEvent = (index) => {
    if (!isEditable) return;

    setEvents((previous) =>
      previous.filter(
        (_, currentIndex) =>
          currentIndex !== index
      )
    );
  };

  /* ==========================================================
     MEGJEGYZÉS HOZZÁADÁSA
     ========================================================== */

  const addNote = async () => {
    if (!isFinalized || isSavingNote) return;

    const text = newNote.trim();
    if (!text) return;

    setIsSavingNote(true);
    try {
      const res = await fetch(
        `http://localhost:3000/api/matches/${match?.id}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            createdBy: activeUserName,
          }),
        }
      );

      if (res.ok) {
        const savedNote = await res.json();
        setNotes((previous) => [...previous, savedNote]);
        if (typeof onNoteAdded === "function") {
          onNoteAdded(match?.id, savedNote);
        }
        setNewNote("");
        setSaveFeedback({
          type: "success",
          text: "A megjegyzés sikeresen elmentve az adatbázisba.",
        });
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const localNote = {
        id: Date.now(),
        matchId: match?.id,
        text,
        createdAt: new Date().toLocaleString("hu-HU"),
        createdBy: activeUserName,
      };
      setNotes((previous) => [...previous, localNote]);
      if (typeof onNoteAdded === "function") {
        onNoteAdded(match?.id, localNote);
      }
      setNewNote("");
      setSaveFeedback({
        type: "warning",
        text: `Megjegyzés helyben mentve (adatbázis hiba: ${err.message}).`,
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  /* ==========================================================
     ESEMÉNYNAPLÓ MENTÉSE
     ========================================================== */

  const handleSave = async () => {
    if (!isEditable || isSaving) return;
    setIsSaving(true);
    setSaveFeedback(null);

    const payload = {
      meta,
      events,
      date: meta.matchDate || match?.date,
      time: meta.matchTime || match?.time,
      venue: meta.venue || match?.venue,
      title:
        meta.homeTeam && meta.awayTeam
          ? `${meta.homeTeam} vs ${meta.awayTeam}`
          : match?.title,
    };

    try {
      const res = await fetch(
        `http://localhost:3000/api/matches/${match?.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const updatedMatch = await res.json();
        if (typeof onSaveMatch === "function") {
          onSaveMatch(updatedMatch);
        }
        setSaveFeedback({
          type: "success",
          text: "Az eseménynapló adatai sikeresen mentésre kerültek az adatbázisba!",
        });
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setSaveFeedback({
        type: "warning",
        text: `Hiba a mentés során: ${err.message}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  /* ==========================================================
     VÉGLEGESÍTÉS ÉS POPUP MODAL
     Követelmény: Ha manuálisan van lezárva a véglegesítés gombbal,
     akkor fel kell ugrania egy ablaknak ami megkérdezi hogy ki nyert,
     és mi a végeredmény.
     ========================================================== */

  const handleOpenFinalizeModal = async () => {
    if (!isEditable || isFinalizing) return;
    setModalError("");
    let defaultWinner = meta.homeTeam || "";
    let defaultScore = "";

    const apiMatch = await fetchMatchResultFromMockApi(match?.id).catch(
      () => null
    );
    if (apiMatch?.score && apiMatch?.winner) {
      defaultScore = apiMatch.score;
      defaultWinner = apiMatch.winner;
    }

    setModalWinner(defaultWinner);
    setModalScore(defaultScore);
    setShowFinalizeModal(true);
  };

  const handleConfirmFinalize = async () => {
    if (!modalWinner.trim()) {
      setModalError("Kérjük add meg, hogy ki nyert a mérkőzésen!");
      return;
    }
    if (!modalScore.trim()) {
      setModalError("Kérjük add meg a hivatalos végeredményt (pl. 2 - 1)!");
      return;
    }

    const finalResult = {
      winner: modalWinner.trim(),
      score: modalScore.trim(),
      isAuto: false,
    };

    const nextMeta = {
      ...meta,
      winner: finalResult.winner,
      score: finalResult.score,
    };

    setIsFinalizing(true);
    setShowFinalizeModal(false);
    setMeta(nextMeta);
    setStatus("finalized");

    if (typeof onFinalizeMatch === "function") {
      await onFinalizeMatch(match?.id, {
        ...finalResult,
        meta: nextMeta,
        events,
      });
    }

    const emailRes = await sendEventLogClosedEmail({
      match: { ...match, title: `${nextMeta.homeTeam} vs ${nextMeta.awayTeam}`, date: nextMeta.matchDate, time: nextMeta.matchTime },
      result: finalResult,
      recipientEmail: masterData?.reportEmail || "szeconnect.projektmunka@gmail.com",
      reason: "manual",
    });

    setEmailNotification(
      emailRes?.ok === false
        ? `Lezárás mentve, de az e-mail küldés sikertelen volt (${emailRes.error}).`
        : "📧 Értesítő e-mail sikeresen elküldve a törzsadatokban megadott címre PDF csatolmánnyal!"
    );
    setIsFinalizing(false);
  };

  const handleArchive = async () => {
    if (!isFinalized || isArchiving) return;
    setIsArchiving(true);
    if (typeof onArchiveMatch === "function") {
      await onArchiveMatch(match?.id);
    }
    setStatus("archived");
    setIsArchiving(false);
  };

  /* ==========================================================
     FEJLÉC INPUT CLASS
     ========================================================== */

  const headerInputClass = `
    min-w-0
    w-full
    rounded-[5px]
    border-0
    bg-transparent
    px-[6px]
    py-1
    text-[14px]
    leading-[1.4]
    text-gray-900
    outline-none
    transition
    duration-150
    hover:bg-[#f6f8fb]
    focus:bg-[#f6f8fb]
    focus:shadow-[inset_0_0_0_1px_#b9c4d5]
  `;

  /* ==========================================================
     FINALIZED / ARCHIVED
     ========================================================== */

  if (
    isFinalized ||
    isArchived
  ) {
    return (
      <div
        className="
          mx-auto
          w-full
          max-w-[1600px]
          px-6
          py-6
          text-gray-800
          max-[800px]:px-3
          max-[800px]:py-3
        "
      >
        {/* ====================================================
            FELSŐ SÁV: CÍM, STÁTUSZ ÉS VÉGEREDMÉNY
           ==================================================== */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {isFinalized ? "Lezárt eseménynapló" : "Archivált eseménynapló"}
              </h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isFinalized
                    ? "border border-amber-300 bg-amber-100 text-amber-800"
                    : "border border-gray-300 bg-gray-100 text-gray-800"
                }`}
              >
                {isFinalized ? "Lezárt" : "Archivált"}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {meta.competitionName || match?.title} • {meta.matchDate || match?.date} {meta.matchTime || match?.time}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {(meta.score || match?.score) && (
              <div className="rounded-xl border border-[#2E7D32]/30 bg-[#f0f9f1] px-4 py-2.5 text-right">
                <div className="text-xs font-medium text-gray-500">Végeredmény:</div>
                <div className="text-xl font-bold text-[#2E7D32]">
                  {meta.score || match?.score}{" "}
                  <span className="text-sm font-semibold text-gray-700">
                    (Győztes: {meta.winner || match?.winner})
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                window.open(
                  `http://localhost:3000/api/matches/${match?.id}/pdf`,
                  "_blank"
                )
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#2E7D32] hover:bg-[#256629] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all cursor-pointer"
              title="PDF összefoglaló megnyitása új lapon"
            >
              <span>PDF Megtekintése</span>
            </button>

            <a
              href={`http://localhost:3000/api/matches/${match?.id}/pdf?download=1`}
              download={`esemenynaplo-${match?.id}.pdf`}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all cursor-pointer"
              title="PDF összefoglaló letöltése"
            >
              <span>PDF Letöltése</span>
            </a>

            {isFinalized && (
              <button
                type="button"
                onClick={handleArchive}
                disabled={isArchiving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C19A5B] hover:bg-[#b08a4c] px-4 py-2.5 text-sm font-semibold text-black shadow-md transition-all cursor-pointer disabled:opacity-60"
                title="Eseménynapló archiválása"
              >
                <span>{isArchiving ? "Archiválás..." : "Archiválás"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Értesítési sávok */}
        {emailNotification && (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            {emailNotification}
          </div>
        )}

        {saveFeedback && (
          <div
            className={`mb-4 rounded-xl border p-4 text-sm ${
              saveFeedback.type === "success"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {saveFeedback.text}
          </div>
        )}

        {/* ====================================================
            DOKUMENTUM / PDF ELŐNÉZET (CSAK OLVASHATÓ)
           ==================================================== */}

        <div
          className="
            w-full
            overflow-hidden
            rounded-[8px]
            border
            border-[#d9dee7]
            bg-white
          "
        >
          <div className="bg-white p-6 sm:p-10 overflow-x-auto text-black">
            <EventLogDocument meta={meta} rows={events} notes={notes} />
          </div>
        </div>

        {/* ====================================================
            LEZÁRT - MEGJEGYZÉSEK + ÚJ MEGJEGYZÉS
           ==================================================== */}

        {isFinalized && (
          <div
            className="
              mt-6
              rounded-[10px]
              border
              border-[#d9dee7]
              bg-white
              p-5
            "
          >
            <h3
              className="
                mb-4
                text-base
                font-bold
                text-gray-800
              "
            >
              Megjegyzések
            </h3>

            {notes.length > 0 && (
              <div
                className="
                  mb-4
                  flex
                  flex-col
                  gap-2
                "
              >
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="
                      rounded-[7px]
                      border
                      border-[#e1e5eb]
                      bg-[#fafbfc]
                      px-3
                      py-[10px]
                    "
                  >
                    <p
                      className="
                        whitespace-pre-wrap
                        text-[13px]
                        leading-[1.5]
                        text-gray-800
                      "
                    >
                      {note.text}
                    </p>

                    <div
                      className="
                        mt-1.5
                        text-[11px]
                        text-[#8a94a3]
                      "
                    >
                      {note.createdBy}
                      {" – "}
                      {note.createdAt}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <textarea
              value={newNote}
              onChange={(event) =>
                setNewNote(
                  event.target.value
                )
              }
              placeholder="Új megjegyzés hozzáadása a lezárt eseménynaplóhoz..."
              rows={3}
              className="
                min-h-[80px]
                w-full
                resize-y
                rounded-[7px]
                border
                border-[#cfd6e0]
                px-[10px]
                py-[9px]
                text-[13px]
                outline-none
                transition
                focus:border-[#9eabbc]
              "
            />

            <div
              className="
                mt-3
                flex
                justify-end
                gap-2
                max-[600px]:flex-col
              "
            >
              <button
                type="button"
                onClick={addNote}
                disabled={!newNote.trim()}
                className="
                  min-h-10
                  rounded-[7px]
                  border
                  border-[#2E7D32]
                  bg-[#2E7D32]
                  px-5
                  py-2
                  text-[13px]
                  font-semibold
                  text-white
                  transition
                  hover:bg-[#256628]
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                  max-[600px]:w-full
                "
              >
                Megjegyzés mentése
              </button>
            </div>
          </div>
        )}

        {/* ====================================================
            ARCHIVÁLT - CSAK MEGLÉVŐ MEGJEGYZÉSEK
           ==================================================== */}

        {isArchived &&
          notes.length > 0 && (
            <div
              className="
                mt-6
                rounded-[10px]
                border
                border-[#d9dee7]
                bg-white
                p-5
              "
            >
              <h3
                className="
                  mb-4
                  text-base
                  font-bold
                  text-gray-800
                "
              >
                Megjegyzések
              </h3>

              <div
                className="
                  flex
                  flex-col
                  gap-2
                "
              >
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="
                      rounded-[7px]
                      border
                      border-[#e1e5eb]
                      bg-[#fafbfc]
                      px-3
                      py-[10px]
                    "
                  >
                    <p
                      className="
                        whitespace-pre-wrap
                        text-[13px]
                        leading-[1.5]
                        text-gray-800
                      "
                    >
                      {note.text}
                    </p>

                    <div
                      className="
                        mt-1.5
                        text-[11px]
                        text-[#8a94a3]
                      "
                    >
                      {note.createdBy}
                      {" – "}
                      {note.createdAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        <button
          type="button"
          onClick={onBack}
          className="
            mt-6
            rounded-[7px]
            border
            border-gray-300
            bg-white
            px-5
            py-2
            text-[13px]
            font-semibold
            text-gray-700
            transition
            hover:bg-gray-50
            max-[600px]:w-full
          "
        >
          Vissza
        </button>

      </div>
    );
  }

  /* ==========================================================
     EDITABLE / IN PROGRESS
     ========================================================== */

  return (
    <div
      className="
        mx-auto
        w-full
        max-w-[1600px]
        p-6
        font-sans
        text-gray-800
        max-[800px]:p-3
      "
    >
      {/* ======================================================
          FELSŐ SÁV: CÍM ÉS STÁTUSZ
         ====================================================== */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Megnyitott eseménynapló
            </h1>
            <span className="rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
              Megnyitott
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {meta.competitionName || match?.title} • {meta.matchDate || match?.date} {meta.matchTime || match?.time}
          </p>
        </div>
      </div>

      {emailNotification && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {emailNotification}
        </div>
      )}

      {/* ======================================================
          FEJLÉC
         ====================================================== */}

      <section
        className="
          relative
          mb-6
          rounded-xl
          border
          border-[#C19A5B]
          bg-white
          px-6
          py-[22px]
          shadow-[0_2px_6px_rgba(0,0,0,0.04)]
          max-[800px]:p-4
        "
      >
        <div
          className="
            grid
            grid-cols-1
            gap-x-[42px]
            gap-y-1
            pt-[72px]
            lg:grid-cols-2
            lg:pt-0
            lg:pr-[170px]
            max-[1100px]:lg:gap-x-6
          "
        >

          <div
            className="
              flex
              min-w-0
              flex-col
            "
          >
            <HeaderField
              label="Meccs megnevezése"
              first
            >
              <input
                type="text"
                value={
                  meta.competitionName || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "competitionName",
                    event.target.value
                  )
                }
                className={`
                  ${headerInputClass}
                  text-[18px]
                  font-bold
                `}
              />
            </HeaderField>

            <HeaderField label="Hazai csapat">
              <input
                type="text"
                value={
                  meta.homeTeam || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "homeTeam",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Vendég csapat">
              <input
                type="text"
                value={
                  meta.awayTeam || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "awayTeam",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Mérkőzés dátuma">
              <input
                type="text"
                value={
                  meta.matchDate || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "matchDate",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Mérkőzés időpontja">
              <input
                type="text"
                value={
                  meta.matchTime || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "matchTime",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Szervező">
              <input
                type="text"
                value={
                  meta.organizer || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "organizer",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>
          </div>

          <div
            className="
              flex
              min-w-0
              flex-col
            "
          >
            <HeaderField label="Biztonsági vezető">
              <input
                type="text"
                value={
                  meta.securityOfficer?.name ||
                  ""
                }
                onChange={(event) =>
                  updateNestedMeta(
                    "securityOfficer",
                    "name",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Biztonsági vezető telefonszáma">
              <input
                type="text"
                value={
                  meta.securityOfficer?.phone ||
                  ""
                }
                onChange={(event) =>
                  updateNestedMeta(
                    "securityOfficer",
                    "phone",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Főszervező">
              <input
                type="text"
                value={
                  meta.headOrganizer?.name ||
                  ""
                }
                onChange={(event) =>
                  updateNestedMeta(
                    "headOrganizer",
                    "name",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Főszervező telefonszáma">
              <input
                type="text"
                value={
                  meta.headOrganizer?.phone ||
                  ""
                }
                onChange={(event) =>
                  updateNestedMeta(
                    "headOrganizer",
                    "phone",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Eseménynapló vezető">
              <input
                type="text"
                value={
                  meta.eventLogLeader || ""
                }
                onChange={(event) =>
                  updateMeta(
                    "eventLogLeader",
                    event.target.value
                  )
                }
                className={headerInputClass}
              />
            </HeaderField>

            <HeaderField label="Egészségügyi szolgálat">
              <div
                className="
                  flex
                  w-full
                  flex-col
                "
              >
                <input
                  type="text"
                  value={
                    meta.medicalService
                      ?.organization || ""
                  }
                  onChange={(event) =>
                    updateNestedMeta(
                      "medicalService",
                      "organization",
                      event.target.value
                    )
                  }
                  placeholder="Szervezet"
                  className={headerInputClass}
                />

                <input
                  type="text"
                  value={
                    meta.medicalService
                      ?.person || ""
                  }
                  onChange={(event) =>
                    updateNestedMeta(
                      "medicalService",
                      "person",
                      event.target.value
                    )
                  }
                  placeholder="Személy"
                  className={`
                    ${headerInputClass}
                    text-[13px]
                  `}
                />
              </div>
            </HeaderField>

            <HeaderField label="Katasztrófavédelem">
              <div
                className="
                  flex
                  w-full
                  flex-col
                "
              >
                <input
                  type="text"
                  value={
                    meta.disasterProtection
                      ?.organization || ""
                  }
                  onChange={(event) =>
                    updateNestedMeta(
                      "disasterProtection",
                      "organization",
                      event.target.value
                    )
                  }
                  placeholder="Szervezet"
                  className={headerInputClass}
                />

                <input
                  type="text"
                  value={
                    meta.disasterProtection
                      ?.person || ""
                  }
                  onChange={(event) =>
                    updateNestedMeta(
                      "disasterProtection",
                      "person",
                      event.target.value
                    )
                  }
                  placeholder="Személy"
                  className={`
                    ${headerInputClass}
                    text-[13px]
                  `}
                />
              </div>
            </HeaderField>
          </div>
        </div>

        <div
          className="
            pointer-events-none
            absolute
            right-6
            top-3
            z-10
            flex
            h-[80px]
            w-[110px]
            items-center
            justify-center
            max-[800px]:right-[14px]
            max-[800px]:top-[4px]
            max-[800px]:h-[65px]
            max-[800px]:w-[90px]
          "
        >
          <img
            src={logo}
            alt="Rába ETO logo"
            className="
              block
              h-[80px]
              w-[80px]
              object-contain
              max-[800px]:h-[60px]
              max-[800px]:w-[60px]
            "
          />
        </div>
      </section>

      {/* ======================================================
          ESEMÉNYNAPLÓ SZEKCIÓ
         ====================================================== */}

      <section className="w-full">

        <div
          className="
            mb-[10px]
            flex
            items-end
            justify-between
            gap-4
          "
        >
          <div>
            <p
              className="
                m-0
                max-w-[900px]
                text-xs
                leading-[1.5]
                text-gray-500
              "
            >
              Az időpont és a kitöltő automatikusan
              kerül rögzítésre az esemény első
              adatbevitelekor. Az intézkedést
              meghatározó személy alapértelmezetten
              a bejelentkezett felhasználó.
            </p>
          </div>

          <span
            className="
              shrink-0
              text-[13px]
              text-gray-500
            "
          >
            {events.length} esemény
          </span>
        </div>

        {/* ====================================================
            DESKTOP TÁBLÁZAT
           ==================================================== */}

        <div
          className="
            hidden
            w-full
            overflow-x-auto
            rounded-[10px]
            border
            border-[#C19A5B]
            bg-white
            shadow-[0_2px_5px_rgba(0,0,0,0.03)]
            lg:block
          "
        >
          <table
            className="
              w-full
              min-w-[1000px]
              table-fixed
              border-separate
              border-spacing-0
              text-[13px]
            "
          >
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[35%]" />
              <col className="w-[6%]" />
            </colgroup>

            <thead>
              <tr>
                {[
                  "#",
                  "Időpont",
                  "Kitöltő",
                  "Esemény",
                  "Intézkedést meghatározó személy",
                  "Intézkedés / eredmény",
                  "Törlés",
                ].map((title, index) => (
                  <th
                    key={title}
                    className={`
                      h-[42px]
                      border-b
                      border-r
                      border-[#e1e5eb]
                      bg-[#2E7D32]
                      px-[10px]
                      py-2
                      align-middle
                      text-xs
                      font-bold
                      text-white
                      ${
                        index === 0 ||
                        index === 6
                          ? "text-center"
                          : "text-left"
                      }
                    `}
                  >
                    {title}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="
                      p-7
                      text-center
                      text-[13px]
                      text-[#8a94a3]
                    "
                  >
                    Nincs még rögzített esemény.
                  </td>
                </tr>
              ) : (
                events.map(
                  (event, index) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      index={index}
                      updateEvent={
                        updateEvent
                      }
                      deleteEvent={
                        deleteEvent
                      }
                      currentUserName={activeUserName}
                    />
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {/* ====================================================
            MOBILE
           ==================================================== */}

        <div
          className="
            flex
            flex-col
            gap-3
            lg:hidden
          "
        >
          {events.length === 0 ? (
            <div
              className="
                rounded-xl
                border
                border-[#C19A5B]
                bg-white
                p-6
                text-center
                text-[13px]
                text-[#8a94a3]
              "
            >
              Nincs még rögzített esemény.
            </div>
          ) : (
            events.map(
              (event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={index}
                  updateEvent={
                    updateEvent
                  }
                  deleteEvent={
                    deleteEvent
                  }
                  currentUserName={activeUserName}
                />
              )
            )
          )}
        </div>

        {/* ====================================================
            ÚJ ESEMÉNY
           ==================================================== */}

        <div
          className="
            mt-3
            flex
            items-center
            justify-between
            gap-4
            max-[600px]:flex-col
            max-[600px]:items-stretch
          "
        >
          <span
            className="
              text-xs
              leading-[1.4]
              text-[#7b8492]
            "
          >
            Új esemény hozzáadásakor az időpont
            automatikusan rögzítésre kerül.
          </span>

          <button
            type="button"
            onClick={addEvent}
            className="
              min-h-[38px]
              shrink-0
              rounded-[7px]
              border
              border-[#c8d0dc]
              bg-white
              px-4
              py-2
              text-[13px]
              font-semibold
              text-[#344054]
              transition
              hover:border-[#aeb8c7]
              hover:bg-[#f5f7fa]
              hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]
              max-[600px]:w-full
            "
          >
            + Esemény hozzáadása
          </button>
        </div>
      </section>

      {/* ======================================================
          MENTÉS / VÉGLEGESÍTÉS
         ====================================================== */}

      {saveFeedback && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            saveFeedback.type === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {saveFeedback.text}
        </div>
      )}

      <div
        className="
          mt-6
          flex
          items-center
          justify-end
          gap-[10px]
          border-t
          border-[#e1e5eb]
          pt-[18px]
          max-[600px]:flex-col-reverse
          max-[600px]:items-stretch
        "
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isFinalizing}
          className="
            min-h-10
            rounded-[7px]
            border
            border-[#aeb8c7]
            bg-white
            px-5
            py-[9px]
            text-[13px]
            font-semibold
            text-[#344054]
            transition
            active:translate-y-px
            hover:border-[#98a5b7]
            hover:bg-[#f5f7fa]
            hover:shadow-[0_2px_5px_rgba(0,0,0,0.06)]
            disabled:cursor-not-allowed
            disabled:opacity-60
            max-[600px]:w-full
          "
        >
          {isSaving ? "Mentés..." : "Mentés"}
        </button>

        <button
          type="button"
          onClick={handleOpenFinalizeModal}
          disabled={isSaving || isFinalizing}
          className="
            min-h-10
            rounded-[7px]
            border
            border-[#2E7D32]
            bg-[#2E7D32]
            px-5
            py-[9px]
            text-[13px]
            font-semibold
            text-white
            transition
            active:translate-y-px
            hover:border-[#256628]
            hover:bg-[#256628]
            hover:shadow-[0_2px_5px_rgba(0,0,0,0.1)]
            disabled:cursor-not-allowed
            disabled:opacity-60
            max-[600px]:w-full
          "
        >
          {isFinalizing ? "Véglegesítés..." : "Véglegesítés"}
        </button>
      </div>

      {/* ======================================================
          VISSZA
         ====================================================== */}

      <button
        type="button"
        onClick={onBack}
        className="
          mt-6
          rounded-[7px]
          border
          border-gray-300
          bg-white
          px-4
          py-2
          text-[13px]
          font-semibold
          text-gray-700
          transition
          hover:bg-gray-50
          max-[600px]:w-full
        "
      >
        Vissza
      </button>

      {/* ======================================================
          VÉGLEGESÍTÉSI MODAL (KI NYERT ÉS MI A VÉGEREDMÉNY)
         ====================================================== */}
      {showFinalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">
              Eseménynapló véglegesítése
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              A mérkőzés lezárásához kérjük add meg a győztest és a hivatalos végeredményt.
            </p>

            <div className="mt-5 space-y-4">
              {/* Ki nyert? */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Ki nyert?
                </label>
                <div className="space-y-2">
                  {[
                    meta.homeTeam || "Hazai csapat",
                    meta.awayTeam || "Vendég csapat",
                    "Döntetlen",
                  ].map((team) => (
                    <label
                      key={team}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition ${
                        modalWinner === team
                          ? "border-[#2E7D32] bg-[#f0f9f1] font-semibold text-[#2E7D32]"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="winnerOption"
                        value={team}
                        checked={modalWinner === team}
                        onChange={(e) => setModalWinner(e.target.value)}
                        className="text-[#2E7D32] focus:ring-[#2E7D32]"
                      />
                      <span>{team}</span>
                    </label>
                  ))}
                  <div className="pt-1">
                    <input
                      type="text"
                      placeholder="Egyéb / Egyéni győztes megadása..."
                      value={
                        [meta.homeTeam, meta.awayTeam, "Döntetlen"].includes(modalWinner)
                          ? ""
                          : modalWinner
                      }
                      onChange={(e) => setModalWinner(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32]"
                    />
                  </div>
                </div>
              </div>

              {/* Végeredmény */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Mi a végeredmény?
                </label>
                <input
                  type="text"
                  placeholder="pl. 2 - 1"
                  value={modalScore}
                  onChange={(e) => setModalScore(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2E7D32] focus:ring-1 focus:ring-[#2E7D32]"
                />
              </div>

              {modalError && (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">
                  ⚠️ {modalError}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Mégse
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalize}
                className="rounded-lg bg-[#2E7D32] px-5 py-2 text-sm font-semibold text-white shadow hover:bg-[#256628]"
              >
                Lezárás és mentés
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default EventLogEditor;

