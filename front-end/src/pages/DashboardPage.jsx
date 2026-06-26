import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard, getAuditLog, checkServices } from "../services/api";
import StatCard from "../components/StatCard";
import { motion } from "framer-motion";

const QUICK_ACTIONS = [
  { label: "Upload document", icon: "📄", to: "/upload",   color: "#2563eb" },
  { label: "Voice note",      icon: "🎙", to: "/voice",    color: "#7c3aed" },
  { label: "Ask AI",          icon: "💬", to: "/ask",      color: "#0891b2" },
  { label: "New event",       icon: "📅", to: "/calendar", color: "#16a34a" },
  { label: "New task",        icon: "✓",  to: "/tasks",    color: "#d97706" },
];

// shared hover style for clickable cards/rows
const clickable = { cursor: "pointer" };

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(t) {
  if (!t) return "";
  return t.slice(0, 5);
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function DashboardPage() {
  const navigate = useNavigate();
  const [dash, setDash]   = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState("");
  const [ai, setAi]       = useState(null);

  useEffect(() => {
    getDashboard()
      .then(setDash)
      .catch((e) => setError(e.message));

    getAuditLog({ limit: 5 })
      .then(setAudit)
      .catch(() => {});

    checkServices()
      .then((s) => setAi(s?.ai_extraction === "ready"))
      .catch(() => setAi(false));
  }, []);

  const todayEvents  = dash?.today_events          ?? [];
  const openTasks    = dash?.open_tasks             ?? [];
  const pendingConf  = dash?.pending_confirmations  ?? [];
  const pendingReply = dash?.pending_replies        ?? [];

  return (
    <>
      <div
        style={{
          position: "absolute",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(96,165,250,0.25), transparent)",
          filter: "blur(100px)",
          zIndex: -1,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: -60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        style={{ marginBottom: "60px" }}
      >
        <h1 style={{ fontSize: "64px", fontWeight: "800", margin: 0, lineHeight: 1 }}>
          {greetingByHour()}
        </h1>
        <p style={{ color: "#64748b", fontSize: "18px", marginTop: "16px" }}>
          {error
            ? `Could not load dashboard — ${error}`
            : "Manage meetings, deadlines, notes and documents from a single workspace."}
        </p>

        {/* AI status chip */}
        {ai != null && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "20px",
            background: ai ? "#ecfdf5" : "#fef2f2", color: ai ? "#065f46" : "#991b1b",
            border: `1px solid ${ai ? "#a7f3d0" : "#fecaca"}`,
            padding: "6px 14px", borderRadius: "99px", fontSize: "13px", fontWeight: 600,
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%",
              background: ai ? "#10b981" : "#ef4444", display: "inline-block" }} />
            {ai ? "AI extraction online" : "AI offline — manual entry still works (degraded mode)"}
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "48px" }}>
        {QUICK_ACTIONS.map((a) => (
          <motion.button key={a.to} onClick={() => navigate(a.to)}
            whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              background: "white", border: "1px solid #e2e8f0", borderLeft: `3px solid ${a.color}`,
              padding: "14px 20px", borderRadius: "14px", cursor: "pointer",
              fontWeight: 600, fontSize: "15px", color: "#1e293b",
              boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
            }}>
            <span style={{ fontSize: "20px" }}>{a.icon}</span>{a.label}
          </motion.button>
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "24px", marginBottom: "60px" }}>
        {[
          { title: "Events Today",         value: todayEvents.length,  subtitle: "Scheduled today",       delay: 0.2,  to: "/calendar", color: "#2563eb" },
          { title: "Open Tasks",           value: openTasks.length,    subtitle: "Need attention",        delay: 0.35, to: "/tasks",    color: "#16a34a" },
          { title: "Pending Confirmations",value: pendingConf.length,  subtitle: "Awaiting your review",  delay: 0.5,  to: "/upload",   color: "#d97706" },
          { title: "Pending Replies",      value: pendingReply.length, subtitle: "Reply tasks due soon",  delay: 0.65, to: "/tasks",    color: "#dc2626" },
        ].map(({ title, value, subtitle, delay, to, color }) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.6 }}
            whileHover={{ y: -4, scale: 1.02 }}
            onClick={() => navigate(to)}
            style={clickable}
          >
            <StatCard title={title} value={dash ? value : "…"} subtitle={subtitle} color={color} />
          </motion.div>
        ))}
      </div>

      {/* Today's schedule */}
      <div
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(10px)",
          borderRadius: "24px",
          padding: "24px",
          marginBottom: "40px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "24px" }}>Today's Schedule</h2>
        {todayEvents.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No events scheduled for today.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {todayEvents.map((ev) => (
              <motion.div
                key={ev.id}
                whileHover={{ x: 4 }}
                onClick={() => navigate("/calendar")}
                title="Open in Calendar"
                style={{
                  background: "rgba(255,255,255,0.6)",
                  backdropFilter: "blur(10px)",
                  padding: "20px",
                  borderRadius: "18px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, marginBottom: "6px" }}>{ev.title}</h3>
                  {ev.venue && <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>{ev.venue}</p>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {ev.event_time && (
                    <p style={{ margin: 0, color: "#2563eb", fontWeight: 600 }}>{fmtTime(ev.event_time)}</p>
                  )}
                  <span
                    style={{
                      fontSize: "12px",
                      background: ev.source === "manual" ? "#f0fdf4" : "#eff6ff",
                      color: ev.source === "manual" ? "#16a34a" : "#2563eb",
                      padding: "3px 10px",
                      borderRadius: "99px",
                    }}
                  >
                    {ev.source}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Open tasks */}
      {openTasks.length > 0 && (
        <div
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "24px",
            marginBottom: "40px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Open Tasks</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {openTasks.slice(0, 5).map((t) => (
              <motion.div
                key={t.id}
                whileHover={{ x: 4 }}
                onClick={() => navigate("/tasks")}
                title="Open in Tasks"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderRadius: "14px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 500 }}>{t.title}</span>
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                  {t.due_date ? `Due ${fmtDate(t.due_date)}` : "No due date"}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pending confirmations */}
      {pendingConf.length > 0 && (
        <div
          style={{
            background: "rgba(254,243,199,0.7)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "24px",
            marginBottom: "40px",
            border: "1px solid #fde68a",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "16px", color: "#92400e" }}>
            Pending AI Extractions — Needs Review
          </h2>
          {pendingConf.map((item) => (
            <motion.div
              key={item.job_id}
              whileHover={{ x: 4 }}
              onClick={() => navigate("/upload")}
              title="Review on Upload page"
              style={{ color: "#78350f", fontSize: "14px", marginBottom: "8px", cursor: "pointer" }}
            >
              <strong>{item.filename}</strong> — uploaded {fmtDate(item.uploaded_at)}
              {item.extraction_count > 0 && ` — ${item.extraction_count} item(s) to confirm`}
            </motion.div>
          ))}
          <p style={{ color: "#92400e", fontSize: "13px", marginTop: "12px", marginBottom: 0 }}>
            Go to <strong>Upload</strong> page to review and confirm.
          </p>
        </div>
      )}

      {/* Recent activity */}
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        style={{ marginBottom: "80px" }}
      >
        <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>Recent Activity</h2>
        <div
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          {audit.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No activity yet. Upload a document to get started.</p>
          ) : (
            audit.map((entry) => (
              <p key={entry.id} style={{ margin: "0 0 10px", color: "#475569" }}>
                <strong style={{ color: "#2563eb" }}>{entry.action}</strong>{" "}
                {entry.entity_type} #{entry.entity_id}
                {entry.detail ? ` — ${entry.detail}` : ""}
                <span style={{ float: "right", color: "#94a3b8", fontSize: "12px" }}>
                  {fmtDate(entry.created_at)}
                </span>
              </p>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}

export default DashboardPage;
