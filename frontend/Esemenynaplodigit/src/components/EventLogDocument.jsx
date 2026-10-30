// EventLogDocument.jsx
import logo from "../assets/logo.png";

export default function EventLogDocument({ meta = {}, rows = [] }) {
  const securityOfficer = meta.securityOfficer || {};
  const headOrganizer = meta.headOrganizer || {};
  const medicalService = meta.medicalService || {};
  const disasterProtection = meta.disasterProtection || {};

  return (
    <div
      style={{
        padding: "32px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
        backgroundColor: "#ffffff",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* =======================================================
          FEJLÉC: CÍM ÉS LOGÓ TÖKÉLETESEN ELVÁLASZTVA
          (Nincs position absolute, így nem lóg bele semmilyen szövegbe!)
         ======================================================= */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "28px",
          paddingBottom: "16px",
          borderBottom: "2px solid #2E7D32",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "26px",
              fontWeight: "bold",
              margin: 0,
              color: "#1f2937",
              letterSpacing: "-0.5px",
            }}
          >
            Eseménynapló
          </h1>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "13px",
              color: "#4b5563",
              fontWeight: "500",
            }}
          >
            Rába ETO Digitális Eseménynapló Dokumentum
          </p>
        </div>

        <div style={{ flexShrink: 0 }}>
          <img
            src={logo}
            alt="Rába ETO logo"
            style={{
              height: "65px",
              width: "auto",
              maxHeight: "65px",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </div>

      {/* =======================================================
          MÉRKŐZÉS TÖRZSEDATOK (2 OSZLOPOS RÁCS)
         ======================================================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: "32px",
          rowGap: "10px",
          marginBottom: "28px",
        }}
      >
        <Field
          label="Versenyrendszer megnevezése"
          value={meta.competitionName}
        />
        <Field
          label="Mérkőző csapatok (hazai – vendég)"
          value={
            meta.homeTeam && meta.awayTeam
              ? `${meta.homeTeam} – ${meta.awayTeam}`
              : meta.homeTeam || meta.awayTeam || "—"
          }
        />
        <Field
          label="Mérkőzés ideje"
          value={`${meta.matchDate || ""} ${meta.matchTime || ""}`.trim()}
        />
        <Field
          label="Biztonsági felelős és elérhetősége"
          value={`${securityOfficer.name || ""} ${securityOfficer.phone || ""}`.trim()}
        />
        <Field
          label="Rendező szerv megnevezése"
          value={meta.organizer}
        />
        <Field
          label="Főrendező megnevezése"
          value={`${headOrganizer.name || ""} ${headOrganizer.phone || ""}`.trim()}
        />
        <Field
          label="Eseménynaplót vezető személy"
          value={meta.eventLogLeader}
        />
        <Field
          label="Egészségügyi biztosítás"
          value={
            medicalService.organization || medicalService.person
              ? `${medicalService.organization || ""} – ${medicalService.person || ""}`.replace(/^ – | – $/g, "")
              : "—"
          }
        />
        <Field
          label="Katasztrófavédelmi biztosítás"
          value={
            disasterProtection.organization || disasterProtection.person
              ? `${disasterProtection.organization || ""} – ${disasterProtection.person || ""}`.replace(/^ – | – $/g, "")
              : "—"
          }
        />
        {meta.score && (
          <Field
            label="Végeredmény és győztes"
            value={`${meta.score} (${meta.winner || "—"})`}
          />
        )}
      </div>

      {/* =======================================================
          ESEMÉNYTÁBLÁZAT
         ======================================================= */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          borderSpacing: "0",
          marginTop: "16px",
          tableLayout: "fixed",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr>
            <Th style={{ width: "45px", textAlign: "center" }}>SSZ</Th>
            <Th style={{ width: "80px" }}>Időpont</Th>
            <Th style={{ width: "130px" }}>Eseményt jelentő</Th>
            <Th style={{ width: "180px", textAlign: "left" }}>Esemény leírása</Th>
            <Th style={{ width: "130px" }}>Intézkedést hozó</Th>
            <Th style={{ textAlign: "left" }}>Intézkedés / eredmény</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  border: "1px solid #d1d5db",
                  padding: "16px",
                  textAlign: "center",
                  color: "#6b7280",
                  fontStyle: "italic",
                }}
              >
                Nincs rögzített esemény ebben az eseménynaplóban.
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={row.id || index}
                style={{
                  backgroundColor: index % 2 === 1 ? "#f9fafb" : "#ffffff",
                }}
              >
                <Td style={{ textAlign: "center", fontWeight: "bold" }}>
                  {row.sequenceNumber || index + 1}
                </Td>
                <Td>{row.time || "—"}</Td>
                <Td>{row.reporterName || "—"}</Td>
                <Td>{row.eventDescription || row.eventType || "—"}</Td>
                <Td>{row.decisionMaker || "—"}</Td>
                <Td>{row.actionResult || row.actionType || "—"}</Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- helpers ---------- */

function Field({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: "8px",
        paddingTop: "3px",
        paddingBottom: "3px",
        fontSize: "13px",
      }}
    >
      <span
        style={{
          fontWeight: "bold",
          fontSize: "13px",
          color: "#374151",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}:
      </span>
      <span
        style={{
          borderBottom: "1px solid #9ca3af",
          flex: 1,
          fontSize: "13px",
          fontWeight: "500",
          paddingLeft: "4px",
          color: "#111827",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function Th({ children, style = {} }) {
  return (
    <th
      style={{
        border: "1px solid #9ca3af",
        padding: "8px 10px",
        fontWeight: "bold",
        fontSize: "12px",
        backgroundColor: "#e5e7eb",
        color: "#111827",
        textAlign: "left",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style = {} }) {
  return (
    <td
      style={{
        border: "1px solid #d1d5db",
        padding: "7px 10px",
        verticalAlign: "top",
        fontSize: "12px",
        color: "#1f2937",
        wordBreak: "break-word",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
