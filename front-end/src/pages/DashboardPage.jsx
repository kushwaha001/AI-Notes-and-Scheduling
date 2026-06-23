import { useEffect, useState } from "react";
import { getTodayEvents } from "../services/api";
import StatCard from "../components/StatCard";
import { motion } from "framer-motion";

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
    position: "absolute",
    width: "400px",
    height: "400px",
    background:
      "radial-gradient(circle, rgba(96,165,250,0.25), transparent)",
    filter: "blur(100px)",
    zIndex: -1,
  }}
/>
    <motion.div
      initial={{ opacity: 0, y: -60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      style={{ marginBottom: "60px" }}
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
          fontSize: "72px",
          fontWeight: "800",
          margin: 0,
          lineHeight: "1",
        }}
      >
        Good Morning
      </h1>

      <p
        style={{
          color: "#64748b",
          fontSize: "20px",
          marginTop: "20px",
        }}
      >
        Manage meetings, deadlines, notes and documents from a single workspace.
      </p>
    </motion.div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: "24px",
        marginBottom: "80px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        <StatCard
          title="Events Today"
          value={events.length}
          subtitle="Scheduled today"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <StatCard
          title="Pending Tasks"
          value="5"
          subtitle="Need attention"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6 }}
      >
        <StatCard
          title="Deadlines"
          value="2"
          subtitle="This week"
        />
      </motion.div>
    </div>

    <div
      style={{
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(10px)",
        borderRadius: "24px",
        padding: "24px",
        marginBottom: "80px",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "24px" }}>
        Today's Schedule
      </h2>

      {events.length === 0 ? (
        <p>No events found.</p>
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
                background: "rgba(255,255,255,0.5)",
                backdropFilter: "blur(10px)",
                padding: "24px",
                borderRadius: "20px",
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  marginBottom: "10px",
                }}
              >
                {event.title}
              </h3>

              <p
                style={{
                  margin: 0,
                  color: "#2563eb",
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

    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      style={{ marginBottom: "80px" }}
    >
      <h2 style={{ fontSize: "32px", marginBottom: "24px" }}>
        Upcoming Week
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "24px",
        }}
      >
        <StatCard
          title="Meetings"
          value="8"
          subtitle="Scheduled this week"
        />

        <StatCard
          title="Documents"
          value="14"
          subtitle="Uploaded recently"
        />

        <StatCard
          title="Deadlines"
          value="3"
          subtitle="Need attention"
        />
      </div>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.2 }}
      style={{
        marginBottom: "120px",
      }}
    >
      <h2 style={{ fontSize: "32px", marginBottom: "24px" }}>
        Recent Activity
      </h2>

      <div
        style={{
          background: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(10px)",
          borderRadius: "24px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <p>✓ Uploaded Project Review Letter</p>
        <p>✓ AI Extracted Meeting Details</p>
        <p>✓ Created Calendar Event</p>
        <p>✓ Added High Priority Task</p>
      </div>
    </motion.div>
  </>
);
}

export default DashboardPage;