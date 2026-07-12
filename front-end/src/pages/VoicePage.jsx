import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { uploadVoice, createNote, summarizeNote, listAudio, audioDownloadUrl } from "../services/api";
import { useToast } from "../components/ToastProvider";

// Voice is a note-taking tool: record/upload → local Whisper transcript →
// save as a Note (which then gets an AI summary + tags, air-gapped).
export default function VoicePage() {
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [savedNoteId, setSavedNoteId] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const [recordings, setRecordings] = useState([]);
  const loadRecordings = useCallback(() => { listAudio().then(setRecordings).catch(() => {}); }, []);
  useEffect(() => { loadRecordings(); }, [loadRecordings]);

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
    } catch {
      toast.error("Microphone unavailable. You can upload an audio file instead.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function sendAudio(file) {
    setBusy("transcribing"); setTranscript(""); setSavedNoteId(null);
    try {
      const r = await uploadVoice(file);
      setTranscript(r.transcript || "");
      // Seed a title from the first few words of the transcript.
      if (r.transcript) setTitle(r.transcript.trim().split(/\s+/).slice(0, 6).join(" "));
      else toast.info(r.message || "No speech detected.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
      loadRecordings();   // show the newly-saved audio (even if transcription failed)
    }
  }

  async function saveAsNote() {
    if (!transcript.trim()) return;
    setBusy("saving");
    try {
      const res = await createNote({
        title: title.trim() || "Voice note",
        content: transcript,
        classification: "General",
      });
      // Fire-and-forget AI summary + tags (won't block; safe if LLM offline).
      summarizeNote(res.note_id).catch(() => {});
      setSavedNoteId(res.note_id);
      toast.success("Saved as a note.");
      setTranscript(""); setTitle("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }

  const card = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: "var(--radius)", boxShadow: "var(--shadow)",
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ color: "var(--muted)", fontSize: 15.5, margin: "0 0 20px" }}>
        Record or upload a voice note. It's transcribed locally (Whisper), you edit the text,
        then save it as a note — with an automatic AI summary and tags.
      </p>

      {/* Record / upload */}
      <div style={{ ...card, padding: 24, marginBottom: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {!recording ? (
          <button onClick={startRecording} disabled={!!busy}
            style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "14px 26px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 700, fontSize: 15.5 }}>
            ● Record
          </button>
        ) : (
          <button onClick={stopRecording}
            style={{ background: "var(--danger)", color: "#fff", border: "none", padding: "14px 26px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 700, fontSize: 15.5 }}>
            ■ Stop &amp; transcribe
          </button>
        )}
        <span style={{ color: "var(--muted)" }}>or</span>
        <label style={{ background: "var(--surface-2)", color: "var(--text-2)", padding: "12px 20px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600 }}>
          Upload audio file
          <input type="file" accept=".wav,.mp3,.m4a,.ogg,.webm" style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && sendAudio(e.target.files[0])} />
        </label>
        {busy && <span style={{ color: "var(--accent)", fontWeight: 600 }}>{busy}…</span>}
        {recording && <span style={{ color: "var(--danger)", fontWeight: 600 }}>● recording</span>}
      </div>

      {savedNoteId && (
        <div style={{ ...card, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--ok)", fontWeight: 600 }}>✓ Saved as a note.</span>
          <Link to="/notes" style={{ marginLeft: "auto", color: "var(--accent)", fontWeight: 700, textDecoration: "none" }}>
            Open in Notes →
          </Link>
        </div>
      )}

      {/* Transcript → note */}
      {(transcript || busy === "transcribing") && (
        <div style={{ ...card, padding: 22 }}>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>Transcript</h3>
          <label style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Note title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            style={{ width: "100%", margin: "6px 0 14px", padding: "11px 13px", borderRadius: 9, border: "1px solid var(--border-2)", fontSize: 16, background: "var(--bg)", color: "var(--text)", boxSizing: "border-box" }}
          />
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcription will appear here…"
            style={{ width: "100%", minHeight: 160, padding: 14, borderRadius: 10, border: "1px solid var(--border)", fontSize: 15.5, lineHeight: 1.6, boxSizing: "border-box", resize: "vertical", background: "var(--bg)", color: "var(--text)" }}
          />
          <button onClick={saveAsNote} disabled={!transcript.trim() || !!busy}
            style={{ marginTop: 12, background: "var(--accent)", color: "#fff", border: "none", padding: "11px 24px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
            {busy === "saving" ? "Saving…" : "Save as note"}
          </button>
        </div>
      )}

      {/* Saved recordings — audio is always kept, so a note can be replayed / re-checked
          even if transcription failed at the time. */}
      {recordings.length > 0 && (
        <div style={{ ...card, padding: 22, marginTop: 20 }}>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>
            Your recordings <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 13 }}>· audio is kept even if transcription failed</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recordings.map((a) => {
              const ok = a.transcript && a.transcript.trim();
              return (
                <div key={a.id} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: "var(--muted)" }}>#{a.id} · {new Date(a.recorded_at).toLocaleString("en-GB")}</span>
                    {ok
                      ? <span style={{ background: "var(--ok-soft)", color: "var(--ok)", fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99 }}>transcribed</span>
                      : <span style={{ background: "var(--warn-soft)", color: "var(--warn)", fontSize: 11.5, fontWeight: 700, padding: "2px 9px", borderRadius: 99 }}>no transcript</span>}
                    <a href={audioDownloadUrl(a.id)} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>⬇ download</a>
                  </div>
                  <audio controls preload="none" src={audioDownloadUrl(a.id)} style={{ width: "100%", height: 36 }} />
                  {ok && <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-2)", lineHeight: 1.5 }}>{a.transcript.length > 200 ? a.transcript.slice(0, 200) + "…" : a.transcript}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
