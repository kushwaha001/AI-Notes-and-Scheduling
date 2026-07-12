import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getTrash, restoreItem, purgeItem } from "../services/api";
import { fmtDate } from "../components/DateInput";

const SECTIONS = [
  { key: "events",    type: "event",    label: "Events",    color: "var(--accent)" },
  { key: "tasks",     type: "task",     label: "Tasks",     color: "var(--ok)" },
  { key: "documents", type: "document", label: "Documents", color: "var(--warn)" },
  { key: "notes",     type: "note",     label: "Notes",     color: "var(--text-2)" },
];

export default function TrashPage() {
  const [trash, setTrash]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [purgeDays, setPurgeDays] = useState(30);

  function load() {
    setLoading(true);
    getTrash()
      .then((d) => { setTrash(d); setPurgeDays(d.purge_after_days || 30); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(type, id) {
    await restoreItem(type, id).catch((e) => alert(e.message));
    load();
  }

  async function handlePurge(type, id) {
    if (!window.confirm("Permanently delete this item? This cannot be undone.")) return;
    await purgeItem(type, id).catch((e) => alert(e.message));
    load();
  }

  const totalItems = trash
    ? SECTIONS.reduce((n, s) => n + (trash[s.key]?.length || 0), 0)
    : 0;

  function itemLabel(section, item) {
    if (section.key === "documents") return item.filename;
    return item.title || `#${item.id}`;
  }
  function itemSub(section, item) {
    if (section.key === "events") {
      if (!item.event_date) return "";
      const timeStr = item.event_time ? ` @ ${String(item.event_time).slice(0, 5)}${item.event_end_time ? `–${String(item.event_end_time).slice(0, 5)}` : ""}` : "";
      return fmtDate(item.event_date) + timeStr;
    }
    if (section.key === "tasks") {
      if (!item.due_date) return "";
      const timeStr = item.start_time ? ` @ ${String(item.start_time).slice(0, 5)}${item.end_time ? `–${String(item.end_time).slice(0, 5)}` : ""}` : "";
      return `Due ${fmtDate(item.due_date)}` + timeStr;
    }
    if (section.key === "documents") return (item.file_type || "").toUpperCase();
    return "";
  }

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <p style={{ color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
          Trash
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Trash</h1>
        <p style={{ color: "var(--muted)", marginTop: "10px" }}>
          Deleted items are kept here and can be restored. They are automatically
          purged after <strong>{purgeDays} days</strong>. Nothing is permanently lost by accident.
        </p>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading trash…</p>}

      {!loading && totalItems === 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "20px", padding: "60px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.06)" }}>
          <p style={{ color: "var(--muted)", fontSize: "18px" }}>Trash is empty.</p>
        </div>
      )}

      {!loading && trash && SECTIONS.map((section) => {
        const items = trash[section.key] || [];
        if (items.length === 0) return null;
        return (
          <div key={section.key} style={{ marginBottom: "28px" }}>
            <h2 style={{ marginBottom: "14px", color: section.color }}>
              {section.label} ({items.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item) => (
                <motion.div
                  key={`${section.type}-${item.id}`}
                  whileHover={{ y: -2 }}
                  style={{
                    background: "var(--surface)", borderRadius: "14px",
                    padding: "16px 20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <div>
                    <strong>{itemLabel(section, item)}</strong>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "13px" }}>
                      {itemSub(section, item)}
                      {item.deleted_at ? ` · deleted ${fmtDate(item.deleted_at)}` : ""}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => handleRestore(section.type, item.id)}
                      style={{ background: "var(--accent)", color: "white", border: "none", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePurge(section.type, item.id)}
                      style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "7px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
                    >
                      Delete forever
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
