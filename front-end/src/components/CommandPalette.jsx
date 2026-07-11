/*
 * CommandPalette — Ctrl+K / Cmd+K quick launcher, mounted once globally
 * (inside the Router, so useNavigate is available).
 * Two groups: ACTIONS (static navigation shortcuts) and ITEMS (knowledge-graph
 * nodes fetched once on first open); Enter on an item opens its PeekModal.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getGraph } from "../services/api";
import PeekModal from "./PeekModal";

const ACTIONS = [
  { icon: "✓",  label: "New task",        to: "/tasks" },
  { icon: "📅", label: "New event",       to: "/calendar" },
  { icon: "📄", label: "Upload document", to: "/upload" },
  { icon: "🎙", label: "Voice note",      to: "/voice" },
  { icon: "💬", label: "Ask AI",          to: "/ask" },
  { icon: "✉️", label: "Letters",         to: "/letters" },
  { icon: "🕸", label: "Graph",           to: "/graph" },
  { icon: "🔍", label: "Search",          to: "/search" },
  { icon: "⚙️", label: "Settings",        to: "/settings" },
];

const KIND_ICON = { document: "📄", event: "📅", task: "✓", note: "📝" };

// Loose match: plain substring, else characters in order (fuzzy).
function fuzzy(query, text) {
  const q = query.toLowerCase(), t = String(text || "").toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;
  let i = 0;
  for (const ch of t) if (ch === q[i]) i += 1;
  return i >= q.length;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [nodes, setNodes] = useState(null); // null = not fetched yet
  const [peek, setPeek] = useState(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const fetchedRef = useRef(false);

  // Global shortcut: Ctrl/Cmd+K toggles, Esc closes. Ignore keys typed in
  // inputs/textareas — except the palette's own input.
  useEffect(() => {
    function onKey(e) {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing && el !== inputRef.current) {
        // Still allow the shortcut itself so the palette can be summoned anywhere.
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // On first open: focus the input and fetch graph nodes once.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      getGraph().then((g) => setNodes(g.nodes || [])).catch(() => setNodes([]));
    }
  }, [open]);

  const q = query.trim();
  const actionResults = ACTIONS.filter((a) => fuzzy(q, a.label))
    .map((a) => ({ type: "action", icon: a.icon, label: a.label, to: a.to }));
  const itemResults = q
    ? (nodes || [])
        .filter((n) => String(n.label || "").toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8)
        .map((n) => ({ type: "item", icon: KIND_ICON[n.kind] || "•", label: n.label, kind: n.kind, id: n.id }))
    : [];
  const results = [...actionResults, ...itemResults];
  const selIdx = Math.min(sel, Math.max(results.length - 1, 0));

  function run(r) {
    if (!r) return;
    setOpen(false);
    if (r.type === "action") navigate(r.to);
    else setPeek({ kind: r.kind, id: r.id });
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[selIdx]);
    }
  }

  // Keep the selected row in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${selIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  function Row({ r, idx }) {
    const active = idx === selIdx;
    return (
      <div
        data-idx={idx}
        onMouseEnter={() => setSel(idx)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => run(r)}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
          cursor: "pointer", borderRadius: "var(--radius-sm)",
          background: active ? "var(--accent-soft)" : "transparent",
          color: active ? "var(--accent)" : "var(--text)",
          transition: "background .12s, color .12s",
        }}
      >
        <span style={{ fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 }}>{r.icon}</span>
        <span style={{ fontSize: 15, fontWeight: active ? 650 : 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.label}
        </span>
        {r.type === "item" && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{r.kind}</span>
        )}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div
          onMouseDown={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,0.45)",
            display: "flex", justifyContent: "center", alignItems: "flex-start",
            padding: "20vh 16px 16px",
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 620,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
              overflow: "hidden", display: "flex", flexDirection: "column",
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSel(0); }}
              onKeyDown={onInputKey}
              placeholder="Type a command or search your items…"
              style={{
                width: "100%", boxSizing: "border-box", padding: "16px 18px",
                border: "none", outline: "none", borderBottom: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)",
                fontSize: 17, fontFamily: "inherit",
              }}
            />

            <div ref={listRef} style={{ maxHeight: 360, overflowY: "auto", padding: "8px" }}>
              {actionResults.length > 0 && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "8px 16px 4px" }}>
                  Actions
                </div>
              )}
              {actionResults.map((r, i) => <Row key={`a-${r.to}`} r={r} idx={i} />)}

              {itemResults.length > 0 && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", padding: "10px 16px 4px" }}>
                  Items
                </div>
              )}
              {itemResults.map((r, i) => <Row key={`i-${r.id}`} r={r} idx={actionResults.length + i} />)}

              {results.length === 0 && (
                <p style={{ margin: 0, padding: "16px", color: "var(--muted)", fontSize: 14 }}>
                  {q && nodes === null ? "Loading your items…" : "No matches."}
                </p>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 16px", fontSize: 12.5, color: "var(--muted)", background: "var(--surface-2)" }}>
              ↑↓ navigate · Enter open · Esc close
            </div>
          </div>
        </div>
      )}

      {peek && <PeekModal item={peek} onClose={() => setPeek(null)} />}
    </>
  );
}
