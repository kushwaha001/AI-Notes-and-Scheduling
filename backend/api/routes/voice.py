from fastapi import APIRouter, UploadFile, File, HTTPException
import hashlib
import os
from api.config import AUDIO_DIR, ALLOWED_AUDIO

router = APIRouter(tags=["Voice"])


@router.post("/upload/voice")
async def upload_voice(file: UploadFile = File(...)):
    """FR-6 — accept audio, validate format, queue for Whisper STT."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_AUDIO:
        raise HTTPException(400, f"Audio format '{ext}' not supported. Use WAV, MP3, M4A or OGG.")

    contents = await file.read()
    dest = os.path.join(AUDIO_DIR, file.filename)

    with open(dest, "wb") as f:
        f.write(contents)

    # TODO Day 5: check audio duration <= MAX_AUDIO (5 min)
    # TODO Day 5: call Whisper STT locally (NFR-3: never leaves network)
    # TODO Day 5: INSERT INTO tasks (audio_file, transcript, source='voice')

    return {
        "status"    : "transcribing",
        "job_id"    : hashlib.md5(file.filename.encode()).hexdigest()[:10],
        "filename"  : file.filename,
        "transcript": "",
        "audio_path": dest,
        "message"   : "Audio received. Transcription in progress."
    }


@router.post("/upload/voice/{job_id}/extract")
def extract_from_transcript(job_id: str, transcript: dict):
    """FR-12 — after human edits transcript, trigger LLM task extraction."""
    # TODO Day 5: send transcript text to vLLM
    # TODO Day 5: resolve relative dates ('tomorrow', 'next Friday') → actual date
    # TODO Day 5: return extractions[] same shape as /upload
    return {"job_id": job_id, "extractions": []}
