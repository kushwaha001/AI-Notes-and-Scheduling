import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import NotificationManager from "./NotificationManager";
import BackendStatus from "./BackendStatus";
import UserMenu from "./UserMenu";
import { AttentionPopup } from "./NeedsAttention";

function AppShell({ children, user }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        position: "relative",
      }}
    >
      <NotificationManager />
      <BackendStatus />
      <UserMenu user={user} />
      <AttentionPopup />

      <Sidebar />

      <main style={{ flex: 1, minWidth: 0, position: "relative", scrollBehavior: "smooth" }}>
        <Topbar user={user} />
        <div style={{ padding: "34px 40px" }}>{children}</div>
      </main>
    </div>
  );
}

export default AppShell;
