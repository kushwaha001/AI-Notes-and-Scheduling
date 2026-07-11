import { useEffect, useState } from "react";
import { getNotesFor, createNote } from "../services/api";

// Notes attached to a single event or task. Lets the user jot a quick note that
// is also stored as a real note (visible on the Notes page, with a link badge).
export default function EntityNotes({ entityType, entityId }) {
  const [notes, setNotes]   = useState([]);
  const [text, setText]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  function load() {
    if (entityId == null) return;
    getNotesFor(entityType, entityId).then(setNotes).catch(() => {});
  }
  useEffect(load, [entityType, entityId]);

  async function addNote() {
    const body = text.trim();
    if (!body) return;
    setSaving(true); setError("");
    try {
      // Use the first line as the title (falls back to a generic one).
      const firstLine = body.split("\n")[0].slice(0, 80);
      await createNote({
        title: firstLine || "Note",
        content: body,
        classification: "General",
        linked_entity_type: entityType,
        linked_entity_id: entityId,
      });
      setText("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: "18px" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: "15px" }}>
        Notes {notes.length > 0 && <span style={{ color: "#94a3b8", fontWeight: 400 }}>({notes.length})</span>}
      </h3>

      {notes.length > 0 && (
        <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {notes.map((n) => (
            <div key={n.id} style={{
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: "10px", padding: "10px 12px",
            }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "13px", color: "#92400e" }}>
                🗒 {n.title}
              </p>
              {n.preview && (
                <p style={{ margin: "3px 0 0", color: "#78716c", fontSize: "12.5px", whiteSpace: "pre-wrap" }}>
                  {n.preview}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Add a note to this ${entityType}…`}
        rows={2}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: "10px",
          border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box",
          resize: "vertical", outline: "none", fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
        <button onClick={addNote} disabled={saving || !text.trim()}
          style={{
            background: text.trim() ? "#f59e0b" : "#e2e8f0",
            color: text.trim() ? "white" : "#94a3b8",
            border: "none", padding: "7px 16px", borderRadius: "8px",
            cursor: text.trim() ? "pointer" : "not-allowed", fontWeight: 600, fontSize: "13px",
          }}>
          {saving ? "Saving…" : "Add note"}
        </button>
        {error && <span style={{ color: "#ef4444", fontSize: "12px" }}>{error}</span>}
        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
          Also appears on the Notes page
        </span>
      </div>
    </div>
  );
}
