import { motion } from "framer-motion";

function StatCard({ title, value, subtitle, color = "#2563eb" }) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -5 }}
      transition={{ duration: 0.2 }}
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: "24px",
        padding: "28px",
        minWidth: "200px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        borderTop: `4px solid ${color}`,
      }}
    >
      <p
        style={{
          color: "#64748b",
          marginBottom: "14px",
          fontSize: "13px",
          textTransform: "uppercase",
          letterSpacing: "1px",
          fontWeight: 600,
        }}
      >
        {title}
      </p>

      <h2 style={{ margin: 0, fontSize: "44px", fontWeight: "800", color }}>
        {value}
      </h2>

      <p style={{ color: "#94a3b8", marginTop: "12px", fontSize: "14px" }}>
        {subtitle}
      </p>
    </motion.div>
  );
}

export default StatCard;
