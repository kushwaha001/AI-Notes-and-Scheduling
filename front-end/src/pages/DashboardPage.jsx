import { useEffect, useState } from "react";
import { getTodayEvents } from "../services/api";
import StatCard from "../components/StatCard";

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
    <>
      <div
        style={{
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
  style={{
    marginBottom: "50px",
  }}
>
  <p
    style={{
      color: "#60a5fa",
      fontSize: "14px",
      textTransform: "uppercase",
      letterSpacing: "2px",
      marginBottom: "12px",
    }}
  >
    AI Notes & Scheduling
  </p>

  <h1
    style={{
      fontSize: "56px",
      margin: 0,
      fontWeight: "800",
      lineHeight: "1.1",
    }}
  >
    Good Morning
  </h1>

  <p
    style={{
      color: "#94a3b8",
      fontSize: "18px",
      marginTop: "16px",
      maxWidth: "700px",
    }}
  >
    Manage meetings, deadlines, notes and documents from a single workspace.
  </p>
</div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "24px",
          marginBottom: "40px",
        }}
      >
        <StatCard
          title="Events Today"
          value={events.length}
          subtitle="Scheduled today"
        />

        <StatCard
          title="Pending Tasks"
          value="5"
          subtitle="Need attention"
        />

        <StatCard
          title="Deadlines"
          value="2"
          subtitle="This week"
        />
      </div>

      <div
        style={{
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "24px",
          padding: "24px",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "24px",
          }}
        >
          Today's Schedule
        </h2>

        {events.length === 0 ? (
          <p
            style={{
              color: "#94a3b8",
            }}
          >
            No events found.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {events.map((event) => (
              <div
                key={event.id}
                style={{
  background: "rgba(255,255,255,0.04)",
  backdropFilter: "blur(10px)",
  padding: "24px",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
}}
              >
                <h3
  style={{
    margin: 0,
    marginBottom: "10px",
    fontSize: "20px",
    fontWeight: "700",
  }}
>
                  {event.title}
                </h3>

                <p
  style={{
    margin: 0,
    color: "#60a5fa",
    fontWeight: "600",
  }}
>
  Priority: {event.priority}
</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default DashboardPage;