// EventLogDocument.jsx
import logo from "../assets/logo.png";
import { eventRows as defaultSampleRows } from "../data/EventLogData";

export default function EventLogDocument({ meta = {}, rows = [] }) {
  const securityOfficer = meta.securityOfficer || {};
  const headOrganizer = meta.headOrganizer || {};
  const medicalService = meta.medicalService || {};
  const disasterProtection = meta.disasterProtection || {};

  // Ha nincsenek események átadva, használjuk az alapértelmezett minta eseményeket
  const displayRows = rows && rows.length > 0 ? rows : defaultSampleRows;

  const homeAway =
    meta.homeTeam && meta.awayTeam
      ? `${meta.homeTeam} – ${meta.awayTeam}`
      : meta.homeTeam || meta.awayTeam || "RabaETO – Nem RábaETO";

  const matchDateTime = `${meta.matchDate || "2026.04.12."} ${meta.matchTime || "14.52"}`.trim();

  const securityInfo =
    `${securityOfficer.name || ""} ${securityOfficer.phone || ""}`.trim() ||
    meta.securityOfficerName ||
    "Valaki 03635379";

  const headOrganizerInfo =
    `${headOrganizer.name || ""} ${headOrganizer.phone || ""}`.trim() ||
    meta.headOrganizerName ||
    "Valaki2 03654892";

  const medicalInfo =
    medicalService.organization || medicalService.person
      ? `${medicalService.organization || ""} – ${medicalService.person || ""}`.replace(/^ – | – $/g, "")
      : "Szervezet – Személy";

  const disasterInfo =
    disasterProtection.organization || disasterProtection.person
      ? `${disasterProtection.organization || ""} – ${disasterProtection.person || ""}`.replace(/^ – | – $/g, "")
      : "Katasztrofavédelmisek – Valaki4";

  return (
    <div
      style={{
        padding: "36px 40px",
        fontFamily: '"Times New Roman", Times, serif',
        color: "#000000",
        backgroundColor: "#ffffff",
        maxWidth: "850px",
        margin: "0 auto",
        boxSizing: "border-box",
        fontSize: "11pt",
        lineHeight: "1.35",
      }}
    >
      {/* =======================================================
          FEJLÉC: KÖZÉPRE IGAZÍTOTT CÍM ÉS JOBB FELSŐ LOGÓ
         ======================================================= */}
      <div
        style={{
          position: "relative",
          marginBottom: "28px",
          minHeight: "100px",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: "0",
            top: "0",
          }}
        >
          <img
            src={logo}
            alt="Rába ETO logo"
            style={{
              height: "95px",
              width: "auto",
              maxHeight: "95px",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>

        <div
          style={{
            textAlign: "center",
            paddingTop: "28px",
          }}
        >
          <h1
            style={{
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: "22pt",
              fontWeight: "bold",
              margin: 0,
              color: "#000000",
              letterSpacing: "0.5px",
            }}
          >
            Eseménynapló
          </h1>
        </div>
      </div>

      {/* =======================================================
          MÉRKŐZÉS TÖRZSEDATOK (PONTOS IGAZÍTÁS)
         ======================================================= */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "30px",
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: "11pt",
        }}
      >
        <tbody>
          <tr>
            <td style={labelStyle}>Versenyrendszer megnevezése:</td>
            <td style={valueStyle}>{meta.competitionName || "Mérkőzéselnevezés"}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Mérkőző csapatok megnevezése (hazai / vendég):</td>
            <td style={valueStyle}>{homeAway}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Mérkőzés ideje:</td>
            <td style={valueStyle}>{matchDateTime}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Biztonsági felelős megnevezése és elérhetősége:</td>
            <td style={valueStyle}>{securityInfo}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Rendező vagy rendező szerv megnevezése:</td>
            <td style={valueStyle}>{meta.organizer || "Szervező"}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Főrendező megnevezése:</td>
            <td style={valueStyle}>{headOrganizerInfo}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Eseménynaplót vezető megnevezése és elérhetősége:</td>
            <td style={valueStyle}>{meta.eventLogLeader || "Valaki3"}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Egészségügyi biztosításért felelős szervezet és személy:</td>
            <td style={valueStyle}>{medicalInfo}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Katasztrófavédelmi biztosításért felelős szervezet és személy:</td>
            <td style={valueStyle}>{disasterInfo}</td>
          </tr>
          {(meta.score || meta.winner) && (
            <tr>
              <td style={labelStyle}>Hivatalos végeredmény és győztes:</td>
              <td style={valueStyle}>
                <strong>{meta.score || "N/A"}</strong> (Győztes: {meta.winner || "N/A"})
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* =======================================================
          ESEMÉNYTÁBLÁZAT (FEKETE KERET, LÁGY KÉKES-SZÜRKE FEJLÉC)
         ======================================================= */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          borderSpacing: "0",
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: "10pt",
          border: "1.5px solid #000000",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#DDE3EA" }}>
            <th style={{ ...thStyle, width: "45px", textAlign: "center" }}>SSZ</th>
            <th style={{ ...thStyle, width: "65px", textAlign: "center" }}>Időpont</th>
            <th style={{ ...thStyle, width: "125px", textAlign: "left" }}>Eseményt jelentő</th>
            <th style={{ ...thStyle, textAlign: "left" }}>Esemény leírása</th>
            <th style={{ ...thStyle, width: "125px", textAlign: "left" }}>Intézkedést meghatározó</th>
            <th style={{ ...thStyle, width: "135px", textAlign: "left" }}>Intézkedés / eredmény</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => (
            <tr key={row.id || index}>
              <td style={{ ...tdStyle, textAlign: "center" }}>
                {row.sequenceNumber || index + 1}
              </td>
              <td style={{ ...tdStyle, textAlign: "center" }}>
                {row.time || "—"}
              </td>
              <td style={tdStyle}>{row.reporterName || "—"}</td>
              <td style={tdStyle}>{row.eventDescription || row.eventType || "—"}</td>
              <td style={tdStyle}>{row.decisionMaker || "—"}</td>
              <td style={tdStyle}>{row.actionResult || row.actionType || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const labelStyle = {
  width: "53%",
  fontWeight: "bold",
  fontSize: "11pt",
  color: "#000000",
  padding: "3px 8px 3px 0",
  verticalAlign: "top",
  lineHeight: "1.35",
};

const valueStyle = {
  width: "47%",
  fontWeight: "normal",
  fontSize: "11pt",
  color: "#000000",
  padding: "3px 0",
  verticalAlign: "top",
  lineHeight: "1.35",
};

const thStyle = {
  border: "1px solid #000000",
  padding: "7px 6px",
  fontWeight: "bold",
  fontSize: "10pt",
  color: "#000000",
  verticalAlign: "middle",
};

const tdStyle = {
  border: "1px solid #000000",
  padding: "6px 8px",
  fontSize: "10pt",
  color: "#000000",
  verticalAlign: "top",
  lineHeight: "1.3",
};
