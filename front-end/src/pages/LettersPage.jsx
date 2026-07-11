/*
 * Letters workspace — the office DAK register.
 * Top: "Replies due" (letters awaiting a reply, with AI draft + mark-replied).
 * Below: the full correspondence register with search, status filters and a
 * CSV export, exactly like a classic inward/outward register.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getRegister, getPendingReplies, setLetterStatus, registerCsvUrl } from "../services/api";
import { fmtDate } from "../components/DateInput";
import { useToast } from "../components/ToastProvider";
import PeekModal from "../components/PeekModal";
import DraftReplyModal from "../components/DraftReplyModal";

const STATUS_CHIP = {
  open:    { bg: "var(--warn-soft)", fg: "var(--warn)" },
  replied: { bg: "var(--ok-soft)", fg: "var(--ok)" },
  closed:  { bg: "var(--surface-2)", fg: "var(--muted)" },
};
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const card = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
};

// null / unknown letter_status counts as open.
const normStatus = (s) => {
  const v = String(s || "open").toLowerCase();
  return STATUS_CHIP[v] ? v : "open";
};

// "YYYY-MM-DD…" strictly before today (local)?
function isOverdue(d) {
  if (!d) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`) < today;
}

// Pending-reply rows may arrive in a few shapes — normalize defensively.
function normPending(r) {
  return {
    id: r?.id ?? r?.doc_id ?? r?.document_id ?? null,
    filename: r?.filename || r?.title || r?.subject || "",
    ref_number: r?.ref_number || r?.ref || "",
    reply_by: r?.reply_by || r?.due_date || r?.deadline || "",
  };
}

export default function LettersPage() {
  const toast = useToast();
  const [register, setRegister] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [peekId, setPeekId] = useState(null);
  const [draftDoc, setDraftDoc] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  function load(initial = false) {
    if (initial) setLoading(true);
    Promise.all([
      getRegister().catch((e) => { setError(e?.message || "Couldn't load the register."); return []; }),
      getPendingReplies().catch(() => []),
    ])
      .then(([reg, pen]) => {
        setRegister(Array.isArray(reg) ? reg : []);
        setPending((Array.isArray(pen) ? pen : []).map(normPending).filter((p) => p.id != null));
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(true); }, []);

  async function handleMarkReplied(id) {
    setMarkingId(id);
    try {
      await setLetterStatus(id, "replied");
      toast.success("Marked as replied.");
      load();
    } catch (e) {
      toast.error(e?.message || "Couldn't update the letter.");
    } finally {
      setMarkingId(null);
    }
  }

  const counts = useMemo(() => {
    const c = { all: register.length, open: 0, replied: 0, closed: 0 };
    register.forEach((l) => { c[normStatus(l.letter_status)] += 1; });
    return c;
  }, [register]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return register.filter((l) => {
      if (statusFilter !== "all" && normStatus(l.letter_status) !== statusFilter) return false;
      if (!q) return true;
      return `${l.filename || ""} ${l.ref_number || ""}`.toLowerCase().includes(q);
    });
  }, [register, search, statusFilter]);

  const btn = (primary) => ({
    background: primary ? "var(--accent)" : "var(--surface)",
    color: primary ? "#fff" : "var(--text-2)",
    border: primary ? "none" : "1px solid var(--border-2)",
    padding: "8px 16px", borderRadius: "var(--radius-sm)", cursor: "pointer",
    fontWeight: 600, fontSize: 14, transition: "all .13s",
  });
  const chipBtn = (active) => ({
    padding: "6px 15px", borderRadius: 99, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
    background: active ? "var(--accent-soft)" : "var(--surface)",
    color: active ? "var(--accent)" : "var(--text-2)",
    transition: "all .13s", whiteSpace: "nowrap",
  });
  const th = {
    textAlign: "left", padding: "11px 16px", fontSize: 11.5, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--muted)",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td = { padding: "13px 16px", verticalAlign: "middle" };

  const linkStyle = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    color: "var(--accent)", fontWeight: 650, fontSize: 14.5, textAlign: "left",
    maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    display: "block", fontFamily: "inherit",
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <style>{`
        @keyframes lettersPulse { 0%, 100% { opacity: .45 } 50% { opacity: 1 } }
        .letters-row { transition: background .13s; }
        .letters-row:hover { background: var(--surface-2); }
      `}</style>

      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 20px" }}>
        Every letter in one register — track what came in, what needs a reply, and what's closed.
      </p>

      {/* ── A · Replies due ── */}
      {pending.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px" }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Replies due</h2>
            <span style={{ fontSize: 14, color: "var(--muted)" }}>
              {pending.length} letter{pending.length === 1 ? "" : "s"} waiting on you
            </span>
          </div>

          {pending.map((p, i) => {
            const overdue = isOverdue(p.reply_by);
            return (
              <div
                key={p.id ?? i}
                style={{
                  ...card, borderColor: "var(--warn)", background: "var(--warn-soft)",
                  padding: "15px 20px", marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <button onClick={() => setPeekId(p.id)} title="Peek at the letter"
                    style={{ ...linkStyle, fontSize: 15.5, maxWidth: "100%" }}>
                    {p.filename || p.ref_number || "Letter"}
                  </button>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6, fontSize: 13 }}>
                    {p.ref_number && (
                      <span style={{
                        background: "var(--surface)", color: "var(--text-2)", padding: "2px 10px",
                        borderRadius: 99, fontWeight: 600, fontFamily: MONO, fontSize: 12.5,
                        border: "1px solid var(--border)",
                      }}>
                        {p.ref_number}
                      </span>
                    )}
                    {p.reply_by && (
                      <span style={{ color: overdue ? "var(--danger)" : "var(--text-2)", fontWeight: overdue ? 700 : 500 }}>
                        Reply by {fmtDate(p.reply_by)}
                      </span>
                    )}
                    {overdue && (
                      <span style={{
                        background: "var(--danger-soft)", color: "var(--danger)", padding: "2px 10px",
                        borderRadius: 99, fontWeight: 800, fontSize: 11.5, letterSpacing: "0.5px",
                      }}>
                        OVERDUE
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
                  <button onClick={() => setDraftDoc(p)} style={btn(true)}>✍️ Draft reply</button>
                  <button onClick={() => handleMarkReplied(p.id)} disabled={markingId === p.id} style={btn(false)}>
                    {markingId === p.id ? "Marking…" : "✓ Mark replied"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ── B · Correspondence register ── */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 2px 14px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 650 }}>Correspondence register</h2>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            {loading ? "loading…" : `${counts.all} letter${counts.all === 1 ? "" : "s"} · ${counts.open} awaiting reply`}
          </span>
        </div>

        {/* Toolbar: search · status chips · CSV */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename or ref number…"
            style={{
              flex: "1 1 220px", minWidth: 180, padding: "10px 14px", borderRadius: 9,
              border: "1px solid var(--border-2)", fontSize: 14.5, boxSizing: "border-box",
              background: "var(--bg)", color: "var(--text)", fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {[["all", "All"], ["open", "Open"], ["replied", "Replied"], ["closed", "Closed"]].map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)} style={chipBtn(statusFilter === key)}>
                {label}{!loading && ` (${counts[key]})`}
              </button>
            ))}
          </div>
          <a href={registerCsvUrl()} title="Download the register as CSV"
            style={{ ...btn(false), textDecoration: "none", marginLeft: "auto", display: "inline-block" }}>
            ⬇ CSV
          </a>
        </div>

        <div style={{ ...card, overflow: "hidden" }}>
          {error && !loading && register.length === 0 && (
            <div style={{ padding: 20, color: "var(--danger)", fontSize: 14.5 }}>{error}</div>
          )}

          {/* Loading — pulsing placeholder rows */}
          {loading && [0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              display: "flex", gap: 18, alignItems: "center", padding: "17px 20px",
              borderBottom: i < 3 ? "1px solid var(--border)" : "none",
            }}>
              {[80, 230, 90, 90, 70].map((w, j) => (
                <div key={j} style={{
                  height: 12, width: w, maxWidth: "22%", borderRadius: 6, background: "var(--surface-2)",
                  animation: "lettersPulse 1.25s ease-in-out infinite", animationDelay: `${(i * 5 + j) * 0.06}s`,
                }} />
              ))}
            </div>
          ))}

          {/* Empty states */}
          {!loading && !error && register.length === 0 && (
            <div style={{ padding: "48px 32px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📮</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>The register is empty</h3>
              <p style={{ color: "var(--muted)", margin: "0 0 18px", fontSize: 15 }}>
                Once you capture letters they'll be logged here automatically — ref numbers, dates and all.
              </p>
              <Link to="/upload" style={{
                display: "inline-block", background: "var(--accent)", color: "#fff",
                textDecoration: "none", padding: "11px 20px", borderRadius: "var(--radius-sm)",
                fontWeight: 650, fontSize: 15,
              }}>
                + Capture your first letter
              </Link>
            </div>
          )}
          {!loading && register.length > 0 && rows.length === 0 && (
            <div style={{ padding: 24, color: "var(--muted)", fontSize: 14.5, textAlign: "center" }}>
              No letters match{search ? ` “${search}”` : " this filter"}.
            </div>
          )}

          {/* The register table — scrolls horizontally inside its own box */}
          {!loading && rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720, fontSize: 14.5 }}>
                <thead>
                  <tr>
                    <th style={th}>Ref number</th>
                    <th style={th}>Letter</th>
                    <th style={th}>Received</th>
                    <th style={th}>Reply by</th>
                    <th style={th}>Status</th>
                    <th style={th}>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l, i) => {
                    const status = normStatus(l.letter_status);
                    const sc = STATUS_CHIP[status];
                    const overdue = status === "open" && isOverdue(l.reply_by);
                    return (
                      <tr key={l.id ?? i} className="letters-row"
                        style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                          {l.ref_number || "—"}
                        </td>
                        <td style={td}>
                          <button onClick={() => l.id != null && setPeekId(l.id)} title="Peek at the letter" style={linkStyle}>
                            {l.filename || "Untitled letter"}
                          </button>
                        </td>
                        <td style={{ ...td, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                          {l.uploaded_at ? fmtDate(l.uploaded_at) : "—"}
                        </td>
                        <td style={{
                          ...td, whiteSpace: "nowrap",
                          color: overdue ? "var(--danger)" : "var(--text-2)",
                          fontWeight: overdue ? 700 : 400,
                        }}>
                          {l.reply_by ? fmtDate(l.reply_by) : "—"}{overdue ? " ⚠" : ""}
                        </td>
                        <td style={td}>
                          <span style={{
                            background: sc.bg, color: sc.fg, padding: "3px 11px",
                            borderRadius: 99, fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap",
                          }}>
                            {status}
                          </span>
                        </td>
                        <td style={{ ...td, color: "var(--muted)", whiteSpace: "nowrap" }}>
                          {l.classification || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {peekId != null && (
        <PeekModal item={{ kind: "document", id: peekId }} onClose={() => setPeekId(null)} />
      )}
      {draftDoc && <DraftReplyModal doc={draftDoc} onClose={() => setDraftDoc(null)} />}
    </div>
  );
}
