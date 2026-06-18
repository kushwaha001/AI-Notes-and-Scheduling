import { useState } from "react";
import { uploadFile } from "../services/api";

function UploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("");

  async function handleUpload() {
    if (!selectedFile) {
      setStatus("Please select a file");
      return;
    }

    try {
      const result = await uploadFile(selectedFile);

      if (result.status === "success") {
        setStatus("Upload successful");
      } else if (result.status === "duplicate") {
        setStatus("Duplicate file");
      } else {
        setStatus("Upload failed");
      }
    } catch (error) {
      setStatus("Upload failed");
    }
  }

  return (
    <div>
      <h1>Upload Page</h1>

      <input
        type="file"
        onChange={(e) => setSelectedFile(e.target.files[0])}
      />

      <button onClick={handleUpload}>
        Upload
      </button>

      <p>{status}</p>
    </div>
  );
}

export default UploadPage;