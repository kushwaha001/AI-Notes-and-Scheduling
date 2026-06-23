/**
 * NFR-5: All date input/display uses DD MMM YYYY convention.
 * This component renders a native date picker but converts the value
 * to/from DD MMM YYYY for display and backend submission.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "2026-06-23" → "23 Jun 2026" */
export function fmtDate(iso) {
  if (!iso) return "—";
  const raw = String(iso).split("T")[0];
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

/** "23 Jun 2026" → "2026-06-23"  (for HTML date input value) */
export function fmtToISO(ddMmmYyyy) {
  if (!ddMmmYyyy) return "";
  const parts = String(ddMmmYyyy).trim().split(" ");
  if (parts.length !== 3) return "";
  const [d, mon, y] = parts;
  const m = MONTHS.indexOf(mon);
  if (m === -1) return "";
  return `${y}-${String(m + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "2026-06-23" (from <input type=date>) → "23 Jun 2026" (for backend) */
export function isoToDDMmmYYYY(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

/**
 * A native date picker whose value is always "YYYY-MM-DD" internally
 * but displays clearly as DD MMM YYYY to the user via a label.
 *
 * Usage:
 *   <DateInput value={isoValue} onChange={setIsoValue} label="Date" />
 *   Then call isoToDDMmmYYYY(isoValue) before sending to backend.
 */
export default function DateInput({ value, onChange, label, required, style }) {
  return (
    <div style={style}>
      {label && (
        <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
          {label}{required ? " *" : ""}
          <span style={{ color: "#94a3b8", fontSize: "11px", marginLeft: "6px" }}>DD MMM YYYY</span>
        </label>
      )}
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "8px",
          border: "1px solid #cbd5e1",
          fontSize: "14px",
          boxSizing: "border-box",
          ...(style?.input || {}),
        }}
      />
      {value && (
        <span style={{ fontSize: "12px", color: "#3b82f6", marginTop: "3px", display: "block" }}>
          {fmtDate(value)}
        </span>
      )}
    </div>
  );
}
