from fastapi import APIRouter, HTTPException
from typing import Optional
from api.db import get_db

router = APIRouter(tags=["Queue"])


@router.get("/queue")
def list_queue(status: Optional[str] = None):
    """NFR-6 — all jobs in processing queue with status."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        query = """
            SELECT pq.id, pq.status, pq.retry_count, pq.queued_at, pq.processed_at,
                   d.filename, d.file_type
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
        """
        params = []
        if status:
            query += " WHERE pq.status = %s"
            params.append(status)
        query += " ORDER BY pq.queued_at DESC"
        cur.execute(query, params)
        return {"jobs": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/queue/{job_id}")
def get_queue_job(job_id: int):
    """NFR-2 — status of one specific job."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT pq.*, d.filename
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            WHERE  pq.id = %s
        """, (job_id,))
        job = cur.fetchone()
        if not job:
            raise HTTPException(404, "Job not found.")
        return {"job": job}
    finally:
        cur.close()
        conn.close()


@router.post("/queue/{job_id}/retry")
def retry_queue_job(job_id: int):
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
            RETURNING id, retry_count
        """, (job_id,))
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
def cancel_queue_job(job_id: int):
    """NFR-6 — cancel a waiting job."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE processing_queue
            SET status = 'cancelled'
            WHERE id = %s AND status = 'waiting'
            RETURNING id
        """, (job_id,))
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
