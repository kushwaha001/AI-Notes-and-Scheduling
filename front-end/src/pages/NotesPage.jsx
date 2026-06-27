import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getNotes, getNote, createNote, updateNote, deleteNote, getNoteVersions, getNoteVersion } from "../services/api";
import { fmtDate } from "../components/DateInput";
import RelatedItems from "../components/RelatedItems";

const CLASSIFICATIONS = ["General", "Meeting", "Reply", "Review", "Personal", "Restricted", "Confidential"];

export default function NotesPage() {
  const [notes, setNotes]           = useState([]);
  const [selected, setSelected]     = useState(null); // { note_id, content }
  const [editTitle, setEditTitle]   = useState("");
  const [editContent, setEditContent] = useState("");
  const [editClass, setEditClass]   = useState("General"); // FR-36
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");
  const [creating, setCreating]     = useState(false);
  const [newTitle, setNewTitle]     = useState("");

  // FR-39 — version history
  const [versions, setVersions]         = useState(null); // array or null (modal closed)
  const [viewVersion, setViewVersion]   = useState(null); // { version, content }

  function loadList() {
    getNotes().then(setNotes).catch(() => {});
  }

  useEffect(() => { loadList(); }, []);

  async function openNote(id) {
    setLoading(true);
    try {
      const data = await getNote(id);
      // strip the "# title" header line from the body (title is its own field now)
      const lines = (data.content || "").split("\n");
      const body  = lines[0].startsWith("#") ? lines.slice(2).join("\n") : data.content;
      setSelected(data);
      setEditTitle(data.title || String(id));
      setEditClass(data.classification || "General");
      setEditContent(body);
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true); setMsg("");
    try {
      await updateNote(selected.note_id, {
        title: editTitle, content: editContent, classification: editClass,
      });
      setMsg("Saved.");
      loadList();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    try {
      const res = await createNote({ title: newTitle, content: "", classification: "General" });
      setCreating(false);
      setNewTitle("");
      loadList();
      openNote(res.note_id);
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Move note to trash? You can restore it later.")) return;
    await deleteNote(id).catch((e) => alert(e.message));
    if (selected?.note_id === id) { setSelected(null); setEditContent(""); setEditTitle(""); }
    loadList();
  }

  async function openHistory() {
    if (!selected) return;
    try {
      const vs = await getNoteVersions(selected.note_id);
      setVersions(vs);
    } catch (e) { alert(e.message); }
  }

  async function viewVersionContent(version) {
    try {
      const data = await getNoteVersion(selected.note_id, version);
      setViewVersion({ version, content: data.content });
    } catch (e) { alert(e.message); }
  }

  function restoreVersion() {
    if (!viewVersion) return;
    // load version content into the editor (user can Save to make it current)
    const lines = (viewVersion.content || "").split("\n");
    const titleLine = lines[0].startsWith("#") ? lines[0].replace(/^#+\s*/, "") : "";
    const body = titleLine ? lines.slice(2).join("\n") : viewVersion.content;
    setEditTitle(titleLine || selected.note_id);
    setEditContent(body);
    setViewVersion(null);
    setVersions(null);
    setMsg("Version loaded — click Save to make it the current version.");
  }

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
          Notes
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Notes</h1>
        <p style={{ color: "#64748b", marginTop: "10px" }}>
          Capture quick notes. Every edit is stored as Markdown on the server.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "20px", alignItems: "start" }}>
        {/* Left — note list */}
        <div style={{ background: "white", borderRadius: "20px", padding: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "16px" }}>All Notes ({notes.length})</h3>
            <button
              onClick={() => setCreating((v) => !v)}
              style={{
                background: "#2563eb", color: "white", border: "none",
                padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
                fontWeight: 600, fontSize: "13px",
              }}
            >
              + New
            </button>
          </div>

          {creating && (
            <div style={{ marginBottom: "12px" }}>
              <input
                autoFocus
                type="text"
                placeholder="Note title…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={{
                  width: "100%", padding: "8px 10px",
                  borderRadius: "8px", border: "1px solid #2563eb",
                  fontSize: "14px", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <button onClick={handleCreate}
                  style={{ background: "#10b981", color: "white", border: "none", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                  Create
                </button>
                <button onClick={() => { setCreating(false); setNewTitle(""); }}
                  style={{ background: "#f1f5f9", color: "#64748b", border: "none", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {notes.length === 0 && !creating && (
            <p style={{ color: "#94a3b8", fontSize: "13px" }}>No notes yet. Click + New.</p>
          )}

          {notes.map((n) => (
            <div
              key={n.id}
              onClick={() => openNote(n.id)}
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                marginBottom: "6px",
                cursor: "pointer",
                background: selected?.note_id === n.id ? "#eff6ff" : "#f8fafc",
                border: selected?.note_id === n.id ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {n.title}
                </p>
                <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "11px" }}>
                  {fmtDate(n.modified_at)}
                  {n.classification && n.classification !== "General" && (
                    <span style={{
                      marginLeft: "6px", background: "#faf5ff", color: "#7c3aed",
                      padding: "1px 7px", borderRadius: "99px", fontWeight: 600,
                    }}>{n.classification}</span>
                  )}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                style={{
                  background: "transparent", border: "none",
                  color: "#ef4444", cursor: "pointer", fontSize: "14px", padding: "0 4px",
                }}
                title="Delete note"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Right — editor */}
        {selected ? (
          <motion.div
            key={selected.note_id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
              background: "white", borderRadius: "20px",
              padding: "22px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{
                  flex: 1, fontSize: "20px", fontWeight: 700,
                  border: "none", outline: "none",
                  borderBottom: "2px solid #e2e8f0",
                  padding: "4px 0", marginRight: "16px",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleSave} disabled={saving}
                  style={{
                    background: "#2563eb", color: "white", border: "none",
                    padding: "8px 18px", borderRadius: "8px", cursor: "pointer", fontWeight: 600,
                  }}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={openHistory}
                  style={{ background: "#faf5ff", color: "#7c3aed", border: "1px solid #e9d5ff", padding: "8px 14px", borderRadius: "8px", cursor: "pointer" }}>
                  History
                </button>
                <button onClick={() => handleDelete(selected.note_id)}
                  style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", padding: "8px 14px", borderRadius: "8px", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>

            {/* FR-36 — classification tag */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <label style={{ fontSize: "13px", color: "#64748b" }}>Classification:</label>
              <select value={editClass} onChange={(e) => setEditClass(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}>
                {CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>

            {msg && (
              <p style={{ color: msg.startsWith("Error") ? "#ef4444" : "#10b981", fontSize: "13px", marginBottom: "12px" }}>
                {msg}
              </p>
            )}

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Write your note in Markdown…"
              style={{
                width: "100%", minHeight: "420px",
                padding: "14px", borderRadius: "10px",
                border: "1px solid #e2e8f0",
                fontSize: "14px", fontFamily: "monospace",
                lineHeight: "1.7", resize: "vertical",
                boxSizing: "border-box", outline: "none",
              }}
            />

            <div style={{ marginTop: "10px" }}>
              <p style={{ color: "#94a3b8", fontSize: "12px", margin: 0 }}>
                Stored as Markdown on server · note #{selected.note_id} ·
                use <strong>History</strong> to view or restore earlier versions
              </p>
            </div>

            {/* FR-25 — AI-suggested related notes/documents */}
            <RelatedItems kind="note" id={selected.note_id} />
          </motion.div>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.6)", borderRadius: "20px",
            padding: "60px", textAlign: "center",
            boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
          }}>
            {loading ? (
              <p style={{ color: "#94a3b8" }}>Loading…</p>
            ) : (
              <>
                <p style={{ color: "#94a3b8", fontSize: "18px" }}>Select a note to view or edit</p>
                <p style={{ color: "#cbd5e1", fontSize: "14px" }}>or click + New to create one</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* FR-39 — version history modal */}
      {versions !== null && (
        <div onClick={() => { setVersions(null); setViewVersion(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
          }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: "20px", padding: "24px", width: "100%", maxWidth: "620px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0 }}>Version History</h3>
              <button onClick={() => { setVersions(null); setViewVersion(null); }}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "20px" }}>×</button>
            </div>

            {!viewVersion ? (
              versions.length === 0 ? (
                <p style={{ color: "#94a3b8" }}>No previous versions yet. Versions are saved each time you edit and save.</p>
              ) : (
                versions.map((v) => (
                  <div key={v.version} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderBottom: "1px solid #f1f5f9",
                  }}>
                    <span style={{ fontSize: "14px" }}>
                      {new Date(v.saved_at).toLocaleString()}
                    </span>
                    <button onClick={() => viewVersionContent(v.version)}
                      style={{ background: "#eff6ff", color: "#2563eb", border: "none", padding: "5px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
                      View
                    </button>
                  </div>
                ))
              )
            ) : (
              <div>
                <button onClick={() => setViewVersion(null)}
                  style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "5px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", marginBottom: "12px" }}>
                  ‹ Back to versions
                </button>
                <pre style={{
                  background: "#f8fafc", borderRadius: "10px", padding: "16px",
                  fontSize: "13px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: "340px", overflowY: "auto", border: "1px solid #e2e8f0",
                }}>
                  {viewVersion.content}
                </pre>
                <button onClick={restoreVersion}
                  style={{ marginTop: "12px", background: "#10b981", color: "white", border: "none", padding: "9px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
                  Load this version into editor
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}
