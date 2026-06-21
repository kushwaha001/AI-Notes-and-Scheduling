import CalendarContainer from "../components/CalendarContainer";
import { motion } from "framer-motion";

function CalendarPage() {
  return (
    <>
      <div
        style={{
          marginBottom: "30px",
        }}
      >
        <p
          style={{
            color: "#60a5fa",
            letterSpacing: "2px",
            textTransform: "uppercase",
            fontSize: "14px",
            marginBottom: "10px",
          }}
        >
          Calendar Workspace
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "48px",
          }}
        >
          Schedule & Events
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* Left Side */}

        <div
          style={{
            background: "white",
            borderRadius: "24px",
            padding: "20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: "24px",
              }}
            >
              Calendar Overview
            </h2>

            <p
              style={{
                color: "#64748b",
                marginTop: "8px",
              }}
            >
              View and manage upcoming meetings, deadlines and tasks.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                background: "#eff6ff",
                padding: "14px 18px",
                borderRadius: "14px",
                fontWeight: "600",
              }}
            >
              5 Events
            </div>

            <div
              style={{
                background: "#f0fdf4",
                padding: "14px 18px",
                borderRadius: "14px",
                fontWeight: "600",
              }}
            >
              1 High Priority
            </div>

            <div
              style={{
                background: "#faf5ff",
                padding: "14px 18px",
                borderRadius: "14px",
                fontWeight: "600",
              }}
            >
              June 2026
            </div>
          </div>

          <CalendarContainer />
        </div>

        {/* Right Side */}

        <motion.div
          initial={{
            opacity: 0,
            x: 50,
          }}
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{
            duration: 0.6,
          }}
          style={{
            background: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(10px)",
            borderRadius: "24px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            height: "fit-content",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                margin: 0,
              }}
            >
              Event Details
            </h2>

            <span
              style={{
                background: "#fee2e2",
                color: "#dc2626",
                padding: "6px 12px",
                borderRadius: "999px",
                fontWeight: "600",
              }}
            >
              High
            </span>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: "#64748b" }}>
              Reference Number
            </div>

            <strong>REF-2026-001</strong>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: "#64748b" }}>
              Event Name
            </div>

            <strong>Project Review Meeting</strong>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: "#64748b" }}>
              Date
            </div>

            <strong>20 June 2026</strong>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: "#64748b" }}>
              Time
            </div>

            <strong>10:00 AM</strong>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <div style={{ color: "#64748b" }}>
              Source Document
            </div>

            <strong>Project Review Letter.pdf</strong>
          </div>

          <motion.button
            whileHover={{
              scale: 1.03,
            }}
            whileTap={{
              scale: 0.98,
            }}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Open Source Document
          </motion.button>
        </motion.div>
      </div>
    </>
  );
}

export default CalendarPage;