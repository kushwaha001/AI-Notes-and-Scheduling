/*
 * Knowledge Graph — an Obsidian-style view of the whole workspace. Documents,
 * notes, events and tasks are nodes; reference-number matches, source links and
 * soft-links are labelled, arrowed edges. Self-contained force-directed layout
 * in SVG (no external libraries — fully air-gapped): a small cooling physics
 * simulation, with pan / zoom, node drag, hover-highlight and click-to-open.
 */
import { useEffect, useRef, useReducer, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getGraph, getPreview, documentDownloadUrl } from "../services/api";

const KIND = {
  document: { color: "#D97757", icon: "📄", label: "Letter" },
  note:     { color: "#4F7A52", icon: "📝", label: "Note" },
  event:    { color: "#B4791F", icon: "📅", label: "Event" },
  task:     { color: "#5B7089", icon: "✓",  label: "Task" },
};
const REF_RELATIONS = new Set(["same reference", "same series"]);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtTick = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MON[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; };
const FIELD_LABEL = { subject: "Subject", venue: "Venue", time: "Time", event_date: "Date", reply_by: "Reply by", deadline: "Deadline", date: "Date", due: "Due", status: "Status", priority: "Priority" };
const DATE_FIELDS = new Set(["event_date", "reply_by", "deadline", "date", "due"]);
const prettyDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso)); return m ? `${m[3]} ${MON[+m[2] - 1]} ${m[1]}` : String(iso); };

const W = 1600, H = 1000;   // simulation coordinate space

