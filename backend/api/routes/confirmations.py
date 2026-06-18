from fastapi import APIRouter, HTTPException
from api.models import ConfirmItem, DismissItem
from api.db import get_db

router = APIRouter(tags=["Confirm"])

# fetch("http://localhost:9000/confirmations/confirm", {
#     method: "POST",
#     headers: { "Content-Type": "application/json" },
#     body: JSON.stringify({
#         job_id     : "a3f9c12b",
#         item_index : 0,
#         title      : "Team Meeting",
#         event_date : "20 Jun 2026",
#         event_time : "10:00",
#         venue      : "Room A",
#         item_type  : "event",
#         priority   : "High",
#         category   : "Meeting"
#     })
# })
@router.post("/confirmations/confirm")
def confirm_item(item: ConfirmItem):
    """FR-14 — human approves one extracted item (event or task)."""
    conn = get_db()
    cur  = conn.cursor()

    try:
        if item.item_type == "event":
            # 1. Save event to events table
            cur.execute("""
                INSERT INTO events
                    (title, event_date, event_time, venue, attendees,
                     ref_number, deadline, reply_by,
                     priority, category, source, confirmed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'ai', NOW())
                RETURNING id
            """, (
                item.title,
                item.event_date or None,
                item.event_time or None,
                item.venue      or None,
                item.attendees  or None,
                item.ref_number or None,
                item.deadline   or None,
                item.reply_by   or None,
                item.priority,
                item.category,
            ))
            event_id = cur.fetchone()["id"]

            # 2. Link event back to its source document via event_documents
            cur.execute("""
                INSERT INTO event_documents (event_id, document_id)
                SELECT %s, document_id
                FROM   processing_queue
                WHERE  job_id = %s
                LIMIT  1
            """, (event_id, item.job_id))

            entity_type = "event"
            entity_id   = event_id

        else:
            # 1. Save task to tasks table
            cur.execute("""
                INSERT INTO tasks
                    (title, due_date, priority, category, source, confirmed_at)
                VALUES (%s, %s, %s, %s, 'ai', NOW())
                RETURNING id
            """, (
                item.title,
                item.due_date or None,
                item.priority,
                item.category,
            ))
            entity_id   = cur.fetchone()["id"]
            entity_type = "task"

        # 3. Write audit log entry
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
    # TODO Day 3: UPDATE processing_queue SET status='dismissed'
    # TODO Day 4: write audit_log action='dismissed'
    return {
        "status" : "dismissed",
        "job_id" : item.job_id,
        "message": "Proposal dismissed. Document kept and searchable."
    }


@router.get("/confirmations/pending")
def pending_confirmations():
    """Dashboard — documents extracted but awaiting human confirmation."""
    # TODO Day 3: SELECT FROM processing_queue WHERE status='awaiting_confirm'
    return {"pending": []}
