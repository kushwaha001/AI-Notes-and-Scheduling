import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  uploadFile,
  getDocuments,
  deleteDocument,
  getPendingConfirmations,
  documentDownloadUrl,
  getAuditLog,
  checkServices,
  reextractDocument,
  setLetterStatus,
  draftReply,
  getRegister,
  createNote,
} from "../services/api";
import { fmtDate, fmtDateTime } from "../components/DateInput";
import { useToast } from "../components/ToastProvider";
import Connections from "../components/Connections";
import AiStatusBadge from "../components/AiStatusBadge";

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// Correspondence lifecycle badge colours.
const LETTER_CHIP = {
  open:    { bg: "var(--warn-soft)", fg: "var(--warn)", label: "Open" },
  replied: { bg: "var(--ok-soft)", fg: "var(--ok)", label: "Replied" },
  closed:  { bg: "var(--surface-2)", fg: "var(--muted)", label: "Closed" },
};

// Map a job/document status to a token-based chip colour.
function chip(status) {
  const ok = ["done", "ready_to_confirm", "awaiting_confirm"];
  const bad = ["failed", "too-large"];
  if (ok.includes(status)) return { bg: "var(--ok-soft)", fg: "var(--ok)" };
  if (bad.includes(status)) return { bg: "var(--danger-soft)", fg: "var(--danger)" };
  return { bg: "var(--warn-soft)", fg: "var(--warn)" }; // queued / uploading / processing / duplicate
}

const cardStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
};

