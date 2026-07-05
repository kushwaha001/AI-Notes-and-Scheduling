import { useState } from "react";
import { motion } from "framer-motion";
import { ask, reindex } from "../services/api";

const KIND_ICON = { document: "📄", note: "📝", event: "📅" };

export default function AskPage() {
  const [q, setQ]           = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexMsg, setIndexMsg] = useState("");

  async function handleAsk(e) {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      setResult(await ask(q.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

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
    "What is the budget review meeting about?",
    "When do I need to reply by?",
    "Which documents mention the audit?",
  ];

  return (
    <>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
            Ask your documents (RAG)
          </p>
          <h1 style={{ margin: 0, fontSize: "42px" }}>Ask AI</h1>
          <p style={{ color: "#64748b", marginTop: "10px" }}>
            Ask questions in plain language. Answers come from your own documents and
            notes, with citations — nothing leaves your machine.
          </p>
        </div>
        <button onClick={handleReindex} disabled={indexing}
          style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", padding: "10px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
          {indexing ? "Indexing…" : "Rebuild index"}
        </button>
      </div>

      {indexMsg && (
        <p style={{ color: indexMsg.startsWith("Error") ? "#ef4444" : "#16a34a", fontSize: "13px", marginBottom: "14px" }}>
          {indexMsg}
        </p>
      )}

      <form onSubmit={handleAsk}
        style={{ background: "white", borderRadius: "20px", padding: "20px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "20px", display: "flex", gap: "12px" }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your documents and notes…"
          style={{ flex: 1, padding: "16px 18px", borderRadius: "14px", border: "1px solid #cbd5e1", fontSize: "16px", outline: "none" }}
        />
        <button type="submit" disabled={loading || !q.trim()}
          style={{ background: loading ? "#64748b" : "#2563eb", color: "white", border: "none", padding: "16px 28px", borderRadius: "14px", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700 }}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {/* example chips */}
      {!result && !loading && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          {examples.map((ex) => (
            <button key={ex} onClick={() => { setQ(ex); }}
              style={{ background: "#eff6ff", color: "#2563eb", border: "none", padding: "8px 16px", borderRadius: "99px", cursor: "pointer", fontSize: "13px" }}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: "12px", padding: "16px 18px", marginBottom: "16px" }}>
          {error}
          {error.includes("Embedding") && (
            <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
              Check the embedding server (<code>EMBED_BASE_URL</code> / <code>EMBED_MODEL</code>), then click “Rebuild index”.
            </p>
          )}
        </div>
      )}

      {loading && (
        <div style={{ background: "white", borderRadius: "20px", padding: "30px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "#94a3b8" }}>Searching your documents and composing an answer…</p>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "white", borderRadius: "20px", padding: "26px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "14px", fontSize: "20px" }}>Answer</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#1e293b", fontSize: "15px" }}>
            {result.answer}
          </p>

          {result.sources?.length > 0 && (
            <div style={{ marginTop: "22px", borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
              <h3 style={{ margin: "0 0 12px", fontSize: "14px", color: "#64748b" }}>Sources</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {result.sources.map((s) => (
                  <div key={`${s.kind}-${s.item_id}`} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: "10px", padding: "10px 14px", fontSize: "14px",
                  }}>
                    <span style={{ background: "#2563eb", color: "white", borderRadius: "6px", padding: "1px 8px", fontSize: "12px", fontWeight: 700 }}>
                      {s.n}
                    </span>
                    <span>{KIND_ICON[s.kind] || "📄"}</span>
                    <span style={{ flex: 1 }}>{s.title || `${s.kind} ${s.item_id}`}</span>
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>match {(s.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </>
  );
}
