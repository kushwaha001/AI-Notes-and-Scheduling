import logging
from fastapi import APIRouter, HTTPException
from api.models import ConfirmItem, DismissItem
from api.db import get_db

router = APIRouter(tags=["Confirm"])
log = logging.getLogger(__name__)


@router.post("/confirmations/confirm")
def confirm_item(item: ConfirmItem):
    """FR-14 — human approves one extracted item (event or task)."""
    conn = get_db()
    cur  = conn.cursor()

    try:
        if item.item_type == "event":
            cur.execute("""
                INSERT INTO events
                    (users_id, title, event_date, event_time, venue, attendees,
                     classification, source, status)
                VALUES (1, %s, %s, %s, %s, %s, %s, 'ai', 'upcoming')
                RETURNING id
            """, (
                item.title,
                item.event_date or None,
                item.event_time or None,
                item.venue      or None,
                item.attendees  or None,
                item.category or item.priority or None,
            ))
            event_id = cur.fetchone()["id"]

            # FR-17/FR-37 — persist the chosen reminder offsets for this event
            from api.routes.reminders import insert_reminders
            insert_reminders(cur, event_id, item.reminders)

            cur.execute("""
                INSERT INTO linked_documents
                    (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                SELECT 'document', document_id, 'event', %s, 'source', TRUE
                FROM   processing_queue
                WHERE  id = %s
                LIMIT  1
            """, (event_id, item.job_id))

            # FR-23 — a reply-by date becomes a reply task (shows in pending-replies)
            if item.reply_by:
                cur.execute("""
                    INSERT INTO tasks
                        (users_id, title, due_date, is_reply_task, classification, source, status)
                    VALUES (1, %s, %s, TRUE, 'Reply', 'ai', 'open')
                    RETURNING id
                """, (f"Reply: {item.title}", item.reply_by))
                reply_id = cur.fetchone()["id"]
                cur.execute("""
                    INSERT INTO linked_documents
                        (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                    SELECT 'document', document_id, 'task', %s, 'source', TRUE
                    FROM processing_queue WHERE id = %s LIMIT 1
                """, (reply_id, item.job_id))
                cur.execute("""
                    INSERT INTO audit_log (action, entity_type, entity_id, detail)
                    VALUES ('manual_entry', 'task', %s, %s)
                """, (reply_id, f"Reply task for: {item.title}"))

            entity_type = "event"
            entity_id   = event_id

        else:
            cur.execute("""
                INSERT INTO tasks
                    (users_id, title, due_date, classification, source, status)
                VALUES (1, %s, %s, %s, 'ai', 'open')
                RETURNING id
            """, (
                item.title,
                item.due_date or None,
                item.category or item.priority or None,
            ))
            entity_id   = cur.fetchone()["id"]
            entity_type = "task"

        cur.execute("""
            UPDATE extractions
            SET status = 'confirmed'
            WHERE source_type = 'document'
              AND id = %s
              AND status = 'pending'
        """, (item.item_index,))

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('confirmed', %s, %s, %s)
        """, (entity_type, entity_id, item.title))

        # When no pending extractions remain for this document, clear it from the
        # confirm queue so it stops showing under "Pending AI Extractions".
        cur.execute("SELECT document_id FROM processing_queue WHERE id = %s", (item.job_id,))
        row = cur.fetchone()
        doc_id = row["document_id"] if row else None
        if doc_id is not None:
            cur.execute("""
                SELECT COUNT(*) AS n FROM extractions
                WHERE source_type = 'document' AND source_id = %s AND status = 'pending'
            """, (doc_id,))
            if cur.fetchone()["n"] == 0:
                cur.execute("UPDATE processing_queue SET status = 'done', processed_at = NOW() WHERE id = %s", (item.job_id,))
                cur.execute("UPDATE documents SET status = 'done' WHERE id = %s", (doc_id,))

        conn.commit()
        return {
            "status"   : "saved",
            "item_type": item.item_type,
            "id"       : entity_id,
            "title"    : item.title,
            "message"  : "Event saved to calendar." if item.item_type == "event" else "Task saved.",
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/confirmations/dismiss")
def dismiss_item(item: DismissItem):
    """FR-14a — discard proposal but keep the document."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE extractions
            SET status = 'dismissed'
            WHERE id = %s AND status = 'pending'
        """, (item.item_index,))

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('dismissed', 'document', %s, 'User dismissed proposal')
        """, (item.job_id,))

        # FR-14a — the document is always kept; only clear the job from the queue
        # once nothing is left pending.
        cur.execute("SELECT document_id FROM processing_queue WHERE id = %s", (item.job_id,))
        row = cur.fetchone()
        doc_id = row["document_id"] if row else None
        if doc_id is not None:
            cur.execute("""
                SELECT COUNT(*) AS n FROM extractions
                WHERE source_type = 'document' AND source_id = %s AND status = 'pending'
            """, (doc_id,))
            if cur.fetchone()["n"] == 0:
                cur.execute("UPDATE processing_queue SET status = 'dismissed' WHERE id = %s", (item.job_id,))
                cur.execute("UPDATE documents SET status = 'done' WHERE id = %s", (doc_id,))

        conn.commit()
        return {
            "status" : "dismissed",
            "job_id" : item.job_id,
            "message": "Proposal dismissed. Document kept and searchable."
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/confirmations/pending")
def pending_confirmations():
    """Dashboard — documents extracted but awaiting human confirmation."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT pq.id AS job_id, d.filename, d.uploaded_at,
                   COUNT(e.id) AS extraction_count
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            LEFT JOIN extractions e
                   ON e.source_type = 'document'
                  AND e.source_id   = d.id
                  AND e.status      = 'pending'
            WHERE  pq.status = 'awaiting_confirm'
            GROUP BY pq.id, d.filename, d.uploaded_at
            ORDER BY d.uploaded_at DESC
        """)
        return {"pending": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/confirmations/{job_id}")
def confirmation_detail(job_id: int):
    """FR-14 — the document + its AI-extracted fields for the confirm screen."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT pq.id AS job_id, d.id AS doc_id, d.filename, d.file_type,
                   d.uploaded_at, d.full_text
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            WHERE  pq.id = %s
        """, (job_id,))
        job = cur.fetchone()
        if not job:
            raise HTTPException(404, "Job not found.")

        cur.execute("""
            SELECT id, item_type, subject, event_date, event_time, venue, attendees,
                   ref_number, deadline, reply_by, reply_by_overdue, meeting_date_flag,
                   field_confidence, model_name, status, extracted_at
            FROM   extractions
            WHERE  source_type = 'document' AND source_id = %s AND status = 'pending'
            ORDER BY extracted_at DESC
        """, (job["doc_id"],))
        return {"job": job, "extractions": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
