import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getEvent, documentDownloadUrl } from "../services/api";
import { fmtDate, fmtDateTime } from "./DateInput";
import EntityNotes from "./EntityNotes";
import Connections from "./Connections";

// Confidence is intentionally NOT shown here — per product decision it appears
// only at extraction time (on the Upload review screen), not in the saved-event
// detail popup.
function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ margin: "0 0 3px", color: "var(--muted)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </p>
      <strong style={{ fontSize: "15px" }}>{value}</strong>
    </div>
  );
}

export default function EventDetailModal({ eventId, onClose, onEdit, onDelete }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [docPopup, setDocPopup] = useState(null); // small source popup
  const [thread, setThread]     = useState([]);   // letter's file-number series

  useEffect(() => {
    if (eventId == null) return;
    setLoading(true);
    getEvent(eventId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  // Letter thread for the primary linked document. Endpoint may not exist yet
  // (built in parallel) — any failure just leaves the section hidden.
  useEffect(() => {
    const docId = data?.source_documents?.[0]?.id;
    if (docId == null) { setThread([]); return; }
    let alive = true;
    // Derive the API base from documentDownloadUrl so VITE_API_BASE overrides
    // (offline build) keep working: ".../documents/{id}/download" → ".../thread".
    fetch(documentDownloadUrl(docId).replace(/\/download$/, "/thread"))
      .then((r) => (r.ok ? r.json() : { thread: [] }))
      .then((r) => { if (alive) setThread(Array.isArray(r?.thread) ? r.thread : []); })
      .catch(() => { if (alive) setThread([]); });
    return () => { alive = false; };
  }, [data]);

  if (eventId == null) return null;

  const ev          = data?.event;
  const docs        = data?.source_documents ?? [];
  const extractions = data?.extractions ?? [];
  const history     = data?.history ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", borderRadius: "22px",
          width: "100%", maxWidth: "620px", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "22px 26px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          position: "sticky", top: 0, background: "var(--surface)", borderRadius: "22px 22px 0 0",
        }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--accent)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Event Details
            </p>
            <h2 style={{ margin: 0, fontSize: "24px" }}>
              {loading ? "Loading…" : ev?.title || "Event"}
            </h2>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "24px", lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ padding: "22px 26px" }}>
          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

          {ev && (
            <>
              {/* Core event fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: "20px" }}>
                <Field label="Date" value={fmtDate(ev.event_date)} />
                <Field label="Time" value={ev.event_time ? String(ev.event_time).slice(0, 5) : ""} />
                <Field label="Venue" value={ev.venue} />
                <Field label="Attendees" value={ev.attendees} />
                <Field label="Classification" value={ev.classification} />
                <Field label="Priority" value={ev.priority || "Medium"} />
                <Field label="Source" value={ev.source} />
              </div>

              {/* Summary / Additional Detail (AI-parsed when available) */}
              <div style={{
                background: "var(--bg)", borderRadius: "14px", padding: "16px 18px",
                marginBottom: "18px", border: "1px solid var(--border)",
              }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "15px" }}>
                  Summary / Additional Detail
                </h3>
                {extractions.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "13px" }}>
                    {ev.source === "manual"
                      ? "This event was created manually — no additional detail."
                      : "No additional detail is linked to this event yet."}
                  </p>
                ) : (
                  extractions.map((ex, i) => {
                    return (
                      <div key={i} style={{ marginBottom: i < extractions.length - 1 ? "16px" : 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
                          <Field label="Subject"    value={ex.subject} />
                          <Field label="Date"       value={ex.event_date ? fmtDate(ex.event_date) : ""} />
                          <Field label="Time"       value={ex.event_time ? String(ex.event_time).slice(0,5) : ""} />
                          <Field label="Venue"      value={ex.venue} />
                          <Field label="Attendees"  value={ex.attendees} />
                          <Field label="Reference#" value={ex.ref_number} />
                          <Field label="Deadline"   value={ex.deadline ? fmtDate(ex.deadline) : ""} />
                          <Field label="Reply by"   value={ex.reply_by ? fmtDate(ex.reply_by) : ""} />
                        </div>
                        {ex.model_name && (
                          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "11px" }}>
                            Extracted by {ex.model_name} · {ex.extracted_at ? fmtDate(ex.extracted_at) : ""}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Official Document — opens a small popup */}
              {docs.length > 0 && (
                <div style={{ marginBottom: "18px" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>Official Document</h3>
                  {docs.map((d) => (
                    <div key={d.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", borderRadius: "10px",
                      background: "var(--accent-soft)", marginBottom: "8px",
                    }}>
                      <span style={{ fontSize: "14px" }}>{d.filename}</span>
                      <button onClick={() => setDocPopup(d)}
                        style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "transparent", padding: "4px 14px", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                        View source
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Letter thread — the file-number series; only shown when there
                  is an actual chain (more than the letter itself). */}
              {docs.length > 0 && thread.length > 1 && (
                <div style={{ marginBottom: "18px" }}>
                  <h3 style={{ margin: "0 0 2px", fontSize: "15px" }}>Letter thread</h3>
                  <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: "12.5px" }}>
                    This meeting's correspondence trail — corrigenda and follow-ups in order.
                  </p>
                  {thread.map((t, i) => {
                    const isThis = t.id === docs[0].id;
                    return (
                      <div key={t.id ?? i} style={{ display: "flex", gap: "12px" }}>
                        {/* dot + connector line */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "12px", flexShrink: 0 }}>
                          <span style={{
                            width: "9px", height: "9px", borderRadius: "99px", marginTop: "9px",
                            background: isThis ? "var(--accent)" : "var(--border-2)", flexShrink: 0,
                          }} />
                          {i < thread.length - 1 && (
                            <span style={{ width: "2px", flex: 1, background: "var(--border)" }} />
                          )}
                        </div>
                        <div style={{
                          flex: 1, minWidth: 0, padding: "6px 10px 12px", marginBottom: "2px",
                          borderRadius: "10px",
                          background: isThis ? "var(--accent-soft)" : "transparent",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            {t.ref_number && (
                              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", fontWeight: 600, color: "var(--text-2)" }}>
                                {t.ref_number}
                              </span>
                            )}
                            {isThis && (
                              <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 9px", borderRadius: "99px", background: "var(--accent)", color: "#fff" }}>
                                this letter
                              </span>
                            )}
                            {t.letter_status && (
                              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 9px", borderRadius: "99px", background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                                {t.letter_status}
                              </span>
                            )}
                            {t.uploaded_at && (
                              <span style={{ marginLeft: "auto", fontSize: "11.5px", color: "var(--muted)" }}>
                                {fmtDate(t.uploaded_at)}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "13.5px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {t.filename}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Connections — backlinks + graph */}
              <Connections kind="event" id={ev.id} />

              {/* Notes attached to this event */}
              <EntityNotes entityType="event" entityId={ev.id} />

              {/* History */}
              {history.length > 0 && (
                <details style={{ marginBottom: "18px" }}>
                  <summary style={{ cursor: "pointer", fontSize: "14px", color: "var(--text-2)", fontWeight: 600 }}>
                    History ({history.length})
                  </summary>
                  <div style={{ marginTop: "10px" }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "13px" }}>
                        <strong style={{ color: "var(--accent)" }}>{h.action}</strong>
                        {h.detail ? ` — ${h.detail}` : ""}
                        <span style={{ float: "right", color: "var(--muted)", fontSize: "11px" }}>
                          {fmtDateTime(h.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                <button onClick={() => onDelete(ev.id)}
                  style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  Delete
                </button>
                <button onClick={() => onEdit(ev)}
                  style={{ background: "var(--accent)", color: "white", border: "none", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  Edit / Reschedule
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Small source-document popup */}
      {docPopup && (
        <div
          onClick={(e) => { e.stopPropagation(); setDocPopup(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1200,
            background: "rgba(15,23,42,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: "20px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)", borderRadius: "16px", padding: "22px",
              width: "100%", maxWidth: "360px", boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>Source Document</h3>
              <button onClick={() => setDocPopup(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "20px" }}>×</button>
            </div>
            <p style={{ margin: "0 0 6px" }}><strong>{docPopup.filename}</strong></p>
            <p style={{ margin: "0 0 4px", color: "var(--muted)", fontSize: "13px" }}>
              Type: {(docPopup.file_type || "").toUpperCase()}
            </p>
            {docPopup.uploaded_at && (
              <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: "13px" }}>
                Uploaded: {fmtDate(docPopup.uploaded_at)}
              </p>
            )}
            <a href={documentDownloadUrl(docPopup.id)} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", background: "var(--accent)", color: "white", padding: "9px 18px", borderRadius: "10px", textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>
              Open original
            </a>
          </motion.div>
        </div>
      )}
    </div>
  );
}
