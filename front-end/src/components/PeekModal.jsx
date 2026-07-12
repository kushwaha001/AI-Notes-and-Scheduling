/*
 * PeekModal — reusable 'click → summary → expand full letter' box.
 * Given an item {kind, id}, fetches GET /preview and shows its summary + key
 * fields, with an Expand toggle for the full body and open/go actions. Used
 * wherever a letter/note is listed (Inbox, related items, connections).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPreview, documentDownloadUrl } from "../services/api";

const ICON = { document: "📄", note: "📝", event: "📅", task: "✓", audio: "🎙" };
const LABEL = { document: "Letter", note: "Note", event: "Event", task: "Task", audio: "Audio" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIELD_LABEL = { subject: "Subject", venue: "Venue", time: "Time", event_date: "Date", reply_by: "Reply by", deadline: "Deadline", date: "Date", due: "Due", status: "Status", priority: "Priority" };
const DATE_FIELDS = new Set(["event_date", "reply_by", "deadline", "date", "due"]);
const prettyDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? `${m[3]} ${MON[+m[2] - 1]} ${m[1]}` : String(iso); };

export default function PeekModal({ item, onClose }) {
  const navigate = useNavigate();
  const [st, setSt] = useState({ loading: true, data: null, expanded: false });

  useEffect(() => {
    if (!item) return;
    setSt({ loading: true, data: null, expanded: false });
    getPreview(item.kind, item.id)
      .then((d) => setSt((s) => ({ ...s, loading: false, data: d })))
      .catch(() => setSt((s) => ({ ...s, loading: false, data: null })));
  }, [item?.kind, item?.id]);

  if (!item) return null;
  const d = st.data;

  function go() {
    if (item.kind === "document") window.open(documentDownloadUrl(item.id), "_blank");
    else if (item.kind === "note") navigate("/notes");
    else if (item.kind === "event") navigate("/calendar");
    else if (item.kind === "task") navigate("/tasks");
    onClose?.();
  }

  const btn = {
    border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--text-2)",
    padding: "8px 15px", borderRadius: 9, cursor: "pointer", fontWeight: 600, fontSize: 14, textDecoration: "none",
  };

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 18 }}>{ICON[item.kind]}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {d?.title || (st.loading ? "Loading…" : "Preview")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {LABEL[item.kind] || item.kind}{d?.ref_number ? ` · ${d.ref_number}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
        </div>

        <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
          {st.loading ? <p style={{ color: "var(--muted)" }}>Loading…</p>
            : !d ? <p style={{ color: "var(--muted)" }}>Preview unavailable.</p>
            : <>
                {d.summary && (
                  <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.55 }}>
                    <span style={{ color: "var(--accent)", fontWeight: 700 }}>Summary · </span>{d.summary}
                  </p>
                )}
                {Object.keys(d.fields || {}).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {Object.entries(d.fields).map(([k, v]) => (
                      <span key={k} style={{ background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13, padding: "3px 10px", borderRadius: 8 }}>
                        {FIELD_LABEL[k] || k}: {DATE_FIELDS.has(k) ? prettyDate(v) : v}
                      </span>
                    ))}
                  </div>
                )}
                {d.body ? (
                  <>
                    <button onClick={() => setSt((s) => ({ ...s, expanded: !s.expanded }))}
                      style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "none", padding: "8px 15px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                      {st.expanded ? "▴ Collapse" : "▾ Expand full letter"}
                    </button>
                    {st.expanded && (
                      <pre style={{
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                        fontFamily: item.kind === "note" ? "monospace" : "Georgia, serif",
                        fontSize: 14.5, lineHeight: 1.65, background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 10, padding: 16, margin: 0, maxHeight: "45vh", overflowY: "auto",
                      }}>{d.body}</pre>
                    )}
                  </>
                ) : (!d.summary && <p style={{ color: "var(--muted)", fontSize: 14 }}>No text to preview.</p>)}
              </>}
        </div>

        {d && (
          <div style={{ display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
            {item.kind === "document"
              ? <a href={documentDownloadUrl(item.id)} target="_blank" rel="noreferrer" style={btn}>Open original</a>
              : <button onClick={go} style={{ ...btn, cursor: "pointer" }}>Go to {LABEL[item.kind] || item.kind}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
