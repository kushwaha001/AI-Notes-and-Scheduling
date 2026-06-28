from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from typing import Optional
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Queue"])


@router.post("/queue/process")
def process_queue(background_tasks: BackgroundTasks,
                  user: CurrentUser = Depends(current_user)):
    """FR-8/NFR-9 — process any waiting documents now (e.g. once AI is back up)."""
    from api.ai.pipeline import ai_ready, process_waiting
    if not ai_ready():
        raise HTTPException(503, "AI is not available (Ollama or Docling offline).")
    background_tasks.add_task(process_waiting, 20)
    return {"status": "processing", "message": "Processing queued documents in the background."}


@router.get("/queue")
def list_queue(status: Optional[str] = None,
               user: CurrentUser = Depends(current_user)):
    """NFR-6 — all jobs in processing queue with status."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        query = """
            SELECT pq.id, pq.status, pq.retry_count, pq.queued_at, pq.processed_at,
                   d.filename, d.file_type
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            WHERE  d.users_id = %s
        """
        params = [user["id"]]
        if status:
            query += " AND pq.status = %s"
            params.append(status)
        query += " ORDER BY pq.queued_at DESC"
        cur.execute(query, params)
        return {"jobs": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/queue/{job_id}")
def get_queue_job(job_id: int, user: CurrentUser = Depends(current_user)):
    """NFR-2 — status of one specific job."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT pq.*, d.filename
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            WHERE  pq.id = %s AND d.users_id = %s
        """, (job_id, user["id"]))
        job = cur.fetchone()
        if not job:
            raise HTTPException(404, "Job not found.")
        return {"job": job}
    finally:
        cur.close()
        conn.close()


@router.post("/queue/{job_id}/retry")
def retry_queue_job(job_id: int, user: CurrentUser = Depends(current_user)):
    """NFR-2 — manually retry a failed job."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE processing_queue
            SET    status = 'waiting',
                   retry_count = retry_count + 1,
                   processed_at = NULL
            WHERE  id = %s AND status IN ('failed', 'cancelled')
              AND  document_id IN (SELECT id FROM documents WHERE users_id = %s)
            RETURNING id, retry_count
        """, (job_id, user["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(400, "Job is not in a retryable state (must be failed or cancelled).")
        conn.commit()
        return {"status": "retrying", "job_id": job_id, "retry_count": row["retry_count"]}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/queue/{job_id}")
def cancel_queue_job(job_id: int, user: CurrentUser = Depends(current_user)):
    """NFR-6 — cancel a waiting job."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE processing_queue
            SET status = 'cancelled'
            WHERE id = %s AND status = 'waiting'
              AND document_id IN (SELECT id FROM documents WHERE users_id = %s)
            RETURNING id
        """, (job_id, user["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(400, "Job is not cancellable (must be in waiting state).")
        conn.commit()
        return {"status": "cancelled", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
