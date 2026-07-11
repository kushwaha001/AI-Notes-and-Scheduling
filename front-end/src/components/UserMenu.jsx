// v2 — signed-in user badge + logout, shown only when auth is enabled
// (i.e. a user object exists). In single-user/no-auth mode it renders nothing,
// so the v1 UI is unchanged.
import { FiLogOut, FiUser } from "react-icons/fi";
import { logout } from "../auth/auth";

function UserMenu({ user }) {
  if (!user) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 20,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px 6px 12px",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        border: "1px solid #e2e8f0",
        borderRadius: 999,
        boxShadow: "0 2px 8px rgba(15,23,42,0.06)",
        fontSize: 14,
        color: "#0f172a",
      }}
    >
      <FiUser size={16} color="#475569" />
      <span style={{ fontWeight: 600 }} title={user.email || user.username}>
        {user.name || user.username}
      </span>
      <button
        onClick={logout}
        title="Sign out"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: "#0f172a",
          color: "#fff",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        <FiLogOut size={14} /> Sign out
      </button>
    </div>
  );
}

export default UserMenu;
