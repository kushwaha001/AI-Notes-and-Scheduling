/*
 * Skeleton — tiny pulsing placeholder blocks for loading states.
 * <Skeleton width height radius style> renders one block; <SkeletonRows n>
 * stacks n list-row shaped skeletons (title line + meta line, divided like
 * the task/note list cards).
 */

const CSS_ID = "skeleton-css";

function ensureCss() {
  if (typeof document === "undefined" || document.getElementById(CSS_ID)) return;
  const el = document.createElement("style");
  el.id = CSS_ID;
  el.textContent =
    "@keyframes skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }";
  document.head.appendChild(el);
}

export default function Skeleton({ width = "100%", height = 14, radius = 8, style }) {
  ensureCss();
  return (
    <div
      aria-hidden="true"
      style={{
        width, height, borderRadius: radius,
        background: "var(--surface-2)",
        animation: "skeleton-pulse 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

const ROW_WIDTHS = ["62%", "78%", "54%", "70%", "46%", "66%"];

export function SkeletonRows({ n = 3, style }) {
  return (
    <div style={style}>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          style={{ padding: "16px 20px", borderBottom: i < n - 1 ? "1px solid var(--border)" : "none" }}
        >
          <Skeleton width={ROW_WIDTHS[i % ROW_WIDTHS.length]} height={15} style={{ marginBottom: 8 }} />
          <Skeleton width="34%" height={11} />
        </div>
      ))}
    </div>
  );
}
