import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { search } from "../services/api";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await search(query.trim());
      setResults(data);
    } catch (e) {
      setError(e.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const events    = results?.events    ?? [];
  const documents = results?.documents ?? [];
  const notes     = results?.notes     ?? [];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        style={{ marginBottom: "40px" }}
      >
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "10px" }}>
          Intelligent Search
        </p>
        <h1 style={{ margin: 0, fontSize: "48px" }}>Search Workspace</h1>
        <p style={{ color: "#64748b", marginTop: "16px", fontSize: "18px" }}>
          Search events and documents using keywords.
        </p>
      </motion.div>

      <form
        onSubmit={handleSearch}
        style={{
          background: "white", borderRadius: "24px",
          padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          marginBottom: "30px", display: "flex", gap: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search meetings, documents, tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1, padding: "16px 18px",
            borderRadius: "14px", border: "1px solid #cbd5e1",
            fontSize: "16px", outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            background: loading ? "#64748b" : "#2563eb",
            color: "white", border: "none",
            padding: "16px 28px", borderRadius: "14px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700, fontSize: "15px",
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <div style={{ color: "#ef4444", marginBottom: "20px", padding: "14px 18px", background: "#fef2f2", borderRadius: "12px" }}>
          {error}
        </div>
      )}

      {results && (
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
          <div style={{ background: "#eff6ff", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {events.length} Events
          </div>
          <div style={{ background: "#f0fdf4", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {documents.length} Documents
          </div>
          <div style={{ background: "#fef9c3", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {notes.length} Notes
          </div>
          <div style={{ background: "#faf5ff", padding: "12px 18px", borderRadius: "14px", fontWeight: 600, color: "#64748b" }}>
            Keyword search
          </div>
        </div>
      )}

      {results && events.length === 0 && documents.length === 0 && notes.length === 0 && (
        <div
          style={{
            background: "white", borderRadius: "20px",
            padding: "40px", textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ color: "#94a3b8", fontSize: "18px" }}>
            No results found for &ldquo;{results.query}&rdquo;
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ background: "white", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Calendar Events</h2>
          {events.map((ev) => (
            <motion.div
              key={ev.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/calendar")}
              title="Open in Calendar"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "#f8fafc",
                border: "1px solid #e2e8f0", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 6px" }}>{ev.title}</h3>
                {ev.venue && <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>{ev.venue}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, color: "#2563eb", fontWeight: 600, fontSize: "15px" }}>
                  {fmtDate(ev.event_date)}
                </p>
                {ev.event_time && (
                  <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "13px" }}>
                    {ev.event_time.slice(0, 5)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ background: "white", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Documents</h2>
          {documents.map((doc) => (
            <motion.div
              key={doc.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/upload")}
              title="View on Upload page"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "#f8fafc",
                border: "1px solid #e2e8f0", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 6px" }}>{doc.filename}</h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: "13px", textTransform: "uppercase" }}>
                  {doc.file_type}
                </p>
              </div>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                {fmtDate(doc.uploaded_at)}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div style={{ background: "white", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginTop: "24px" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Notes</h2>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/notes")}
              title="Open in Notes"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "#f8fafc",
                border: "1px solid #e2e8f0", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>{n.title}</h3>
              {n.classification && n.classification !== "General" && (
                <span style={{ background: "#faf5ff", color: "#7c3aed", padding: "3px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600 }}>
                  {n.classification}
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
