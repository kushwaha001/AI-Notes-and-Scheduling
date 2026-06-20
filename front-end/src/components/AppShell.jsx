import Sidebar from "./Sidebar";

function AppShell({ children }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#020617",
        color: "white",
      }}
    >
      <Sidebar />

      <main
        style={{
          flex: 1,
          padding: "32px 40px",
          overflowY: "auto",
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default AppShell;