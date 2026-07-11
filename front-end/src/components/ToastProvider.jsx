import { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

const ToastCtx = createContext({ success() {}, error() {}, info() {} });

export function useToast() {
  return useContext(ToastCtx);
}

const STYLE = {
  success: { bg: "#ecfdf5", border: "#a7f3d0", color: "#065f46", icon: "✓" },
  error:   { bg: "#fef2f2", border: "#fecaca", color: "#991b1b", icon: "✕" },
  info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af", icon: "ℹ" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // opts.action — optional { label, onClick }: renders an accent button that
  // runs onClick and dismisses the toast. Action toasts linger a bit longer.
  const push = useCallback((message, type = "info", opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type, action: opts.action }]);
    setTimeout(() => dismiss(id), opts.action ? 6000 : 4200);
  }, [dismiss]);

  const api = {
    success: (m, opts) => push(m, "success", opts),
    error:   (m, opts) => push(m, "error", opts),
    info:    (m, opts) => push(m, "info", opts),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 3000,
        display: "flex", flexDirection: "column", gap: "10px", maxWidth: "360px" }}>
        <AnimatePresence>
          {toasts.map((t) => {
            const s = STYLE[t.type] || STYLE.info;
            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                style={{
                  background: s.bg, border: `1px solid ${s.border}`, color: s.color,
                  borderRadius: "12px", padding: "12px 16px", fontSize: "14px", fontWeight: 500,
                  boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
                  display: "flex", alignItems: "center", gap: "10px",
                }}>
                <span style={{ fontWeight: 700 }}>{s.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
                {t.action && (
                  <button
                    onClick={() => { t.action.onClick?.(); dismiss(t.id); }}
                    style={{
                      flexShrink: 0, background: "var(--accent)", color: "#fff",
                      border: "none", padding: "5px 12px", borderRadius: "8px",
                      cursor: "pointer", fontWeight: 700, fontSize: "13px",
                      fontFamily: "inherit", transition: "opacity .12s",
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
