import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { checkServices, getQueue, getAuditLog, createBackup, getLastBackup, getSystemStatus } from "../services/api";
import { fmtDateTime, IST_TZ } from "../components/DateInput";

function Meter({ label, pct, detail }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const color = p > 85 ? "#dc2626" : p > 60 ? "#c2410c" : "#16a34a";
  return (
    <div style={{ background: "white", borderRadius: "14px", padding: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontWeight: 600, fontSize: "14px" }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontSize: "14px" }}>{p}%</span>
      </div>
      <div style={{ height: "8px", background: "#e2e8f0", borderRadius: "99px", overflow: "hidden" }}>
        <div style={{ width: `${p}%`, height: "100%", background: color }} />
      </div>
      {detail && <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "12px" }}>{detail}</p>}
    </div>
  );
}

function fmtWhen(iso) {
  if (!iso) return "never";
  return fmtDateTime(iso);   // IST
}

const STATUS_COLOR = {
  ok           : { bg: "#f0fdf4", color: "#16a34a", label: "Online" },
  unreachable  : { bg: "#fef2f2", color: "#dc2626", label: "Offline" },
  error        : { bg: "#fff7ed", color: "#c2410c", label: "Error" },
  configured   : { bg: "#eff6ff", color: "#2563eb", label: "Configured" },
};

