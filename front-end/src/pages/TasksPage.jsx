import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTasks, createTask, updateTask, deleteTask } from "../services/api";
import DateInput, { fmtDate, toApiDate } from "../components/DateInput";

const CATEGORIES = ["General","Meeting","Reply","Review","Personal","Restricted","Confidential"];

const STATUS_STYLE = {
  open   : { background: "#eff6ff", color: "#2563eb"  },
  done   : { background: "#f0fdf4", color: "#16a34a"  },
  trashed: { background: "#f8fafc", color: "#94a3b8"  },
};

export default function TasksPage() {
  const [allTasks, setAllTasks] = useState([]);   // every task; counts + filtering derive from this
  const [filter, setFilter]     = useState("open");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ title: "", due_date: "", category: "General", is_reply_task: false });
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");

  function loadTasks() {
    setLoading(true);
    getTasks({})                       // always load all; filter on the client
      .then(setAllTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTasks(); }, []);

  async function handleCreate() {
    if (!form.title) { setMsg("Title is required."); return; }
    setSaving(true); setMsg("");
    try {
      await createTask({
        title      : form.title,
        due_date   : toApiDate(form.due_date),
        category   : form.category,
      });
      setMsg("Task saved.");
      setForm({ title: "", due_date: "", category: "General", is_reply_task: false });
      setShowForm(false);
      loadTasks();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkDone(id) {
    await updateTask(id, { status: "done" }).catch((e) => alert(e.message));
    loadTasks();
  }

  async function handleDelete(id) {
    if (!window.confirm("Move task to trash?")) return;
    await deleteTask(id).catch((e) => alert(e.message));
    loadTasks();
  }

  // Counts always reflect every task (not the current filter)
  const counts = {
    open : allTasks.filter((t) => t.status === "open").length,
    done : allTasks.filter((t) => t.status === "done").length,
    all  : allTasks.length,
  };

  // The list shown depends on the selected filter card
  const tasks = filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);

  // Pending replies = open reply-tasks due within 2 days or overdue
  const pendingReplies = allTasks.filter((t) => {
    if (t.status !== "open" || !t.is_reply_task || !t.due_date) return false;
    const diff = (new Date(t.due_date) - new Date()) / (1000 * 60 * 60 * 24);
    return diff <= 2;
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        style={{ marginBottom: "32px" }}
      >
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "10px" }}>
          Task Management
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Tasks &amp; Priorities</h1>
        <p style={{ color: "#64748b", marginTop: "12px", fontSize: "16px" }}>
          Track pending work, deadlines and reply-by dates.
        </p>
      </motion.div>

      {/* Pending replies banner (FR-23) */}
      {pendingReplies.length > 0 && (
        <div style={{
          background: "#fff7ed", border: "1px solid #fed7aa",
          borderRadius: "16px", padding: "16px 20px", marginBottom: "24px",
        }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#c2410c" }}>
            ⚠ Pending Replies — {pendingReplies.length} due soon
          </p>
          {pendingReplies.map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <span style={{ fontSize: "14px", color: "#92400e" }}>
                {t.title} — due <strong>{fmtDate(t.due_date)}</strong>
              </span>
              <button onClick={() => handleMarkDone(t.id)}
                style={{ background: "#10b981", color: "white", border: "none", padding: "5px 14px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                Mark Done
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "28px" }}>
        {[
          { label: "Open",  key: "open",  bg: "#eff6ff" },
          { label: "Done",  key: "done",  bg: "#f0fdf4" },
          { label: "All",   key: "all",   bg: "#f8fafc" },
        ].map(({ label, key, bg }) => (
          <div
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? "#2563eb" : bg,
              borderRadius: "18px", padding: "22px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
              cursor: "pointer",
              color: filter === key ? "white" : "#0f172a",
              transition: "all 0.2s",
            }}
          >
            <h3 style={{ margin: "0 0 6px", fontSize: "14px" }}>{label}</h3>
            <h1 style={{ margin: 0, fontSize: "36px" }}>{loading ? "…" : counts[key]}</h1>
          </div>
        ))}
      </div>

      {/* Create task */}
      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={() => { setShowForm((v) => !v); setMsg(""); }}
          style={{
            background: "#2563eb", color: "white", border: "none",
            padding: "11px 22px", borderRadius: "12px", cursor: "pointer",
            fontWeight: 600, fontSize: "14px",
          }}
        >
          + New Task
        </button>

        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            style={{
              background: "white", borderRadius: "16px",
              padding: "20px", marginTop: "14px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3 style={{ margin: "0 0 14px" }}>New Task</h3>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Title *</label>
                <input type="text" placeholder="Task title" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
                />
              </div>
              <DateInput label="Due Date" value={form.due_date}
                onChange={(v) => setForm((f) => ({ ...f, due_date: v }))} />
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Category</label>
                <select value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }}
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button onClick={handleCreate} disabled={saving}
                style={{ background: "#10b981", color: "white", border: "none", padding: "10px 22px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                {saving ? "Saving…" : "Save Task"}
              </button>
              <button onClick={() => { setShowForm(false); setMsg(""); }}
                style={{ background: "transparent", color: "#64748b", border: "1px solid #e2e8f0", padding: "10px 22px", borderRadius: "10px", cursor: "pointer" }}>
                Cancel
              </button>
              {msg && <span style={{ color: msg.startsWith("Error") ? "#ef4444" : "#10b981", fontSize: "14px" }}>{msg}</span>}
            </div>
          </motion.div>
        )}
      </div>

      {/* Task list */}
      <div style={{ background: "white", borderRadius: "22px", padding: "22px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>
          {filter === "all" ? "All Tasks" : filter === "open" ? "Open Tasks" : "Completed Tasks"}
        </h2>

        {error  && <p style={{ color: "#ef4444" }}>{error}</p>}
        {loading && <p style={{ color: "#94a3b8" }}>Loading tasks…</p>}
        {!loading && tasks.length === 0 && (
          <p style={{ color: "#94a3b8" }}>No tasks. Create one above.</p>
        )}

        {tasks.map((task) => (
          <motion.div key={task.id} whileHover={{ y: -2 }}
            style={{
              padding: "16px 18px", borderRadius: "14px", marginBottom: "12px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <h3 style={{
                margin: "0 0 5px",
                textDecoration: task.status === "done" ? "line-through" : "none",
                color: task.status === "done" ? "#94a3b8" : "#0f172a",
              }}>
                {task.title}
              </h3>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "12px" }}>
                {task.due_date && (
                  <span style={{ color: "#64748b" }}>Due {fmtDate(task.due_date)}</span>
                )}
                {task.classification && (
                  <span style={{ background: "#faf5ff", color: "#7c3aed", padding: "2px 8px", borderRadius: "99px", fontWeight: 600 }}>
                    {task.classification}
                  </span>
                )}
                <span style={{ ...STATUS_STYLE[task.status], padding: "2px 8px", borderRadius: "99px", fontWeight: 600 }}>
                  {task.status}
                </span>
                {task.source && (
                  <span style={{ color: "#94a3b8" }}>via {task.source}</span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              {task.status === "open" && (
                <button onClick={() => handleMarkDone(task.id)}
                  style={{ background: "#10b981", color: "white", border: "none", padding: "7px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                  Done
                </button>
              )}
              <button onClick={() => handleDelete(task.id)}
                style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "7px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                Trash
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
