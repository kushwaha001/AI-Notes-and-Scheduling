import CalendarContainer from "../components/CalendarContainer";

function CalendarPage() {
  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <h1>Calendar</h1>
        <p style={{ color: "#94a3b8" }}>
          Manage meetings, tasks and deadlines.
        </p>
      </div>

      <CalendarContainer />
    </>
  );
}

export default CalendarPage;