import { useEffect, useState } from "react";
import {
  getLinkSuggestions, getAcceptedLinks, acceptLink, rejectLink,
} from "../services/api";

/**
 * FR-25 — AI-suggested "soft" links.
 *
 * For a given content item (note/document) this shows:
 *   • already-accepted related items, and
 *   • new similarity-based suggestions the user can Accept or Dismiss.
 * Nothing is linked automatically — the user always decides.
 */
export default function RelatedItems({ kind, id }) {
  const [suggestions, setSuggestions] = useState([]);
  const [linked, setLinked]           = useState([]);
  const [loading, setLoading]         = useState(true);

  async function load() {
    if (id == null) return;
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        getLinkSuggestions(kind, id).catch(() => []),
        getAcceptedLinks(kind, id).catch(() => []),
      ]);
      setSuggestions(s);
      setLinked(l);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind, id]);

  async function decide(item, accept) {
    const pair = { a_kind: kind, a_id: id, b_kind: item.kind, b_id: item.id };
    setSuggestions((prev) => prev.filter((x) => !(x.kind === item.kind && x.id === item.id)));
    try {
      await (accept ? acceptLink(pair) : rejectLink(pair));
      if (accept) setLinked((prev) => [...prev, { kind: item.kind, id: item.id, title: item.title }]);
    } catch {
      load(); // restore real state on failure
    }
  }

  if (loading && suggestions.length === 0 && linked.length === 0) {
    return <p style={{ color: "#94a3b8", fontSize: "13px", margin: "14px 0 0" }}>Finding related items…</p>;
  }
  if (suggestions.length === 0 && linked.length === 0) return null;

  const chip = (it) => `${it.kind === "note" ? "Note" : "Doc"} #${it.id}${it.title ? ` — ${it.title}` : ""}`;

  return (
    <div style={{ marginTop: "18px", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
      <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "14px" }}>Related items</p>

      {linked.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: suggestions.length ? "12px" : 0 }}>
          {linked.map((it) => (
            <span key={`${it.kind}-${it.id}`} style={{
              background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0",
              padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600,
            }}>
              🔗 {chip(it)}
            </span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <>
          <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "12px" }}>
            AI suggests these might be related — you decide:
          </p>
          {suggestions.map((it) => (
            <div key={`${it.kind}-${it.id}`} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 12px", borderRadius: "10px", marginBottom: "6px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <span style={{ fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chip(it)}
                <span style={{ color: "#94a3b8", marginLeft: "8px", fontSize: "11px" }}>
                  {Math.round(it.score * 100)}% match
                </span>
              </span>
              <span style={{ display: "flex", gap: "6px", flexShrink: 0, marginLeft: "10px" }}>
                <button onClick={() => decide(it, true)}
                  style={{ background: "#10b981", color: "white", border: "none", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                  Link
                </button>
                <button onClick={() => decide(it, false)}
                  style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "4px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                  Dismiss
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
