import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard, getAuditLog, checkServices, getDigest } from "../services/api";
import { AttentionPanel } from "../components/NeedsAttention";
import AiStatusBadge from "../components/AiStatusBadge";

const QUICK_ACTIONS = [
  { label: "Upload document", icon: "📄", to: "/upload" },
  { label: "Voice note",      icon: "🎙", to: "/voice" },
  { label: "Ask AI",          icon: "💬", to: "/ask" },
  { label: "New event",       icon: "📅", to: "/calendar" },
  { label: "New task",        icon: "✓",  to: "/tasks" },
];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(t) {
  return t ? t.slice(0, 5) : "";
}
function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── small building blocks (token-styled) ──────────────────────
function Stat({ n, label, onClick, tone }) {
  const color = tone === "hot" ? "var(--accent)" : tone === "warn" ? "var(--warn)" : "var(--text)";
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", boxShadow: "var(--shadow)", padding: "22px 24px", cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 38, fontWeight: 680, letterSpacing: "-.5px", color }}>{n}</div>
      <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 4 }}>{label}</div>
    </button>
  );
}

function Card({ title, count, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px" }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>{title}</h2>
        {count != null && <span style={{ fontSize: 14, color: "var(--muted)" }}>{count}</span>}
      </div>
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden",
        }}
      >
        {children}
      </div>
    </section>
  );
}

// Morning-brief stat chip — small pill that jumps to the relevant page.
function BriefChip({ icon, n, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 99, padding: "6px 14px", cursor: "pointer",
        fontSize: 13.5, fontWeight: 600, color: "var(--text-2)",
        transition: "border-color .12s ease, box-shadow .12s ease",
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ color: "var(--text)", fontWeight: 700 }}>{n}</span>
      {label}
    </button>
  );
}

// One step of the first-run guide strip.
function GuideStep({ n, icon, title, desc, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ flex: "1 1 210px", minWidth: 0, display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 99, flexShrink: 0, marginTop: 1,
        background: "var(--accent-soft)", color: "var(--accent)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 12.5, fontWeight: 700,
      }}>
        {n}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 650 }}>{icon} {title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
      </div>
    </div>
  );
}

