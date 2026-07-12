import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ask, reindex, documentDownloadUrl } from "../services/api";

const KIND_ICON = { document: "📄", note: "📝", event: "📅", task: "✓" };

export default function AskPage() {
  const navigate = useNavigate();
  const [q, setQ]           = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexMsg, setIndexMsg] = useState("");

  async function runAsk(text) {
    const query = (text ?? q).trim();
    if (!query) return;
    setQ(query);
    setLoading(true); setError(""); setResult(null);
    try {
      setResult(await ask(query));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function handleAsk(e) { e?.preventDefault(); runAsk(); }

  async function handleReindex() {
    setIndexing(true); setIndexMsg("");
    try {
      const r = await reindex();
      setIndexMsg(`Indexed ${r.documents} document(s) and ${r.notes} note(s) — ${r.chunks} chunks.`);
    } catch (e) {
      setIndexMsg(`Error: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  }

  const examples = [
    "What's on 18 July?",
    "What's due this week?",
    "What's overdue?",
    "What's coming up in August?",
    "What is the empowered committee report about?",
  ];

  // Open a cited source: a document opens its file; notes/events jump to their page.
  function openSource(s) {
    if (s.kind === "document") window.open(documentDownloadUrl(s.item_id), "_blank");
    else if (s.kind === "note") navigate("/notes");
    else if (s.kind === "event") navigate("/calendar");
    else if (s.kind === "task") navigate("/tasks");
  }

  return (
    <>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
            Ask your documents (RAG)
          </p>
          <h1 style={{ margin: 0, fontSize: "42px" }}>Ask AI</h1>
          <p style={{ color: "var(--muted)", marginTop: "10px" }}>
            Ask questions in plain language. Answers come from your own documents and
            notes, with citations — nothing leaves your machine.
          </p>
        </div>
        <button onClick={handleReindex} disabled={indexing}
          style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", padding: "10px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
          {indexing ? "Indexing…" : "Rebuild index"}
        </button>
      </div>

      {indexMsg && (
        <p style={{ color: indexMsg.startsWith("Error") ? "var(--danger)" : "var(--ok)", fontSize: "13px", marginBottom: "14px" }}>
          {indexMsg}
        </p>
      )}

      <form onSubmit={handleAsk}
        style={{ background: "var(--surface)", borderRadius: "20px", padding: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "20px", display: "flex", gap: "12px" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your documents and notes…"
          style={{ flex: 1, padding: "16px 18px", borderRadius: "14px", border: "1px solid var(--border-2)", fontSize: "16px", outline: "none" }}
        />
        <button type="submit" disabled={loading || !q.trim()}
          style={{ background: loading ? "var(--muted)" : "var(--accent)", color: "white", border: "none", padding: "16px 28px", borderRadius: "14px", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700 }}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* example chips */}
      {!result && !loading && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          {examples.map((ex) => (
            <button key={ex} onClick={() => runAsk(ex)}
              style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "none", padding: "8px 16px", borderRadius: "99px", cursor: "pointer", fontSize: "13px" }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: "12px", padding: "16px 18px", marginBottom: "16px" }}>
          {error}
          {error.includes("Embedding") && (
            <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
              Check the embedding server (<code>EMBED_BASE_URL</code> / <code>EMBED_MODEL</code>), then click “Rebuild index”.
            </p>
          )}
        </div>
      )}

      {loading && (
        <div style={{ background: "var(--surface)", borderRadius: "20px", padding: "30px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "var(--muted)" }}>Searching your documents and composing an answer…</p>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "var(--surface)", borderRadius: "20px", padding: "26px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "14px", fontSize: "20px" }}>Answer</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "var(--text)", fontSize: "15px" }}>
            {result.answer}
          </p>

          {result.sources?.length > 0 && (
            <div style={{ marginTop: "22px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "14px", color: "var(--muted)" }}>Sources</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {result.sources.map((s) => (
                  <button key={`${s.kind}-${s.item_id}`} onClick={() => openSource(s)}
                    title="Open source"
                    style={{
                      display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left",
                      background: "var(--bg)", border: "1px solid var(--border)", cursor: "pointer",
                      borderRadius: "10px", padding: "10px 14px", fontSize: "14px", color: "var(--text)",
                    }}>
                    <span style={{ background: "var(--accent)", color: "white", borderRadius: "6px", padding: "1px 8px", fontSize: "12px", fontWeight: 700 }}>
                      {s.n}
                    </span>
                    <span>{KIND_ICON[s.kind] || "📄"}</span>
                    <span style={{ flex: 1 }}>{s.title || `${s.kind} ${s.item_id}`}</span>
                    <span style={{ color: "var(--muted)", fontSize: "12px" }}>match {(s.score * 100).toFixed(0)}% →</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </>
  );
}
