/*
 * 'Needs attention' — surfaces what's slipping and reconciles overdue tasks.
 *
 * Detection is rule-based (from GET /attention); the briefing line is AI-phrased
 * server-side (deterministic fallback). For every overdue task it asks the user
 * to resolve it: ✓ Done · 📅 Postpone (new date) · Still working (snooze today).
 *
 * Exposes AttentionPanel (embedded on Today) and AttentionPopup (an app-load
 * modal shown when several tasks are overdue, once per day).
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAttention, updateTask } from "../services/api";
import { useToast } from "./ToastProvider";

function prettyDate(d) {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[3]} ${months[+m[2] - 1]} ${m[1]}`;
}

const SNOOZE_KEY = "attention_snoozed"; // { [taskId]: "YYYY-MM-DD" }
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function snoozedIds() {
  try {
    const m = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}");
    const t = todayStr();
    return new Set(Object.entries(m).filter(([, d]) => d === t).map(([id]) => Number(id)));
  } catch {
    return new Set();
  }
}
function snooze(id) {
  let m = {};
  try { m = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}"); } catch { m = {}; }
  m[id] = todayStr();
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(m));
}

// Shared data + actions hook.
export function useAttention() {
  const [data, setData] = useState(null);
  const [snoozed, setSnoozed] = useState(snoozedIds);
  const toast = useToast();

  const reload = useCallback(() => {
    getAttention().then(setData).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const markDone = useCallback(async (id) => {
    try { await updateTask(id, { status: "done" }); toast.success("Marked done."); reload(); }
    catch (e) { toast.error(e.message); }
  }, [reload, toast]);

  const postpone = useCallback(async (id, date) => {
    if (!date) return;
    try { await updateTask(id, { due_date: date }); toast.success(`Postponed to ${prettyDate(date)}.`); reload(); }
    catch (e) { toast.error(e.message); }
  }, [reload, toast]);

  const keepOpen = useCallback((id) => {
    snooze(id);
    setSnoozed(snoozedIds());
  }, []);

  const overdue = (data?.overdue || []).filter((t) => !snoozed.has(t.id));
  return { data, overdue, markDone, postpone, keepOpen };
}

// One overdue task with the reconcile controls.
function OverdueRow({ task, onDone, onPostpone, onKeep, last }) {
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState("");

  const btn = (bg, fg, border) => ({
    background: bg, color: fg, border: border || "none",
    padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13.5,
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
      borderBottom: last ? "none" : "1px solid var(--border)", flexWrap: "wrap",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 580 }}>
          {task.is_reply_task ? "↩️ " : ""}{task.title}
        </div>
        <div style={{ fontSize: 13, color: "var(--warn)", marginTop: 2 }}>
          was due {prettyDate(task.due_date)}
        </div>
      </div>
      {picking ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
          <button style={btn("var(--accent)", "#fff")} disabled={!date}
            onClick={() => { onPostpone(task.id, date); setPicking(false); }}>Save date</button>
          <button style={btn("var(--surface)", "var(--text-2)", "1px solid var(--border-2)")}
            onClick={() => setPicking(false)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn("var(--accent)", "#fff")} onClick={() => onDone(task.id)}>✓ Done</button>
          <button style={btn("var(--surface)", "var(--text-2)", "1px solid var(--border-2)")}
            onClick={() => setPicking(true)}>📅 Postpone</button>
          <button style={btn("var(--surface)", "var(--muted)", "1px solid var(--border-2)")}
            onClick={() => onKeep(task.id)}>Still working</button>
        </div>
      )}
    </div>
  );
}

function OverdueList({ overdue, markDone, postpone, keepOpen }) {
  return (
    <div>
      {overdue.map((t, i) => (
        <OverdueRow key={t.id} task={t} last={i === overdue.length - 1}
          onDone={markDone} onPostpone={postpone} onKeep={keepOpen} />
      ))}
    </div>
  );
}

const card = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
};

// ── Panel on Today ────────────────────────────────────────────
export function AttentionPanel() {
  const navigate = useNavigate();
  const { data, overdue, markDone, postpone, keepOpen } = useAttention();
  if (!data) return null;

  const chips = [];
  if (data.replies_due?.length) chips.push([`${data.replies_due.length} reply due`, "/tasks", "warn"]);
  if (data.due_today?.length) chips.push([`${data.due_today.length} due today`, "/tasks", "accent"]);
  if (data.awaiting_confirm) chips.push([`${data.awaiting_confirm} to confirm`, "/inbox", "accent"]);
  if (data.due_soon?.length) chips.push([`${data.due_soon.length} due soon`, "/tasks", "muted"]);

  const nothing = overdue.length === 0 && chips.length === 0;

  return (
    <div style={{ ...card, padding: "18px 20px", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650 }}>Needs attention</h2>
      </div>
      <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: 15 }}>{data.briefing}</p>

      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {chips.map(([label, to, tone]) => (
            <button key={label} onClick={() => navigate(to)}
              style={{
                border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13.5,
                padding: "6px 13px", borderRadius: 99,
                background: tone === "warn" ? "var(--warn-soft)" : tone === "muted" ? "var(--surface-2)" : "var(--accent-soft)",
                color: tone === "warn" ? "var(--warn)" : tone === "muted" ? "var(--muted)" : "var(--accent)",
              }}>
              {label} →
            </button>
          ))}
        </div>
      )}

      {overdue.length > 0 && (
        <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "var(--warn-soft)", color: "var(--warn)", fontWeight: 700, fontSize: 13.5 }}>
            ⚠️ {overdue.length} overdue — did you finish these?
          </div>
          <OverdueList overdue={overdue} markDone={markDone} postpone={postpone} keepOpen={keepOpen} />
        </div>
      )}

      {nothing && (
        <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 14 }}>Nothing slipping. 🎉</p>
      )}
    </div>
  );
}

// ── App-load popup (shown once/day when several are overdue) ───
const POPUP_KEY = "attention_popup_seen";
export function AttentionPopup() {
  const { data, overdue, markDone, postpone, keepOpen } = useAttention();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    const seenToday = localStorage.getItem(POPUP_KEY) === todayStr();
    if (!seenToday && overdue.length >= 2) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function close() {
    localStorage.setItem(POPUP_KEY, todayStr());
    setOpen(false);
  }

  if (!open || overdue.length === 0) return null;

  return (
    <div onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ ...card, width: "100%", maxWidth: 640, maxHeight: "80vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Before you start…</h2>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 22 }}>×</button>
        </div>
        <p style={{ margin: "0 0 16px", color: "var(--text-2)", fontSize: 15 }}>
          {overdue.length} task{overdue.length !== 1 ? "s" : ""} passed their due date. Finished, or should they move?
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <OverdueList overdue={overdue} markDone={markDone} postpone={postpone} keepOpen={keepOpen} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={close}
            style={{ background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--border-2)", padding: "10px 20px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600 }}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