export default function GraphPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [, rerender] = useReducer((x) => x + 1, 0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(null);
  const [focus, setFocus] = useState(null);      // focused hub (task/event) node id
  const [preview, setPreview] = useState(null); // { kind, id, loading, data, expanded }
  const [layout, setLayout] = useState("web"); // "web" | "timeline"
  const [range, setRange] = useState({ from: "", to: "" }); // timeline focus window
  const [filters, setFilters] = useState({ document: true, note: true, event: true, task: true, refOnly: false, labels: true });
  const tlRef = useRef(null); // { min, max, padL, padR } for the timeline axis
  const rangeRef = useRef(range);
  useEffect(() => { rangeRef.current = range; }, [range]);

  const nodesRef = useRef([]);
  const edgesRef = useRef([]);
  const alphaRef = useRef(0);
  const rafRef = useRef(0);
  const svgRef = useRef(null);
  const dragRef = useRef(null);   // { id } while dragging a node
  const panRef = useRef(null);    // { x, y } while panning
  const fitRef = useRef(false);   // request an auto-fit once the web layout settles
  const layoutRef = useRef("web");
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  const focusRef = useRef(null);
  useEffect(() => { focusRef.current = focus; }, [focus]);

  useEffect(() => {
    getGraph()
      .then((g) => {
        // seed positions on a circle so the layout unfolds nicely
        const n = g.nodes.length || 1;
        nodesRef.current = g.nodes.map((nd, i) => ({
          ...nd,
          x: W / 2 + Math.cos((2 * Math.PI * i) / n) * 320 + (i % 7) * 3,
          y: H / 2 + Math.sin((2 * Math.PI * i) / n) * 320 + (i % 5) * 3,
          vx: 0, vy: 0,
        }));
        const byId = Object.fromEntries(nodesRef.current.map((x) => [x.id, x]));
        edgesRef.current = g.edges.filter((e) => byId[e.source] && byId[e.target]);
        setData(g);
      })
      .catch((e) => setError(e.message));
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the chosen layout when the data loads, the layout switches, or the
  // timeline focus window changes.
  useEffect(() => {
    if (!data) return;
    if (layout === "timeline") { setFocus(null); applyTimeline(); }
    else {
      // Switching back to web: DON'T snap the camera to identity first — that
      // caused a visible double-jump (identity → nodes fly → refit). Frame the
      // current positions immediately, re-heat, and auto-refit once settled.
      fitRef.current = true;
      fitView();
      heat(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, data, range]);

  // Frame the visible node cluster: center its bounding box in the viewBox and
  // scale to fit, so the graph is always in view (never settles off-screen).
  function fitView(subset) {
    const ns = (subset && subset.length) ? subset : nodesRef.current.filter(
      (n) => filters[n.kind] && (layoutRef.current !== "timeline" || !n._out)
    );
    if (!ns.length) { setView({ x: 0, y: 0, k: 1 }); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of ns) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    const pad = 90;
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const k = Math.min(2.2, Math.max(0.3, Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setView({ x: W / 2 - cx * k, y: H / 2 - cy * k, k });
  }

  // ── Focus: a hub (task/event) and the letters that feed into it ──
  function buildAdj() {
    const adj = {};
    for (const e of edgesRef.current) {
      (adj[e.source] || (adj[e.source] = new Set())).add(e.target);
      (adj[e.target] || (adj[e.target] = new Set())).add(e.source);
    }
    return adj;
  }

  // Events & tasks that letters connect to, each with its connected letters,
  // biggest first — this drives the top focus strip.
  function computeHubs() {
    const adj = buildAdj();
    const byId = Object.fromEntries(nodesRef.current.map((n) => [n.id, n]));
    return nodesRef.current
      .filter((n) => n.kind === "event" || n.kind === "task")
      .map((n) => ({
        node: n,
        letters: [...(adj[n.id] || [])].map((id) => byId[id]).filter((m) => m && m.kind === "document"),
      }))
      .filter((h) => h.letters.length > 0)
      .sort((a, b) => b.letters.length - a.letters.length ||
        String(a.node.label).localeCompare(String(b.node.label)));
  }

  // Spotlight a hub: centre it, ring its neighbours around it, hide the rest.
  function focusHub(hubId) {
    const adj = buildAdj();
    const byId = Object.fromEntries(nodesRef.current.map((n) => [n.id, n]));
    const hub = byId[hubId];
    if (!hub) return;
    const ring = [...(adj[hubId] || [])].map((id) => byId[id]).filter(Boolean);
    cancelAnimationFrame(rafRef.current); rafRef.current = 0; alphaRef.current = 0;
    hub.x = W / 2; hub.y = H / 2; hub.vx = 0; hub.vy = 0;
    const R = Math.min(370, 150 + ring.length * 16);
    ring.forEach((n, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ring.length);
      n.x = W / 2 + Math.cos(ang) * R; n.y = H / 2 + Math.sin(ang) * R;
      n.vx = 0; n.vy = 0;
    });
    setSel(hubId); setFocus(hubId);
    fitView([hub, ...ring]);
  }

  function clearFocus() { setFocus(null); setSel(null); fitRef.current = true; heat(1); }

  function stepFocus(dir) {
    const hubs = computeHubs();
    if (!hubs.length) return;
    const i = hubs.findIndex((h) => h.node.id === focusRef.current);
    const ni = i < 0 ? (dir > 0 ? 0 : hubs.length - 1) : (i + dir + hubs.length) % hubs.length;
    focusHub(hubs[ni].node.id);
  }

  // Chronological layout: X by date (left→right), Y by type lane. Honours the
  // focus window (range.from / range.to); items outside it are marked _out.
  function applyTimeline() {
    cancelAnimationFrame(rafRef.current); rafRef.current = 0; alphaRef.current = 0;
    const ns = nodesRef.current;
    const R = rangeRef.current;
    const laneY = { document: H * 0.22, event: H * 0.42, task: H * 0.62, note: H * 0.82 };
    const padL = 190, padR = 90;
    const times = ns.map((n) => (n.date ? Date.parse(n.date) : NaN)).filter((t) => !isNaN(t));
    let min = R.from ? Date.parse(R.from) : (times.length ? Math.min(...times) : 0);
    let max = R.to ? Date.parse(R.to) : (times.length ? Math.max(...times) : 1);
    if (min > max) { const t = min; min = max; max = t; }
    const span = Math.max(86400000, max - min);
    ["document", "event", "task", "note"].forEach((k) => {
      const lane = ns.filter((n) => n.kind === k);
      lane.sort((a, b) => (Date.parse(a.date || 0) || 0) - (Date.parse(b.date || 0) || 0));
      lane.forEach((n, i) => {
        const t = n.date ? Date.parse(n.date) : NaN;
        n._out = !isNaN(t) && (t < min || t > max);
        n.x = isNaN(t) ? padL * 0.45 : padL + ((t - min) / span) * (W - padL - padR);
        n.y = laneY[k] + ((i % 3) - 1) * 34;
        n.vx = 0; n.vy = 0;
      });
    });
    tlRef.current = { min, max, padL, padR };
    setView({ x: 0, y: 0, k: 1 });
    rerender();
  }

  const heat = useCallback((a) => {
    alphaRef.current = Math.max(alphaRef.current, a);
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tick() {
    if (layoutRef.current === "timeline") { rafRef.current = 0; return; }
    const ns = nodesRef.current, es = edgesRef.current;
    const alpha = alphaRef.current;
    const REP = 9000, SPRING = 0.022, LEN = 200, GRAV = 0.008, DAMP = 0.85;

    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = REP / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    const byId = Object.fromEntries(ns.map((x) => [x.id, x]));
    for (const e of es) {
      const a = byId[e.source], b = byId[e.target];
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - LEN) * SPRING;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const a of ns) {
      a.vx += (W / 2 - a.x) * GRAV;
      a.vy += (H / 2 - a.y) * GRAV;
      if (dragRef.current && dragRef.current.id === a.id) continue;
      a.vx *= DAMP; a.vy *= DAMP;
      a.x += a.vx * alpha; a.y += a.vy * alpha;
    }
    alphaRef.current *= 0.98;
    rerender();
    if (alphaRef.current > 0.03) rafRef.current = requestAnimationFrame(tick);
    else { rafRef.current = 0; if (fitRef.current) { fitRef.current = false; fitView(); } }
  }

  // ── pointer: node drag, background pan ──
  const toGraph = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const sy = ((clientY - r.top) / r.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k };
  };

  function onNodeDown(e, id) {
    e.stopPropagation();
    dragRef.current = { id };
    setSel(id);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onBgDown(e) {
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function onMove(e) {
    if (dragRef.current) {
      const g = toGraph(e.clientX, e.clientY);
      const nd = nodesRef.current.find((n) => n.id === dragRef.current.id);
      if (nd) { nd.x = g.x; nd.y = g.y; nd.vx = 0; nd.vy = 0; }
      if (layoutRef.current === "web") heat(0.4);
      rerender();
    } else if (panRef.current && svgRef.current) {
      // Snapshot the pan origin locally: onUp may null panRef.current before the
      // setView updater runs, so the updater must not dereference panRef.current.
      const pr = panRef.current;
      const r = svgRef.current.getBoundingClientRect();
      const dx = ((e.clientX - pr.x) / r.width) * W;
      const dy = ((e.clientY - pr.y) / r.height) * H;
      const ox = pr.vx, oy = pr.vy;
      setView((v) => ({ ...v, x: ox + dx, y: oy + dy }));
    }
  }
  function onUp() {
    dragRef.current = null; panRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  // Zoom via explicit buttons only. Wheel-zoom was removed on purpose: Ctrl+scroll
  // fights the browser's own page-zoom gesture (which no listener can reliably
  // intercept — pinch and Ctrl +/- included), and plain-scroll-zoom hijacked page
  // scrolling. Buttons zoom ONLY the graph, about its centre, with zero conflict.
  function zoomBy(factor) {
    setView((v) => {
      const k = Math.min(3, Math.max(0.3, v.k * factor));
      const r = k / v.k;                     // actual scale ratio after clamping
      const cx = W / 2, cy = H / 2;          // keep the viewBox centre fixed
      return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  }

  // Click a node → peek: summary + key fields, expandable to the full letter.
  function peek(nd) {
    const id = nd.id.split("-")[1];
    setSel(nd.id);
    setPreview({ kind: nd.kind, id, loading: true, data: null, expanded: false });
    getPreview(nd.kind, id)
      .then((d) => setPreview((p) => (p && p.id === id && p.kind === nd.kind ? { ...p, loading: false, data: d } : p)))
      .catch(() => setPreview((p) => (p ? { ...p, loading: false, data: null } : p)));
  }

  function openNode(nd) {
    const id = String(nd.id).split("-")[1];
    if (nd.kind === "document") window.open(documentDownloadUrl(id), "_blank");
    else if (nd.kind === "note") navigate("/notes");
    else if (nd.kind === "event") navigate("/calendar");
    else if (nd.kind === "task") navigate("/tasks");
  }

  if (error) return <div style={{ color: "var(--danger)" }}>Could not load the graph — {error}</div>;
  if (!data) return <div style={{ color: "var(--muted)" }}>Building your graph…</div>;

  // visible set per filters (+ focus window in timeline mode)
  const showKind = (k) => filters[k];
  const baseNodes = nodesRef.current.filter((n) => showKind(n.kind));
  let nodes = layout === "timeline" ? baseNodes.filter((n) => !n._out) : baseNodes;
  const focusSet = (focus && layout === "web")
    ? (() => { const a = buildAdj(); return new Set([focus, ...(a[focus] || [])]); })()
    : null;
  if (focusSet) nodes = nodes.filter((n) => focusSet.has(n.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = edgesRef.current.filter((e) =>
    nodeIds.has(e.source) && nodeIds.has(e.target) &&
    (!filters.refOnly || REF_RELATIONS.has(e.relation)));

  const active = hover || sel;
  const neighborIds = new Set();
  if (active) {
    neighborIds.add(active);
    for (const e of edges) {
      if (e.source === active) neighborIds.add(e.target);
      if (e.target === active) neighborIds.add(e.source);
    }
  }
  const dim = (id) => active && !neighborIds.has(id);
  const edgeActive = (e) => active && (e.source === active || e.target === active);

  const counts = data.nodes.reduce((a, n) => ((a[n.kind] = (a[n.kind] || 0) + 1), a), {});

  const hubs = layout === "web" ? computeHubs() : [];
  const hubCount = Object.fromEntries(hubs.map((h) => [h.node.id, h.letters.length]));

  const cbStyle = (on, color) => ({
    display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5,
    padding: "5px 11px", borderRadius: 99, border: "1px solid var(--border-2)",
    background: on ? "var(--surface)" : "var(--bg)", color: on ? "var(--text)" : "var(--muted)",
    userSelect: "none",
  });
  const arrowBtn = {
    border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--text)",
    borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0,
  };
  const hubChip = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", cursor: "pointer",
    fontSize: 13, fontWeight: 600, padding: "6px 11px", borderRadius: 99, flexShrink: 0,
    border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
    background: on ? "var(--accent-soft)" : "var(--surface)", color: on ? "var(--accent)" : "var(--text-2)",
  });

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 14px" }}>
        Every document, note, event and task and how they connect — reference numbers, source letters and links.
        Drag to pan, use the +/− buttons to zoom, hover to highlight, click to open.
      </p>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 9, padding: 3, gap: 2, marginRight: 4 }}>
          {[["web", "Web"], ["timeline", "Timeline"]].map(([l, lab]) => (
            <button key={l} onClick={() => setLayout(l)}
              style={{
                border: "none", cursor: "pointer", padding: "6px 15px", borderRadius: 7, fontSize: 13.5, fontWeight: 600,
                background: layout === l ? "var(--surface)" : "transparent",
                color: layout === l ? "var(--accent)" : "var(--text-2)",
                boxShadow: layout === l ? "var(--shadow)" : "none",
              }}>
              {lab}
            </button>
          ))}
        </div>
        {Object.entries(KIND).map(([k, m]) => (
          <label key={k} style={cbStyle(filters[k], m.color)} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: m.color, display: "inline-block" }} />
            {m.label}s <span style={{ color: "var(--muted)" }}>{counts[k] || 0}</span>
          </label>
        ))}
        <label style={cbStyle(filters.refOnly)} onClick={() => setFilters((f) => ({ ...f, refOnly: !f.refOnly }))}>
          {filters.refOnly ? "☑" : "☐"} Reference links only
        </label>
        <label style={cbStyle(filters.labels)} onClick={() => setFilters((f) => ({ ...f, labels: !f.labels }))}>
          {filters.labels ? "☑" : "☐"} Labels
        </label>
        {layout === "timeline" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Focus</span>
            <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
            <span style={{ fontSize: 13, color: "var(--muted)" }}>→</span>
            <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
            {(range.from || range.to) && (
              <button onClick={() => setRange({ from: "", to: "" })}
                style={{ ...cbStyle(true), cursor: "pointer", padding: "5px 11px" }}>clear</button>
            )}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => zoomBy(0.83)} title="Zoom out"
            style={{ ...cbStyle(true), cursor: "pointer", fontWeight: 700, padding: "5px 12px", minWidth: 34 }}>−</button>
          <button onClick={() => zoomBy(1.2)} title="Zoom in"
            style={{ ...cbStyle(true), cursor: "pointer", fontWeight: 700, padding: "5px 12px", minWidth: 34 }}>+</button>
          <button onClick={() => (layout === "timeline" ? setView({ x: 0, y: 0, k: 1 }) : fitView())}
            style={{ ...cbStyle(true), cursor: "pointer" }}>Reset view</button>
        </div>
      </div>

      {/* Focus strip — one chip per task/event; click to spotlight its letters, ‹ › to switch */}
      {layout === "web" && hubs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>Focus ▸</span>
          <button onClick={() => stepFocus(-1)} title="Previous" style={arrowBtn}>‹</button>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 0", flex: 1 }}>
            {focus && (
              <button onClick={clearFocus} title="Show the whole graph"
                style={{ ...hubChip(false), color: "var(--danger)", borderColor: "var(--danger)", fontWeight: 700 }}>✕ All</button>
            )}
            {hubs.map((h) => {
              const on = h.node.id === focus;
              const m = KIND[h.node.kind];
              return (
                <button key={h.node.id} title={h.node.label}
                  onClick={() => (on ? clearFocus() : focusHub(h.node.id))} style={hubChip(on)}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, display: "inline-block" }} />
                  {h.node.label.length > 22 ? h.node.label.slice(0, 21) + "…" : h.node.label}
                  <span style={{ background: on ? "var(--surface)" : "var(--surface-2)", color: "var(--text-2)", borderRadius: 20, padding: "0 7px", fontSize: 12, fontWeight: 700 }}>{h.letters.length}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => stepFocus(1)} title="Next" style={arrowBtn}>›</button>
        </div>
      )}

      <div style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {focus && layout === "web" && (() => {
          const h = nodesRef.current.find((n) => n.id === focus);
          const cnt = hubCount[focus] ?? (focusSet ? focusSet.size - 1 : 0);
          return h ? (
            <div style={{ position: "absolute", top: 12, left: 12, zIndex: 4, display: "flex", alignItems: "center", gap: 10,
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "6px 12px", fontSize: 13, boxShadow: "var(--shadow)" }}>
              <b style={{ color: "var(--accent)" }}>Focused</b>
              <span style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
              <span style={{ color: "var(--muted)" }}>· {cnt} letter{cnt === 1 ? "" : "s"}</span>
              <button onClick={clearFocus} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>✕</button>
            </div>
          ) : null;
        })()}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "70vh", display: "block", cursor: panRef.current ? "grabbing" : "grab", touchAction: "none" }}
          onPointerDown={onBgDown}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* timeline lanes + date axis */}
            {layout === "timeline" && tlRef.current && (() => {
              const { min, max, padL, padR } = tlRef.current;
              const span = Math.max(1, max - min);
              const lanes = [["Letters", H * 0.22], ["Events", H * 0.42], ["Tasks", H * 0.62], ["Notes", H * 0.82]];
              const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
              return (
                <g style={{ pointerEvents: "none" }}>
                  {lanes.map(([lab, y]) => (
                    <g key={lab}>
                      <line x1={padL - 24} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 7" />
                      <text x={18} y={y + 4} fontSize="14" fill="var(--muted)" fontWeight="700">{lab}</text>
                    </g>
                  ))}
                  <line x1={padL} y1={H - 40} x2={W - padR} y2={H - 40} stroke="var(--border-2)" strokeWidth="1.5" />
                  {ticks.map((t, i) => {
                    const x = padL + ((t - min) / span) * (W - padL - padR);
                    return (
                      <g key={i}>
                        <line x1={x} y1={H - 45} x2={x} y2={H - 35} stroke="var(--border-2)" />
                        <text x={x} y={H - 18} textAnchor="middle" fontSize="13" fill="var(--muted)">{fmtTick(t)}</text>
                      </g>
                    );
                  })}
                  {/* Today marker */}
                  {(() => {
                    const now = Date.parse(new Date().toISOString().slice(0, 10));
                    if (now < min || now > max) return null;
                    const x = padL + ((now - min) / span) * (W - padL - padR);
                    return (
                      <g>
                        <line x1={x} y1={40} x2={x} y2={H - 40} stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="5 4" />
                        <text x={x} y={30} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--accent)">Today</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })()}
            {/* edges */}
            {edges.map((e, i) => {
              const a = byId[e.source], b = byId[e.target];
              if (!a || !b) return null;
              const on = edgeActive(e);
              const isRef = REF_RELATIONS.has(e.relation);
              const faded = active && !on;
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
              return (
                <g key={i} opacity={faded ? 0.08 : 1}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={on ? "var(--accent)" : isRef ? "#c9a08e" : "var(--border-2)"}
                    strokeWidth={on ? 2.4 : isRef ? 1.8 : 1.3}
                    strokeDasharray={e.relation === "same series" ? "5 5" : "none"}
                    markerEnd={e.directed ? "url(#arrow)" : undefined} />
                  {on && (
                    <text x={mx} y={my - 4} textAnchor="middle" fontSize="11"
                      fill="var(--accent)" style={{ pointerEvents: "none" }}>
                      {e.relation}
                    </text>
                  )}
                </g>
              );
            })}
            {/* nodes */}
            {nodes.map((n) => {
              const m = KIND[n.kind];
              const baseR = 11 + Math.min(9, (hubCount[n.id] || 0) * 1.3);   // hubs grow with their letter count
              const r = n.id === active ? baseR + 4 : baseR;
              return (
                <g key={n.id} opacity={dim(n.id) ? 0.18 : 1}
                  style={{ cursor: "pointer" }}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => { e.stopPropagation(); peek(n); }}>
                  <circle cx={n.x} cy={n.y} r={r} fill={m.color}
                    stroke="var(--surface)" strokeWidth="2.5" />
                  {((filters.labels && nodes.length <= 60) || n.id === active || view.k > 1.1) && (
                    <text x={n.x} y={n.y + r + 13} textAnchor="middle" fontSize="12"
                      fill="var(--text)" stroke="var(--surface)" strokeWidth="3.5"
                      paintOrder="stroke" strokeLinejoin="round"
                      fontWeight={n.id === active ? 700 : 500}
                      style={{ pointerEvents: "none" }}>
                      {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* click-to-peek preview panel */}
        {preview && (
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0, width: 380, maxWidth: "92%",
            background: "var(--surface)", borderLeft: "1px solid var(--border)",
            boxShadow: "-12px 0 32px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 18 }}>{KIND[preview.kind]?.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {preview.data?.title || (preview.loading ? "Loading…" : "Preview")}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {KIND[preview.kind]?.label}{preview.data?.ref_number ? ` · ${preview.data.ref_number}` : ""}
                </div>
              </div>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20 }}>×</button>
            </div>

            <div style={{ padding: "14px 16px", overflowY: "auto", flex: 1 }}>
              {preview.loading ? <p style={{ color: "var(--muted)" }}>Loading…</p>
                : !preview.data ? <p style={{ color: "var(--muted)" }}>Preview unavailable.</p>
                : <>
                    {preview.data.summary && (
                      <p style={{ margin: "0 0 12px", fontSize: 14.5, lineHeight: 1.55 }}>
                        <span style={{ color: "var(--accent)", fontWeight: 700 }}>Summary · </span>{preview.data.summary}
                      </p>
                    )}
                    {Object.keys(preview.data.fields || {}).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {Object.entries(preview.data.fields).map(([k, v]) => (
                          <span key={k} style={{ background: "var(--surface-2)", color: "var(--text-2)", fontSize: 12.5, padding: "3px 10px", borderRadius: 8 }}>
                            {FIELD_LABEL[k] || k}: {DATE_FIELDS.has(k) ? prettyDate(v) : v}
                          </span>
                        ))}
                      </div>
                    )}
                    {preview.data.body ? (
                      <>
                        <button onClick={() => setPreview((p) => ({ ...p, expanded: !p.expanded }))}
                          style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>
                          {preview.expanded ? "▴ Collapse" : "▾ Expand full letter"}
                        </button>
                        {preview.expanded && (
                          <pre style={{
                            whiteSpace: "pre-wrap", wordBreak: "break-word",
                            fontFamily: preview.kind === "note" ? "monospace" : "Georgia, serif",
                            fontSize: 14, lineHeight: 1.6, background: "var(--bg)", border: "1px solid var(--border)",
                            borderRadius: 10, padding: 14, margin: 0, maxHeight: "42vh", overflowY: "auto",
                          }}>{preview.data.body}</pre>
                        )}
                      </>
                    ) : (!preview.data.summary && <p style={{ color: "var(--muted)", fontSize: 13.5 }}>No text to preview.</p>)}
                  </>}
            </div>

            {preview.data && (
              <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
                {preview.kind === "document"
                  ? <a href={documentDownloadUrl(preview.id)} target="_blank" rel="noreferrer"
                      style={{ ...cbStyle(true), textDecoration: "none", cursor: "pointer" }}>Open original</a>
                  : <button onClick={() => { const nd = nodesRef.current.find((n) => n.id === `${preview.kind}-${preview.id}`); if (nd) openNode(nd); }}
                      style={{ ...cbStyle(true), cursor: "pointer" }}>Go to {KIND[preview.kind]?.label}</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* legend for edge meaning */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
        <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#c9a08e" strokeWidth="2"/></svg> same reference</span>
        <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="#c9a08e" strokeWidth="2" strokeDasharray="5 5"/></svg> same series</span>
        <span><svg width="26" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--muted)" strokeWidth="1.6" markerEnd="url(#arrow)"/></svg> source of / reply to</span>
        {nodes.length === 0 && <span>No items yet — upload a letter or add a note to grow your graph.</span>}
      </div>
    </div>
  );
}
