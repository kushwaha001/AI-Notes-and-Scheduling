import { useCalendarApp, ScheduleXCalendar } from "@schedule-x/react";
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
} from "@schedule-x/calendar";

import { Temporal } from "temporal-polyfill";
import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";

function CalendarContainer() {
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
    ],
  });

  return <ScheduleXCalendar calendarApp={calendar} />;
}

export default CalendarContainer;