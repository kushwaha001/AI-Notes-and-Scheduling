"""
FR-6 / FR-12 / FR-13 — Voice capture → local transcription → extraction.

Upload an audio note → faster-whisper transcribes it locally → the editable
transcript is returned. The (edited) transcript can then be sent for field
extraction, reusing the same local model as documents.
"""

import os
import logging

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel

from api.config import AUDIO_DIR, ALLOWED_AUDIO
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Voice"])
log = logging.getLogger(__name__)


class TranscriptPayload(BaseModel):
    transcript: str


@router.post("/upload/voice")
async def upload_voice(file: UploadFile = File(...),
                       user: CurrentUser = Depends(current_user)):
    """FR-6 — accept audio, transcribe locally (Whisper), keep the audio file."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_AUDIO:
        raise HTTPException(400, f"Audio format '{ext}' not supported. Use WAV, MP3, M4A, OGG or WEBM.")

    contents = await file.read()
    # Namespace by owner so identical filenames from different users don't clash.
    dest = os.path.join(AUDIO_DIR, f"u{user['id']}_{file.filename}")
    with open(dest, "wb") as f:
        f.write(contents)

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO audio (users_id, file_path, status) VALUES (%s, %s, 'transcribing') RETURNING id",
            (user["id"], dest))
        audio_id = cur.fetchone()["id"]
        conn.commit()
    finally:
        cur.close()
        conn.close()

    transcript, duration = "", None
    try:
        from api.ai.transcribe import whisper_available, transcribe
        if whisper_available():
            transcript, duration = transcribe(dest)
            conn = get_db(); cur = conn.cursor()
            cur.execute("UPDATE audio SET transcript = %s, duration = %s, status = 'ready' WHERE id = %s",
                        (transcript, duration, audio_id))
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('uploaded', 'audio', %s, 'Voice note transcribed')
            """, (audio_id,))
            conn.commit(); cur.close(); conn.close()
    except Exception as e:
        log.error("Transcription failed for audio %s: %s", audio_id, e)

    return {
        "audio_id": audio_id,
        "transcript": transcript,
        "duration": duration,
        "filename": file.filename,
        "message": "Transcribed — edit if needed, then extract."
                   if transcript else
                   "Audio saved. Transcription unavailable (Whisper offline).",
    }


@router.post("/voice/extract")
def extract_from_transcript(body: TranscriptPayload,
                            user: CurrentUser = Depends(current_user)):
    """FR-12/13 — extract a task/event from the edited transcript (relative dates
    like 'tomorrow' are resolved). If nothing schedulable, it just comes back empty."""
    from api.ai.extractor import extract_fields
    from api.ai.llm import llm_available
    if not llm_available():
        raise HTTPException(503, "AI model not available (LLM server offline).")

    fields = extract_fields(body.transcript)

    def iso(v):
        return v.isoformat() if hasattr(v, "isoformat") else (v or "")

    return {
        "item_type":  fields["item_type"],
        "subject":    fields["subject"] or "",
        "event_date": iso(fields["event_date"]),
        "event_time": fields["event_time"] or "",
        "event_end_time": fields.get("event_end_time") and (str(fields["event_end_time"])[:5]) or "",
        "venue":      fields["venue"] or "",
        "attendees":  fields["attendees"] or "",
        "deadline":   iso(fields["deadline"]),
        "reply_by":   iso(fields["reply_by"]),
        "field_confidence": fields["field_confidence"],
    }


@router.get("/audio")
def list_audio(user: CurrentUser = Depends(current_user)):
    """List the caller's saved voice notes so a recording can be replayed even if
    transcription failed at the time (FR-6 — audio is always kept)."""
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(
            "SELECT id, duration, transcript, status, recorded_at FROM audio "
            "WHERE users_id = %s AND status != 'trashed' ORDER BY recorded_at DESC LIMIT 50",
            (user["id"],))
        return {"audio": cur.fetchall()}
    finally:
        cur.close(); conn.close()


@router.get("/audio/{audio_id}/download")
def download_audio(audio_id: int, user: CurrentUser = Depends(current_user)):
    """Stream a saved audio file back (playback / re-check)."""
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("SELECT file_path FROM audio WHERE id = %s AND users_id = %s",
                    (audio_id, user["id"]))
        row = cur.fetchone()
    finally:
        cur.close(); conn.close()
    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(404, "Audio not found.")
    return FileResponse(row["file_path"])
