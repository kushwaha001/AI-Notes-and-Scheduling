import { motion } from "framer-motion";

function BackgroundBlobs() {
  return (
    <>
      <motion.div
        animate={{
          x: [0, 100, 0],
          y: [0, -50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
        }}
        style={{
          position: "fixed",
          top: "100px",
          right: "150px",
          width: "300px",
          height: "300px",
          borderRadius: "50%",
          background:
            "rgba(96,165,250,0.15)",
          filter: "blur(180px)",
          zIndex: 0,
        }}
      />

      <motion.div
        animate={{
          x: [0, -80, 0],
          y: [0, 60, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
        }}
        style={{
          position: "fixed",
          bottom: "100px",
          left: "150px",
          width: "350px",
          height: "350px",
          borderRadius: "50%",
          background:
            "rgba(168,85,247,0.12)",
          filter: "blur(140px)",
          zIndex: 0,
        }}
      />
      <motion.div
  animate={{
    scale: [1, 1.2, 1],
  }}
  transition={{
    duration: 18,
    repeat: Infinity,
    repeatType: "mirror",
ease: "easeInOut",
  }}
  style={{
    position: "fixed",
    top: "35%",
    left: "45%",
    width: "250px",
    height: "250px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.4)",
    filter: "blur(100px)",
    zIndex: 0,
  }}
/>
    </>
  );
}

export default BackgroundBlobs;