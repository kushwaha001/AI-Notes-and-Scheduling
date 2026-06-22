import { motion } from "framer-motion";
import { useState } from "react";

function SearchPage() {
  const [query, setQuery] = useState("");

  const results = [
    {
      id: 1,
      title: "Project Review Meeting",
      type: "Calendar Event",
    },
    {
      id: 2,
      title: "Finance Notice.pdf",
      type: "Document",
    },
    {
      id: 3,
      title: "Frontend Demo Task",
      type: "Task",
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
          Intelligent Search
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "48px",
          }}
        >
          Search Workspace
        </h1>

        <p
          style={{
            color: "#64748b",
            marginTop: "16px",
            fontSize: "18px",
          }}
        >
          Search events, documents, notes and tasks using natural language.
        </p>
      </motion.div>

      <div
        style={{
          background: "white",
          borderRadius: "24px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
          marginBottom: "30px",
        }}
      >
        <input
          type="text"
          placeholder="Search meetings, documents, tasks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "18px",
            borderRadius: "14px",
            border: "1px solid #cbd5e1",
            fontSize: "16px",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginBottom: "30px",
        }}
      >
        <div
          style={{
            background: "#eff6ff",
            padding: "14px 18px",
            borderRadius: "14px",
            fontWeight: "600",
          }}
        >
          24 Documents
        </div>

        <div
          style={{
            background: "#f0fdf4",
            padding: "14px 18px",
            borderRadius: "14px",
            fontWeight: "600",
          }}
        >
          12 Events
        </div>

        <div
          style={{
            background: "#faf5ff",
            padding: "14px 18px",
            borderRadius: "14px",
            fontWeight: "600",
          }}
        >
          8 Tasks
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
          Search Results
        </h2>

        {results.map((result) => (
          <motion.div
            key={result.id}
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
                marginBottom: "8px",
              }}
            >
              {result.title}
            </h3>

            <p
              style={{
                color: "#64748b",
                margin: 0,
              }}
            >
              {result.type}
            </p>
          </motion.div>
        ))}
      </div>
    </>
  );
}

export default SearchPage;