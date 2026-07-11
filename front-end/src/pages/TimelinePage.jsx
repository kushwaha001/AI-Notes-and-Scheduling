import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getTimeline } from "../services/api";
import { fmtDate } from "../components/DateInput";

const KIND_STYLE = {
  event: { color: "var(--accent)", bg: "var(--accent-soft)", icon: "📅", label: "Event" },
  task:  { color: "var(--ok)", bg: "var(--ok-soft)", icon: "✓",  label: "Task"  },
  note:  { color: "var(--text-2)", bg: "var(--surface-2)", icon: "📝", label: "Note"  },
};

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function dayLabel(dateKey) {
  if (dateKey === "Undated") return { main: "Undated", sub: "" };
  const d = new Date(`${dateKey}T00:00:00`);
  if (isNaN(d)) return { main: dateKey, sub: "" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  let rel = "";
  if (diff === 0) rel = "Today";
  else if (diff === 1) rel = "Tomorrow";
  else if (diff === -1) rel = "Yesterday";
  else if (diff > 1) rel = `In ${diff} days`;
  else rel = `${-diff} days ago`;
  return { main: fmtDate(dateKey), sub: `${WEEKDAYS[d.getDay()]} · ${rel}` };
}

export default function TimelinePage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const navigate = useNavigate();

  useEffect(() => {
    getTimeline()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    all:   items.length,
    event: items.filter((i) => i.kind === "event").length,
    task:  items.filter((i) => i.kind === "task").length,
    note:  items.filter((i) => i.kind === "note").length,
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);

  function goToSource(item) {
    if (item.kind === "event") navigate("/calendar");
    else if (item.kind === "task") navigate("/tasks");
    else navigate("/notes");
  }

  // group by date
  const groups = {};
  filtered.forEach((item) => {
    const key = item.date || "Undated";
    (groups[key] ||= []).push(item);
  });
  const sortedKeys = Object.keys(groups).sort().reverse();

  return (
    <>
      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 20px" }}>
        Events, tasks and notes in one chronological view. Repeating events are
        shown once. Click any item to open its source.
      </p>

      {/* Filters with counts */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "28px", flexWrap: "wrap" }}>
        {[
          { key: "all",   label: "All" },
          { key: "event", label: "Events" },
          { key: "task",  label: "Tasks" },
          { key: "note",  label: "Notes" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: "8px 18px", borderRadius: "10px", border: "none",
              background: filter === f.key ? "var(--accent)" : "var(--surface-2)",
              color: filter === f.key ? "white" : "var(--text-2)",
              fontWeight: 600, cursor: "pointer", fontSize: "14px",
              display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            {f.label}
            <span style={{
              background: filter === f.key ? "rgba(255,255,255,0.25)" : "var(--border)",
              color: filter === f.key ? "white" : "#64748b",
              borderRadius: "99px", padding: "1px 8px", fontSize: "12px",
            }}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading timeline…</p>}
      {!loading && filtered.length === 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "20px", padding: "60px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "var(--muted)", fontSize: "18px" }}>Nothing on the timeline yet.</p>
        </div>
      )}

      {sortedKeys.map((dateKey) => {
        const { main, sub } = dayLabel(dateKey);
        return (
          <div key={dateKey} style={{ marginBottom: "26px" }}>
            {/* Date header */}
            <div style={{
              display: "flex", alignItems: "baseline", gap: "10px",
              marginBottom: "14px", paddingBottom: "8px",
              borderBottom: "1px solid var(--border)",
            }}>
              <h3 style={{ margin: 0, color: "var(--text)", fontSize: "17px", fontWeight: 700 }}>{main}</h3>
              {sub && <span style={{ color: "var(--muted)", fontSize: "13px" }}>{sub}</span>}
            </div>

            <div style={{ borderLeft: "2px solid var(--border)", paddingLeft: "22px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {groups[dateKey].map((item) => {
                const s = KIND_STYLE[item.kind] || KIND_STYLE.note;
                return (
                  <motion.div
                    key={`${item.kind}-${item.id}`}
                    whileHover={{ x: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}
                    onClick={() => goToSource(item)}
                    style={{
                      background: "var(--surface)", borderRadius: "14px",
                      padding: "14px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                      cursor: "pointer", position: "relative",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderLeft: `4px solid ${s.color}`,
                    }}
                  >
                    {/* timeline dot */}
                    <span style={{
                      position: "absolute", left: "-30px", top: "50%", transform: "translateY(-50%)",
                      width: "13px", height: "13px", borderRadius: "50%",
                      background: s.color, border: "3px solid white",
                      boxShadow: "0 0 0 1px var(--border)",
                    }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <span style={{ fontSize: "18px" }}>{s.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "15px" }}>{item.title}</strong>
                          {item.recurring && (
                            <span style={{
                              background: "var(--warn-soft)", color: "var(--warn)",
                              fontSize: "11px", fontWeight: 600,
                              padding: "1px 8px", borderRadius: "99px",
                            }}>
                              🔁 repeats · {item.occurrences}×
                            </span>
                          )}
                          {item.classification && item.classification !== "General" && (
                            <span style={{
                              background: "var(--surface-2)", color: "var(--text-2)",
                              fontSize: "11px", fontWeight: 600,
                              padding: "1px 8px", borderRadius: "99px",
                            }}>
                              {item.classification}
                            </span>
                          )}
                        </div>
                        {(item.subtitle || item.time) && (
                          <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: "13px" }}>
                            {item.subtitle}
                            {item.subtitle && item.time ? " · " : ""}
                            {item.time ? String(item.time).slice(0, 5) : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <span style={{
                      background: s.bg, color: s.color,
                      padding: "3px 12px", borderRadius: "99px",
                      fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
                    }}>
                      {s.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