export default function UploadPage() {
  const toast = useToast();

  const [queue, setQueue] = useState([]); // [{ file, name, size, status, message }]
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [pending, setPending] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [history, setHistory] = useState(null);
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [connDoc, setConnDoc] = useState(null); // document whose connections modal is open
  const [draft, setDraft] = useState(null);     // { docId, filename, text, loading }
  const [register, setRegister] = useState(null); // rows array, or null (closed)

  function loadData() {
    getDocuments().then(setDocuments).catch(() => {});
    getPendingConfirmations().then(setPending).catch(() => {});
    checkServices().then((s) => setAiStatus(s.ai_extraction)).catch(() => {});
  }
  useEffect(() => { loadData(); }, []);

  const inProgress = documents.filter(
    (d) => ["queued", "processing"].includes(d.status) ||
           ["waiting", "processing"].includes(d.queue_status)
  );

  useEffect(() => {
    if (inProgress.length === 0) return;
    const id = setInterval(loadData, 8000);
    return () => clearInterval(id);
  }, [inProgress.length]);

  function onFilesPicked(fileList) {
    const files = Array.from(fileList);
    if (files.length > 20) {
      toast.error("Maximum 20 files per batch.");
      return;
    }
    // Detect oversized files up-front (before any upload/extraction) so the user
    // isn't left waiting on a huge file that the server would reject at 50 MB.
    const MAX_BYTES = 50 * 1024 * 1024;
    const mapped = files.map((f) => {
      const tooBig = f.size > MAX_BYTES;
      return {
        file: f, name: f.name, size: f.size,
        status: tooBig ? "too-large" : "queued",
        message: tooBig ? `Over 50 MB (${(f.size / 1048576).toFixed(1)} MB) — remove or use a smaller copy.` : "",
      };
    });
    setQueue(mapped);
    if (mapped.some((m) => m.status === "too-large"))
      toast.error("Some files are over the 50 MB limit and won't be uploaded.");
  }

  function removeFromQueue(i) {
    setQueue((q) => q.filter((_, idx) => idx !== i));
  }

  async function handleBatchUpload() {
    setUploading(true);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "done" || queue[i].status === "too-large") continue;
      setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)));
      try {
        const res = await uploadFile(queue[i].file);
        setQueue((q) => q.map((item, idx) =>
          idx === i ? { ...item, status: "done", message: `Job #${res.job_id}` } : item));
      } catch (e) {
        const dup = String(e.message).toLowerCase().includes("duplicate");
        if (dup) toast.info(`"${queue[i].name}" is already in your documents — skipped, not uploaded again.`);
        setQueue((q) => q.map((item, idx) =>
          idx === i ? { ...item, status: dup ? "duplicate" : "failed", message: e.message } : item));
      }
    }
    setUploading(false);
    toast.success("Uploaded. Review what the AI found in your Inbox.");
    loadData();
  }

  async function handleDeleteDoc(id) {
    if (!window.confirm("Move document to trash? You can restore it later.")) return;
    try { await deleteDocument(id); loadData(); }
    catch (e) { toast.error(e.message); }
  }

  async function handleReextract(id) {
    try {
      await reextractDocument(id);
      toast.info("Re-extraction started — watch the Inbox.");
      setTimeout(loadData, 1500);
    } catch (e) { toast.error(e.message); }
  }

  function openDraft(doc) {
    setDraft({ docId: doc.id, filename: doc.filename, text: "", loading: true });
    draftReply(doc.id)
      .then((r) => setDraft((d) => (d ? { ...d, text: r.draft, loading: false } : d)))
      .catch((e) => { toast.error(e.message); setDraft(null); });
  }

  async function saveDraftAsNote() {
    try {
      await createNote({ title: `Reply: ${draft.filename}`, content: draft.text, classification: "General" });
      toast.success("Saved reply as a note.");
      setDraft(null);
    } catch (e) { toast.error(e.message); }
  }

  function openRegister() {
    setRegister([]);
    getRegister().then(setRegister).catch((e) => { toast.error(e.message); setRegister(null); });
  }

  function exportCSV(rows) {
    const header = ["Reference", "File", "Status", "Uploaded", "Reply by", "Classification"];
    const lines = [header.join(",")].concat(rows.map((r) =>
      [r.ref_number, r.filename, r.letter_status, r.uploaded_at, r.reply_by, r.classification].map(csvCell).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "correspondence-register.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function printRegister(rows) {
    const w = window.open("", "_blank");
    if (!w) { toast.error("Allow pop-ups to print the register."); return; }
    const body = rows.map((r) => `<tr><td>${esc(r.ref_number) || "—"}</td><td>${esc(r.filename)}</td>` +
      `<td>${esc(r.letter_status)}</td><td>${esc(fmtDate(r.uploaded_at))}</td>` +
      `<td>${r.reply_by ? esc(fmtDate(r.reply_by)) : "—"}</td></tr>`).join("");
    w.document.write(`<html><head><title>Correspondence Register</title>
      <style>body{font-family:sans-serif;padding:24px}h1{font-size:20px}
      table{border-collapse:collapse;width:100%;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f3f1ea}</style></head><body>
      <h1>Correspondence Register</h1>
      <table><thead><tr><th>Reference</th><th>File</th><th>Status</th><th>Uploaded</th><th>Reply by</th></tr></thead>
      <tbody>${body}</tbody></table></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  async function handleLetterStatus(id, status) {
    // optimistic update
    setDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, letter_status: status } : d)));
    try {
      await setLetterStatus(id, status);
      toast.success(`Marked ${status}.`);
    } catch (e) {
      toast.error(e.message);
      loadData();
    }
  }

  async function openHistory(doc) {
    try {
      const entries = await getAuditLog({ entity_type: "document", entity_id: doc.id });
      setHistory({ doc, entries });
    } catch (e) { toast.error(e.message); }
  }

  const doneCount = queue.filter((q) => q.status === "done").length;
  const reviewCount = pending.length + inProgress.length;

  const btn = (primary) => ({
    background: primary ? "var(--accent)" : "var(--surface)",
    color: primary ? "#fff" : "var(--text-2)",
    border: primary ? "none" : "1px solid var(--border-2)",
    padding: "10px 18px", borderRadius: "var(--radius-sm)",
    cursor: "pointer", fontWeight: 600, fontSize: 15,
  });

  return (
    <div style={{ maxWidth: 980 }}>
      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 18px" }}>
        Upload letters, notices and scanned mail. PDF, JPG, PNG, TIFF — max 50 MB each, up to 20 files.
      </p>

      {/* AI status + review banner */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
        <AiStatusBadge online={aiStatus == null ? null : aiStatus === "ready"} />
        {reviewCount > 0 && (
          <Link
            to="/inbox"
            style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--accent-soft)", color: "var(--accent)", textDecoration: "none",
              padding: "8px 16px", borderRadius: 99, fontSize: 14, fontWeight: 700,
            }}
          >
            {pending.length > 0 ? `${pending.length} ready to confirm` : `${inProgress.length} processing`} · Open Inbox →
          </Link>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFilesPicked(e.dataTransfer.files); }}
        style={{
          ...cardStyle,
          border: "2px dashed var(--border-2)",
          padding: 44, textAlign: "center", marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Drag &amp; drop documents</h2>
        <p style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: 15 }}>or choose one or many files</p>
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          onChange={(e) => onFilesPicked(e.target.files)}
          style={{ color: "var(--text-2)" }}
        />
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div style={{ ...cardStyle, padding: 20, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>Upload queue — {doneCount}/{queue.length} done</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setQueue([])} disabled={uploading} style={btn(false)}>Clear</button>
              <button onClick={handleBatchUpload} disabled={uploading} style={btn(true)}>
                {uploading ? "Uploading…" : `Upload ${queue.length} file(s)`}
              </button>
            </div>
          </div>
          {queue.map((item, idx) => {
            const c = chip(item.status);
            return (
              <div
                key={idx}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", borderRadius: 10, marginBottom: 8,
                  background: "var(--bg)", border: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13, marginLeft: 10 }}>
                    {(item.size / 1024).toFixed(0)} KB{item.message ? ` · ${item.message}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ background: c.bg, color: c.fg, padding: "4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                    {item.status === "too-large" ? "too large" : item.status}
                  </span>
                  {(item.status === "queued" || item.status === "too-large") && !uploading && (
                    <button onClick={() => removeFromQueue(idx)}
                      style={{ background: "none", border: "1px solid var(--border-2)", color: "var(--text-2)", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Uploaded documents */}
      {documents.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "0 0 14px" }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>Your documents</h2>
            <button onClick={openRegister}
              style={{ marginLeft: "auto", ...btn(false), padding: "6px 14px", fontSize: 13.5, borderRadius: 99 }}>
              📋 Register
            </button>
            <button
              onClick={() => setAwaitingOnly((v) => !v)}
              style={{
                border: "1px solid var(--border-2)", cursor: "pointer",
                padding: "6px 14px", borderRadius: 99, fontSize: 13.5, fontWeight: 600,
                background: awaitingOnly ? "var(--warn-soft)" : "var(--surface)",
                color: awaitingOnly ? "var(--warn)" : "var(--text-2)",
              }}
            >
              {awaitingOnly ? "✓ Awaiting reply" : "Awaiting reply"}
            </button>
          </div>
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            {(awaitingOnly ? documents.filter((d) => (d.letter_status || "open") === "open") : documents).map((doc, i, arr) => {
              const c = chip(doc.status);
              const ls = LETTER_CHIP[doc.letter_status || "open"];
              return (
                <div
                  key={doc.id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    padding: "16px 20px",
                    borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 16 }}>{doc.filename}</strong>
                    <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "3px 0 0" }}>
                      {(doc.file_type || "").toUpperCase()} — uploaded {fmtDate(doc.uploaded_at)}
                      {doc.ref_number ? ` · ${doc.ref_number}` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span title="Correspondence status"
                      style={{ background: ls.bg, color: ls.fg, padding: "4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                      {ls.label}
                    </span>
                    <select value={doc.letter_status || "open"} onChange={(e) => handleLetterStatus(doc.id, e.target.value)}
                      title="Set correspondence status"
                      style={{ ...btn(false), padding: "6px 8px", fontSize: 13, cursor: "pointer" }}>
                      <option value="open">Open</option>
                      <option value="replied">Replied</option>
                      <option value="closed">Closed</option>
                    </select>
                    <span style={{ background: c.bg, color: c.fg, padding: "4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                      {doc.status}
                    </span>
                    <button onClick={() => setConnDoc(doc)} style={{ ...btn(false), padding: "6px 12px", fontSize: 13 }}>Links</button>
                    <button onClick={() => openDraft(doc)} disabled={aiStatus !== "ready"}
                      title={aiStatus === "ready" ? "Draft a reply (local AI)" : "AI offline"}
                      style={{ ...btn(false), padding: "6px 12px", fontSize: 13, opacity: aiStatus === "ready" ? 1 : 0.5, cursor: aiStatus === "ready" ? "pointer" : "not-allowed" }}>
                      Draft reply
                    </button>
                    <a href={documentDownloadUrl(doc.id)} target="_blank" rel="noreferrer" style={{ ...btn(false), padding: "6px 12px", fontSize: 13, textDecoration: "none" }}>Open</a>
                    <button onClick={() => handleReextract(doc.id)} disabled={aiStatus !== "ready"}
                      title={aiStatus === "ready" ? "Re-run AI extraction" : "AI offline"}
                      style={{ ...btn(false), padding: "6px 12px", fontSize: 13, opacity: aiStatus === "ready" ? 1 : 0.5, cursor: aiStatus === "ready" ? "pointer" : "not-allowed" }}>
                      Re-extract
                    </button>
                    <button onClick={() => openHistory(doc)} style={{ ...btn(false), padding: "6px 12px", fontSize: 13 }}>History</button>
                    <button onClick={() => handleDeleteDoc(doc.id)} style={{ ...btn(false), padding: "6px 12px", fontSize: 13, color: "var(--danger)", borderColor: "var(--danger)" }}>Trash</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History modal */}
      {history && (
        <div
          onClick={() => setHistory(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...cardStyle, padding: 26, width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>History — {history.doc.filename}</h3>
              <button onClick={() => setHistory(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
            </div>
            {history.entries.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No history recorded.</p>
            ) : (
              history.entries.map((entry) => (
                <div key={entry.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <strong style={{ color: "var(--accent)" }}>{entry.action}</strong>
                  {entry.detail ? ` — ${entry.detail}` : ""}
                  <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 12.5 }}>{fmtDateTime(entry.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Connections modal */}
      {connDoc && (
        <div
          onClick={() => setConnDoc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...cardStyle, padding: 26, width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Connections — {connDoc.filename}</h3>
              <button onClick={() => setConnDoc(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
            </div>
            <Connections kind="document" id={connDoc.id} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Nothing here yet means this letter isn't linked to other items.
            </p>
          </div>
        </div>
      )}

      {/* Reply-draft modal */}
      {draft && (
        <div onClick={() => setDraft(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...cardStyle, padding: 26, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Draft reply — {draft.filename}</h3>
              <button onClick={() => setDraft(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
            </div>
            {draft.loading ? (
              <p style={{ color: "var(--muted)" }}>Drafting a reply with the local model…</p>
            ) : (
              <>
                <textarea value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                  style={{ width: "100%", minHeight: 260, padding: 14, borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, lineHeight: 1.6, boxSizing: "border-box", resize: "vertical", background: "var(--bg)", color: "var(--text)" }} />
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={saveDraftAsNote} style={{ ...btn(true) }}>Save as note</button>
                  <button onClick={() => { navigator.clipboard?.writeText(draft.text); toast.info("Copied."); }} style={{ ...btn(false) }}>Copy</button>
                </div>
                <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 10 }}>
                  AI-drafted from the letter. Review and edit before sending — nothing is sent automatically.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Correspondence register modal */}
      {register && (
        <div onClick={() => setRegister(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ ...cardStyle, padding: 24, width: "100%", maxWidth: 860, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Correspondence register</h3>
              <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{register.length} letter(s)</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => exportCSV(register)} style={{ ...btn(false), padding: "7px 14px", fontSize: 13.5 }}>Export CSV</button>
                <button onClick={() => printRegister(register)} style={{ ...btn(false), padding: "7px 14px", fontSize: 13.5 }}>Print</button>
                <button onClick={() => setRegister(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                    {["Reference", "File", "Status", "Uploaded", "Reply by"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".4px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {register.map((r) => {
                    const ls = LETTER_CHIP[r.letter_status || "open"];
                    return (
                      <tr key={r.id}>
                        <td style={{ padding: "10px", borderBottom: "1px solid var(--border)" }}>{r.ref_number || "—"}</td>
                        <td style={{ padding: "10px", borderBottom: "1px solid var(--border)" }}>{r.filename}</td>
                        <td style={{ padding: "10px", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ background: ls.bg, color: ls.fg, padding: "2px 10px", borderRadius: 99, fontSize: 12.5, fontWeight: 700 }}>{ls.label}</span>
                        </td>
                        <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{fmtDate(r.uploaded_at)}</td>
                        <td style={{ padding: "10px", borderBottom: "1px solid var(--border)", color: r.reply_by ? "var(--warn)" : "var(--muted)" }}>{r.reply_by ? fmtDate(r.reply_by) : "—"}</td>
                      </tr>
                    );
                  })}
                  {register.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, color: "var(--muted)" }}>No letters yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
