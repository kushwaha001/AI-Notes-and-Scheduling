import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getPendingConfirmations,
  getConfirmation,
  getDocuments,
  checkServices,
  processQueue,
  confirmAllExtractions,
  dismissAllExtractions,
} from "../services/api";
import { fmtDate } from "../components/DateInput";
import { useToast } from "../components/ToastProvider";
import PeekModal from "../components/PeekModal";

// "2026-07-09" -> "09 Jul 2026" (DD MMM YYYY, per NFR-5).
function prettyDate(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}

function docStatusChip(status) {
  const map = {
    confirmed:           ["var(--ok-soft)", "var(--ok)", "confirmed"],
    done:                ["var(--ok-soft)", "var(--ok)", "done"],
    partially_confirmed: ["var(--ok-soft)", "var(--ok)", "partly confirmed"],
    dismissed:           ["var(--surface-2)", "var(--muted)", "dismissed"],
    failed:              ["var(--warn-soft)", "var(--warn)", "needs a clearer copy"],
  };
  const [bg, color, label] = map[status] || ["var(--surface-2)", "var(--muted)", status || "saved"];
  return { bg, color, label };
}

function overallConfidence(fc) {
  if (!fc || typeof fc !== "object") return null;
  const vals = Object.values(fc).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
}

function ExtractionPreview({ ex }) {
  const isEvent = ex.item_type === "event" && ex.event_date;
  const conf = overallConfidence(ex.field_confidence);
  const low = conf != null && conf < 70;
  const chips = [];
  if (isEvent) {
    if (ex.event_date) chips.push(`📅 ${prettyDate(ex.event_date)}`);
    if (ex.event_time) chips.push(`🕐 ${String(ex.event_time).slice(0, 5)}${ex.event_end_time ? "–" + String(ex.event_end_time).slice(0, 5) : ""}`);
    if (ex.venue) chips.push(`📍 ${ex.venue}`);
    if (ex.attendees) chips.push(`👥 ${ex.attendees}`);
    if (ex.reply_by) chips.push(`↩️ Reply by ${prettyDate(ex.reply_by)}`);
  } else {
    const due = ex.deadline || ex.reply_by || ex.event_date;
    if (due) chips.push(`📅 Due ${prettyDate(due)}`);
    if (ex.attendees) chips.push(`👥 ${ex.attendees}`);
  }

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderLeft: "4px solid var(--accent)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: chips.length ? 8 : 0 }}>
        <span
          style={{
            background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700,
            fontSize: 12, padding: "2px 10px", borderRadius: 99, textTransform: "uppercase",
          }}
        >
          {isEvent ? "Event" : "Task"}
        </span>
        <strong style={{ fontSize: 15 }}>{ex.subject || "Untitled"}</strong>
        {conf != null && (
          <span
            title="AI confidence (shown at extraction time)"
            style={{
              marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
              background: low ? "var(--warn-soft)" : "var(--ok-soft)",
              color: low ? "var(--warn)" : "var(--ok)",
            }}
          >
            {conf}% confident{low ? " · review" : ""}
          </span>
        )}
      </div>
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {chips.map((c, i) => (
            <span
              key={i}
              style={{
                background: "var(--surface-2)", color: "var(--text-2)", fontSize: 13,
                padding: "3px 10px", borderRadius: 8,
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [docs, setDocs] = useState([]);
  const [details, setDetails] = useState({});
  const [docIds, setDocIds] = useState({}); // job_id -> document id, for peek
  const [aiStatus, setAiStatus] = useState(null);
  const [busyJob, setBusyJob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [peek, setPeek] = useState(null);
  const [loaded, setLoaded] = useState(false);

  function load() {
    getPendingConfirmations().then(setPending).catch(() => {});
    getDocuments().then(setDocs).catch(() => {}).finally(() => setLoaded(true));
    checkServices().then((s) => setAiStatus(s.ai_extraction)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const inProgress = docs.filter(
    (d) => ["queued", "processing"].includes(d.status) ||
           ["waiting", "processing"].includes(d.queue_status)
  );

  // Already-handled documents — the captured queue/history, so the Inbox always
  // shows what's been added (distinct from the Capture page) even when nothing
  // is waiting to confirm.
  const recent = docs
    .filter((d) => !["queued", "processing", "ready_to_confirm"].includes(d.status)
                && !["waiting", "processing"].includes(d.queue_status))
    .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
    .slice(0, 15);

  // Auto-refresh while anything is still being read by the AI.
  useEffect(() => {
    if (inProgress.length === 0) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [inProgress.length]);

  useEffect(() => {
    pending.forEach((p) => {
      getConfirmation(p.job_id)
        .then((r) => {
          setDetails((d) => ({ ...d, [p.job_id]: r.extractions || [] }));
          if (r.job?.doc_id) setDocIds((m) => ({ ...m, [p.job_id]: r.job.doc_id }));
        })
        .catch(() => {});
    });
  }, [pending]);

  async function handleDismiss(item) {
    setBusyJob(item.job_id);
    try {
      await dismissAllExtractions(item.job_id);
      toast.info("Dismissed. The document is kept and searchable.");
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyJob(null);
    }
  }

  async function handleConfirmAll(item) {
    setBusyJob(item.job_id);
    try {
      const r = await confirmAllExtractions(item.job_id);
      const added = (Number(r?.events_added) || 0) + (Number(r?.tasks_added) || 0);
      const skipped = Number(r?.skipped) || 0;
      toast.success(
        added > 0
          ? `Added ${added} item(s).${skipped ? ` ${skipped} skipped.` : ""}`
          : "All items confirmed."
      );
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyJob(null);
    }
  }

  async function runQueue() {
    setProcessing(true);
    try {
      await processQueue();
      setTimeout(load, 1500);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  }

  const empty = pending.length === 0 && inProgress.length === 0 && recent.length === 0;

  return (
    <div style={{ maxWidth: 980 }}>
      {loaded && empty && (
        <div
          style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
            padding: "48px 32px", textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>Your inbox is clear</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 18px", fontSize: 15 }}>
            Nothing waiting to confirm. Capture a letter, photo, or voice note and it'll show up here.
          </p>
          <Link
            to="/upload"
            style={{
              display: "inline-block", background: "var(--accent)", color: "#fff",
              textDecoration: "none", padding: "12px 22px", borderRadius: "var(--radius-sm)",
              fontWeight: 650, fontSize: 16,
            }}
          >
            + Capture something
          </Link>
        </div>
      )}

      {/* Ready to confirm */}
      {pending.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Ready to confirm</h2>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>the AI proposes — you approve</span>
          </div>

          {pending.map((item) => (
            <div
              key={item.job_id}
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
                padding: "18px 20px", marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <button
                    onClick={() => docIds[item.job_id] && setPeek({ kind: "document", id: docIds[item.job_id] })}
                    disabled={!docIds[item.job_id]}
                    title="Peek at the letter"
                    style={{ background: "none", border: "none", padding: 0, cursor: docIds[item.job_id] ? "pointer" : "default", color: "var(--accent)", fontSize: 16, fontWeight: 700, textAlign: "left" }}>
                    {item.filename}
                  </button>
                  <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "3px 0 0" }}>
                    {item.extraction_count > 0
                      ? `${item.extraction_count} item(s) found · uploaded ${fmtDate(item.uploaded_at)}`
                      : `Uploaded ${fmtDate(item.uploaded_at)}`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                  <button
                    onClick={() => handleDismiss(item)}
                    disabled={busyJob === item.job_id}
                    style={{
                      background: "var(--surface)", color: "var(--text-2)",
                      border: "1px solid var(--border-2)", padding: "10px 18px",
                      borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 15, fontWeight: 600,
                    }}
                  >
                    Dismiss
                  </button>
                  {(item.extraction_count > 1 || (details[item.job_id] || []).length > 1) && (
                    <button
                      onClick={() => handleConfirmAll(item)}
                      disabled={busyJob === item.job_id}
                      title="Add every extracted item at once"
                      style={{
                        background: "var(--accent-soft)", color: "var(--accent)",
                        border: "none", padding: "10px 18px",
                        borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 15, fontWeight: 700,
                      }}
                    >
                      ✓ Confirm all
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/confirm/${item.job_id}`)}
                    style={{
                      background: "var(--accent)", color: "#fff", border: "none",
                      padding: "10px 22px", borderRadius: "var(--radius-sm)",
                      cursor: "pointer", fontWeight: 700, fontSize: 15,
                    }}
                  >
                    Review →
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {(details[item.job_id] || []).map((ex) => (
                  <ExtractionPreview key={ex.id} ex={ex} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Processing / queued */}
      {inProgress.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Processing</h2>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {inProgress.length} document(s) being read
            </span>
            {aiStatus === "ready" && (
              <button
                onClick={runQueue}
                disabled={processing}
                style={{
                  marginLeft: "auto", background: "var(--surface)", color: "var(--accent)",
                  border: "1px solid var(--accent)", padding: "8px 16px",
                  borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: 14,
                }}
              >
                {processing ? "Starting…" : "▶ Run AI now"}
              </button>
            )}
          </div>
          <div
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden",
            }}
          >
            {inProgress.map((doc, i) => (
              <div
                key={doc.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
                  borderBottom: i < inProgress.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 16 }}>{doc.filename}</strong>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: 13.5 }}>
                    {doc.status === "processing" || doc.queue_status === "processing"
                      ? "Reading & extracting fields…"
                      : "Queued for the AI…"}
                  </p>
                </div>
                <span
                  style={{
                    marginLeft: "auto", background: "var(--surface-2)", color: "var(--muted)",
                    padding: "5px 13px", borderRadius: 99, fontSize: 13.5, fontWeight: 600,
                  }}
                >
                  {doc.status === "processing" ? "extracting" : "queued"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recently captured — the queue/history of what's been added */}
      {recent.length > 0 && (
        <section style={{ marginTop: pending.length || inProgress.length ? 30 : 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Recently captured</h2>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>everything you've added</span>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
            {recent.map((doc, i) => {
              const s = docStatusChip(doc.status);
              return (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < recent.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <button onClick={() => setPeek({ kind: "document", id: doc.id })}
                    title="Peek at the letter"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent)", fontSize: 15.5, fontWeight: 650, textAlign: "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.filename}
                  </button>
                  <span style={{ color: "var(--muted)", fontSize: 13, flexShrink: 0 }}>{fmtDate(doc.uploaded_at)}</span>
                  <span style={{ marginLeft: "auto", flexShrink: 0, background: s.bg, color: s.color, fontSize: 12.5, fontWeight: 700, padding: "3px 11px", borderRadius: 99 }}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {peek && <PeekModal item={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}
