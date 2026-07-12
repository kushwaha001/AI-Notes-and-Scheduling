import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { useState, useEffect } from "react";
import { getEvents, getTasks } from "../services/api";
import { useTheme } from "../theme/ThemeProvider";

// Two colour-coded "calendars": events (coral, matching the app accent) and
// tasks (green). schedule-x needs literal hex, so these mirror the token palette.
const CALENDARS = {
  event: {
    colorName: "event",
    lightColors: { main: "#D97757", container: "#F6E9E2", onContainer: "#7a2f16" },
    darkColors:  { main: "#E08462", container: "#3B322D", onContainer: "#F6E9E2" },
  },
  task: {
    colorName: "task",
    lightColors: { main: "#4F7A52", container: "#E4EFE1", onContainer: "#14532d" },
    darkColors:  { main: "#7FA97F", container: "#2A342A", onContainer: "#E4EFE1" },
  },
};

function eventToSX(e) {
  if (!e.event_date) return null;
  const dateStr = String(e.event_date).split("T")[0];
  if (e.event_time) {
    try {
      const time = String(e.event_time).slice(0, 5);
      // schedule-x needs a ZonedDateTime (a PlainDateTime crashes it) and renders
      // it by its UTC INSTANT. The stored time is an IST wall-clock, so anchor it
      // to UTC — that makes the literal time (e.g. 14:30) show as 14:30 for every
      // viewer. Anchoring to Asia/Kolkata displayed the UTC-shifted 09:00.
      const endT = e.event_end_time ? String(e.event_end_time).slice(0, 5) : null;
      const start = Temporal.ZonedDateTime.from(`${dateStr}T${time}:00[UTC]`);
      const end = endT
        ? Temporal.ZonedDateTime.from(`${dateStr}T${endT}:00[UTC]`)
        : start.add({ hours: 1 });
      return { id: `event-${e.id}`, title: e.title, start, end, calendarId: "event" };
    } catch { /* fall back to all-day */ }
  }
  try {
    const d = Temporal.PlainDate.from(dateStr);
    return { id: `event-${e.id}`, title: e.title, start: d, end: d, calendarId: "event" };
  } catch { return null; }
}

function taskToSX(t) {
  if (!t.due_date) return null;  // tasks without a due date don't appear on the calendar
  const dateStr = String(t.due_date).split("T")[0];
  if (t.start_time) {
    try {
      const time = String(t.start_time).slice(0, 5);
      const endT = t.end_time ? String(t.end_time).slice(0, 5) : null;
      const start = Temporal.ZonedDateTime.from(`${dateStr}T${time}:00[UTC]`);
      const end = endT
        ? Temporal.ZonedDateTime.from(`${dateStr}T${endT}:00[UTC]`)
        : start.add({ hours: 1 });
      return { id: `task-${t.id}`, title: `📋 ${t.title}`, start, end, calendarId: "task" };
    } catch { /* fall back to all-day */ }
  }
  try {
    const d = Temporal.PlainDate.from(dateStr);
    return { id: `task-${t.id}`, title: `📋 ${t.title}`, start: d, end: d, calendarId: "task" };
  } catch { return null; }
}

function InnerCalendar({ events, onEventClick, view, isDark }) {
  const calendar = useCalendarApp({
    views       : [createViewMonthGrid(), createViewWeek(), createViewDay()],
    defaultView : view || "month-grid",
    selectedDate: Temporal.Now.plainDateISO("Asia/Kolkata"),   // "today" in IST
    locale      : "en-GB",   // day-first date formatting (DD/MM/YYYY)
    isDark,                  // schedule-x dark theme, driven by ThemeProvider
    calendars   : CALENDARS,
    events,
    callbacks: {
      onEventClick(calendarEvent) {
        if (onEventClick) onEventClick(calendarEvent);
      },
      // Never collapse to the narrow single-day layout. schedule-x switches
      // month→day when the container is under ~700px, but at our large default
      // UI zoom the layout viewport is narrow enough to trip that even on a wide
      // desktop — which made "Month" silently render a day grid. Desktop-only, so
      // we always keep the chosen view.
      isCalendarSmall: () => false,
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
    return <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>Loading calendar…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: "30px", borderRadius: "16px", background: "var(--danger-soft)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
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
      key={`${view || "month-grid"}|${isDark ? "d" : "l"}|${sxEvents.map((e) => e.id).join(",")}`}
      events={sxEvents}
      onEventClick={onEventClick}
      view={view}
      isDark={isDark}
    />
  );
}
