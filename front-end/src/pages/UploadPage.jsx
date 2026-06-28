import { useState, useEffect } from "react";
import {
  uploadFile,
  getDocuments,
  deleteDocument,
  getPendingConfirmations,
  documentDownloadUrl,
  getAuditLog,
  processQueue,
  checkServices,
  reextractDocument,
} from "../services/api";
import { motion } from "framer-motion";
import { fmtDate } from "../components/DateInput";
import ExtractionReviewModal from "../components/ExtractionReviewModal";

const STATUS_COLOR = {
  queued: "#f59e0b", processing: "#3b82f6", ready_to_confirm: "#8b5cf6",
  done: "#22c55e", failed: "#ef4444", trashed: "#94a3b8",
  waiting: "#f59e0b", awaiting_confirm: "#8b5cf6", cancelled: "#94a3b8",
  uploading: "#3b82f6", duplicate: "#f59e0b",
};

export default function UploadPage() {
  // FR-2 batch upload — queue of files with per-file status
  const [queue, setQueue]       = useState([]); // [{ name, size, status, message }]
  const [uploading, setUploading] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [pending, setPending]     = useState([]);
  const [history, setHistory]     = useState(null); // { doc, entries }
  const [reviewJob, setReviewJob] = useState(null); // job_id under review
  const [aiStatus, setAiStatus]   = useState(null); // "ready" | "offline"
  const [processing, setProcessing] = useState(false);

  function loadData() {
    getDocuments().then(setDocuments).catch(() => {});
    getPendingConfirmations().then(setPending).catch(() => {});
    checkServices().then((s) => setAiStatus(s.ai_extraction)).catch(() => {});
  }
  useEffect(() => { loadData(); }, []);

  // poll while documents are still processing so results appear automatically
  const queuedCount = documents.filter(
    (d) => d.status === "queued" || d.status === "processing" ||
           d.queue_status === "waiting" || d.queue_status === "processing"
  ).length;

  useEffect(() => {
    if (queuedCount === 0) return;
    const id = setInterval(loadData, 5000);
    return () => clearInterval(id);
  }, [queuedCount]);

  async function handleProcessQueue() {
    setProcessing(true);
    try {
      await processQueue();
      setTimeout(loadData, 1500);
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(false);
    }
  }

  function onFilesPicked(fileList) {
    const files = Array.from(fileList);
    if (files.length > 20) {
      alert("Maximum 20 files per batch.");
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

  async function handleDeleteDoc(id) {
    if (!window.confirm("Move document to trash? You can restore it later.")) return;
    try { await deleteDocument(id); loadData(); }
    catch (e) { alert(e.message); }
  }

  // FR-14a — re-run extraction on a stored document
  async function handleReextract(id) {
    try {
      await reextractDocument(id);
      setTimeout(loadData, 1500);
    } catch (e) { alert(e.message); }
  }

  // FR-28 — per-item history view
  async function openHistory(doc) {
    try {
      const entries = await getAuditLog({ entity_type: "document", entity_id: doc.id });
      setHistory({ doc, entries });
    } catch (e) { alert(e.message); }
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
        {queuedCount > 0 && (
          <>
            <span style={{ color: "#64748b", fontSize: "13px" }}>
              {queuedCount} document(s) waiting / processing…
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

      {/* Batch queue (FR-2) */}
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

      {/* Pending confirmations */}
      {pending.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ marginBottom: "14px" }}>Pending AI Extractions</h2>
          {pending.map((item) => (
            <div key={item.job_id} style={{
              background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)",
              borderRadius: "16px", padding: "18px", marginBottom: "12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <strong>{item.filename}</strong>
                <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0" }}>
                  Uploaded {fmtDate(item.uploaded_at)}
                  {item.extraction_count > 0 ? ` — ${item.extraction_count} item(s)` : ""}
                </p>
              </div>
              <button onClick={() => setReviewJob(item.job_id)}
                style={{ background: "#2563eb", color: "white", border: "none", padding: "9px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                Review &amp; Confirm
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirm screen (FR-14) */}
      {reviewJob != null && (
        <ExtractionReviewModal
          jobId={reviewJob}
          onClose={() => setReviewJob(null)}
          onDone={loadData}
        />
      )}

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
                    {new Date(entry.created_at).toLocaleString()}
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
