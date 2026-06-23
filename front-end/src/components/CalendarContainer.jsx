import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { useState, useEffect } from "react";
import { getEvents } from "../services/api";

// Temporal is available globally via temporal-polyfill/global (main.jsx)
function plainDate(dateStr) {
  return Temporal.PlainDate.from(dateStr);
}

function toSXEvent(e) {
  if (!e.event_date) return null;
  const dateStr = String(e.event_date).split("T")[0]; // "YYYY-MM-DD"

  // Timed event → ZonedDateTime (needed by week/day views)
  if (e.event_time) {
    try {
      const timeStr = String(e.event_time).slice(0, 5); // "HH:MM"
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const start = Temporal.ZonedDateTime.from(`${dateStr}T${timeStr}:00[${tz}]`);
      const end = start.add({ hours: 1 });
      return { id: String(e.id), title: e.title, start, end };
    } catch {
      /* fall through to all-day so the event still shows */
    }
  }

  // All-day event → PlainDate
  try {
    const d = plainDate(dateStr);
    return { id: String(e.id), title: e.title, start: d, end: d };
  } catch {
    return null;
  }
}

function InnerCalendar({ events, onEventClick }) {
  const calendar = useCalendarApp({
    views       : [createViewMonthGrid(), createViewWeek(), createViewDay()],
    defaultView : "month-grid",
    selectedDate: Temporal.Now.plainDateISO(),
    events,
    callbacks: {
      onEventClick(calendarEvent) {
        if (onEventClick) onEventClick(calendarEvent);
      },
    },
  });

  return (
    <div style={{ borderRadius: "16px", overflow: "hidden" }}>
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}

export default function CalendarContainer({ onEventCount, refreshKey, onEventClick }) {
  const [sxEvents, setSxEvents] = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    setLoaded(false);
    setError("");
    getEvents()
      .then((events) => {
        const mapped = events.map(toSXEvent).filter(Boolean);
        setSxEvents(mapped);
        if (onEventCount) onEventCount(mapped.length);
      })
      .catch((e) => {
        setError(
          e.message?.includes("fetch")
            ? "Cannot reach the backend on http://localhost:9000 — start the API server."
            : e.message
        );
      })
      .finally(() => setLoaded(true));
  }, [refreshKey]);

  if (!loaded) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
        Loading calendar…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "30px", borderRadius: "16px",
        background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
      }}>
        <strong>Calendar could not load.</strong>
        <p style={{ margin: "8px 0 0", fontSize: "14px" }}>{error}</p>
      </div>
    );
  }

  return (
    <InnerCalendar
      key={sxEvents.map((e) => e.id).join(",")}
      events={sxEvents}
      onEventClick={onEventClick}
    />
  );
}
