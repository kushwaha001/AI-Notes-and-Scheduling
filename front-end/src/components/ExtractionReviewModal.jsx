import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getConfirmation, confirmItem, dismissItem, documentDownloadUrl, getEvents } from "../services/api";
import DateInput, { fmtDate, toApiDate } from "./DateInput";
import { useToast } from "./ToastProvider";

// confidence badge — low (<70%) is flagged red per FR-10/FR-14
function Conf({ value }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const low = pct < 70;
  return (
    <span style={{
      fontSize: "11px", fontWeight: 600, marginLeft: "8px",
      padding: "1px 8px", borderRadius: "99px",
      background: low ? "#fef2f2" : "#f0fdf4",
      color: low ? "#dc2626" : "#16a34a",
    }}>
      {pct}%{low ? " · low" : ""}
    </span>
  );
}

function Labelled({ label, conf, low, children }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "flex", alignItems: "center", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>
        {label}<Conf value={conf} />
        {low && <span style={{ marginLeft: "6px", color: "#dc2626", fontSize: "11px" }}>⚠ check this</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: "8px",
  border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box",
};

export default function ExtractionReviewModal({ jobId, onClose, onDone }) {
  const [data, setData]     = useState(null);
  const [forms, setForms]   = useState({});   // extraction id -> editable fields
  const [busy, setBusy]     = useState(null);
  const [error, setError]   = useState("");
  const [conflict, setConflict] = useState({}); // exId -> clashing event title (FR-15)
  const toast = useToast();

  useEffect(() => {
    if (jobId == null) return;
    getConfirmation(jobId)
      .then((d) => {
        setData(d);
        const f = {};
        (d.extractions || []).forEach((ex) => {
          f[ex.id] = {
            item_type : ex.item_type || "event",
            title     : ex.subject || "",
            event_date: ex.event_date ? String(ex.event_date).split("T")[0] : "",
            event_time: ex.event_time ? String(ex.event_time).slice(0, 5) : "",
            venue     : ex.venue || "",
            attendees : ex.attendees || "",
            ref_number: ex.ref_number || "",
            deadline  : ex.deadline ? String(ex.deadline).split("T")[0] : "",
            reply_by  : ex.reply_by ? String(ex.reply_by).split("T")[0] : "",
          };
        });
        setForms(f);
      })
      .catch((e) => setError(e.message));
  }, [jobId]);

  if (jobId == null) return null;

  const job  = data?.job;
  const exs  = data?.extractions ?? [];

  function setField(exId, key, val) {
    setForms((f) => ({ ...f, [exId]: { ...f[exId], [key]: val } }));
  }

  async function handleConfirm(ex) {
    const f = forms[ex.id];
    if (!f.title) { alert("Title is required."); return; }

    // FR-15 — warn if this event clashes with an existing one on the same date
    if (f.item_type === "event" && f.event_date && !conflict[ex.id]) {
      try {
        const existing = await getEvents();
        const clash = existing.find((e) => String(e.event_date).split("T")[0] === f.event_date);
        if (clash) {
          setConflict((c) => ({ ...c, [ex.id]: clash.title }));
          return; // require a second click to save anyway
        }
      } catch { /* if the check fails, don't block saving */ }
    }

    setBusy(ex.id);
    try {
      await confirmItem({
        job_id    : jobId,
        item_index: ex.id,
        item_type : f.item_type,
        title     : f.title,
        event_date: toApiDate(f.event_date),
        event_time: f.event_time,
        venue     : f.venue,
        attendees : f.attendees,
        ref_number: f.ref_number,
        deadline  : toApiDate(f.deadline),
        reply_by  : toApiDate(f.reply_by),
        due_date  : toApiDate(f.deadline || f.reply_by),
      });
      toast.success(f.item_type === "event" ? "Event saved to calendar." : "Task saved.");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDismiss(ex) {
    if (!window.confirm) {} // keep simple
    setBusy(ex.id);
    try {
      await dismissItem({ job_id: jobId, item_index: ex.id });
      toast.info("Proposal dismissed — the document is kept and searchable.");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(`Dismiss failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

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
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "20px",
          width: "100%", maxWidth: "640px", maxHeight: "88vh", overflowY: "auto",
          boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid #f1f5f9",
          position: "sticky", top: 0, background: "white", borderRadius: "20px 20px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "#60a5fa", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Review AI extraction
            </p>
            <h2 style={{ margin: 0, fontSize: "20px" }}>{job?.filename || "Document"}</h2>
            <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "13px" }}>
              Check the fields, correct anything wrong, then approve. Nothing is saved until you confirm.
            </p>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px" }}>×</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {error && <p style={{ color: "#ef4444" }}>{error}</p>}
          {data && exs.length === 0 && (
            <p style={{ color: "#94a3b8" }}>No extracted items. You can dismiss this document.</p>
          )}

          {exs.map((ex) => {
            const f = forms[ex.id] || {};
            const conf = ex.field_confidence || {};
            const dateLow = (conf.event_date ?? 1) < 0.7;
            return (
              <div key={ex.id} style={{
                border: "1px solid #e2e8f0", borderRadius: "14px",
                padding: "16px", marginBottom: "16px",
              }}>
                {/* event/task toggle */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                  {["event", "task"].map((t) => (
                    <button key={t} onClick={() => setField(ex.id, "item_type", t)}
                      style={{
                        padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer",
                        fontWeight: 600, fontSize: "13px",
                        background: f.item_type === t ? "#2563eb" : "#f1f5f9",
                        color: f.item_type === t ? "white" : "#475569",
                      }}>
                      {t === "event" ? "📅 Event" : "📋 Task"}
                    </button>
                  ))}
                </div>

                {/* warnings (FR-11) */}
                {ex.meeting_date_flag && (
                  <p style={{ background: "#fff7ed", color: "#c2410c", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", margin: "0 0 12px" }}>
                    ⚠ The meeting date is in the past — please verify it.
                  </p>
                )}
                {ex.reply_by_overdue && (
                  <p style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", margin: "0 0 12px" }}>
                    ⚠ The reply-by date is overdue.
                  </p>
                )}

                <Labelled label="Title / subject" conf={conf.subject}>
                  <input style={inputStyle} value={f.title} onChange={(e) => setField(ex.id, "title", e.target.value)} />
                </Labelled>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                  <Labelled label="Date" conf={conf.event_date} low={dateLow}>
                    <DateInput value={f.event_date} onChange={(v) => setField(ex.id, "event_date", v)} />
                  </Labelled>
                  <Labelled label="Time" conf={conf.event_time}>
                    <input type="time" style={inputStyle} value={f.event_time} onChange={(e) => setField(ex.id, "event_time", e.target.value)} />
                  </Labelled>
                  <Labelled label="Venue" conf={conf.venue}>
                    <input style={inputStyle} value={f.venue} onChange={(e) => setField(ex.id, "venue", e.target.value)} />
                  </Labelled>
                  <Labelled label="Attendees" conf={conf.attendees}>
                    <input style={inputStyle} value={f.attendees} onChange={(e) => setField(ex.id, "attendees", e.target.value)} />
                  </Labelled>
                  <Labelled label="Reference #" conf={conf.ref_number}>
                    <input style={inputStyle} value={f.ref_number} onChange={(e) => setField(ex.id, "ref_number", e.target.value)} />
                  </Labelled>
                  <Labelled label="Deadline" conf={conf.deadline}>
                    <DateInput value={f.deadline} onChange={(v) => setField(ex.id, "deadline", v)} />
                  </Labelled>
                  <Labelled label="Reply by" conf={conf.reply_by}>
                    <DateInput value={f.reply_by} onChange={(v) => setField(ex.id, "reply_by", v)} />
                  </Labelled>
                </div>

                {conflict[ex.id] && (
                  <p style={{ background: "#fff7ed", color: "#c2410c", padding: "8px 12px", borderRadius: "8px", fontSize: "13px", margin: "10px 0 0" }}>
                    ⚠ Conflict: "{conflict[ex.id]}" is already scheduled on {fmtDate(forms[ex.id].event_date)}. Click again to save anyway.
                  </p>
                )}
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                  <button onClick={() => handleDismiss(ex)} disabled={busy === ex.id}
                    style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                    Dismiss
                  </button>
                  <button onClick={() => handleConfirm(ex)} disabled={busy === ex.id}
                    style={{ background: conflict[ex.id] ? "#f59e0b" : "#10b981", color: "white", border: "none", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                    {busy === ex.id ? "Saving…" : conflict[ex.id] ? "Save anyway" : "Confirm & Save"}
                  </button>
                </div>
              </div>
            );
          })}

          {job && (
            <a href={documentDownloadUrl(job.doc_id)} target="_blank" rel="noreferrer"
              style={{ color: "#2563eb", fontSize: "13px", textDecoration: "none" }}>
              Open original document ↗
            </a>
          )}
        </div>
      </motion.div>
    </div>
  );
}
