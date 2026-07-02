import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { useState, useEffect } from "react";
import { getEvents, getTasks } from "../services/api";

// Two colour-coded "calendars": events (blue) and tasks (green)
const CALENDARS = {
  event: {
    colorName: "event",
    lightColors: { main: "#2563eb", container: "#dbeafe", onContainer: "#1e3a8a" },
    darkColors:  { main: "#93c5fd", container: "#1e3a8a", onContainer: "#dbeafe" },
  },
  task: {
    colorName: "task",
    lightColors: { main: "#16a34a", container: "#dcfce7", onContainer: "#14532d" },
    darkColors:  { main: "#86efac", container: "#14532d", onContainer: "#dcfce7" },
  },
};

function eventToSX(e) {
  if (!e.event_date) return null;
  const dateStr = String(e.event_date).split("T")[0];
  if (e.event_time) {
    try {
      const time = String(e.event_time).slice(0, 5);
      // Render event times in IST (UTC+5:30) regardless of the machine's clock.
      const start = Temporal.ZonedDateTime.from(`${dateStr}T${time}:00[Asia/Kolkata]`);
      return { id: `event-${e.id}`, title: e.title, start, end: start.add({ hours: 1 }), calendarId: "event" };
    } catch { /* fall back to all-day */ }
  }
  try {
    const d = Temporal.PlainDate.from(dateStr);
    return { id: `event-${e.id}`, title: e.title, start: d, end: d, calendarId: "event" };
  } catch { return null; }
}

function taskToSX(t) {
  if (!t.due_date) return null;  // tasks without a due date don't appear on the calendar
  try {
    const d = Temporal.PlainDate.from(String(t.due_date).split("T")[0]);
    return { id: `task-${t.id}`, title: `📋 ${t.title}`, start: d, end: d, calendarId: "task" };
  } catch { return null; }
}

function InnerCalendar({ events, onEventClick, view }) {
  const calendar = useCalendarApp({
    views       : [createViewMonthGrid(), createViewWeek(), createViewDay()],
    defaultView : view || "month-grid",
    selectedDate: Temporal.Now.plainDateISO("Asia/Kolkata"),   // "today" in IST
    locale      : "en-GB",   // day-first date formatting (DD/MM/YYYY)
    calendars   : CALENDARS,
    events,
    callbacks: {
      onEventClick(calendarEvent) {
        if (onEventClick) onEventClick(calendarEvent);
      },
    },
  });

  // Switch the schedule-x view when the page's view switcher changes
  useEffect(() => {
    if (view && calendar?.calendarControls?.setView) {
      calendar.calendarControls.setView(view);
    }
  }, [view]);

  return (
    <div style={{ borderRadius: "16px", overflow: "hidden" }}>
      <ScheduleXCalendar calendarApp={calendar} />
    </div>
  );
}

export default function CalendarContainer({ onCounts, refreshKey, onEventClick, view }) {
  const [sxEvents, setSxEvents] = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    setLoaded(false);
    setError("");
    Promise.all([getEvents(), getTasks({})])
      .then(([events, tasks]) => {
        const mappedEvents = events.map(eventToSX).filter(Boolean);
        const mappedTasks  = tasks.map(taskToSX).filter(Boolean);
        setSxEvents([...mappedEvents, ...mappedTasks]);
        if (onCounts) onCounts({ events: mappedEvents.length, tasks: mappedTasks.length });
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
    return <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading calendar…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: "30px", borderRadius: "16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
        <strong>Calendar could not load.</strong>
        <p style={{ margin: "8px 0 0", fontSize: "14px" }}>{error}</p>
      </div>
    );
  }

  // Key by view AND event set so the schedule-x app is rebuilt with the correct
  // defaultView whenever the user switches Month/Week/Day. (Relying on setView
  // alone was unreliable — switching directly between month/week/day sometimes
  // did nothing; a remount always applies the requested view.)
  return (
    <InnerCalendar
      key={`${view || "month-grid"}|${sxEvents.map((e) => e.id).join(",")}`}
      events={sxEvents}
      onEventClick={onEventClick}
      view={view}
    />
  );
}
