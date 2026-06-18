from fastapi import APIRouter, UploadFile, File, HTTPException
import hashlib
import os
from api.config import UPLOAD_DIR, MAX_SIZE, ALLOWED_DOCS

router = APIRouter(tags=["Documents"])


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """FR-1 validate format/size, FR-3 duplicate check, NFR-6 queue."""
    if file.content_type not in ALLOWED_DOCS:
        raise HTTPException(400, f"File type '{file.content_type}' not allowed. Use PDF, JPG, PNG or TIFF.")

    contents = await file.read()

    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "File exceeds 50 MB limit.")

    file_hash = hashlib.sha256(contents).hexdigest()

    # TODO Day 2: check file_hash against documents table (DB duplicate check)
    dest = os.path.join(UPLOAD_DIR, file.filename)
    if os.path.exists(dest):
        raise HTTPException(409, f"Duplicate file detected: '{file.filename}'.")

    with open(dest, "wb") as f:
        f.write(contents)

    # TODO Day 2: INSERT INTO documents (filename, file_hash, file_path, file_type, status)
    # TODO Day 2: INSERT INTO processing_queue (document_id, job_id)
    # TODO Day 3: FR-4 readability check (resolution + VLM test)
    # TODO Day 3: trigger AI extraction → populate extractions[]

    return {
        "status"     : "queued",
        "job_id"     : file_hash[:12],
        "filename"   : file.filename,
        "size_kb"    : len(contents) // 1024,
        "message"    : "File accepted. AI extraction will begin shortly.",
        "extractions": []
    }


@router.get("/documents")
def list_documents():
    """FR-2 — list all uploaded documents with status."""
    # TODO Day 2: SELECT * FROM documents ORDER BY uploaded_at DESC
    return {"documents": []}


@router.get("/documents/{doc_id}")
def get_document(doc_id: int):
    """FR-27 — document detail + linked events and tasks."""
    # TODO Day 4: SELECT doc + JOIN event_documents + JOIN events/tasks
    return {"document": None, "linked_events": [], "linked_tasks": []}


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int):
    """Soft delete — file stays on disk per FR-27."""
    # TODO Day 4: UPDATE documents SET status='deleted' WHERE id = doc_id
    # TODO Day 4: write audit_log action='deleted'
    return {"status": "deleted", "doc_id": doc_id}
