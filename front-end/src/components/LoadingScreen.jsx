import { motion } from "framer-motion";

function LoadingScreen() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f8fafc",
      }}
    >
      <motion.div
        initial={{
          opacity: 0,
          scale: 0.8,
        }}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        transition={{
          duration: 0.4,
        }}
      >
        <h1
          style={{
            fontSize: "52px",
            margin: 0,
            fontWeight: "800",
            textAlign: "center",
          }}
        >
          AI Notes and Scheduling
        </h1>
      </motion.div>
    </div>
  );
}

export default LoadingScreen;