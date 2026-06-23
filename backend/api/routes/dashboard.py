from fastapi import APIRouter
from api.db import get_db

router = APIRouter(tags=["Dashboard"])


@router.get("/pending-replies")
def pending_replies():
    """FR-23 — reply tasks due within 2 days."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM tasks
            WHERE is_reply_task = TRUE
              AND status = 'open'
              AND deleted_at IS NULL
              AND (due_date IS NULL OR due_date <= CURRENT_DATE + INTERVAL '2 days')
            ORDER BY due_date NULLS LAST
        """)
        return {"pending_replies": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/dashboard")
def dashboard_summary():
    """FR-33, FR-34 — aggregated dashboard data."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM events
            WHERE event_date = CURRENT_DATE AND status != 'trashed'
            ORDER BY event_time NULLS LAST
        """)
        today_events = cur.fetchall()

        cur.execute("""
            SELECT * FROM tasks
            WHERE status = 'open' AND deleted_at IS NULL
            ORDER BY due_date NULLS LAST
            LIMIT 10
        """)
        open_tasks = cur.fetchall()

        cur.execute("""
            SELECT * FROM tasks
            WHERE is_reply_task = TRUE AND status = 'open' AND deleted_at IS NULL
              AND (due_date IS NULL OR due_date <= CURRENT_DATE + INTERVAL '2 days')
            ORDER BY due_date NULLS LAST
        """)
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
            WHERE pq.status = 'awaiting_confirm'
            GROUP BY pq.id, d.filename, d.uploaded_at
            ORDER BY d.uploaded_at DESC
        """)
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
