import { motion } from "framer-motion";

function TasksPage() {
  const tasks = [
    {
      id: 1,
      title: "Review Project Proposal",
      priority: "High",
      status: "Pending",
    },
    {
      id: 2,
      title: "Prepare Frontend Demo",
      priority: "Medium",
      status: "In Progress",
    },
    {
      id: 3,
      title: "Upload Meeting Documents",
      priority: "Low",
      status: "Completed",
    },
  ];

  return (
    <>
      <motion.div
        initial={{
          opacity: 0,
          y: -40,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          duration: 0.7,
        }}
        style={{
          marginBottom: "40px",
        }}
      >
        <p
          style={{
            color: "#60a5fa",
            letterSpacing: "2px",
            textTransform: "uppercase",
            fontSize: "14px",
            marginBottom: "10px",
          }}
        >
          Task Management
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "48px",
          }}
        >
          Tasks & Priorities
        </h1>

        <p
          style={{
            color: "#64748b",
            marginTop: "16px",
            fontSize: "18px",
          }}
        >
          Track pending work, deadlines and important activities.
        </p>
      </motion.div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
          marginBottom: "40px",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h3>Pending</h3>
          <h1>5</h1>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h3>In Progress</h3>
          <h1>2</h1>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          }}
        >
          <h3>Completed</h3>
          <h1>8</h1>
        </div>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: "24px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "24px",
          }}
        >
          Current Tasks
        </h2>

        {tasks.map((task) => (
          <motion.div
            key={task.id}
            whileHover={{
              y: -3,
            }}
            style={{
              padding: "20px",
              borderRadius: "16px",
              marginBottom: "16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <h3
              style={{
                marginTop: 0,
                marginBottom: "10px",
              }}
            >
              {task.title}
            </h3>

            <p>Priority: {task.priority}</p>

            <p>Status: {task.status}</p>
          </motion.div>
        ))}
      </div>
    </>
  );
}

export default TasksPage;