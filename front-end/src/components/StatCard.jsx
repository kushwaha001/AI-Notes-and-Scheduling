import { motion } from "framer-motion";

function StatCard({ title, value, subtitle }) {
  return (
    <motion.div
      whileHover={{
        scale: 1.03,
        y: -5,
      }}
      transition={{
        duration: 0.2,
      }}
      style={{
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "24px",
        padding: "28px",
        minWidth: "260px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <p
        style={{
          color: "#94a3b8",
          marginBottom: "14px",
          fontSize: "14px",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {title}
      </p>

      <h2
        style={{
          margin: 0,
          fontSize: "42px",
          fontWeight: "700",
          color: "white",
        }}
      >
        {value}
      </h2>

      <p
        style={{
          color: "#64748b",
          marginTop: "14px",
          fontSize: "14px",
        }}
      >
        {subtitle}
      </p>
    </motion.div>
  );
}

export default StatCard;