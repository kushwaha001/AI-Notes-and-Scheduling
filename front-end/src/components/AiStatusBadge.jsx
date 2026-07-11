/*
 * AiStatusBadge — the single, canonical pill for "is the local AI reachable?".
 * Used on Today and Capture so the app never describes the same state in two
 * different ways. `online` is a tri-state: true (up), false (down), or null/
 * undefined (not yet known — renders nothing).
 */
export default function AiStatusBadge({ online, style }) {
  if (online == null) return null;
  const ok = !!online;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: ok ? "var(--ok-soft)" : "var(--warn-soft)",
        color: ok ? "var(--ok)" : "var(--warn)",
        padding: "8px 14px", borderRadius: 99, fontSize: 14, fontWeight: 600,
        ...style,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
      {ok ? "AI online" : "AI offline — manual entry still works"}
    </span>
  );
}
