import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { search, getGraph, documentDownloadUrl } from "../services/api";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const fmtDay = (iso) => String(new Date(iso).getDate()).padStart(2, "0");
const fmtMon = (iso) => new Date(iso).toLocaleDateString("en-GB", { month: "short" });

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [upcoming, setUpcoming] = useState(null);   // "Coming up" discovery panel
  const [index, setIndex]     = useState(null);     // searchable index for typeahead
  const [focused, setFocused] = useState(false);    // is the search box focused

  // Build the "Coming up" list from the knowledge graph: upcoming events/deadlines
  // and the letters that feed into them (source-of edges) — clickable to open.
  useEffect(() => {
    getGraph()
      .then((g) => {
        const nodes = g.nodes || [], byId = {}, adj = {};
        nodes.forEach((n) => { byId[n.id] = n; });
        (g.edges || []).forEach((e) => {
          (adj[e.source] = adj[e.source] || []).push(e.target);
          (adj[e.target] = adj[e.target] || []).push(e.source);
        });
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const items = nodes
          .filter((n) => (n.kind === "event" || n.kind === "task") && n.date &&
            !(n.kind === "task" && n.status === "done") && new Date(n.date) >= today)
          .map((n) => ({
            id: n.id, kind: n.kind, label: n.label, date: n.date,
            letters: (adj[n.id] || []).map((id) => byId[id]).filter((m) => m && m.kind === "document"),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 12);
        setUpcoming(items);
        // Build the typeahead index from every node (documents, events, tasks, notes).
        setIndex(nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label || "", ref: n.ref_number || "" })));
      })
      .catch(() => { setUpcoming([]); setIndex([]); });
  }, []);

  const KIND_META = {
    document: { icon: "📄", tag: "Letter" },
    event:    { icon: "📅", tag: "Meeting" },
    task:     { icon: "✅", tag: "Task" },
    note:     { icon: "📝", tag: "Note" },
  };

  function openItem(n) {
    const id = String(n.id).split("-")[1];
    if (n.kind === "document") window.open(documentDownloadUrl(id), "_blank");
    else if (n.kind === "event") navigate("/calendar");
    else if (n.kind === "task") navigate("/tasks");
    else if (n.kind === "note") navigate("/notes");
    setFocused(false);
  }

  // Client-side typeahead: match the query against node titles + reference numbers.
  const ql = query.trim().toLowerCase();
  const suggestions = ql.length >= 1 && index
    ? index.filter((n) => n.label.toLowerCase().includes(ql) || n.ref.toLowerCase().includes(ql)).slice(0, 8)
    : [];

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
        transition={{ duration: 0.3 }}
        style={{ marginBottom: "40px" }}
      >
        <p style={{ color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "10px" }}>
          Intelligent Search
        </p>
        <h1 style={{ margin: 0, fontSize: "48px" }}>Search Workspace</h1>
        <p style={{ color: "var(--muted)", marginTop: "16px", fontSize: "18px" }}>
          Search events and documents using keywords.
        </p>
      </motion.div>

      <form
        onSubmit={handleSearch}
        style={{
          background: "var(--surface)", borderRadius: "24px",
          padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          marginBottom: "30px", display: "flex", gap: "12px",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder="Search meetings, documents, tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            style={{
              width: "100%", padding: "16px 18px", boxSizing: "border-box",
              borderRadius: "14px", border: "1px solid var(--border-2)",
              fontSize: "16px", outline: "none",
            }}
          />
          {/* Typeahead autocomplete dropdown */}
          {focused && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 30,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "14px",
              boxShadow: "var(--shadow)", maxHeight: "340px", overflowY: "auto", padding: "6px",
            }}>
              {suggestions.map((s) => {
                const m = KIND_META[s.kind] || KIND_META.document;
                return (
                  // onMouseDown (not onClick) so it fires before the input's onBlur closes the list
                  <button key={s.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); openItem(s); }}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left",
                      background: "none", border: "none", cursor: "pointer", padding: "10px 12px",
                      borderRadius: "10px", fontSize: "14px", color: "var(--text)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                    <span style={{ fontSize: "16px" }}>{m.icon}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted)", background: "var(--surface-2)", padding: "1px 8px", borderRadius: "6px" }}>{m.tag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
        <div style={{ color: "var(--danger)", marginBottom: "20px", padding: "14px 18px", background: "var(--danger-soft)", borderRadius: "12px" }}>
          {error}
        </div>
      )}

      {/* Discovery: what's coming up, with clickable related letters */}
      {!results && !loading && (
        <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
          <h2 style={{ marginTop: 0, marginBottom: "4px", fontSize: "20px" }}>📅 Coming up</h2>
          <p style={{ margin: "0 0 18px", color: "var(--muted)", fontSize: "14px" }}>
            Upcoming meetings and deadlines — click a linked letter to open the original.
          </p>
          {upcoming === null ? (
            <p style={{ color: "var(--muted)" }}>Loading…</p>
          ) : upcoming.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Nothing upcoming yet — confirmed meetings and deadlines will show here.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {upcoming.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "14px 16px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "14px" }}>
                  <div style={{ minWidth: "52px", textAlign: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: "18px", color: "var(--accent)", lineHeight: 1 }}>{fmtDay(it.date)}</div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{fmtMon(it.date)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button onClick={() => navigate(it.kind === "event" ? "/calendar" : "/tasks")} title="Open"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontWeight: 650, fontSize: "15px", color: "var(--text)" }}>
                      {it.kind === "event" ? "📅 " : "✅ "}{it.label}
                    </button>
                    {it.letters.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "9px" }}>
                        <span style={{ fontSize: "12px", color: "var(--muted)", alignSelf: "center" }}>from:</span>
                        {it.letters.map((l) => (
                          <a key={l.id} href={documentDownloadUrl(l.id.split("-")[1])} target="_blank" rel="noreferrer" title={l.label}
                            style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "var(--accent-soft)", color: "var(--accent)", textDecoration: "none", borderRadius: "99px", padding: "3px 11px", fontSize: "12px", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            📄 {l.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {results && (
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
          <div style={{ background: "var(--accent-soft)", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {events.length} Events
          </div>
          <div style={{ background: "var(--ok-soft)", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {documents.length} Documents
          </div>
          <div style={{ background: "var(--warn-soft)", padding: "12px 18px", borderRadius: "14px", fontWeight: 600 }}>
            {notes.length} Notes
          </div>
          <div style={{ background: "var(--surface-2)", padding: "12px 18px", borderRadius: "14px", fontWeight: 600, color: "var(--muted)" }}>
            Keyword search
          </div>
        </div>
      )}

      {results && events.length === 0 && documents.length === 0 && notes.length === 0 && (
        <div
          style={{
            background: "var(--surface)", borderRadius: "20px",
            padding: "40px", textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ color: "var(--muted)", fontSize: "18px" }}>
            No results found for &ldquo;{results.query}&rdquo;
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Calendar Events</h2>
          {events.map((ev) => (
            <motion.div
              key={ev.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/calendar")}
              title="Open in Calendar"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "var(--bg)",
                border: "1px solid var(--border)", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 6px" }}>{ev.title}</h3>
                {ev.venue && <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>{ev.venue}</p>}
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, color: "var(--accent)", fontWeight: 600, fontSize: "15px" }}>
                  {fmtDate(ev.event_date)}
                </p>
                {ev.event_time && (
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>
                    {ev.event_time.slice(0, 5)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Documents</h2>
          {documents.map((doc) => (
            <motion.div
              key={doc.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/upload")}
              title="View on Upload page"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "var(--bg)",
                border: "1px solid var(--border)", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <h3 style={{ margin: "0 0 6px" }}>{doc.filename}</h3>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px", textTransform: "uppercase" }}>
                  {doc.file_type}
                </p>
              </div>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
                {fmtDate(doc.uploaded_at)}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginTop: "24px" }}>
          <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Notes</h2>
          {notes.map((n) => (
            <motion.div
              key={n.id}
              whileHover={{ y: -2, x: 3 }}
              onClick={() => navigate("/notes")}
              title="Open in Notes"
              style={{
                padding: "18px 20px", borderRadius: "16px",
                marginBottom: "12px", background: "var(--bg)",
                border: "1px solid var(--border)", cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>{n.title}</h3>
              {n.classification && n.classification !== "General" && (
                <span style={{ background: "var(--surface-2)", color: "var(--text-2)", padding: "3px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600 }}>
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
