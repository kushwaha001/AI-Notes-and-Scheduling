import { useEffect, useState } from "react";
import { getEvents, getPendingReplies } from "../services/api";

/**
 * FR-37 — Browser notification reminders.
 * Known limitation (per spec): fires only while the browser/tab is open and
 * permission is granted; the dashboard/timeline remains the source of truth.
 * The Notification API needs a secure context (https or localhost) — on plain
 * http it's simply unavailable and everything here degrades silently.
 */

const CHECK_INTERVAL_MS = 60 * 1000;         // event reminders: poll once a minute
const REPLY_CHECK_MS    = 10 * 60 * 1000;    // replies due: every 10 minutes
const LEAD_MINUTES      = [60, 15];          // remind 1h and 15m before

const fired = new Set();                    // de-dupe per session

const notifiable = () =>
  typeof Notification !== "undefined" && window.isSecureContext;

function eventDateTime(ev) {
  if (!ev.event_date) return null;
  const date = String(ev.event_date).split("T")[0];
  const time = ev.event_time ? String(ev.event_time).slice(0, 5) : "09:00";
  const dt = new Date(`${date}T${time}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

const DISMISS_KEY = "reminders_prompt_dismissed";

export default function NotificationManager() {
  const [perm, setPerm] = useState(
    notifiable() ? Notification.permission : "unsupported"
  );
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1"
  );

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  // periodic reminder check
  useEffect(() => {
    if (perm !== "granted") return;

    async function check() {
      let events = [];
      try { events = await getEvents({ status: "upcoming" }); } catch { return; }

      const now = Date.now();
      events.forEach((ev) => {
        const dt = eventDateTime(ev);
        if (!dt) return;
        const minsUntil = Math.round((dt.getTime() - now) / 60000);
        LEAD_MINUTES.forEach((lead) => {
          // fire when within the minute of the lead time
          if (minsUntil <= lead && minsUntil > lead - 1) {
            const key = `${ev.id}-${lead}`;
            if (fired.has(key)) return;
            fired.add(key);
            new Notification(`Reminder: ${ev.title}`, {
              body: `Starts in ${lead} minutes${ev.venue ? ` · ${ev.venue}` : ""}`,
              tag : key,
            });
          }
        });
      });
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [perm]);

  // Replies due — one desktop notification per letter per day, so an
  // approaching reply-by date can't slip by unnoticed.
  useEffect(() => {
    if (perm !== "granted") return;

    async function checkReplies() {
      let rows = [];
      try { rows = await getPendingReplies(); } catch { return; }
      if (!Array.isArray(rows)) return;
      const today = new Date().toISOString().slice(0, 10);
      rows.forEach((r) => {
        const id = r.id ?? r.doc_id ?? r.document_id;
        const due = r.reply_by || r.due_date || r.deadline;
        if (!id || !due) return;
        // Only nag when it's actually near: due within 3 days, or overdue.
        const days = (new Date(String(due).split("T")[0]) - new Date()) / 86400000;
        if (days > 3) return;
        const key = `reply-${id}-${today}`;
        try {
          if (localStorage.getItem(key)) return;      // once per letter per day
          localStorage.setItem(key, "1");
        } catch { /* private mode — fall back to session de-dupe */
          if (fired.has(key)) return; fired.add(key);
        }
        const name = r.filename || r.title || r.ref_number || `letter #${id}`;
        new Notification(`Reply due: ${name}`, {
          body: `Reply by ${String(due).split("T")[0]} — open Letters to draft it.`,
          tag : key,
        });
      });
    }

    checkReplies();
    const id = setInterval(checkReplies, REPLY_CHECK_MS);
    return () => clearInterval(id);
  }, [perm]);

  // Hide once granted, unsupported, or the user dismissed/blocked it
  if (perm === "unsupported" || perm === "granted" || perm === "denied" || dismissed)
    return null;

  // small unobtrusive permission prompt
  return (
    <div
      style={{
        position: "fixed", bottom: "20px", right: "20px", zIndex: 1000,
        background: "var(--surface)", borderRadius: "14px", padding: "16px 20px",
        boxShadow: "var(--shadow)", maxWidth: "300px",
        border: "1px solid var(--border)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: "14px", color: "var(--text)", fontWeight: 600 }}>
        Enable event reminders?
      </p>
      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--muted)" }}>
        Get a browser notification before your meetings.
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => Notification.requestPermission().then((p) => { setPerm(p); if (p !== "granted") dismiss(); })}
          style={{ background: "var(--accent)", color: "white", border: "none", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
        >
          Enable
        </button>
        <button
          onClick={dismiss}
          style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}
        >
          Don't ask again
        </button>
      </div>
    </div>
  );
}
