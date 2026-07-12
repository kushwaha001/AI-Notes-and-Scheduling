/*
 * DraftReplyModal — AI reply-draft assistant for a letter.
 * On open it asks the local LLM for a draft (may take ~10-30 s), then shows
 * the text in an editable letter-style textarea. The user can copy it, save
 * it as a note (classification "Reply"), or close. Esc closes.
 */
import { useEffect, useRef, useState } from "react";
import { draftReply, createNote } from "../services/api";
import { useToast } from "./ToastProvider";

// The backend may answer {draft} | {reply} | {text} — take whichever exists.
function extractDraft(r) {
  if (typeof r === "string") return r;
  if (r && typeof r === "object") {
    const t = r.draft ?? r.reply ?? r.text;
    if (t != null && String(t).trim()) return String(t);
  }
  return "";
}

export default function DraftReplyModal({ doc, onClose }) {
  const toast = useToast();
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false); // guard against double-mount (StrictMode)

  const docLabel = doc?.filename || doc?.ref_number || "letter";

  async function fetchDraft() {
    setPhase("loading");
    setError("");
    try {
      const r = await draftReply(doc.id);
      const t = extractDraft(r);
      if (!t) throw new Error("The AI returned an empty draft. Try again.");
      setText(t);
      setPhase("ready");
    } catch (e) {
      setError(e?.message || "Drafting failed.");
      setPhase("error");
    }
  }

  useEffect(() => {
    if (!doc?.id || startedRef.current) return;
    startedRef.current = true;
    fetchDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  // Esc closes.
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!doc) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  }

  async function handleSaveNote() {
    if (!text.trim()) { toast.error("Nothing to save yet."); return; }
    setSaving(true);
    try {
      await createNote({
        title: `Reply: ${docLabel}`,
        content: text,
        classification: "Reply",
      });
      toast.success("Draft saved as a note.");
      onClose?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't save the note.");
    } finally {
      setSaving(false);
    }
  }

  const btn = (primary) => ({
    background: primary ? "var(--accent)" : "var(--surface)",
    color: primary ? "#fff" : "var(--text-2)",
    border: primary ? "none" : "1px solid var(--border-2)",
    padding: "10px 20px", borderRadius: "var(--radius-sm)", cursor: "pointer",
    fontWeight: 600, fontSize: 15, transition: "opacity .13s",
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <style>{`
        @keyframes draftPulse { 0%, 100% { opacity: .4 } 50% { opacity: 1 } }
        @keyframes draftFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          width: "100%", maxWidth: 640, maxHeight: "88vh",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 4px", color: "var(--accent)", fontSize: 12, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>
              Draft reply
            </p>
            <h2 style={{ margin: 0, fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {docLabel}
            </h2>
            {doc.ref_number && doc.filename && (
              <p style={{ margin: "3px 0 0", color: "var(--muted)", fontSize: 13 }}>Ref {doc.ref_number}</p>
            )}
          </div>
          <button onClick={onClose} title="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 24, lineHeight: 1, flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {phase === "loading" && (
            <div style={{ textAlign: "center", padding: "36px 10px 30px" }}>
              <div style={{ fontSize: 36, marginBottom: 12, animation: "draftFloat 1.6s ease-in-out infinite" }}>✍️</div>
              <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 650 }}>
                Drafting a reply with your AI… ~20 s
              </p>
              <p style={{ margin: "0 0 22px", color: "var(--muted)", fontSize: 13.5 }}>
                Reading the letter and composing a courteous response.
              </p>
              <div style={{ maxWidth: 380, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {[92, 100, 78].map((w, i) => (
                  <div key={i} style={{
                    height: 11, width: `${w}%`, borderRadius: 6, background: "var(--surface-2)",
                    animation: "draftPulse 1.3s ease-in-out infinite", animationDelay: `${i * 0.18}s`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {phase === "error" && (
            <div style={{
              background: "var(--danger-soft)", border: "1px solid var(--danger)",
              borderRadius: "var(--radius-sm)", padding: "16px 18px",
            }}>
              <p style={{ margin: "0 0 12px", color: "var(--danger)", fontWeight: 600, fontSize: 14.5 }}>
                Couldn't draft a reply — {error}
              </p>
              <button onClick={fetchDraft} style={btn(true)}>↻ Retry</button>
            </div>
          )}

          {phase === "ready" && (
            <>
              <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 13.5 }}>
                Edit freely — this is a starting point, not the final word.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%", minHeight: 300, boxSizing: "border-box", resize: "vertical",
                  padding: "16px 18px", borderRadius: 10, border: "1px solid var(--border-2)",
                  background: "var(--bg)", color: "var(--text)",
                  fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 15.5, lineHeight: 1.7,
                }}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 10, justifyContent: "flex-end",
          padding: "14px 24px", borderTop: "1px solid var(--border)",
        }}>
          <button onClick={onClose} style={btn(false)}>Close</button>
          {phase === "ready" && (
            <>
              <button onClick={handleCopy} style={btn(false)}>Copy</button>
              <button onClick={handleSaveNote} disabled={saving} style={{ ...btn(true), opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : "Save as note"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
