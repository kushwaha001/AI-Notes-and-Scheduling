import { useState, useEffect } from "react";

/**
 * Locale-independent date picker. The native <input type="date"> renders its
 * popup in the browser's locale (US = MM/DD/YYYY), which we can't control — so
 * we use explicit Day / Month / Year dropdowns instead. Always DD/MM/YYYY order.
 *
 * Value is held as ISO "YYYY-MM-DD"; the backend parses that directly.
 */

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// All app timestamps are shown in India Standard Time (UTC+5:30), regardless of
// the machine's own clock/locale. Backend TIMESTAMP columns are naive (no zone)
// and are stored as UTC, so a naive value is treated as UTC before converting.
export const IST_TZ = "Asia/Kolkata";

/** Parse a backend timestamp, treating a naive "…T…" value as UTC. Pure dates
 *  ("YYYY-MM-DD") and zoned values are left as-is. Returns a Date or null. */
function parseTs(ts) {
  if (!ts) return null;
  let s = String(ts);
  // Naive datetime (has a time part but no zone marker) → it's UTC, tag it.
  if (s.includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "2026-06-24" or ISO datetime → "24/06/2026" (date rendered in IST). A pure
 *  date has no zone, so it is shown verbatim — no shifting a day forward/back. */
export function fmtDate(iso) {
  if (!iso) return "—";
  const s = String(iso);
  if (!s.includes("T")) {                     // pure date — no timezone math
    const [y, m, d] = s.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }
  const dt = parseTs(s);                       // timestamp — render the IST date
  if (!dt) return iso;
  return dt.toLocaleDateString("en-GB", { timeZone: IST_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Timestamp → "24 Jun 2026, 15:30" in IST. Use for created_at/updated_at etc. */
export function fmtDateTime(ts) {
  const d = parseTs(ts);
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: IST_TZ, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** Timestamp → "15:30" in IST (time only). */
export function fmtTime(ts) {
  const d = parseTs(ts);
  if (!d) return "—";
  return d.toLocaleTimeString("en-GB", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Value to send to the backend (already "YYYY-MM-DD"). */
export function toApiDate(isoDate) {
  return isoDate || "";
}

function daysInMonth(y, m) {       // m is 1-12
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

function parseISO(v) {
  if (!v) return { d: "", m: "", y: "" };
  const [y, m, d] = String(v).split("-");
  return { d: d ? String(Number(d)) : "", m: m ? String(Number(m)) : "", y: y || "" };
}

export default function DateInput({ value, onChange, label, required, style }) {
  const [parts, setParts] = useState(parseISO(value));

  // resync when the parent resets/changes the value externally
  useEffect(() => { setParts(parseISO(value)); }, [value]);

  const now = new Date();
  const years = [];
  for (let yr = now.getFullYear() - 5; yr <= now.getFullYear() + 6; yr++) years.push(yr);

  const maxDay = daysInMonth(Number(parts.y), Number(parts.m));
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  function update(next) {
    setParts(next);
    if (next.d && next.m && next.y) {
      const dd = String(Math.min(Number(next.d), daysInMonth(Number(next.y), Number(next.m)))).padStart(2, "0");
      onChange(`${next.y}-${String(next.m).padStart(2, "0")}-${dd}`);
    } else {
      onChange("");   // incomplete date
    }
  }

  const selStyle = {
    padding: "10px 8px", borderRadius: "8px", border: "1px solid #cbd5e1",
    fontSize: "14px", boxSizing: "border-box", background: "white", cursor: "pointer",
  };

  return (
    <div style={style}>
      {label && (
        <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
          {label}{required ? " *" : ""}
          <span style={{ color: "#94a3b8", fontSize: "11px", marginLeft: "6px" }}>DD/MM/YYYY</span>
        </label>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1.2fr", gap: "6px" }}>
        <select value={parts.d} onChange={(e) => update({ ...parts, d: e.target.value })} style={selStyle} required={required}>
          <option value="">DD</option>
          {days.map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}
        </select>
        <select value={parts.m} onChange={(e) => update({ ...parts, m: e.target.value })} style={selStyle} required={required}>
          <option value="">MM</option>
          {MONTHS.map((nm, i) => (
            <option key={nm} value={i + 1}>{String(i + 1).padStart(2, "0")} · {nm}</option>
          ))}
        </select>
        <select value={parts.y} onChange={(e) => update({ ...parts, y: e.target.value })} style={selStyle} required={required}>
          <option value="">YYYY</option>
          {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
        </select>
      </div>
    </div>
  );
}
