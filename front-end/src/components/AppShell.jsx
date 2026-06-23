import Sidebar from "./Sidebar";
import BackgroundBlobs from "./BackgroundBlobs";
import NotificationManager from "./NotificationManager";
import BackendStatus from "./BackendStatus";

function AppShell({ children }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background:
          "linear-gradient(to bottom right, #f8fafc, #ffffff)",
        color: "#0f172a",
        position: "relative",
      }}
    >
      <BackgroundBlobs />
      <NotificationManager />
      <BackendStatus />

      <Sidebar />

      <main
        style={{
          flex: 1,
          padding: "40px",
          overflowY: "auto",
          position: "relative",
          zIndex: 1,
          scrollBehavior: "smooth",
        }}
      >
        <div
          style={{
            maxWidth: "1600px",
            margin: "0 auto",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

export default AppShell;