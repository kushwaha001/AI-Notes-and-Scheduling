import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getEvent, documentDownloadUrl } from "../services/api";
import { fmtDate } from "./DateInput";

function Field({ label, value, confidence }) {
  if (value === null || value === undefined || value === "") return null;
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const low = pct != null && pct < 70; // FR-10/FR-14 — low confidence flagged
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ margin: "0 0 3px", color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <strong style={{ fontSize: "15px" }}>{value}</strong>
        {pct != null && (
          <span style={{
            fontSize: "11px", fontWeight: 600,
            padding: "2px 8px", borderRadius: "99px",
            background: low ? "#fef2f2" : "#f0fdf4",
            color: low ? "#dc2626" : "#16a34a",
          }}>
            {pct}%{low ? " · low" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

export default function EventDetailModal({ eventId, onClose, onEdit, onDelete }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (eventId == null) return;
    setLoading(true);
    getEvent(eventId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId]);

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
          background: "white", borderRadius: "22px",
          width: "100%", maxWidth: "620px", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "22px 26px", borderBottom: "1px solid #f1f5f9",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          position: "sticky", top: 0, background: "white", borderRadius: "22px 22px 0 0",
        }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "#60a5fa", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Event Details
            </p>
            <h2 style={{ margin: 0, fontSize: "24px" }}>
              {loading ? "Loading…" : ev?.title || "Event"}
            </h2>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "24px", lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ padding: "22px 26px" }}>
          {error && <p style={{ color: "#ef4444" }}>{error}</p>}

          {ev && (
            <>
              {/* Core event fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: "20px" }}>
                <Field label="Date" value={fmtDate(ev.event_date)} />
                <Field label="Time" value={ev.event_time ? String(ev.event_time).slice(0, 5) : ""} />
                <Field label="Venue" value={ev.venue} />
                <Field label="Attendees" value={ev.attendees} />
                <Field label="Classification" value={ev.classification} />
                <Field label="Source" value={ev.source} />
              </div>

              {/* AI-parsed extraction (FR-8, FR-10) */}
              <div style={{
                background: "#f8fafc", borderRadius: "14px", padding: "16px 18px",
                marginBottom: "18px", border: "1px solid #e2e8f0",
              }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  🤖 AI-Parsed Details
                </h3>
                {extractions.length === 0 ? (
                  <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                    {ev.source === "manual"
                      ? "This event was created manually — no AI extraction."
                      : "No AI-parsed fields are linked to this event yet."}
                  </p>
                ) : (
                  extractions.map((ex, i) => {
                    const conf = ex.field_confidence || {};
                    return (
                      <div key={i} style={{ marginBottom: i < extractions.length - 1 ? "16px" : 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
                          <Field label="Subject"    value={ex.subject}    confidence={conf.subject} />
                          <Field label="Date"       value={ex.event_date ? fmtDate(ex.event_date) : ""} confidence={conf.event_date} />
                          <Field label="Time"       value={ex.event_time ? String(ex.event_time).slice(0,5) : ""} confidence={conf.event_time} />
                          <Field label="Venue"      value={ex.venue}      confidence={conf.venue} />
                          <Field label="Attendees"  value={ex.attendees}  confidence={conf.attendees} />
                          <Field label="Reference#" value={ex.ref_number} confidence={conf.ref_number} />
                          <Field label="Deadline"   value={ex.deadline ? fmtDate(ex.deadline) : ""} confidence={conf.deadline} />
                          <Field label="Reply by"   value={ex.reply_by ? fmtDate(ex.reply_by) : ""} confidence={conf.reply_by} />
                        </div>
                        {ex.model_name && (
                          <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "11px" }}>
                            Extracted by {ex.model_name} · {ex.extracted_at ? fmtDate(ex.extracted_at) : ""}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Source document (FR-27) */}
              {docs.length > 0 && (
                <div style={{ marginBottom: "18px" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>Source Document</h3>
                  {docs.map((d) => (
                    <div key={d.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", borderRadius: "10px",
                      background: "#eff6ff", marginBottom: "8px",
                    }}>
                      <span style={{ fontSize: "14px" }}>{d.filename}</span>
                      <a href={documentDownloadUrl(d.id)} target="_blank" rel="noreferrer"
                        style={{ color: "#2563eb", border: "1px solid #2563eb", padding: "4px 14px", borderRadius: "8px", fontSize: "12px", textDecoration: "none", fontWeight: 600 }}>
                        Open original
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {/* History (FR-28) */}
              {history.length > 0 && (
                <details style={{ marginBottom: "18px" }}>
                  <summary style={{ cursor: "pointer", fontSize: "14px", color: "#475569", fontWeight: 600 }}>
                    History ({history.length})
                  </summary>
                  <div style={{ marginTop: "10px" }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "13px" }}>
                        <strong style={{ color: "#2563eb" }}>{h.action}</strong>
                        {h.detail ? ` — ${h.detail}` : ""}
                        <span style={{ float: "right", color: "#94a3b8", fontSize: "11px" }}>
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                <button onClick={() => onDelete(ev.id)}
                  style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  Delete
                </button>
                <button onClick={() => onEdit(ev)}
                  style={{ background: "#2563eb", color: "white", border: "none", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  Edit / Reschedule
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
