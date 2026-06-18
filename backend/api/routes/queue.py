from fastapi import APIRouter

router = APIRouter(tags=["Queue"])


@router.get("/queue")
def list_queue():
    """NFR-6 — all jobs in processing queue with status."""
    # TODO Day 3: SELECT * FROM processing_queue ORDER BY queued_at DESC
    return {"jobs": []}


@router.get("/queue/{job_id}")
def get_queue_job(job_id: str):
    """NFR-2 — status of one specific job."""
    # TODO Day 3: SELECT * FROM processing_queue WHERE job_id = %s
    return {"job": None}


@router.post("/queue/{job_id}/retry")
def retry_queue_job(job_id: str):
    """NFR-2 — manually retry a failed job."""
    # TODO Day 3: UPDATE processing_queue SET status='waiting', retry_count = retry_count + 1
    return {"status": "retrying", "job_id": job_id}


@router.delete("/queue/{job_id}")
def cancel_queue_job(job_id: str):
    """NFR-6 — cancel a waiting job."""
    # TODO Day 3: UPDATE processing_queue SET status='cancelled'
    return {"status": "cancelled", "job_id": job_id}