function Row({ children, onClick, last }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dash, setDash] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState("");
  const [ai, setAi] = useState(null);
  // undefined = loading, null = failed/empty (card hidden), object = loaded.
  const [digest, setDigest] = useState(undefined);
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem("onboarding-dismissed") !== "1"; } catch { return false; }
  });

  useEffect(() => {
    getDashboard().then(setDash).catch((e) => setError(e.message));
    getAuditLog({ limit: 5 }).then(setAudit).catch(() => {});
    checkServices().then((s) => setAi(s?.ai_extraction === "ready")).catch(() => setAi(false));
    // Morning brief — endpoint may not exist yet; hide the card on any failure.
    getDigest()
      .then((d) => setDigest(d && (d.brief || d.counts) ? d : null))
      .catch(() => setDigest(null));
  }, []);

  function dismissGuide() {
    try { localStorage.setItem("onboarding-dismissed", "1"); } catch { /* private mode */ }
    setShowGuide(false);
  }

  const todayEvents  = dash?.today_events         ?? [];
  const openTasks    = dash?.open_tasks            ?? [];
  const pendingConf  = dash?.pending_confirmations ?? [];
  const pendingReply = dash?.pending_replies       ?? [];
  const v = (arr) => (dash ? arr.length : "…");

  return (
    <div>
      {/* Greeting + AI status */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 680, margin: 0 }}>{greetingByHour()}</h1>
        <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "6px 0 0" }}>
          {error ? `Could not load dashboard — ${error}` : "Here's what needs you today."}
        </p>
        {/* Permanent "AI online" pill removed per tester feedback (#22); the badge
            now appears only when the AI is actually unreachable. */}
        {ai === false && <AiStatusBadge online={false} style={{ marginTop: 14 }} />}
      </div>

      {/* Morning brief — daily digest; hidden entirely if /digest is unavailable */}
      {digest !== null && (
        <section
          style={{
            background: "var(--accent-soft)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", padding: "18px 22px", marginBottom: 20,
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 650 }}>☀️ Your morning brief</h2>
          {digest === undefined ? (
            <>
              <style>{`@keyframes briefPulse { 0%,100% { opacity:.4 } 50% { opacity:.9 } }`}</style>
              <div style={{
                height: 14, width: "58%", borderRadius: 7, background: "var(--border)",
                animation: "briefPulse 1.4s ease-in-out infinite",
              }} />
            </>
          ) : (
            <>
              {digest.brief && (
                <p style={{ margin: "0 0 12px", fontSize: 15.5, lineHeight: 1.55, color: "var(--text)" }}>
                  {digest.brief}
                </p>
              )}
              {digest.counts && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <BriefChip icon="📅" n={digest.counts.meetings_today ?? 0}  label="meetings today"        onClick={() => navigate("/calendar")} />
                  <BriefChip icon="↩"  n={digest.counts.replies_due_week ?? 0} label="replies due this week" onClick={() => navigate("/letters")} />
                  <BriefChip icon="⚠"  n={digest.counts.overdue_tasks ?? 0}    label="overdue"               onClick={() => navigate("/tasks")} />
                  <BriefChip icon="📥" n={digest.counts.awaiting_confirm ?? 0} label="awaiting confirm"      onClick={() => navigate("/inbox")} />
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* First-run guide — three steps, dismissible, remembered in localStorage */}
      {showGuide && (
        <section
          style={{
            position: "relative", display: "flex", gap: 20, flexWrap: "wrap",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
            padding: "14px 44px 14px 20px", marginBottom: 24,
          }}
        >
          <GuideStep n={1} icon="📄" title="Capture"
            desc="Photograph or upload a letter, or speak a note."
            onClick={() => navigate("/upload")} />
          <GuideStep n={2} icon="✅" title="Confirm"
            desc="Check what the AI read, fix anything."
            onClick={() => navigate("/inbox")} />
          <GuideStep n={3} icon="📅" title="Done"
            desc="It's on your calendar with reminders."
            onClick={() => navigate("/calendar")} />
          <button
            onClick={dismissGuide}
            aria-label="Dismiss guide"
            style={{
              position: "absolute", top: 8, right: 10, background: "transparent",
              border: "none", cursor: "pointer", color: "var(--muted)",
              fontSize: 16, lineHeight: 1, padding: 6,
            }}
          >
            ✕
          </button>
        </section>
      )}

      {/* Needs attention — overdue reconciliation + slipping items */}
      <AttentionPanel />

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 30 }}>
        <Stat n={v(todayEvents)}  label="Meetings today"        tone="hot"  onClick={() => navigate("/calendar")} />
        <Stat n={v(openTasks)}    label="Open tasks"                        onClick={() => navigate("/tasks")} />
        <Stat n={v(pendingConf)}  label="Awaiting confirmation"            onClick={() => navigate("/inbox")} />
        <Stat n={v(pendingReply)} label="Pending replies"       tone="warn" onClick={() => navigate("/tasks")} />
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 30 }}>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(a.to)}
            style={{
              display: "flex", alignItems: "center", gap: 10, background: "var(--surface)",
              border: "1px solid var(--border)", padding: "12px 18px", borderRadius: "var(--radius-sm)",
              cursor: "pointer", fontWeight: 600, fontSize: 15, color: "var(--text)", boxShadow: "var(--shadow)",
            }}
          >
            <span style={{ fontSize: 19 }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Today's schedule */}
      <Card title="Today's schedule" count={`${todayEvents.length} event${todayEvents.length === 1 ? "" : "s"}`}>
        {todayEvents.length === 0 ? (
          <Row last><span style={{ color: "var(--muted)" }}>No events scheduled for today.</span></Row>
        ) : (
          todayEvents.map((ev, i) => (
            <Row key={ev.id} onClick={() => navigate("/calendar")} last={i === todayEvents.length - 1}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)", minWidth: 100, marginRight: 10 }}>
                {ev.event_time ? (ev.event_time.slice(0, 5) + (ev.event_end_time ? `–${ev.event_end_time.slice(0, 5)}` : "")) : "—"}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 580 }}>{ev.title}</div>
                {ev.venue && <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 2 }}>{ev.venue}</div>}
              </div>
              <span
                style={{
                  marginLeft: "auto", fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 99,
                  background: "var(--accent-soft)", color: "var(--accent)",
                }}
              >
                {ev.source === "manual" ? "Manual" : "Meeting"}
              </span>
            </Row>
          ))
        )}
      </Card>

      {/* Open tasks */}
      {openTasks.length > 0 && (
        <Card title="Open tasks" count={`showing ${Math.min(5, openTasks.length)} of ${openTasks.length}`}>
          {openTasks.slice(0, 5).map((t, i, arr) => (
            <Row key={t.id} onClick={() => navigate("/tasks")} last={i === arr.length - 1}>
              <span style={{ fontSize: 16.5, fontWeight: 550 }}>{t.title}</span>
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 14 }}>
                {t.due_date ? `Due ${fmtDate(t.due_date)}` : "No due date"}
              </span>
            </Row>
          ))}
        </Card>
      )}

      {/* Pending confirmations → Inbox */}
      {pendingConf.length > 0 && (
        <Card title="Awaiting your confirmation" count={`${pendingConf.length} document(s)`}>
          {pendingConf.map((item, i, arr) => (
            <Row key={item.job_id} onClick={() => navigate(`/confirm/${item.job_id}`)} last={i === arr.length - 1}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 580 }}>{item.filename}</div>
                <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 2 }}>
                  Uploaded {fmtDate(item.uploaded_at)}
                  {item.extraction_count > 0 && ` · ${item.extraction_count} item(s) to confirm`}
                </div>
              </div>
              <span style={{ marginLeft: "auto", color: "var(--accent)", fontWeight: 600, fontSize: 15 }}>Review →</span>
            </Row>
          ))}
        </Card>
      )}

      {/* Recent activity */}
      <Card title="Recent activity">
        {audit.length === 0 ? (
          <Row last><span style={{ color: "var(--muted)" }}>No activity yet. Capture a document to get started.</span></Row>
        ) : (
          audit.map((entry, i, arr) => (
            <Row key={entry.id} last={i === arr.length - 1}>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{entry.action}</span>{" "}
                <span style={{ color: "var(--text-2)" }}>
                  {entry.entity_type} #{entry.entity_id}
                  {entry.detail ? ` — ${entry.detail}` : ""}
                </span>
              </div>
              <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 13 }}>{fmtDate(entry.created_at)}</span>
            </Row>
          ))
        )}
      </Card>
    </div>
  );
}
