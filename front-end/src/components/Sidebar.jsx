import { Link, useLocation } from "react-router-dom";
import {
  FiHome,
  FiUpload,
  FiCalendar,
  FiCheckSquare,
  FiSearch,
} from "react-icons/fi";

function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: <FiHome /> },
    { name: "Upload", path: "/upload", icon: <FiUpload /> },
    { name: "Calendar", path: "/calendar", icon: <FiCalendar /> },
    { name: "Tasks", path: "/tasks", icon: <FiCheckSquare /> },
    { name: "Search", path: "/search", icon: <FiSearch /> },
  ];

  return (
    <div
      style={{
        width: "280px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "24px",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(0,0,0,0.08)",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo Area */}

      <div
        style={{
          marginBottom: "40px",
        }}
      >
        <h2
          style={{
            color: "#0f172a",
            margin: 0,
            fontSize: "30px",
            fontWeight: "800",
          }}
        >
          AI Notes
        </h2>

        <p
          style={{
            color: "#64748b",
            marginTop: "8px",
            fontSize: "14px",
          }}
        >
          Scheduling Workspace
        </p>

        <div
          style={{
            marginTop: "20px",
            padding: "10px 14px",
            borderRadius: "12px",
            background: "#ecfdf5",
            color: "#065f46",
            fontSize: "13px",
            fontWeight: "600",
            width: "fit-content",
          }}
        >
          ● System Online
        </div>
      </div>

      {/* Navigation */}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {navItems.map((item) => {
          const active = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                padding: "14px 18px",
                borderRadius: "14px",
                textDecoration: "none",

                color: active ? "white" : "#475569",

                background: active
                  ? "linear-gradient(135deg, #2563eb, #3b82f6)"
                  : "transparent",

                boxShadow: active
                  ? "0 10px 25px rgba(37,99,235,0.35)"
                  : "none",

                transform: active
                  ? "translateX(6px)"
                  : "translateX(0)",

                transition: "all 0.3s ease",

                fontWeight: active ? "600" : "500",
              }}
            >
              <span
                style={{
                  fontSize: "18px",
                }}
              >
                {item.icon}
              </span>

              {item.name}
            </Link>
          );
        })}
      </div>

      {/* Bottom User Card */}

      <div
        style={{
          marginTop: "auto",
          paddingTop: "30px",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(10px)",
            borderRadius: "18px",
            padding: "18px",
            border: "1px solid rgba(0,0,0,0.06)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
          }}
        >
          <strong
            style={{
              color: "#0f172a",
            }}
          >
            Admin User
          </strong>

          <p
            style={{
              color: "#64748b",
              marginTop: "8px",
              marginBottom: 0,
              fontSize: "13px",
            }}
          >
            AI Notes Workspace
          </p>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;