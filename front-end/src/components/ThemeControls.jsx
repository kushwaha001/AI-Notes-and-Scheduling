/*
 * ThemeControls — the top-bar cluster: a text-size stepper (A− / % / A+) and a
 * light/dark toggle. Reads/writes ThemeProvider; styled entirely from tokens so
 * it looks right in both themes.
 */
import { FiSun, FiMoon } from "react-icons/fi";
import { useTheme } from "../theme/ThemeProvider";

const sizeBtn = {
  border: "none",
  background: "none",
  color: "var(--text-2)",
  cursor: "pointer",
  fontWeight: 750,
  borderRadius: 6,
  padding: "5px 11px",
  lineHeight: 1,
};

export default function ThemeControls() {
  const { theme, toggleTheme, scale, bumpScale } = useTheme();
  const pct = Math.round(scale * 100);
  const dark = theme === "dark";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        title="Text size — saved on this device"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          border: "1px solid var(--border-2)",
          background: "var(--surface)",
          borderRadius: 9,
          padding: 4,
          boxShadow: "var(--shadow)",
        }}
      >
        <button onClick={() => bumpScale(-1)} aria-label="Smaller text" style={{ ...sizeBtn, fontSize: 14 }}>
          A−
        </button>
        <span
          style={{
            fontSize: 13.5,
            color: "var(--muted)",
            minWidth: 48,
            textAlign: "center",
            fontWeight: 600,
          }}
        >
          {pct}%
        </span>
        <button onClick={() => bumpScale(1)} aria-label="Larger text" style={{ ...sizeBtn, fontSize: 19 }}>
          A+
        </button>
      </div>

      <button
        onClick={toggleTheme}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid var(--border-2)",
          background: "var(--surface)",
          color: "var(--text-2)",
          borderRadius: 9,
          padding: "9px 13px",
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 600,
          boxShadow: "var(--shadow)",
        }}
      >
        {dark ? <FiSun size={17} /> : <FiMoon size={17} />}
        {dark ? "Light" : "Dark"}
      </button>
    </div>
  );
}