function ServiceBadge({ name, status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.error;
  return (
    <div style={{
      background: s.bg, borderRadius: "16px",
      padding: "18px 22px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "15px", textTransform: "capitalize" }}>{name}</p>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
          {name === "llm" && "LLM inference (vLLM / Ollama)"}
          {name === "embeddings" && "Embedding model (semantic search)"}
          {name === "docling" && "Document parsing / OCR"}
          {name === "ollama" && "Local LLM inference"}
          {name === "qdrant" && "Vector search DB"}
          {name === "redis"  && "Semantic cache"}
          {name === "postgres" && "Relational database"}
          {name === "whisper" && "Speech-to-text (STT)"}
        </p>
      </div>
      <span style={{
        background: s.color, color: "white",
        padding: "4px 14px", borderRadius: "99px",
        fontWeight: 700, fontSize: "12px",
      }}>
        {typeof status === "string" && status.includes("configured") ? "Configured" : s.label}
      </span>
    </div>
  );
}

export default function SystemStatusPage() {
  const [services, setServices] = useState(null);
  const [queue, setQueue]       = useState([]);
  const [audit, setAudit]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [backup, setBackup]     = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [sys, setSys]           = useState(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [svc, q, a, b, s] = await Promise.allSettled([
        checkServices(),
        getQueue(),
        getAuditLog({ limit: 10 }),
        getLastBackup(),
        getSystemStatus(),
      ]);
      if (svc.status === "fulfilled") setServices(svc.value);
      if (q.status   === "fulfilled") setQueue(q.value);
      if (a.status   === "fulfilled") setAudit(a.value);
      if (b.status   === "fulfilled") setBackup(b.value);
      if (s.status   === "fulfilled") setSys(s.value);
      setLastRefresh(new Date().toLocaleTimeString("en-GB", { timeZone: IST_TZ }));
    } finally {
      setLoading(false);
    }
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      await createBackup();
      setBackup(await getLastBackup());
    } catch (e) {
      alert(e.message);
    } finally {
      setBackingUp(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const queueCounts = {
    waiting          : queue.filter((j) => j.status === "waiting").length,
    processing       : queue.filter((j) => j.status === "processing").length,
    awaiting_confirm : queue.filter((j) => j.status === "awaiting_confirm").length,
    failed           : queue.filter((j) => j.status === "failed").length,
  };

  return (
    <>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
            System Administration
          </p>
          <h1 style={{ margin: 0, fontSize: "42px" }}>System Status</h1>
        </div>
        <button
          onClick={loadAll}
          style={{
            background: "#2563eb", color: "white", border: "none",
            padding: "10px 20px", borderRadius: "10px", cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Refresh
        </button>
      </div>
      {lastRefresh && <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "24px" }}>Last refreshed: {lastRefresh}</p>}

      {/* Service health */}
      <h2 style={{ marginBottom: "14px" }}>AI &amp; Infrastructure Services</h2>
      {loading && <p style={{ color: "#94a3b8" }}>Checking services…</p>}
      {services && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px", marginBottom: "32px" }}>
          {Object.entries(services).map(([name, status]) => (
            <ServiceBadge key={name} name={name} status={status} />
          ))}
        </div>
      )}

      {/* Resources & model (FR-41) */}
      <h2 style={{ marginBottom: "14px" }}>AI Model &amp; Resources</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "32px" }}>
        <div style={{ background: "white", borderRadius: "14px", padding: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>Extraction model</p>
          <p style={{ margin: "8px 0 0", fontSize: "18px", fontWeight: 700, color: sys?.model?.loaded ? "#16a34a" : "#c2410c" }}>
            {sys?.model?.loaded ? "Loaded" : sys?.model?.reachable ? "Idle (not resident)" : "Offline"}
          </p>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>{sys?.model?.model || "—"}</p>
        </div>

        <div style={{ background: "white", borderRadius: "14px", padding: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>Queue depth</p>
          <p style={{ margin: "8px 0 0", fontSize: "26px", fontWeight: 700, color: "#2563eb" }}>{sys?.queue?.depth ?? "—"}</p>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
            {sys?.queue ? `${sys.queue.awaiting_confirm} awaiting confirm · ${sys.queue.failed} failed` : "documents waiting/processing"}
          </p>
        </div>

        {sys?.disk && (
          <Meter label="Disk" pct={sys.disk.used_pct}
                 detail={`${sys.disk.used_gb} GB used of ${sys.disk.total_gb} GB · ${sys.disk.free_gb} GB free`} />
        )}

        {sys?.gpu && sys.gpu.length > 0 ? (
          sys.gpu.map((g, i) => (
            <Meter key={i} label={`GPU — ${g.name}`} pct={g.util_pct}
                   detail={`${g.mem_used_mb}/${g.mem_total_mb} MB (${g.mem_pct}% mem)`} />
          ))
        ) : (
          <div style={{ background: "white", borderRadius: "14px", padding: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>GPU</p>
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "13px" }}>
              No local GPU — inference runs on the Ollama server.
            </p>
          </div>
        )}
      </div>

      {/* Backup (FR-39) */}
      <h2 style={{ marginBottom: "14px" }}>Backup</h2>
      <div style={{
        background: "white", borderRadius: "16px", padding: "18px 22px", marginBottom: "32px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px",
      }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Last successful backup: {backup?.last ? fmtWhen(backup.last.created_at) : "never"}
          </p>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
            {backup?.total ? `${backup.total} backup(s) on disk · ` : ""}
            local snapshot of all data + notes (no cloud).
          </p>
        </div>
        <button onClick={handleBackup} disabled={backingUp}
          style={{ background: "#2563eb", color: "white", border: "none", padding: "10px 20px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
          {backingUp ? "Backing up…" : "Back up now"}
        </button>
      </div>

      {/* Processing queue */}
      <h2 style={{ marginBottom: "14px" }}>Processing Queue</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Waiting",           key: "waiting",          bg: "#fff7ed", color: "#c2410c" },
          { label: "Processing",        key: "processing",       bg: "#eff6ff", color: "#2563eb" },
          { label: "Awaiting Confirm",  key: "awaiting_confirm", bg: "#faf5ff", color: "#7c3aed" },
          { label: "Failed",            key: "failed",           bg: "#fef2f2", color: "#dc2626" },
        ].map(({ label, key, bg, color }) => (
          <div key={key} style={{ background: bg, borderRadius: "14px", padding: "16px" }}>
            <p style={{ margin: 0, color, fontWeight: 700, fontSize: "22px" }}>{queueCounts[key]}</p>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>{label}</p>
          </div>
        ))}
      </div>

      {queue.length > 0 && (
        <div style={{ background: "white", borderRadius: "18px", padding: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", marginBottom: "32px" }}>
          <h3 style={{ margin: "0 0 14px" }}>Recent Queue Jobs</h3>
          {queue.slice(0, 8).map((job) => (
            <div key={job.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px", borderRadius: "10px", marginBottom: "8px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>{job.filename}</span>
                <span style={{ color: "#94a3b8", fontSize: "12px", marginLeft: "10px" }}>
                  Job #{job.id} · retry {job.retry_count}
                </span>
              </div>
              <span style={{
                padding: "3px 10px", borderRadius: "99px", fontSize: "12px", fontWeight: 600,
                background: job.status === "failed" ? "#fef2f2" : job.status === "waiting" ? "#fff7ed" : "#f0fdf4",
                color      : job.status === "failed" ? "#dc2626" : job.status === "waiting" ? "#c2410c" : "#16a34a",
              }}>
                {job.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Audit trail */}
      <h2 style={{ marginBottom: "14px" }}>Audit Trail</h2>
      <div style={{ background: "white", borderRadius: "18px", padding: "20px", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
        {audit.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No audit entries yet.</p>
        ) : (
          audit.map((entry) => (
            <div key={entry.id} style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderBottom: "1px solid #f1f5f9",
            }}>
              <span style={{ fontSize: "14px" }}>
                <strong style={{ color: "#2563eb" }}>{entry.action}</strong>{" "}
                {entry.entity_type} #{entry.entity_id}
                {entry.detail ? ` — ${entry.detail}` : ""}
              </span>
              <span style={{ color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap", marginLeft: "16px" }}>
                {fmtDateTime(entry.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
