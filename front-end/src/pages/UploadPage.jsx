import { useState, useEffect } from "react";
import {
  uploadFile,
  getDocuments,
  deleteDocument,
  getPendingConfirmations,
  getConfirmation,
  documentDownloadUrl,
  getAuditLog,
  processQueue,
  checkServices,
  reextractDocument,
  confirmAllExtractions,
  dismissAllExtractions,
} from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import { fmtDate, fmtDateTime } from "../components/DateInput";
import { useToast } from "../components/ToastProvider";

const STATUS_COLOR = {
  queued: "#f59e0b", processing: "#3b82f6", ready_to_confirm: "#8b5cf6",
  done: "#22c55e", failed: "#ef4444", trashed: "#94a3b8",
  waiting: "#f59e0b", awaiting_confirm: "#8b5cf6", cancelled: "#94a3b8",
  uploading: "#3b82f6", duplicate: "#f59e0b",
};

// Small inline spinner (framer-motion rotate — no extra CSS framework needed)
function Spinner({ size = 18, color = "#4f46e5", track = "#c7d2fe" }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
      style={{
        width: size, height: size, borderRadius: "50%",
        border: `2px solid ${track}`, borderTopColor: color, flexShrink: 0,
      }}
    />
  );
}

// Indeterminate progress bar — we can't know the exact %, so a sweeping bar
// communicates "working" honestly.
function ProgressSweep() {
  return (
    <div style={{
      height: 6, borderRadius: 99, background: "#e0e7ff",
      overflow: "hidden", position: "relative",
    }}>
      <motion.div
        animate={{ x: ["-40%", "260%"] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
        style={{
          position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 99,
          background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
        }}
      />
    </div>
  );
}

// "2026-07-09" -> "09 Jul 2026"; passes other strings through unchanged.
function prettyDate(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}

// Average the per-field confidence scores into a single 0–100 figure.
// Confidence is shown ONLY here, at extraction time (per product decision).
function overallConfidence(fieldConfidence) {
  if (!fieldConfidence || typeof fieldConfidence !== "object") return null;
  const vals = Object.values(fieldConfidence).filter((v) => typeof v === "number");
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 100);
}

// A clean read-only summary of one extracted item — what will be added.
function ExtractionPreview({ ex }) {
  const isEvent = ex.item_type === "event" && ex.event_date;
  const conf = overallConfidence(ex.field_confidence);
  const lowConf = conf != null && conf < 70;
  const chips = [];
  if (isEvent) {
    if (ex.event_date) chips.push(["📅", prettyDate(ex.event_date)]);
    if (ex.event_time) chips.push(["🕐", String(ex.event_time).slice(0, 5)]);
    if (ex.venue)      chips.push(["📍", ex.venue]);
    if (ex.attendees)  chips.push(["👥", ex.attendees]);
    if (ex.reply_by)   chips.push(["↩️", `Reply by ${prettyDate(ex.reply_by)}`]);
  } else {
    const due = ex.deadline || ex.reply_by || ex.event_date;
    if (due) chips.push(["📅", `Due ${prettyDate(due)}`]);
  }

  const accent = isEvent ? "#2563eb" : "#9333ea";
  return (
    <div style={{
      background: "white", border: "1px solid #e2e8f0", borderLeft: `4px solid ${accent}`,
      borderRadius: "10px", padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: chips.length ? "8px" : 0 }}>
        <span style={{
          background: `${accent}15`, color: accent, fontWeight: 700, fontSize: "11px",
          padding: "2px 9px", borderRadius: "99px", textTransform: "uppercase", letterSpacing: "0.03em",
        }}>
          {isEvent ? "Event" : "Task"}
        </span>
        <strong style={{ fontSize: "14px" }}>{ex.subject || "Untitled"}</strong>
        {conf != null && (
          <span
            title="AI confidence for this extraction (shown at extraction time only)"
            style={{
              marginLeft: "auto", fontSize: "11px", fontWeight: 700,
              padding: "2px 9px", borderRadius: "99px",
              background: lowConf ? "#fef2f2" : "#f0fdf4",
              color: lowConf ? "#dc2626" : "#16a34a",
            }}>
            {conf}% confident{lowConf ? " · review" : ""}
          </span>
        )}
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
          {chips.map(([icon, text], i) => (
            <span key={i} style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              background: "#f1f5f9", color: "#334155", fontSize: "12.5px",
              padding: "3px 10px", borderRadius: "8px",
            }}>
              <span>{icon}</span>{text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const toast = useToast();

  // FR-2 batch upload — queue of files with per-file status
  const [queue, setQueue]       = useState([]); // [{ name, size, status, message }]
  const [uploading, setUploading] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [pending, setPending]     = useState([]);
  const [details, setDetails]     = useState({}); // { job_id: [extraction, ...] } — preview
  const [history, setHistory]     = useState(null); // { doc, entries }
  const [aiStatus, setAiStatus]   = useState(null); // "ready" | "offline"
  const [processing, setProcessing] = useState(false);
  const [addingJob, setAddingJob] = useState(null); // job_id being added to calendar

  function loadData() {
    getDocuments().then(setDocuments).catch(() => {});
    getPendingConfirmations().then(setPending).catch(() => {});
    checkServices().then((s) => setAiStatus(s.ai_extraction)).catch(() => {});
  }
  useEffect(() => { loadData(); }, []);

  // Documents still being read by the AI (parse + extract). These sit in the
  // Processing section until extraction finishes and they move to "Ready".
  const inProgress = documents.filter(
    (d) => d.status === "queued" || d.status === "processing" ||
           d.queue_status === "waiting" || d.queue_status === "processing"
  );

  // poll while anything is processing OR while uploads are mid-flight, so the
  // Processing → Ready transition appears automatically without a refresh.
  useEffect(() => {
    if (inProgress.length === 0) return;
    const id = setInterval(loadData, 4000);
    return () => clearInterval(id);
  }, [inProgress.length]);

  // Pull the extracted fields for each ready document so the user can SEE what
  // will be added before clicking (a clean preview — no confidence/edit review).
  useEffect(() => {
    pending.forEach((p) => {
      getConfirmation(p.job_id)
        .then((r) => setDetails((d) => ({ ...d, [p.job_id]: r.extractions || [] })))
        .catch(() => {});
    });
  }, [pending]);

  async function handleProcessQueue() {
    setProcessing(true);
    try {
      await processQueue();
      setTimeout(loadData, 1500);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  function onFilesPicked(fileList) {
    const files = Array.from(fileList);
    if (files.length > 20) {
      toast.error("Maximum 20 files per batch.");
      return;
    }
    setQueue(files.map((f) => ({ file: f, name: f.name, size: f.size, status: "queued", message: "" })));
  }

  // FR-2 / NFR-6 — process the batch sequentially (single pipeline)
  async function handleBatchUpload() {
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "done") continue;
      setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: "uploading" } : item));
      try {
        const res = await uploadFile(queue[i].file);
        setQueue((q) => q.map((item, idx) =>
          idx === i ? { ...item, status: "done", message: `Job #${res.job_id}` } : item));
      } catch (e) {
        const dup = String(e.message).toLowerCase().includes("duplicate");
        setQueue((q) => q.map((item, idx) =>
          idx === i ? { ...item, status: dup ? "duplicate" : "failed", message: e.message } : item));
      }
    }
    setUploading(false);
    loadData();
  }

  // One-click: add EVERY extracted item from this document to the calendar/tasks.
  async function handleAddToCalendar(item) {
    setAddingJob(item.job_id);
    try {
      const res = await confirmAllExtractions(item.job_id);
      const bits = [];
      if (res.events_added) bits.push(`${res.events_added} event${res.events_added > 1 ? "s" : ""}`);
      if (res.tasks_added) bits.push(`${res.tasks_added} task${res.tasks_added > 1 ? "s" : ""}`);
      const skipped = res.events_skipped
        ? ` (${res.events_skipped} duplicate${res.events_skipped > 1 ? "s" : ""} skipped)`
        : "";
      if (res.total > 0) {
        toast.success(`Added ${bits.join(" + ")} to your calendar.${skipped}`);
      } else if (res.events_skipped) {
        toast.info(`Already on your calendar — ${res.events_skipped} duplicate${res.events_skipped > 1 ? "s" : ""} skipped.`);
      } else {
        toast.info("Nothing schedulable was found in this document.");
      }
      loadData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingJob(null);
    }
  }

  async function handleDismissExtraction(item) {
    setAddingJob(item.job_id);
    try {
      await dismissAllExtractions(item.job_id);
      toast.info("Dismissed. The document is kept and searchable.");
      loadData();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAddingJob(null);
    }
  }

  async function handleDeleteDoc(id) {
    if (!window.confirm("Move document to trash? You can restore it later.")) return;
    try { await deleteDocument(id); loadData(); }
    catch (e) { toast.error(e.message); }
  }

  // FR-14a — re-run extraction on a stored document
  async function handleReextract(id) {
    try {
      await reextractDocument(id);
      toast.info("Re-extraction started…");
      setTimeout(loadData, 1500);
    } catch (e) { toast.error(e.message); }
  }

  // FR-28 — per-item history view
  async function openHistory(doc) {
    try {
      const entries = await getAuditLog({ entity_type: "document", entity_id: doc.id });
      setHistory({ doc, entries });
    } catch (e) { toast.error(e.message); }
  }

  const doneCount = queue.filter((q) => q.status === "done").length;

  return (
    <div>
      <h1 style={{ marginBottom: "10px" }}>Upload Documents</h1>
      <p style={{ color: "#94a3b8", marginBottom: "16px" }}>
        Upload letters, notices and scanned mail. PDF, JPG, PNG, TIFF — max 50 MB each,
        up to 20 files per batch.
      </p>

      {/* AI status + run-queue control */}
      <div style={{
        display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
        background: aiStatus === "ready" ? "#f0fdf4" : "#fff7ed",
        border: `1px solid ${aiStatus === "ready" ? "#bbf7d0" : "#fed7aa"}`,
        borderRadius: "14px", padding: "14px 18px", marginBottom: "24px",
      }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: aiStatus === "ready" ? "#15803d" : "#c2410c" }}>
          {aiStatus === "ready" ? "🤖 AI extraction is ON (gemma3:4b)"
            : aiStatus == null ? "Checking AI…" : "AI extraction is OFF"}
        </span>
        {inProgress.length > 0 && (
          <>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {inProgress.length} document(s) processing…
            </span>
            <button
              onClick={handleProcessQueue}
              disabled={processing || aiStatus !== "ready"}
              style={{
                marginLeft: "auto",
                background: aiStatus === "ready" ? "#2563eb" : "#94a3b8",
                color: "white", border: "none", padding: "8px 18px",
                borderRadius: "8px", cursor: aiStatus === "ready" ? "pointer" : "not-allowed",
                fontWeight: 600, fontSize: "14px",
              }}
            >
              {processing ? "Starting…" : "▶ Run AI on queued"}
            </button>
          </>
        )}
        {aiStatus !== "ready" && aiStatus != null && (
          <span style={{ color: "#9a3412", fontSize: "13px" }}>
            Start Ollama and pull the model — see AI-SETUP.md.
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFilesPicked(e.dataTransfer.files); }}
        style={{
          background: "#0f172a", border: "2px dashed #334155",
          borderRadius: "20px", padding: "48px", textAlign: "center", marginBottom: "20px",
        }}
      >
        <h2 style={{ marginBottom: "10px", color: "white" }}>Drag &amp; Drop Documents</h2>
        <p style={{ color: "#94a3b8", marginBottom: "18px" }}>Select one or many files</p>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff"
          onChange={(e) => onFilesPicked(e.target.files)}
          style={{ color: "#94a3b8" }} />
      </div>

      {/* Batch upload queue (FR-2) */}
      {queue.length > 0 && (
        <div style={{ background: "white", borderRadius: "18px", padding: "20px", marginBottom: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h3 style={{ margin: 0 }}>Upload Queue — {doneCount}/{queue.length} done</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setQueue([])} disabled={uploading}
                style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "8px 16px", borderRadius: "8px", cursor: "pointer" }}>
                Clear
              </button>
              <button onClick={handleBatchUpload} disabled={uploading}
                style={{ background: uploading ? "#64748b" : "#2563eb", color: "white", border: "none", padding: "8px 20px", borderRadius: "8px", cursor: uploading ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {uploading ? "Uploading…" : `Upload ${queue.length} file(s)`}
              </button>
            </div>
          </div>
          {queue.map((item, idx) => (
            <div key={idx} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderRadius: "10px", marginBottom: "8px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.name}</span>
                <span style={{ color: "#94a3b8", fontSize: "12px", marginLeft: "10px" }}>
                  {(item.size / 1024).toFixed(0)} KB{item.message ? ` · ${item.message}` : ""}
                </span>
              </div>
              <span style={{
                background: `${STATUS_COLOR[item.status]}20`, color: STATUS_COLOR[item.status],
                padding: "3px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600,
              }}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Processing section (live) ─────────────────────────────
          A document stays here while the AI reads it — parse + extract can
          take up to a minute — so the page never looks blank mid-extraction. */}
      <AnimatePresence>
        {inProgress.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              marginBottom: "28px",
              background: "linear-gradient(180deg,#eef2ff,#ffffff)",
              border: "1px solid #c7d2fe", borderRadius: "18px", padding: "20px",
              boxShadow: "0 6px 20px rgba(79,70,229,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <Spinner size={20} />
              <h2 style={{ margin: 0, fontSize: "18px" }}>
                Processing — {inProgress.length} document{inProgress.length > 1 ? "s" : ""}
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {inProgress.map((doc) => {
                const stage = (doc.status === "processing" || doc.queue_status === "processing")
                  ? "Reading & extracting fields…"
                  : "Queued for the AI…";
                return (
                  <div key={doc.id} style={{
                    background: "white", borderRadius: "12px", padding: "14px 16px",
                    border: "1px solid #e0e7ff",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: "14px" }}>{doc.filename}</strong>
                        <p style={{ margin: "2px 0 0", color: "#6366f1", fontSize: "12px", fontWeight: 600 }}>
                          {stage}
                        </p>
                      </div>
                      <span style={{
                        background: "#eef2ff", color: "#4338ca", padding: "3px 12px",
                        borderRadius: "99px", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap",
                      }}>
                        {doc.status === "processing" ? "extracting" : "queued"}
                      </span>
                    </div>
                    <ProgressSweep />
                  </div>
                );
              })}
            </div>
            <p style={{ color: "#94a3b8", fontSize: "12px", margin: "12px 0 0" }}>
              This can take up to a minute per document — results appear here
              automatically, no refresh needed.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ready to add (one-click, no per-item review) ──────────── */}
      <AnimatePresence>
        {pending.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginBottom: "28px" }}
          >
            <h2 style={{ marginBottom: "6px" }}>✅ Ready to add to your calendar</h2>
            <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 14px" }}>
              Here's what the AI found. Review it below, then add it in one click.
            </p>
            {pending.map((item) => (
              <div key={item.job_id} style={{
                background: "#f0fdf4", border: "1px solid #bbf7d0",
                borderRadius: "16px", padding: "18px 20px", marginBottom: "12px",
                boxShadow: "0 4px 16px rgba(34,197,94,0.07)",
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: "16px", flexWrap: "wrap",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: "15px" }}>{item.filename}</strong>
                    <p style={{ color: "#15803d", fontSize: "13px", margin: "4px 0 0", fontWeight: 600 }}>
                      {item.extraction_count > 0
                        ? `${item.extraction_count} item(s) found — extraction complete`
                        : "Extraction complete"}
                    </p>
                    <p style={{ color: "#64748b", fontSize: "12px", margin: "2px 0 0" }}>
                      Uploaded {fmtDate(item.uploaded_at)}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <button onClick={() => handleDismissExtraction(item)}
                      disabled={addingJob === item.job_id}
                      style={{ background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", padding: "9px 16px", borderRadius: "9px", cursor: "pointer", fontSize: "14px" }}>
                      Dismiss
                    </button>
                    <button onClick={() => handleAddToCalendar(item)}
                      disabled={addingJob === item.job_id}
                      style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        background: "#16a34a", color: "white", border: "none",
                        padding: "9px 20px", borderRadius: "9px",
                        cursor: addingJob === item.job_id ? "wait" : "pointer", fontWeight: 700, fontSize: "14px",
                        boxShadow: "0 4px 12px rgba(22,163,74,0.25)",
                      }}>
                      {addingJob === item.job_id
                        ? <><Spinner size={15} color="#fff" track="rgba(255,255,255,0.4)" /> Adding…</>
                        : <>📅 Add to calendar</>}
                    </button>
                  </div>
                </div>

                {/* Preview of exactly what will be added (no confidence/edit) */}
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {(details[item.job_id] || []).map((ex) => (
                    <ExtractionPreview key={ex.id} ex={ex} />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded documents */}
      {documents.length > 0 && (
        <div>
          <h2 style={{ marginBottom: "14px" }}>Uploaded Documents</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {documents.map((doc) => (
              <div key={doc.id} style={{
                background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)",
                borderRadius: "14px", padding: "16px 20px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <strong>{doc.filename}</strong>
                  <p style={{ color: "#64748b", fontSize: "12px", margin: "4px 0 0" }}>
                    {doc.file_type.toUpperCase()} — uploaded {fmtDate(doc.uploaded_at)}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{
                    background: `${STATUS_COLOR[doc.status] ?? "#94a3b8"}20`,
                    color: STATUS_COLOR[doc.status] ?? "#94a3b8",
                    padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 600,
                  }}>{doc.status}</span>
                  <a href={documentDownloadUrl(doc.id)} target="_blank" rel="noreferrer"
                    style={{ color: "#2563eb", border: "1px solid #2563eb", padding: "4px 12px", borderRadius: "8px", fontSize: "12px", textDecoration: "none" }}>
                    Open
                  </a>
                  <button onClick={() => handleReextract(doc.id)} disabled={aiStatus !== "ready"}
                    title={aiStatus === "ready" ? "Re-run AI extraction" : "AI offline"}
                    style={{ background: "transparent", color: aiStatus === "ready" ? "#0891b2" : "#94a3b8", border: `1px solid ${aiStatus === "ready" ? "#0891b2" : "#cbd5e1"}`, padding: "4px 12px", borderRadius: "8px", cursor: aiStatus === "ready" ? "pointer" : "not-allowed", fontSize: "12px" }}>
                    Re-extract
                  </button>
                  <button onClick={() => openHistory(doc)}
                    style={{ background: "transparent", color: "#7c3aed", border: "1px solid #7c3aed", padding: "4px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}>
                    History
                  </button>
                  <button onClick={() => handleDeleteDoc(doc.id)}
                    style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "4px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px" }}>
                    Trash
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FR-28 — per-item history modal */}
      {history && (
        <div onClick={() => setHistory(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: "20px", padding: "26px", width: "100%", maxWidth: "560px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>History — {history.doc.filename}</h3>
              <button onClick={() => setHistory(null)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "20px" }}>×</button>
            </div>
            {history.entries.length === 0 ? (
              <p style={{ color: "#94a3b8" }}>No history recorded.</p>
            ) : (
              history.entries.map((entry) => (
                <div key={entry.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <strong style={{ color: "#2563eb" }}>{entry.action}</strong>
                  {entry.detail ? ` — ${entry.detail}` : ""}
                  <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: "12px" }}>
                    {fmtDateTime(entry.created_at)}
                  </p>
                </div>
              ))
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
