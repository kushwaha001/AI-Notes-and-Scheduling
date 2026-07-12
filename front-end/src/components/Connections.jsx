/*
 * Connections — 'what links to this?'. Shows a backlinks list (grouped by
 * relation) and a compact radial graph, from GET /connections/{kind}/{id}
 * (source links + accepted soft links + reference-number thread). No AI.
 */
import { useEffect, useState } from "react";
import { getConnections } from "../services/api";
import PeekModal from "./PeekModal";

const KIND_ICON = { document: "📄", note: "📝", event: "📅", task: "✓", audio: "🎙" };
const KIND_COLOR = {
  document: "var(--accent)", note: "var(--accent)", event: "var(--accent)",
  task: "var(--ok)", audio: "var(--warn)",
};

// Compact radial graph: the item in the centre, connections around a circle.
function MiniGraph({ center, nodes }) {
  const size = 260, cx = size / 2, cy = size / 2, r = 92;
  const pts = nodes.slice(0, 8).map((n, i, arr) => {
    const a = (2 * Math.PI * i) / Math.max(1, arr.length) - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  const label = (t) => (t && t.length > 14 ? t.slice(0, 13) + "…" : t || "");
  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 320, display: "block", margin: "0 auto" }}>
      {pts.map((n, i) => (
        <line key={`l${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="var(--border-2)" strokeWidth="1.5" />
      ))}
      {pts.map((n, i) => (
        <g key={`n${i}`}>
          <circle cx={n.x} cy={n.y} r="9" fill="var(--surface)" stroke={KIND_COLOR[n.kind] || "var(--muted)"} strokeWidth="2" />
          <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize="9">{KIND_ICON[n.kind] || "•"}</text>
          <text x={n.x} y={n.y + (n.y < cy ? -14 : 22)} textAnchor="middle" fontSize="9.5" fill="var(--text-2)">{label(n.title)}</text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r="16" fill="var(--accent)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fill="#fff">{KIND_ICON[center?.kind] || "•"}</text>
    </svg>
  );
}

export default function Connections({ kind, id, showGraph = true }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [peek, setPeek] = useState(null);

  useEffect(() => {
    if (kind == null || id == null) return;
    setLoaded(false);
    getConnections(kind, id)
      .then(setData)
      .catch(() => setData({ connections: [] }))
      .finally(() => setLoaded(true));
  }, [kind, id]);

  if (!loaded) return null;
  const conns = data?.connections || [];
  if (conns.length === 0) return null;

  // group by relation for the list
  const groups = {};
  for (const c of conns) (groups[c.relation] ||= []).push(c);

  return (
    <div style={{ marginTop: 4, marginBottom: 18 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>🔗 Connections ({conns.length})</h3>

      {showGraph && conns.length >= 2 && (
        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: 8, marginBottom: 12 }}>
          <MiniGraph center={data.center} nodes={conns} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.entries(groups).map(([relation, items]) => (
          <div key={relation}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4 }}>
              {relation}
            </div>
            {items.map((c) => (
              <button key={`${c.kind}-${c.id}`} onClick={() => setPeek({ kind: c.kind, id: c.id })}
                title="Peek" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", width: "100%", textAlign: "left",
                borderRadius: 9, background: "var(--bg)", border: "1px solid var(--border)", marginBottom: 6, cursor: "pointer", color: "var(--text)",
              }}>
                <span>{KIND_ICON[c.kind] || "•"}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.title}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "capitalize" }}>{c.kind}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {peek && <PeekModal item={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}
