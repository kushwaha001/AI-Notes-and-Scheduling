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

  const push = useCallback((message, type = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const api = {
    success: (m) => push(m, "success"),
    error:   (m) => push(m, "error"),
    info:    (m) => push(m, "info"),
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
                <span>{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
