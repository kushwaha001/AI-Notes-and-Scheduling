import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { uploadVoice, voiceExtract, createEvent, createTask } from "../services/api";
import DateInput, { toApiDate } from "../components/DateInput";

export default function VoicePage() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy]           = useState("");
  const [transcript, setTranscript] = useState("");
  const [fields, setFields]       = useState(null);
  const [msg, setMsg]             = useState("");
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendAudio(new File([blob], "voice.webm", { type: "audio/webm" }));
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
      setMsg("");
    } catch (e) {
      setMsg("Microphone access denied or unavailable. You can upload an audio file instead.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function sendAudio(file) {
    setBusy("transcribing"); setTranscript(""); setFields(null); setMsg("");
    try {
      const r = await uploadVoice(file);
      setTranscript(r.transcript || "");
      if (!r.transcript) setMsg(r.message || "No speech detected.");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleExtract() {
    setBusy("extracting"); setMsg("");
    try {
      const f = await voiceExtract(transcript);
      setFields(f);
      if (!f.subject && !f.event_date) setMsg("No schedulable item found — you can save it as a note instead.");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  async function handleSave() {
    setBusy("saving"); setMsg("");
    try {
      if (fields.item_type === "task") {
        await createTask({ title: fields.subject || transcript.slice(0, 60), due_date: toApiDate(fields.deadline || fields.reply_by || ""), category: "General" });
        setMsg("Saved as a task.");
      } else {
        await createEvent({
          title: fields.subject || transcript.slice(0, 60),
          event_date: toApiDate(fields.event_date), event_time: fields.event_time,
          venue: fields.venue, attendees: fields.attendees, classification: "General",
        });
        setMsg("Saved as an event on the calendar.");
      }
      setFields(null); setTranscript("");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div style={{ marginBottom: "24px" }}>
        <p style={{ color: "#60a5fa", letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", marginBottom: "8px" }}>
          Voice note (FR-6)
        </p>
        <h1 style={{ margin: 0, fontSize: "42px" }}>Voice Capture</h1>
        <p style={{ color: "#64748b", marginTop: "10px" }}>
          Record or upload a voice note. It's transcribed locally (Whisper), you edit the
          text, then turn it into an event or task.
        </p>
      </div>

      {/* Record / upload */}
      <div style={{ background: "white", borderRadius: "20px", padding: "26px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", marginBottom: "20px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
        {!recording ? (
          <button onClick={startRecording} disabled={!!busy}
            style={{ background: "#ef4444", color: "white", border: "none", padding: "14px 26px", borderRadius: "14px", cursor: "pointer", fontWeight: 700, fontSize: "15px" }}>
            ● Record
          </button>
        ) : (
          <button onClick={stopRecording}
            style={{ background: "#0f172a", color: "white", border: "none", padding: "14px 26px", borderRadius: "14px", cursor: "pointer", fontWeight: 700, fontSize: "15px" }}>
            ■ Stop &amp; transcribe
          </button>
        )}
        <span style={{ color: "#94a3b8" }}>or</span>
        <label style={{ background: "#f1f5f9", color: "#475569", padding: "12px 20px", borderRadius: "12px", cursor: "pointer", fontWeight: 600 }}>
          Upload audio file
          <input type="file" accept=".wav,.mp3,.m4a,.ogg,.webm" style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && sendAudio(e.target.files[0])} />
        </label>
        {busy && <span style={{ color: "#2563eb", fontWeight: 600 }}>{busy}…</span>}
        {recording && <span style={{ color: "#ef4444", fontWeight: 600 }}>● recording</span>}
      </div>

      {msg && <p style={{ color: msg.startsWith("Error") ? "#ef4444" : "#64748b", marginBottom: "16px" }}>{msg}</p>}

      {/* Transcript */}
      {(transcript || busy === "transcribing") && (
        <div style={{ background: "white", borderRadius: "20px", padding: "22px", boxShadow: "0 10px 30px rgba(0,0,0,0.06)", marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0 }}>Transcript (editable)</h3>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcription will appear here…"
            style={{ width: "100%", minHeight: "120px", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "15px", lineHeight: 1.6, boxSizing: "border-box", resize: "vertical" }} />
          <button onClick={handleExtract} disabled={!transcript || !!busy}
            style={{ marginTop: "12px", background: "#2563eb", color: "white", border: "none", padding: "10px 22px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
            {busy === "extracting" ? "Extracting…" : "Extract event / task"}
          </button>
        </div>
      )}

      {/* Extracted fields */}
      {fields && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: "white", borderRadius: "20px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {["event", "task"].map((t) => (
              <button key={t} onClick={() => setFields((f) => ({ ...f, item_type: t }))}
                style={{ padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600,
                  background: fields.item_type === t ? "#2563eb" : "#f1f5f9", color: fields.item_type === t ? "white" : "#475569" }}>
                {t === "event" ? "📅 Event" : "📋 Task"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: "12px", color: "#64748b" }}>Title</label>
              <input value={fields.subject} onChange={(e) => setFields((f) => ({ ...f, subject: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} />
            </div>
            {fields.item_type === "event" ? (
              <>
                <div><label style={{ fontSize: "12px", color: "#64748b" }}>Date</label>
                  <DateInput value={fields.event_date} onChange={(v) => setFields((f) => ({ ...f, event_date: v }))} /></div>
                <div><label style={{ fontSize: "12px", color: "#64748b" }}>Time</label>
                  <input type="time" value={fields.event_time} onChange={(e) => setFields((f) => ({ ...f, event_time: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} /></div>
                <div><label style={{ fontSize: "12px", color: "#64748b" }}>Venue</label>
                  <input value={fields.venue} onChange={(e) => setFields((f) => ({ ...f, venue: e.target.value }))}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px", boxSizing: "border-box" }} /></div>
              </>
            ) : (
              <div><label style={{ fontSize: "12px", color: "#64748b" }}>Due date</label>
                <DateInput value={fields.deadline || fields.reply_by} onChange={(v) => setFields((f) => ({ ...f, deadline: v }))} /></div>
            )}
          </div>

          <button onClick={handleSave} disabled={!!busy}
            style={{ marginTop: "18px", background: "#10b981", color: "white", border: "none", padding: "11px 24px", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
            {busy === "saving" ? "Saving…" : `Save ${fields.item_type}`}
          </button>
        </motion.div>
      )}
    </>
  );
}
