from fastapi import APIRouter, UploadFile, File, HTTPException
import hashlib
import os
from api.config import UPLOAD_DIR, MAX_SIZE, ALLOWED_DOCS
from api.db import get_db

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
    file_type = file.content_type.split("/")[-1]
    if file_type == "jpeg":
        file_type = "jpg"

    conn = get_db()
    cur  = conn.cursor()
    dest = os.path.join(UPLOAD_DIR, file.filename)

    try:
        # FR-3: hash-based duplicate check
        cur.execute("SELECT id, filename FROM documents WHERE file_hash = %s", (file_hash,))
        existing = cur.fetchone()
        if existing:
            raise HTTPException(409, f"Duplicate file: already uploaded as '{existing['filename']}' (doc id {existing['id']}).")

        with open(dest, "wb") as f:
            f.write(contents)

        cur.execute("""
            INSERT INTO documents
                (users_id, filename, file_hash, file_path, file_type, status)
            VALUES (1, %s, %s, %s, %s, 'queued')
            RETURNING id
        """, (file.filename, file_hash, dest, file_type))
        doc_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO processing_queue (document_id, status)
            VALUES (%s, 'waiting')
            RETURNING id
        """, (doc_id,))
        queue_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('uploaded', 'document', %s, %s)
        """, (doc_id, file.filename))

        conn.commit()

        return {
            "status"     : "queued",
            "job_id"     : queue_id,
            "doc_id"     : doc_id,
            "filename"   : file.filename,
            "size_kb"    : len(contents) // 1024,
            "message"    : "File accepted. AI extraction will begin shortly.",
            "extractions": []
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        if os.path.exists(dest):
            os.remove(dest)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/documents")
def list_documents():
    """FR-2 — list all uploaded documents with status."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT d.id, d.filename, d.file_type, d.status, d.uploaded_at,
                   pq.status AS queue_status, pq.retry_count
            FROM   documents d
            LEFT JOIN processing_queue pq ON pq.document_id = d.id
            WHERE  d.deleted_at IS NULL
            ORDER BY d.uploaded_at DESC
        """)
        return {"documents": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/documents/{doc_id}")
def get_document(doc_id: int):
    """FR-27 — document detail + linked events and tasks."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT * FROM documents WHERE id = %s AND deleted_at IS NULL", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")

        cur.execute("""
            SELECT e.id, e.title, e.event_date, e.event_time, e.status
            FROM   events e
            JOIN   linked_documents ld
                   ON ld.entity_type = 'event' AND ld.entity_id = e.id
            WHERE  ld.source_type = 'document' AND ld.source_id = %s
        """, (doc_id,))
        linked_events = cur.fetchall()

        cur.execute("""
            SELECT t.id, t.title, t.due_date, t.status
            FROM   tasks t
            JOIN   linked_documents ld
                   ON ld.entity_type = 'task' AND ld.entity_id = t.id
            WHERE  ld.source_type = 'document' AND ld.source_id = %s
        """, (doc_id,))
        linked_tasks = cur.fetchall()

        return {"document": doc, "linked_events": linked_events, "linked_tasks": linked_tasks}
    finally:
        cur.close()
        conn.close()


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int):
    """Soft delete — file stays on disk per FR-27."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE documents
            SET status = 'trashed', deleted_at = NOW()
            WHERE id = %s AND deleted_at IS NULL
        """, (doc_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'document', %s, 'Soft deleted by user')
        """, (doc_id,))
        conn.commit()
        return {"status": "deleted", "doc_id": doc_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
