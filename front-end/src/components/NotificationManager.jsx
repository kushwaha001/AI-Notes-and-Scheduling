import { useEffect, useState } from "react";
import { getEvents } from "../services/api";

/**
 * FR-37 — Browser notification reminders.
 * Known limitation (per spec): fires only while the browser/tab is open and
 * permission is granted; the dashboard/timeline remains the source of truth.
 */

const CHECK_INTERVAL_MS = 60 * 1000;       // poll once a minute
const LEAD_MINUTES      = [60, 15];         // remind 1h and 15m before

const fired = new Set();                    // de-dupe per session

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
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
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

  // Hide once granted, unsupported, or the user dismissed/blocked it
  if (perm === "unsupported" || perm === "granted" || perm === "denied" || dismissed)
    return null;

  // small unobtrusive permission prompt
  return (
    <div
      style={{
        position: "fixed", bottom: "20px", right: "20px", zIndex: 1000,
        background: "white", borderRadius: "14px", padding: "16px 20px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.15)", maxWidth: "300px",
        border: "1px solid #e2e8f0",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: "14px", color: "#0f172a", fontWeight: 600 }}>
        Enable event reminders?
      </p>
      <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#64748b" }}>
        Get a browser notification before your meetings.
      </p>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => Notification.requestPermission().then((p) => { setPerm(p); if (p !== "granted") dismiss(); })}
          style={{ background: "#2563eb", color: "white", border: "none", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
        >
          Enable
        </button>
        <button
          onClick={dismiss}
          style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}
        >
          Don't ask again
        </button>
      </div>
    </div>
  );
}
