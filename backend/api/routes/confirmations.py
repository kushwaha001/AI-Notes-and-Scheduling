from fastapi import APIRouter, HTTPException
from api.models import ConfirmItem, DismissItem
from api.db import get_db

router = APIRouter(tags=["Confirm"])


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

            cur.execute("""
                INSERT INTO linked_documents
                    (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                SELECT 'document', document_id, 'event', %s, 'source', TRUE
                FROM   processing_queue
                WHERE  id = %s
                LIMIT  1
            """, (event_id, item.job_id))

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
            UPDATE processing_queue
            SET status = 'dismissed'
            WHERE id = %s
        """, (item.job_id,))

        cur.execute("""
            UPDATE extractions
            SET status = 'dismissed'
            WHERE id = %s AND status = 'pending'
        """, (item.item_index,))

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('dismissed', 'document', %s, 'User dismissed proposal')
        """, (item.job_id,))

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
