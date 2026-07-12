import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAuditLog } from "../services/api";
import { fmtTime, IST_TZ } from "../components/DateInput";

const ACTION_COLOR = {
  uploaded:     "#2563eb",
  extracted:    "#0891b2",
  confirmed:    "#16a34a",
  dismissed:    "#ea580c",
  edited:       "#7c3aed",
  rescheduled:  "#7c3aed",
  trashed:      "#dc2626",
  restored:     "#16a34a",
  purged:       "#dc2626",
  manual_entry: "#2563eb",
  status_changed: "#0891b2",
};

const ENTITY_TYPES = ["document", "audio", "event", "task", "note"];

export default function AuditLogPage() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [entityType, setEntityType] = useState("");
  const [limit, setLimit]       = useState(100);

  function load() {
    setLoading(true);
    setError("");
    getAuditLog({ entity_type: entityType || undefined, limit })
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [entityType, limit]);

  // group by calendar day for readability
  const groups = {};
  entries.forEach((e) => {
    const day = new Date(e.created_at.includes("T") && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(e.created_at)
      ? e.created_at + "Z" : e.created_at
    ).toLocaleDateString("en-GB", {
      timeZone: IST_TZ, day: "2-digit", month: "short", year: "numeric",
    });
    (groups[day] ||= []).push(e);
  });

  return (
    <>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
            Audit Trail
          </p>
          <h1 style={{ margin: 0, fontSize: "42px" }}>Audit Log</h1>
          <p style={{ color: "var(--muted)", marginTop: "10px" }}>
            A complete, timestamped record of every action — uploads, extractions,
            confirmations, edits, reschedules, deletions, restores and status changes.
          </p>
        </div>
        <button onClick={load}
          style={{ background: "var(--accent)", color: "white", border: "none", padding: "10px 20px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "22px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setEntityType("")}
          style={{
            padding: "8px 16px", borderRadius: "10px", border: "none",
            background: entityType === "" ? "var(--accent)" : "var(--surface-2)",
            color: entityType === "" ? "white" : "var(--text-2)",
            fontWeight: 600, cursor: "pointer", fontSize: "14px",
          }}>
          All
        </button>
        {ENTITY_TYPES.map((t) => (
          <button key={t} onClick={() => setEntityType(t)}
            style={{
              padding: "8px 16px", borderRadius: "10px", border: "none",
              background: entityType === t ? "var(--accent)" : "var(--surface-2)",
              color: entityType === t ? "white" : "var(--text-2)",
              fontWeight: 600, cursor: "pointer", fontSize: "14px", textTransform: "capitalize",
            }}>
            {t}s
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
          style={{ padding: "8px 12px", borderRadius: "10px", border: "1px solid var(--border-2)", fontSize: "14px" }}>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
          <option value={1000}>Last 1000</option>
        </select>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--muted)" }}>Loading audit log…</p>}

      {!loading && entries.length === 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "20px", padding: "60px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "var(--muted)", fontSize: "18px" }}>No activity recorded yet.</p>
        </div>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <div key={day} style={{ marginBottom: "24px" }}>
          <h3 style={{ margin: "0 0 12px", color: "var(--text-2)", fontSize: "15px" }}>{day}</h3>
          <div style={{ background: "var(--surface)", borderRadius: "18px", padding: "8px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)" }}>
            {items.map((e) => (
              <motion.div
                key={e.id}
                whileHover={{ x: 3 }}
                style={{
                  display: "flex", alignItems: "center", gap: "14px",
                  padding: "12px 0", borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{
                  background: `${ACTION_COLOR[e.action] || "#64748b"}18`,
                  color: ACTION_COLOR[e.action] || "#64748b",
                  padding: "4px 12px", borderRadius: "99px",
                  fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
                  textTransform: "capitalize",
                }}>
                  {e.action.replace("_", " ")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "14px" }}>
                    <strong style={{ textTransform: "capitalize" }}>{e.entity_type}</strong>
                    {e.entity_name
                      ? <span style={{ fontWeight: 600 }}>{` "${e.entity_name}"`}</span>
                      : ` #${e.entity_id}`}
                    {e.detail ? <span style={{ color: "var(--muted)" }}> — {e.detail}</span> : ""}
                  </span>
                </div>
                <span style={{ color: "var(--muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                  {fmtTime(e.created_at)}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
