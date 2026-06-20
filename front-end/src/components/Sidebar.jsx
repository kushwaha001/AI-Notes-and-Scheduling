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
        width: "260px",
        background: "#0b1120",
        borderRight: "1px solid #1e293b",
        padding: "24px",
      }}
    >
      <div
  style={{
    marginBottom: "40px",
  }}
>
  <h2
    style={{
      color: "white",
      margin: 0,
      fontSize: "28px",
      fontWeight: "800",
    }}
  >
    AI Notes
  </h2>

  <p
    style={{
      color: "#64748b",
      marginTop: "6px",
      fontSize: "13px",
    }}
  >
    Scheduling Workspace
  </p>
</div>

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
                gap: "12px",
                padding: "14px 16px",
                borderRadius: "12px",
                textDecoration: "none",
                color: active ? "white" : "#94a3b8",
                background: active
  ? "linear-gradient(135deg, #2563eb, #3b82f6)"
  : "transparent",
  boxShadow: active
  ? "0 8px 25px rgba(37,99,235,0.35)"
  : "none",

transform: active
  ? "translateX(4px)"
  : "translateX(0)",
                transition: "all 0.2s ease",
              }}
            >
              {item.icon}
              {item.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default Sidebar;