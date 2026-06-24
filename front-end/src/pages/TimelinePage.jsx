import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getTimeline } from "../services/api";
import { fmtDate } from "../components/DateInput";

const KIND_STYLE = {
  event: { color: "#2563eb", bg: "#eff6ff", icon: "📅", label: "Event" },
  task:  { color: "#16a34a", bg: "#f0fdf4", icon: "✓",  label: "Task"  },
  note:  { color: "#7c3aed", bg: "#faf5ff", icon: "📝", label: "Note"  },
};

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
      <div style={{ marginBottom: "24px" }}>
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
          Unified Timeline
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Timeline</h1>
        <p style={{ color: "#64748b", marginTop: "10px" }}>
          Events, tasks and notes in one chronological view. Click any item to open its source.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {["all", "event", "task", "note"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 18px", borderRadius: "10px", border: "none",
              background: filter === f ? "#2563eb" : "#f1f5f9",
              color: filter === f ? "white" : "#475569",
              fontWeight: 600, cursor: "pointer", fontSize: "14px", textTransform: "capitalize",
            }}
          >
            {f === "all" ? "All" : `${f}s`}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#94a3b8" }}>Loading timeline…</p>}
      {!loading && filtered.length === 0 && (
        <div style={{ background: "white", borderRadius: "20px", padding: "60px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "#94a3b8", fontSize: "18px" }}>Nothing on the timeline yet.</p>
        </div>
      )}

      {sortedKeys.map((dateKey) => (
        <div key={dateKey} style={{ marginBottom: "28px" }}>
          <h3 style={{
            margin: "0 0 14px", color: "#475569",
            fontSize: "15px", position: "sticky", top: 0,
          }}>
            {dateKey === "Undated" ? "Undated" : fmtDate(dateKey)}
          </h3>

          <div style={{ borderLeft: "2px solid #e2e8f0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {groups[dateKey].map((item) => {
              const s = KIND_STYLE[item.kind] || KIND_STYLE.note;
              return (
                <motion.div
                  key={`${item.kind}-${item.id}`}
                  whileHover={{ x: 4 }}
                  onClick={() => goToSource(item)}
                  style={{
                    background: "white", borderRadius: "14px",
                    padding: "14px 18px", boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
                    cursor: "pointer", position: "relative",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  {/* timeline dot */}
                  <span style={{
                    position: "absolute", left: "-29px", top: "50%", transform: "translateY(-50%)",
                    width: "14px", height: "14px", borderRadius: "50%",
                    background: s.color, border: "3px solid white",
                  }} />
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "18px" }}>{s.icon}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: "13px" }}>
                        {item.subtitle}{item.time ? ` · ${String(item.time).slice(0,5)}` : ""}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    background: s.bg, color: s.color,
                    padding: "3px 12px", borderRadius: "99px",
                    fontSize: "12px", fontWeight: 600,
                  }}>
                    {s.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
