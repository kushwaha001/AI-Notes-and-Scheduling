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
      background: "#172554",
      padding: "20px",
      borderRadius: "12px",
    }}
  >
    AI is analyzing the document...
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
    <h2>Extraction Results</h2>

    <p><strong>Reference No:</strong> REF-2026-001</p>
    <p><strong>Title:</strong> Project Review Meeting</p>
    <p><strong>Date:</strong> 20 June 2026</p>
    <p><strong>Time:</strong> 10:00 AM</p>
    <p><strong>Priority:</strong> High</p>

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