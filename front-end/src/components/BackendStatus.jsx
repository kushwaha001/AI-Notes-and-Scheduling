import { useEffect, useState } from "react";
import { checkHealth } from "../services/api";

/**
 * Pings the backend periodically and shows a banner when it is unreachable,
 * so the app never silently shows empty data when the API server is down.
 */
export default function BackendStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;
    async function ping() {
      try {
        await checkHealth();
        if (alive) setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    }
    ping();
    const id = setInterval(ping, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (online) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000,
      background: "#b91c1c", color: "white",
      padding: "10px 20px", textAlign: "center",
      fontSize: "14px", fontWeight: 600,
    }}>
      ⚠ Backend offline — start the API server:
      <code style={{ background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: "6px", margin: "0 6px" }}>
        uvicorn api.main:app --port 9000
      </code>
      (data will not load until it is running)
    </div>
  );
}
