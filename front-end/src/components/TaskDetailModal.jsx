import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTask, updateTask, deleteTask, documentDownloadUrl } from "../services/api";
import DateInput, { fmtDate, toApiDate, fmtDateTime } from "./DateInput";
import EntityNotes from "./EntityNotes";

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ margin: "0 0 3px", color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </p>
      <strong style={{ fontSize: "15px" }}>{value}</strong>
    </div>
  );
}

// Self-contained task detail popup — mirrors EventDetailModal. Handles its own
// mark-done / reschedule / delete and calls onChanged so the calendar refreshes.
export default function TaskDetailModal({ taskId, onClose, onChanged }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [docPopup, setDocPopup] = useState(null);
  const [dueEdit, setDueEdit] = useState("");   // reschedule field (empty = not editing)
  const [busy, setBusy]       = useState(false);

  function reload() {
    setLoading(true);
    getTask(taskId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (taskId == null) return;
    reload();
  }, [taskId]);

  if (taskId == null) return null;

  const task        = data?.task;
  const docs        = data?.source_documents ?? [];
  const extractions = data?.extractions ?? [];
  const history     = data?.history ?? [];

  async function markDone() {
    setBusy(true);
    try { await updateTask(task.id, { status: task.status === "done" ? "open" : "done" }); onChanged?.(); reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function saveDue() {
    setBusy(true);
    try { await updateTask(task.id, { due_date: toApiDate(dueEdit) }); setDueEdit(""); onChanged?.(); reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function removeTask() {
    if (!window.confirm("Move task to trash? You can restore it later.")) return;
    setBusy(true);
    try { await deleteTask(task.id); onChanged?.(); onClose(); }
    catch (e) { setError(e.message); setBusy(false); }
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
            <p style={{ margin: "0 0 4px", color: "#16a34a", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
              Task Details
            </p>
            <h2 style={{ margin: 0, fontSize: "24px" }}>
              {loading ? "Loading…" : task?.title || "Task"}
            </h2>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "24px", lineHeight: 1 }}>
            ×
          </button>
        </div>

        <div style={{ padding: "22px 26px" }}>
          {error && <p style={{ color: "#ef4444" }}>{error}</p>}

          {task && (
            <>
              {/* Core task fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: "16px" }}>
                <Field label="Due date" value={task.due_date ? fmtDate(task.due_date) : "No due date"} />
                <Field label="Status" value={task.status} />
                <Field label="Category" value={task.classification} />
                <Field label="Source" value={task.source} />
                {task.is_reply_task && <Field label="Type" value="Reply task" />}
              </div>

              {/* Reschedule */}
              {dueEdit === "" ? (
                <button onClick={() => setDueEdit(task.due_date ? String(task.due_date).split("T")[0] : "")}
                  style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", padding: "6px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", marginBottom: "18px" }}>
                  Reschedule due date
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginBottom: "18px" }}>
                  <DateInput label="New due date" value={dueEdit} onChange={setDueEdit} />
                  <button onClick={saveDue} disabled={busy}
                    style={{ background: "#2563eb", color: "white", border: "none", padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                    Save
                  </button>
                  <button onClick={() => setDueEdit("")}
                    style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "9px 16px", borderRadius: "8px", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Summary / Additional Detail (AI-parsed when available) */}
              {extractions.length > 0 && (
                <div style={{
                  background: "#f8fafc", borderRadius: "14px", padding: "16px 18px",
                  marginBottom: "18px", border: "1px solid #e2e8f0",
                }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: "15px" }}>Summary / Additional Detail</h3>
                  {extractions.map((ex, i) => (
                    <div key={i} style={{ marginBottom: i < extractions.length - 1 ? "16px" : 0 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px" }}>
                        <Field label="Subject"    value={ex.subject} />
                        <Field label="Deadline"   value={ex.deadline ? fmtDate(ex.deadline) : ""} />
                        <Field label="Reply by"   value={ex.reply_by ? fmtDate(ex.reply_by) : ""} />
                        <Field label="Reference#" value={ex.ref_number} />
                      </div>
                      {ex.model_name && (
                        <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: "11px" }}>
                          Extracted by {ex.model_name} · {ex.extracted_at ? fmtDate(ex.extracted_at) : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Official Document */}
              {docs.length > 0 && (
                <div style={{ marginBottom: "18px" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>Official Document</h3>
                  {docs.map((d) => (
                    <div key={d.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "12px 14px", borderRadius: "10px",
                      background: "#eff6ff", marginBottom: "8px",
                    }}>
                      <span style={{ fontSize: "14px" }}>{d.filename}</span>
                      <button onClick={() => setDocPopup(d)}
                        style={{ color: "#2563eb", border: "1px solid #2563eb", background: "transparent", padding: "4px 14px", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                        View source
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes attached to this task */}
              <EntityNotes entityType="task" entityId={task.id} />

              {/* History */}
              {history.length > 0 && (
                <details style={{ marginBottom: "18px" }}>
                  <summary style={{ cursor: "pointer", fontSize: "14px", color: "#475569", fontWeight: 600 }}>
                    History ({history.length})
                  </summary>
                  <div style={{ marginTop: "10px" }}>
                    {history.map((h, i) => (
                      <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: "13px" }}>
                        <strong style={{ color: "#16a34a" }}>{h.action}</strong>
                        {h.detail ? ` — ${h.detail}` : ""}
                        <span style={{ float: "right", color: "#94a3b8", fontSize: "11px" }}>
                          {fmtDateTime(h.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid #f1f5f9", paddingTop: "16px" }}>
                <button onClick={removeTask} disabled={busy}
                  style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  Delete
                </button>
                <button onClick={markDone} disabled={busy}
                  style={{ background: task.status === "done" ? "#f1f5f9" : "#16a34a", color: task.status === "done" ? "#0f172a" : "white", border: "none", padding: "9px 18px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                  {task.status === "done" ? "Reopen" : "Mark Done"}
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
              background: "white", borderRadius: "16px", padding: "22px",
              width: "100%", maxWidth: "360px", boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "16px" }}>Source Document</h3>
              <button onClick={() => setDocPopup(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "20px" }}>×</button>
            </div>
            <p style={{ margin: "0 0 6px" }}><strong>{docPopup.filename}</strong></p>
            <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "13px" }}>
              Type: {(docPopup.file_type || "").toUpperCase()}
            </p>
            {docPopup.uploaded_at && (
              <p style={{ margin: "0 0 14px", color: "#64748b", fontSize: "13px" }}>
                Uploaded: {fmtDate(docPopup.uploaded_at)}
              </p>
            )}
            <a href={documentDownloadUrl(docPopup.id)} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", background: "#2563eb", color: "white", padding: "9px 18px", borderRadius: "10px", textDecoration: "none", fontWeight: 600, fontSize: "14px" }}>
              Open original
            </a>
          </motion.div>
        </div>
      )}
    </div>
  );
}
