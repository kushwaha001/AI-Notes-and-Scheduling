/*
 * ThemeProvider — owns the two user-tunable display settings and persists them:
 *   • theme  : "light" | "dark"  → sets data-theme on <html> (drives theme.css)
 *   • scale  : whole-UI zoom      → sets <html>.style.zoom
 *
 * Scale exists because some target users are older and want a larger UI; it
 * scales the entire app proportionally (like browser zoom) so nothing gets
 * cramped. Defaults to 100% (normal) — older users can bump it up with A+ and
 * the choice is saved on the device so it's set once.
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const SCALE_STEPS   = [1.0, 1.15, 1.25, 1.35, 1.5, 1.65, 1.8, 2.0];
const DEFAULT_SCALE = 1.0;
const DEFAULT_THEME = "light";

const ThemeCtx = createContext(null);

function readScale() {
  const s = parseFloat(localStorage.getItem("ui-scale"));
  return Number.isFinite(s) ? s : DEFAULT_SCALE;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("ui-theme") || DEFAULT_THEME);
  const [scale, setScale] = useState(readScale);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ui-theme", theme);
  }, [theme]);

  useEffect(() => {
    // `zoom` scales the whole document (incl. inline-px styles) — reliable on the
    // Chromium desktop this app targets. Persisted so it survives a reload.
    document.documentElement.style.zoom = String(scale);
    localStorage.setItem("ui-scale", String(scale));
  }, [scale]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  const bumpScale = useCallback((dir) => {
    setScale((cur) => {
      // Snap to the nearest defined step, then move one notch.
      let i = SCALE_STEPS.indexOf(cur);
      if (i < 0) {
        i = SCALE_STEPS.reduce(
          (best, v, idx) =>
            Math.abs(v - cur) < Math.abs(SCALE_STEPS[best] - cur) ? idx : best,
          0
        );
      }
      i = Math.max(0, Math.min(SCALE_STEPS.length - 1, i + dir));
      return SCALE_STEPS[i];
    });
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggleTheme, scale, bumpScale }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
