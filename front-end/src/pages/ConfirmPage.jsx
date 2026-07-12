import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getConfirmation,
  confirmItem,
  dismissItem,
  documentDownloadUrl,
  getRelatedForDoc,
  acceptLink,
} from "../services/api";
import { useToast } from "../components/ToastProvider";
import PeekModal from "../components/PeekModal";

const REASON_LABEL = {
  "same reference": "Same reference #",
  "same series": "Same file series",
  "on a related letter": "On a related letter",
  "similar content": "Similar content",
};
const KIND_ICON = { document: "📄", note: "📝", event: "📅", task: "✓" };

// Past items connected to this letter (ref-number, series, semantic). Documents
// and notes can be linked (soft link, human-confirmed); events/tasks are shown
// as context since they belong to a related letter, not this one.
function RelatedPanel({ docId, related, onLink, linked, onPeek }) {
  if (!related || related.length === 0) return null;
  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
        padding: "16px 20px", marginBottom: 20,
      }}
    >
      <div style={{ fontSize: 15.5, fontWeight: 650, marginBottom: 4 }}>
        📎 Related to your past items
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 12 }}>
        The AI found earlier letters, tasks and notes that look connected — link the ones that belong together.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {related.map((it) => {
          const key = `${it.kind}-${it.id}`;
          const linkable = it.kind === "document" || it.kind === "note";
          const isLinked = linked.has(key);
          return (
            <div
              key={key}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10,
                background: "var(--bg)", border: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 18 }}>{KIND_ICON[it.kind] || "•"}</span>
              <button onClick={() => onPeek({ kind: it.kind, id: it.id })} title="Peek"
                style={{ minWidth: 0, flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--text)", padding: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 560, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {it.title}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {REASON_LABEL[it.reason] || it.reason}
                  {it.ref_number ? ` · ${it.ref_number}` : ""}
                </div>
              </button>
              <div style={{ marginLeft: "auto", flexShrink: 0 }}>
                {linkable ? (
                  isLinked ? (
                    <span style={{ color: "var(--ok)", fontWeight: 600, fontSize: 13.5 }}>✓ Linked</span>
                  ) : (
                    <button
                      onClick={() => onLink(it)}
                      style={{
                        background: "var(--accent-soft)", color: "var(--accent)", border: "none",
                        padding: "7px 15px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                      }}
                    >
                      Link
                    </button>
                  )
                ) : (
                  <span style={{ color: "var(--muted)", fontSize: 12.5 }}>context</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CONF_THRESHOLD = 0.7; // matches backend CONFIDENCE_THRESHOLD (FR-10/FR-14)
const CATEGORIES = ["General", "Meeting", "Reply", "Review", "Personal", "Restricted", "Confidential"];

const labelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-2)",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: ".4px",
};
const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  border: "1.5px solid var(--border-2)",
  borderRadius: 10,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 17,
  fontFamily: "inherit",
};

function confBadge(low) {
  return {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 12,
    background: low ? "var(--warn-soft)" : "var(--ok-soft)",
    color: low ? "var(--warn)" : "var(--ok)",
  };
}

function Field({ label, value, onChange, type = "text", conf, warn }) {
  const low = conf != null && conf < CONF_THRESHOLD;
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>
        {label}
        {conf != null && (
          <span style={confBadge(low)}>
            {Math.round(conf * 100)}%{low ? " · check" : ""}
          </span>
        )}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, ...(low ? { borderColor: "var(--warn)", background: "var(--warn-soft)" } : {}) }}
      />
      {warn && (
        <div style={{ display: "flex", gap: 7, fontSize: 14, color: "var(--warn)", marginTop: 7, fontWeight: 500 }}>
          ⚠ {warn}
        </div>
      )}
    </div>
  );
}

// Left panel — the actual source so the user verifies the AI against it.
function SourceViewer({ job }) {
  // inline=1 → served with an inline disposition so the document renders in the
  // preview instead of triggering a browser download on every review.
  const url = `${documentDownloadUrl(job.doc_id)}?inline=1`;
  const ft = String(job.file_type || "").toLowerCase();
  const isPdf = ft.includes("pdf") || /\.pdf$/i.test(job.filename || "");
  const isImg = /(jpe?g|png|tiff?|bmp|webp|image)/.test(ft) || /\.(jpe?g|png|tiff?|bmp|webp)$/i.test(job.filename || "");

  return (
    <div style={{ padding: 0, height: "72vh", overflow: "auto", background: "var(--surface-2)" }}>
      {isImg ? (
        <img src={url} alt={job.filename} style={{ width: "100%", display: "block" }} />
      ) : isPdf ? (
        <iframe src={url} title={job.filename} style={{ width: "100%", height: "72vh", border: "none" }} />
      ) : (
        <pre
          style={{
            margin: 0, padding: "22px 24px", whiteSpace: "pre-wrap", fontFamily: "Georgia, serif",
            fontSize: 16, lineHeight: 1.7, color: "var(--text)",
          }}
        >
          {job.full_text || "No preview available for this file type."}
        </pre>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [related, setRelated] = useState([]);
  const [linked, setLinked] = useState(new Set());
  const [peek, setPeek] = useState(null);

  useEffect(() => {
    getConfirmation(jobId)
      .then((r) => {
        setJob(r.job);
        if (r.job?.doc_id) {
          getRelatedForDoc(r.job.doc_id).then(setRelated).catch(() => {});
        }
        setItems(
          (r.extractions || []).map((e) => ({
            id: e.id,
            item_type: e.item_type === "task" ? "task" : "event",
            subject: e.subject || "",
            event_date: e.event_date || "",
            event_time: e.event_time ? String(e.event_time).slice(0, 5) : "",
            event_end_time: e.event_end_time ? String(e.event_end_time).slice(0, 5) : "",
            venue: e.venue || "",
            attendees: e.attendees || "",
            ref_number: e.ref_number || "",
            deadline: e.deadline || "",
            reply_by: e.reply_by || "",
            category: "General",
            fc: e.field_confidence || {},
            meeting_date_flag: e.meeting_date_flag,
            reply_by_overdue: e.reply_by_overdue,
          }))
        );
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [jobId]);

  const setField = (idx, k, v) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  async function linkRelated(it) {
    if (!job?.doc_id) return;
    try {
      await acceptLink({ a_kind: "document", a_id: job.doc_id, b_kind: it.kind, b_id: it.id });
      setLinked((prev) => new Set(prev).add(`${it.kind}-${it.id}`));
      toast.success(`Linked to “${it.title}”.`);
    } catch (e) {
      toast.error(e.message);
    }
  }

  const afterRemoval = (remaining) => {
    if (remaining === 0) {
      toast.success("All set — back to your inbox.");
      navigate("/inbox");
    }
  };

  const approve = useCallback(
    async (idx) => {
      const it = items[idx];
      if (!it) return;
      
      const dateVal = it.item_type === "event" ? it.event_date : (it.deadline || it.reply_by || it.event_date);
      if (!it.subject?.trim() || !dateVal || !it.event_time || !it.event_end_time) {
        toast.error("All fields are mandatory. Please fill in the Title, Date, Start Time, and End Time.");
        return;
      }
      setBusy(true);
      try {
        const res = await confirmItem({
          job_id: Number(jobId),
          item_index: it.id,
          item_type: it.item_type,
          title: it.subject,
          event_date: it.event_date || "",
          event_time: it.event_time || "",
          event_end_time: it.event_end_time || "",
          venue: it.venue || "",
          attendees: it.attendees || "",
          ref_number: it.ref_number || "",
          deadline: it.deadline || "",
          reply_by: it.reply_by || "",
          due_date: it.item_type === "task" ? (it.deadline || it.reply_by || it.event_date || "") : "",
          category: it.category || "General",
        });
        toast[res.status === "duplicate" ? "info" : "success"](res.message || "Saved.");
        const next = items.filter((_, i) => i !== idx);
        setItems(next);
        afterRemoval(next.length);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setBusy(false);
      }
    },
    [items, jobId]
  );

  const dismiss = useCallback(
    async (idx) => {
      const it = items[idx];
      if (!it) return;
      setBusy(true);
      try {
        await dismissItem({ job_id: Number(jobId), item_index: it.id });
        toast.info("Dismissed. The document is kept and searchable.");
        const next = items.filter((_, i) => i !== idx);
        setItems(next);
        afterRemoval(next.length);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setBusy(false);
      }
    },
    [items, jobId]
  );

  // Keyboard: Enter approves the top item, Esc returns to the inbox — but never
  // hijack keys while the user is typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if (e.key === "Escape") navigate("/inbox");
      if (e.key === "Enter" && !typing && items.length && !busy) approve(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, busy, approve, navigate]);

  if (loading) return <div style={{ color: "var(--muted)" }}>Loading…</div>;
  if (!job) return <div style={{ color: "var(--muted)" }}>This item is no longer available.</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
        <button
          onClick={() => navigate("/inbox")}
          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 15, fontWeight: 600 }}
        >
          ← Inbox
        </button>
        <span style={{ color: "var(--muted)", fontSize: 14 }}>
          Verify against the source — nothing saves until you approve
        </span>
        <span style={{ marginLeft: "auto", fontSize: 13.5, color: "var(--muted)" }}>
          <b style={{ color: "var(--text-2)" }}>Enter</b> approve · <b style={{ color: "var(--text-2)" }}>Esc</b> back
        </span>
      </div>

      <RelatedPanel docId={job.doc_id} related={related} onLink={linkRelated} linked={linked} onPeek={setPeek} />
      {peek && <PeekModal item={peek} onClose={() => setPeek(null)} />}

      {items.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>Nothing left to review here.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* Source */}
          <div
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden",
              position: "sticky", top: 96,
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontSize: 14.5, color: "var(--muted)", fontWeight: 600 }}>
              📄 {job.filename}
            </div>
            <SourceViewer job={job} />
          </div>

          {/* Editable fields, one card per extracted item */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {items.map((it, idx) => (
              <div
                key={it.id}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden",
                }}
              >
                <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14.5, color: "var(--muted)", fontWeight: 600 }}>Extracted fields</span>
                  <select
                    value={it.item_type}
                    onChange={(e) => setField(idx, "item_type", e.target.value)}
                    style={{
                      marginLeft: "auto", padding: "7px 12px", borderRadius: 8,
                      border: "1px solid var(--border-2)", background: "var(--bg)", color: "var(--text)",
                      fontSize: 14, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <option value="event">Event</option>
                    <option value="task">Task</option>
                  </select>
                </div>

                <div style={{ padding: "20px 22px" }}>
                  <Field label="Subject" value={it.subject} conf={it.fc.subject}
                    onChange={(v) => setField(idx, "subject", v)} />

                  {it.item_type === "event" ? (
                    <>
                      <Field label="Event date" type="date" value={it.event_date} conf={it.fc.event_date}
                        warn={it.meeting_date_flag ? "This date is in the past — please verify it wasn't misread." : null}
                        onChange={(v) => setField(idx, "event_date", v)} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                        <Field label="Start Time" type="time" value={it.event_time} conf={it.fc.event_time}
                          onChange={(v) => setField(idx, "event_time", v)} />
                        <Field label="End Time" type="time" value={it.event_end_time} conf={it.fc.event_end_time}
                          onChange={(v) => setField(idx, "event_end_time", v)} />
                      </div>
                      <Field label="Venue" value={it.venue} conf={it.fc.venue}
                        onChange={(v) => setField(idx, "venue", v)} />
                      <Field label="Attendees" value={it.attendees} conf={it.fc.attendees}
                        onChange={(v) => setField(idx, "attendees", v)} />
                      <Field label="Reply-by" type="date" value={it.reply_by} conf={it.fc.reply_by}
                        warn={it.reply_by_overdue ? "Reply-by date has passed." : null}
                        onChange={(v) => setField(idx, "reply_by", v)} />
                    </>
                  ) : (
                    <>
                      <Field label="Due date" type="date" value={it.deadline || it.reply_by || it.event_date} conf={it.fc.deadline || it.fc.reply_by}
                        onChange={(v) => setField(idx, "deadline", v)} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                        <Field label="Start Time" type="time" value={it.event_time} conf={it.fc.event_time}
                          onChange={(v) => setField(idx, "event_time", v)} />
                        <Field label="End Time" type="time" value={it.event_end_time} conf={it.fc.event_end_time}
                          onChange={(v) => setField(idx, "event_end_time", v)} />
                      </div>
                    </>
                  )}

                  <Field label="Reference no." value={it.ref_number} conf={it.fc.ref_number}
                    onChange={(v) => setField(idx, "ref_number", v)} />

                  {/* Categorisation (FR-36) — reviewable before it's saved */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Category</label>
                    <select
                      value={it.category}
                      onChange={(e) => setField(idx, "category", e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, padding: "16px 22px", borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={() => approve(idx)}
                    disabled={busy}
                    style={{
                      background: "var(--accent)", color: "#fff", border: "none",
                      padding: "12px 22px", borderRadius: "var(--radius-sm)",
                      cursor: busy ? "wait" : "pointer", fontWeight: 700, fontSize: 15.5,
                    }}
                  >
                    {it.item_type === "event" ? "Approve — add to calendar" : "Approve — add task"}
                  </button>
                  <button
                    onClick={() => dismiss(idx)}
                    disabled={busy}
                    style={{
                      background: "var(--surface)", color: "var(--text-2)",
                      border: "1px solid var(--border-2)", padding: "12px 20px",
                      borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600, fontSize: 15.5,
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
