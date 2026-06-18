import { useEffect, useState } from "react";
import { getTodayEvents } from "../services/api";

function DashboardPage() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    async function loadEvents() {
      const data = await getTodayEvents();
      setEvents(data);
    }

    loadEvents();
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>

      <h2>Today's Events</h2>

      {events.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              {event.title} - {event.priority}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default DashboardPage;