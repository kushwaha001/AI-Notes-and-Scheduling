import { Link, useLocation } from "react-router-dom";
import {
  FiHome, FiUpload, FiCalendar, FiCheckSquare,
  FiSearch, FiFileText, FiClock, FiTrash2, FiList, FiActivity,
} from "react-icons/fi";

function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: "Dashboard",  path: "/dashboard", icon: <FiHome /> },
    { name: "Upload",     path: "/upload",    icon: <FiUpload /> },
    { name: "Calendar",   path: "/calendar",  icon: <FiCalendar /> },
    { name: "Timeline",   path: "/timeline",  icon: <FiClock /> },
    { name: "Tasks",      path: "/tasks",     icon: <FiCheckSquare /> },
    { name: "Search",     path: "/search",    icon: <FiSearch /> },
    { name: "Notes",      path: "/notes",     icon: <FiFileText /> },
    { name: "Audit Log",  path: "/audit",     icon: <FiList /> },
    { name: "Trash",      path: "/trash",     icon: <FiTrash2 /> },
    { name: "Status",     path: "/status",    icon: <FiActivity /> },
  ];

  return (
    <div
      style={{
        width: "260px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        background: "rgba(255,255,255,0.75)",
        backdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(0,0,0,0.08)",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "32px", paddingLeft: "8px" }}>
        <h2 style={{ color: "#0f172a", margin: 0, fontSize: "20px", fontWeight: "800", lineHeight: 1.2 }}>
          AI Notes and Scheduling
        </h2>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {navItems.map((item) => {
          const active = location.pathname === item.path ||
            (item.path === "/dashboard" && location.pathname === "/");

          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "11px 14px",
                borderRadius: "12px",
                textDecoration: "none",
                color: active ? "white" : "#475569",
                background: active
                  ? "linear-gradient(135deg, #2563eb, #3b82f6)"
                  : "transparent",
                boxShadow: active ? "0 6px 20px rgba(37,99,235,0.35)" : "none",
                transform: active ? "translateX(4px)" : "translateX(0)",
                transition: "all 0.25s ease",
                fontWeight: active ? "600" : "500",
                fontSize: "14px",
              }}
            >
              <span style={{ fontSize: "16px" }}>{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default Sidebar;
