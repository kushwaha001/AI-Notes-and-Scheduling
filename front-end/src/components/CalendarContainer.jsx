import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
} from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";
import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";
import { useState } from "react";

function CalendarContainer() {




const [selectedEvent, setSelectedEvent] = useState(null);

  const calendar = useCalendarApp({
    views: [
      createViewDay(),
      createViewWeek(),
      createViewMonthGrid(),
    ],

    events: [
  {
    id: "1",
    title: "Project Review",
    start: Temporal.PlainDate.from("2026-06-20"),
    end: Temporal.PlainDate.from("2026-06-20"),
  },

  {
    id: "2",
    title: "Budget Meeting",
    start: Temporal.PlainDate.from("2026-06-24"),
    end: Temporal.PlainDate.from("2026-06-24"),
  },

  {
    id: "3",
    title: "Frontend Demo",
    start: Temporal.PlainDate.from("2026-06-15"),
    end: Temporal.PlainDate.from("2026-06-15"),
  },

  {
    id: "4",
    title: "Client Discussion",
    start: Temporal.PlainDate.from("2026-06-11"),
    end: Temporal.PlainDate.from("2026-06-11"),
  },

  {
    id: "5",
    title: "Team Sync",
    start: Temporal.PlainDate.from("2026-06-28"),
    end: Temporal.PlainDate.from("2026-06-28"),
  },
],
  });

  return (
  <div
    style={{
      borderRadius: "20px",
      overflow: "hidden",
    }}
  >
    <ScheduleXCalendar calendarApp={calendar} />
  </div>
);
}

export default CalendarContainer;