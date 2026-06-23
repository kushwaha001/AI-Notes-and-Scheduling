from fastapi import APIRouter, HTTPException
from typing import Optional
from api.models import ManualEvent, EventUpdate, LinkDocumentRequest
from api.db import get_db

router = APIRouter(tags=["Events"])


@router.get("/events/today")
def events_today():
    """FR-33 — today's meetings for dashboard."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT *
            FROM events
            WHERE event_date = CURRENT_DATE
            AND status <> 'deleted'
            ORDER BY event_time
        """)
        events = cur.fetchall()
        return {
            "events": events,
            "date": str(events[0]["event_date"]) if events else ""
        }
    finally:
        cur.close()
        conn.close()

@router.get("/events")
def list_events(
    from_date: Optional[str] = None,
    to_date  : Optional[str] = None,
    status   : Optional[str] = None,
):
    """FR-16 — list events with optional date range and status filter."""
    conn = get_db()
    cur = conn.cursor()

    try:
        query = """
            SELECT *
            FROM events
            WHERE 1=1
        """
        params = []

        if from_date:
            query += " AND event_date >= %s"
            params.append(from_date)

        if to_date:
            query += " AND event_date <= %s"
            params.append(to_date)

        if status:
            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY event_date, event_time"
        cur.execute(query, params)
        return {
            "events": cur.fetchall()
        }
    finally:
        cur.close()
        conn.close()


@router.get("/events/{event_id}")
def get_event(event_id: int):
    """FR-16 — single event with source document links."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT *
            FROM events
            WHERE id = %s
        """, (event_id,))

        event = cur.fetchone()
        
        if not event:
            raise HTTPException(
                status_code=404,
                detail="Event not found"
            )
        cur.execute("""
            SELECT d.*
            FROM documents d
            JOIN linked_documents ld
            ON ld.source_type = 'document'
            AND ld.source_id = d.id
            WHERE ld.entity_type = 'event'
            AND ld.entity_id = %s
            """, (event_id,))

        docs = cur.fetchall()

        return {
            "event": event,
            "source_documents": docs
        }
    finally:
        cur.close()
        conn.close()

@router.post("/events/manual")
def create_event_manual(event: ManualEvent):
    """FR-7 — manual entry, no AI. NFR-9: never depends on vLLM."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO events (
                users_id,
                title,
                event_date,
                event_time,
                venue,
                attendees,
                classification,
                source,
                status
            )
            VALUES (
                1,
                %s,
                %s,
                %s,
                %s,
                %s,
                %s,
                'manual',
                'upcoming'
            )
            RETURNING id
        """, (
            event.title,
            event.event_date,
            event.event_time or None,
            event.venue or None,
            event.attendees or None,
            event.category or None
        ))

        event_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO audit_log
            (action, entity_type, entity_id, detail)
            VALUES
            ('manual_entry', 'event', %s, %s)
        """, (
            event_id,
            event.title
        ))

        conn.commit()

        return {
            "status": "saved",
            "event_id": event_id
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

    finally:
        cur.close()
        conn.close()


@router.patch("/events/{event_id}")
def update_event(event_id: int, update: EventUpdate):
    """FR-16 — edit an existing event."""
    conn = get_db()
    cur = conn.cursor()

    try:
        fields = []
        params = []

        if update.title is not None:
            fields.append("title = %s")
            params.append(update.title)

        if update.event_date is not None:
            fields.append("event_date = %s")
            params.append(update.event_date)

        if update.event_time is not None:
            fields.append("event_time = %s")
            params.append(update.event_time)

        if update.venue is not None:
            fields.append("venue = %s")
            params.append(update.venue)

        if update.attendees is not None:
            fields.append("attendees = %s")
            params.append(update.attendees)

        if update.category is not None:
            fields.append("classification = %s")
            params.append(update.category)

        if not fields:
            raise HTTPException(400, "No fields supplied")

        query = f"""
            UPDATE events
            SET {", ".join(fields)}
            WHERE id = %s
              AND deleted_at IS NULL
        """

        params.append(event_id)

        cur.execute(query, params)

        if cur.rowcount == 0:
            raise HTTPException(404, "Event not found")

        cur.execute("""
            INSERT INTO audit_log
            (action, entity_type, entity_id, detail)
            VALUES
            ('edited', 'event', %s, 'Event updated')
        """, (event_id,))

        conn.commit()

        return {
            "status": "updated",
            "event_id": event_id
        }

    except HTTPException:
        raise

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

    finally:
        cur.close()
        conn.close()


@router.delete("/events/{event_id}")
def delete_event(event_id: int):
    """FR-16 — soft delete, keeps audit trail."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            UPDATE events
            SET status = 'trashed',
                deleted_at = NOW()
            WHERE id = %s
              AND deleted_at IS NULL
        """, (event_id,))

        if cur.rowcount == 0:
            raise HTTPException(404, "Event not found")

        cur.execute("""
            INSERT INTO audit_log
            (action, entity_type, entity_id, detail)
            VALUES
            ('trashed', 'event', %s, 'Event moved to trash')
        """, (event_id,))

        conn.commit()

        return {
            "status": "deleted",
            "event_id": event_id
        }

    except HTTPException:
        raise

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

    finally:
        cur.close()
        conn.close()


@router.post("/events/{event_id}/link-document")
def link_document_to_event(
    event_id: int,
    body: LinkDocumentRequest
):
    """Link an additional document to an existing event."""

    conn = get_db()
    cur = conn.cursor()

    try:
        # Check event exists
        cur.execute("""
            SELECT id
            FROM events
            WHERE id = %s
              AND deleted_at IS NULL
        """, (event_id,))

        if not cur.fetchone():
            raise HTTPException(
                status_code=404,
                detail="Event not found"
            )

        # Check document exists
        cur.execute("""
            SELECT id
            FROM documents
            WHERE id = %s
              AND deleted_at IS NULL
        """, (body.doc_id,))

        if not cur.fetchone():
            raise HTTPException(
                status_code=404,
                detail="Document not found"
            )

        # Create link
        cur.execute("""
            INSERT INTO linked_documents (
                source_type,
                source_id,
                entity_type,
                entity_id,
                link_type,
                confirmed
            )
            VALUES (
                'document',
                %s,
                'event',
                %s,
                'source',
                TRUE
            )
            ON CONFLICT DO NOTHING
        """, (
            body.doc_id,
            event_id
        ))

        # Audit log
        cur.execute("""
            INSERT INTO audit_log (
                action,
                entity_type,
                entity_id,
                detail
            )
            VALUES (
                'edited',
                'event',
                %s,
                %s
            )
        """, (
            event_id,
            f'Linked document {body.doc_id}'
        ))

        conn.commit()

        return {
            "status": "linked",
            "event_id": event_id,
            "doc_id": body.doc_id
        }

    except HTTPException:
        raise

    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    finally:
        cur.close()
        conn.close()