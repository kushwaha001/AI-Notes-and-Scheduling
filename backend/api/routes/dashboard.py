from fastapi import APIRouter, Depends
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Dashboard"])


@router.get("/pending-replies")
def pending_replies(user: CurrentUser = Depends(current_user)):
    """FR-23 — reply tasks due within 2 days."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM tasks
            WHERE is_reply_task = TRUE
              AND status = 'open'
              AND deleted_at IS NULL
              AND users_id = %s
              AND (due_date IS NULL OR due_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '2 days')
            ORDER BY due_date NULLS LAST
        """, (user["id"],))
        return {"pending_replies": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/dashboard")
def dashboard_summary(user: CurrentUser = Depends(current_user)):
    """FR-33, FR-34 — aggregated dashboard data."""
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    try:
        cur.execute("""
            SELECT * FROM events
            WHERE event_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date AND status != 'trashed' AND users_id = %s
            ORDER BY event_time NULLS LAST
        """, (uid,))
        today_events = cur.fetchall()

        cur.execute("""
            SELECT * FROM tasks
            WHERE status = 'open' AND deleted_at IS NULL AND users_id = %s
            ORDER BY due_date NULLS LAST
            LIMIT 10
        """, (uid,))
        open_tasks = cur.fetchall()

        cur.execute("""
            SELECT * FROM tasks
            WHERE is_reply_task = TRUE AND status = 'open' AND deleted_at IS NULL
              AND users_id = %s
              AND (due_date IS NULL OR due_date <= (NOW() AT TIME ZONE 'Asia/Kolkata')::date + INTERVAL '2 days')
            ORDER BY due_date NULLS LAST
        """, (uid,))
        pending_replies = cur.fetchall()

        cur.execute("""
            SELECT pq.id AS job_id, d.filename, d.uploaded_at,
                   COUNT(e.id) AS extraction_count
            FROM processing_queue pq
            JOIN documents d ON d.id = pq.document_id
            LEFT JOIN extractions e
                ON e.source_type = 'document'
               AND e.source_id   = d.id
               AND e.status      = 'pending'
            WHERE pq.status = 'awaiting_confirm' AND d.users_id = %s
            GROUP BY pq.id, d.filename, d.uploaded_at
            ORDER BY d.uploaded_at DESC
        """, (uid,))
        pending_confirmations = cur.fetchall()

        return {
            "today_events"         : today_events,
            "open_tasks"           : open_tasks,
            "pending_replies"      : pending_replies,
            "pending_confirmations": pending_confirmations,
        }
    finally:
        cur.close()
        conn.close()
