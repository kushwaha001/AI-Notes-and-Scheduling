from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
import hashlib
import os
import logging
from api.config import UPLOAD_DIR, MAX_SIZE, MAX_BATCH, ALLOWED_DOCS
from api.db import get_db

router = APIRouter(tags=["Documents"])
log = logging.getLogger(__name__)

_MIME = {
    "pdf":  "application/pdf",
    "jpg":  "image/jpeg",
    "png":  "image/png",
    "tiff": "image/tiff",
}


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int):
    """FR-27 — open/download the original uploaded document (the record)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT filename, file_path, file_type FROM documents WHERE id = %s", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")
        if not os.path.exists(doc["file_path"]):
            raise HTTPException(410, "Original file is no longer on disk.")
        return FileResponse(
            doc["file_path"],
            media_type=_MIME.get(doc["file_type"], "application/octet-stream"),
            filename=doc["filename"],
        )
    finally:
        cur.close()
        conn.close()


@router.post("/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """FR-1 validate format/size, FR-3 duplicate check, NFR-6 queue, FR-8 extract."""

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
        # FR-1: batch limit — no more than MAX_BATCH files in one batch.
        # A "batch" = files uploaded within the last 60s (sequential uploads).
        # Using a rolling window (not a cumulative count) so it can't permanently
        # block uploads while files sit unprocessed in the queue.
        cur.execute("""
            SELECT COUNT(*) AS n FROM documents
            WHERE uploaded_at > NOW() - INTERVAL '60 seconds' AND deleted_at IS NULL
        """)
        if cur.fetchone()["n"] >= MAX_BATCH:
            raise HTTPException(
                400,
                f"Batch limit reached: up to {MAX_BATCH} files per batch. "
                f"Please wait a moment before uploading more."
            )

        # FR-3: hash-based duplicate check
        cur.execute("SELECT id, filename, file_path, deleted_at FROM documents WHERE file_hash = %s", (file_hash,))
        existing = cur.fetchone()
        if existing:
            if existing["deleted_at"] is None:
                # an active document already has this exact file
                raise HTTPException(409, f"Duplicate file: already uploaded as '{existing['filename']}' (doc id {existing['id']}).")

            # The match is in the trash — restore it instead of blocking (FR-19).
            with open(existing["file_path"], "wb") as f:
                f.write(contents)
            cur.execute("UPDATE documents SET status = 'queued', deleted_at = NULL WHERE id = %s", (existing["id"],))
            cur.execute("""
                UPDATE processing_queue SET status = 'waiting', processed_at = NULL
                WHERE document_id = %s RETURNING id
            """, (existing["id"],))
            row = cur.fetchone()
            if row:
                queue_id = row["id"]
            else:
                cur.execute("INSERT INTO processing_queue (document_id, status) VALUES (%s,'waiting') RETURNING id", (existing["id"],))
                queue_id = cur.fetchone()["id"]
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('restored', 'document', %s, 'Restored via re-upload')
            """, (existing["id"],))
            conn.commit()

            ai_on = False
            try:
                from api.ai.pipeline import ai_ready, process_document
                if ai_ready():
                    ai_on = True
                    background_tasks.add_task(process_document, existing["id"])
            except Exception:
                pass
            return {
                "status": "restored" if not ai_on else "processing",
                "job_id": queue_id, "doc_id": existing["id"], "filename": existing["filename"],
                "size_kb": len(contents) // 1024,
                "message": "This file was in the trash — it has been restored"
                           + (" and is being re-processed." if ai_on else "."),
                "extractions": [],
            }

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

        # FR-8/NFR-9 — kick off AI extraction in the background if available;
        # otherwise the doc stays queued and can be processed later (degraded mode).
        ai_on = False
        try:
            from api.ai.pipeline import ai_ready, process_document
            if ai_ready():
                ai_on = True
                background_tasks.add_task(process_document, doc_id)
        except Exception as e:
            log.warning("AI not available, leaving doc %s queued: %s", doc_id, e)

        return {
            "status"     : "processing" if ai_on else "queued",
            "job_id"     : queue_id,
            "doc_id"     : doc_id,
            "filename"   : file.filename,
            "size_kb"    : len(contents) // 1024,
            "message"    : ("AI extraction started — refresh to see results."
                            if ai_on else
                            "File accepted and queued. AI is offline; it will be processed when available."),
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


@router.post("/documents/{doc_id}/reextract")
def reextract_document(doc_id: int, background_tasks: BackgroundTasks):
    """FR-14a — re-run extraction on a stored document. Previous extractions are
    kept (versioned by status), the new one goes through the confirm screen."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id FROM documents WHERE id = %s AND deleted_at IS NULL", (doc_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Document not found.")
        # keep prior pending extractions as history (mark superseded)
        cur.execute("""
            UPDATE extractions SET status = 'dismissed'
            WHERE source_type = 'document' AND source_id = %s AND status = 'pending'
        """, (doc_id,))
        cur.execute("UPDATE documents SET status = 'queued' WHERE id = %s", (doc_id,))
        cur.execute("""
            UPDATE processing_queue
            SET status = 'waiting', processed_at = NULL, retry_count = retry_count + 1
            WHERE document_id = %s
        """, (doc_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('extracted', 'document', %s, 'Re-extraction requested')
        """, (doc_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    ai_on = False
    try:
        from api.ai.pipeline import ai_ready, process_document
        if ai_ready():
            ai_on = True
            background_tasks.add_task(process_document, doc_id)
    except Exception as e:
        log.warning("Re-extract: AI unavailable for doc %s: %s", doc_id, e)

    return {"status": "reprocessing" if ai_on else "queued", "doc_id": doc_id}


@router.get("/documents/{doc_id}")
def get_document(doc_id: int):
    """FR-27 — document detail + linked events/tasks + ref-number related docs."""
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

        # FR-24 — documents that share the same reference number (deterministic)
        related_docs = []
        if doc.get("ref_number"):
            cur.execute("""
                SELECT id, filename, uploaded_at FROM documents
                WHERE ref_number = %s AND id <> %s AND deleted_at IS NULL
                ORDER BY uploaded_at DESC
            """, (doc["ref_number"], doc_id))
            related_docs = cur.fetchall()

        return {
            "document": doc,
            "linked_events": linked_events,
            "linked_tasks": linked_tasks,
            "related_documents": related_docs,
        }
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
