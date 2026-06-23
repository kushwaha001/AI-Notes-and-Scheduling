import { useState } from "react";
import { uploadFile } from "../services/api";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);

const [isProcessing, setIsProcessing] = useState(false);
const [showExtraction, setShowExtraction] = useState(false);
const [saved, setSaved] = useState(false);


  async function handleUpload() {
  if (!selectedFile) return;

  setIsProcessing(true);

  setTimeout(() => {
    setIsProcessing(false);
    setShowExtraction(true);
  }, 2000);
}

  return (
    <div>
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "50px",
    background: "rgba(255,255,255,0.6)",
    backdropFilter: "blur(10px)",
    padding: "20px",
    borderRadius: "20px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  }}
>
  <div>
    <strong
  style={{
    color: selectedFile ? "#2563eb" : "#94a3b8",
  }}
>
  1. Upload
</strong>
  </div>

  <div
    style={{
      width: "60px",
      height: "2px",
      background: "#cbd5e1",
    }}
  />

  <div>
    <strong
  style={{
    color: isProcessing || showExtraction
      ? "#2563eb"
      : "#94a3b8",
  }}
>
  2. Analyze
</strong>
  </div>

  <div
    style={{
      width: "60px",
      height: "2px",
      background: "#cbd5e1",
    }}
  />

  <div>
    <strong
  style={{
    color: showExtraction
      ? "#2563eb"
      : "#94a3b8",
  }}
>
  3. Review
</strong>
  </div>

  <div
    style={{
      width: "60px",
      height: "2px",
      background: "#cbd5e1",
    }}
  />

  <div>
    <strong
  style={{
    color: saved
      ? "#10b981"
      : "#94a3b8",
  }}
>
  4. Save
</strong>
  </div>
</div>
      <h1
        style={{
          marginBottom: "10px",
        }}
      >
        Upload Document
      </h1>

      <p
        style={{
          color: "#94a3b8",
          marginBottom: "30px",
        }}
      >
        Upload letters, notices, meeting schedules and other documents for AI
        extraction.
      </p>

      <div
        style={{
          background: "#0f172a",
          border: "2px dashed #334155",
          borderRadius: "20px",
          padding: "60px",
          textAlign: "center",
          marginBottom: "30px",
        }}
      >
        <h2 style={{ marginBottom: "15px" }}>
          Drag & Drop Document
        </h2>

        <p
          style={{
            color: "#94a3b8",
            marginBottom: "20px",
          }}
        >
          PDF, DOCX, JPG, PNG
        </p>

        <input
          type="file"
          onChange={(e) => setSelectedFile(e.target.files[0])}
        />
      </div>

      <div
        style={{
          background: "#111827",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "20px",
        }}
      >
        <strong>Selected File</strong>

        <p
          style={{
            marginTop: "10px",
            color: "#94a3b8",
          }}
        >
          {selectedFile
            ? selectedFile.name
            : "No file selected"}
        </p>
      </div>

      <button
        onClick={handleUpload}
        style={{
          background: "#2563eb",
          color: "white",
          border: "none",
          padding: "14px 28px",
          borderRadius: "12px",
          cursor: "pointer",
          fontSize: "16px",
        }}
      >
        Upload Document
      </button>

      {isProcessing && (
  <div
    style={{
      marginTop: "30px",
      background: "rgba(255,255,255,0.7)",
      backdropFilter: "blur(10px)",
      padding: "30px",
      borderRadius: "24px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    }}
  >
    <h3
      style={{
        marginTop: 0,
        marginBottom: "20px",
      }}
    >
      AI Processing Document
    </h3>

    <div style={{ marginBottom: "12px" }}>
      ✓ Reading document
    </div>

    <div style={{ marginBottom: "12px" }}>
      ✓ Detecting dates and times
    </div>

    <div style={{ marginBottom: "12px" }}>
      ✓ Extracting meeting details
    </div>

    <div>
      ✓ Creating calendar event
    </div>
  </div>
)}
{showExtraction && (
  <div
    style={{
      marginTop: "30px",
      background: "#111827",
      padding: "30px",
      borderRadius: "20px",
      border: "1px solid #1f2937",
    }}
  >
    <h2
  style={{
    marginTop: 0,
    marginBottom: "10px",
  }}
>
  AI Extraction Results
</h2>

<p
  style={{
    color: "#64748b",
    marginBottom: "30px",
  }}
>
  Review the extracted information before creating the calendar event.
</p>

    <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginTop: "20px",
  }}
>
  <div>
    <p
      style={{
        color: "#64748b",
        marginBottom: "5px",
      }}
    >
      Reference Number
    </p>

    <strong>REF-2026-001</strong>
  </div>

  <div>
    <p
      style={{
        color: "#64748b",
        marginBottom: "5px",
      }}
    >
      Priority
    </p>

    <span
      style={{
        background: "#fee2e2",
        color: "#dc2626",
        padding: "6px 12px",
        borderRadius: "999px",
        fontWeight: "600",
      }}
    >
      High
    </span>
  </div>

  <div>
    <p
      style={{
        color: "#64748b",
        marginBottom: "5px",
      }}
    >
      Event Title
    </p>

    <strong>Project Review Meeting</strong>
  </div>

  <div>
    <p
      style={{
        color: "#64748b",
        marginBottom: "5px",
      }}
    >
      Time
    </p>

    <strong>10:00 AM</strong>
  </div>

  <div>
    <p
      style={{
        color: "#64748b",
        marginBottom: "5px",
      }}
    >
      Date
    </p>

    <strong>20 June 2026</strong>
  </div>
</div>

    <button
      onClick={() => setSaved(true)}
      style={{
        marginTop: "20px",
        background: "#10b981",
        color: "white",
        border: "none",
        padding: "12px 24px",
        borderRadius: "12px",
        cursor: "pointer",
      }}
    >
      Confirm & Save
    </button>
  </div>
)}
{saved && (
  <div
    style={{
      marginTop: "20px",
      color: "#10b981",
      fontWeight: "bold",
    }}
  >
    Event saved successfully and added to calendar.
  </div>
)}
        
    </div>
  );
}

export default UploadPage;