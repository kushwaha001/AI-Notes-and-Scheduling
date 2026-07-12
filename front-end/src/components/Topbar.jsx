import { useLocation } from "react-router-dom";
import ThemeControls from "./ThemeControls";

// Page title + subtitle derived from the route, plus the theme/size controls.
// Sticky so the controls stay reachable as a page scrolls.
const TITLES = {
  "/":          ["Today", "What needs you right now"],
  "/dashboard": ["Today", "What needs you right now"],
  "/upload":    ["Capture", "Add a letter, photo, or file"],
  "/inbox":     ["Inbox", "Review what the AI found — you approve"],
  "/calendar":  ["Calendar", "Your schedule"],
  "/graph":     ["Knowledge Graph", "How everything connects"],
  "/search":    ["Search", "Find anything · answers come from your data"],
  "/voice":     ["Voice", "Record and transcribe"],
  "/ask":       ["Ask AI", "Questions across your notes and documents"],
  "/tasks":     ["Tasks", "Everything to do"],
  "/notes":     ["Notes", "Your written notes"],
  "/timeline":  ["Timeline", "Everything in order"],
  "/audit":     ["Audit Log", "Every action recorded"],
  "/trash":     ["Trash", "Deleted items — restorable"],
  "/status":    ["System Status", "Services and health"],
  "/settings":  ["AI Settings", "Model server, key and prompt — applies instantly"],
  "/letters":   ["Letters", "Correspondence register · replies due · AI drafts"],
};

function titleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const base = "/" + (pathname.split("/")[1] || "");
  return TITLES[base] || ["", ""];
}

export default function Topbar({ user }) {
  const { pathname } = useLocation();
  const [title, sub] = titleFor(pathname);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "18px 40px",
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 660, color: "var(--text)" }}>{title}</h1>
        {sub && <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
      {/* leave room for the fixed auth UserMenu when signed in */}
      <div style={{ marginLeft: "auto", marginRight: user ? 220 : 0 }}>
        <ThemeControls />
      </div>
    </div>
  );
}
