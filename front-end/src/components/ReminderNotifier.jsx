import { useEffect, useRef } from "react";
import { getDueReminders, markReminderDelivered } from "../services/api";

/**
 * FR-37 — Browser reminder notifications.
 *
 * Polls the backend for due reminders and raises a native browser notification
 * for each, then marks it delivered so it never fires twice. Renders nothing.
 *
 * Known limitation (per spec): this only works while the tab is open and the
 * user has granted notification permission — the dashboard remains the reliable
 * fallback, so failures here are silent by design.
 */
const POLL_MS = 60_000;

export default function ReminderNotifier() {
  const seen = useRef(new Set());

  useEffect(() => {
    // Ask for permission once, politely (no-op if already decided).
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    let alive = true;

    async function poll() {
      try {
        const due = await getDueReminders(1);
        for (const r of due) {
          if (seen.current.has(r.id)) continue;
          seen.current.add(r.id);

          const when = r.event_time
            ? `${r.event_date} at ${r.event_time.slice(0, 5)}`
            : r.event_date;
          const body = `${when}${r.venue ? ` · ${r.venue}` : ""}`;

          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(`Reminder: ${r.title}`, { body, tag: `rem-${r.id}` });
            } catch {
              /* notifications unavailable — dashboard is the fallback */
            }
          }
          // Mark delivered regardless so the queue stays clean even if the
          // browser blocked the popup.
          markReminderDelivered(r.id).catch(() => {});
        }
      } catch {
        /* backend/AI down — degraded mode, try again next tick (NFR-9) */
      }
      if (alive) timer = setTimeout(poll, POLL_MS);
    }

    let timer = setTimeout(poll, 3000); // small initial delay after load
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return null;
}
