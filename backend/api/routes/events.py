from datetime import datetime, date
from calendar import monthrange
from typing import Optional
<<<<<<< HEAD
from api.models import ManualEvent, EventUpdate, LinkDocumentRequest
=======

from fastapi import APIRouter, HTTPException, Depends
from api.models import ManualEvent, EventUpdate
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
from api.db import get_db
from api.auth import current_user, CurrentUser
from api.routes.reminders import insert_reminders

router = APIRouter(tags=["Events"])

MAX_OCCURRENCES = 365         # hard safety cap for recurrence generation
DEFAULT_OCCURRENCES = 12      # used when a recurrence has no end date or count


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return s


def _add_interval(d: date, frequency: str, interval: int) -> date:
    """FR-20 — advance a date by one recurrence step."""
    if frequency == "daily":
        return date.fromordinal(d.toordinal() + interval)
    if frequency == "weekly":
        return date.fromordinal(d.toordinal() + 7 * interval)
    if frequency == "monthly":
        month = d.month - 1 + interval
        year  = d.year + month // 12
        month = month % 12 + 1
        day   = min(d.day, monthrange(year, month)[1])
        return date(year, month, day)
    if frequency == "yearly":
        try:
            return d.replace(year=d.year + interval)
        except ValueError:  # Feb 29
            return d.replace(year=d.year + interval, day=28)
    return d


def _occurrence_dates(start: date, frequency: str, interval: int,
                      end_date: Optional[date], end_count: Optional[int]) -> list:
    """Build the list of dates for a recurring series (inclusive of start)."""
    interval = max(1, interval or 1)
    dates = [start]
    cur = start
    while len(dates) < MAX_OCCURRENCES:
        cur = _add_interval(cur, frequency, interval)
        if end_date and cur > end_date:
            break
        dates.append(cur)
        if end_count and len(dates) >= end_count:
            break
    return dates


@router.get("/events/today")
def events_today(user: CurrentUser = Depends(current_user)):
    """FR-33 — today's meetings for dashboard."""
    conn = get_db()
    cur = conn.cursor()
    try:
        # "Today" is the IST calendar day (the DB session runs in UTC).
        cur.execute("""
            SELECT * FROM events
            WHERE event_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
              AND status != 'trashed'
              AND users_id = %s
            ORDER BY event_time NULLS LAST
        """, (user["id"],))
        events = cur.fetchall()
        return {
            "events": events,
            "date": str(events[0]["event_date"]) if events else ""
        }
    finally:
        cur.close()
        conn.close()

<<<<<<< HEAD
=======

>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
@router.get("/events")
def list_events(
    from_date: Optional[str] = None,
    to_date  : Optional[str] = None,
    status   : Optional[str] = None,
    user: CurrentUser = Depends(current_user),
):
    """FR-16 — list events with optional date range and status filter."""
    conn = get_db()
    cur = conn.cursor()
    try:
        query = "SELECT * FROM events WHERE status != 'trashed' AND users_id = %s"
        params = [user["id"]]

        if from_date:
            query += " AND event_date >= %s"
            params.append(from_date)
        if to_date:
            query += " AND event_date <= %s"
            params.append(to_date)
        if status:
            query += " AND status = %s"
            params.append(status)

        query += " ORDER BY event_date, event_time NULLS LAST"
        cur.execute(query, params)
        return {"events": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/events/{event_id}")
def get_event(event_id: int, user: CurrentUser = Depends(current_user)):
    """FR-16/FR-26/FR-27 — single event with source documents and the
    AI-parsed extraction fields (FR-8, FR-10) that produced it."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM events WHERE id = %s AND users_id = %s AND status != 'trashed'",
                    (event_id, user["id"]))
        event = cur.fetchone()
        if not event:
<<<<<<< HEAD
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
=======
            raise HTTPException(404, "Event not found.")
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55

        # Linked source documents (FR-26/FR-27)
        cur.execute("""
            SELECT d.id, d.filename, d.file_type, d.classification,
                   d.full_text, d.uploaded_at
            FROM documents d
            JOIN linked_documents ld
                ON ld.source_type = 'document' AND ld.source_id = d.id
            WHERE ld.entity_type = 'event' AND ld.entity_id = %s
        """, (event_id,))
        docs = cur.fetchall()

        # AI-parsed extraction fields from those source documents (FR-8, FR-10)
        extractions = []
        if docs:
            doc_ids = [d["id"] for d in docs]
            cur.execute("""
                SELECT subject, event_date, event_time, venue, attendees,
                       ref_number, deadline, reply_by, reply_by_overdue,
                       meeting_date_flag, field_confidence, model_name,
                       item_type, status, extracted_at
                FROM extractions
                WHERE source_type = 'document' AND source_id = ANY(%s)
                ORDER BY extracted_at DESC
            """, (doc_ids,))
            extractions = cur.fetchall()

        # Audit history for this event (FR-28)
        cur.execute("""
            SELECT action, detail, created_at
            FROM audit_log
            WHERE entity_type = 'event' AND entity_id = %s
            ORDER BY created_at DESC
        """, (event_id,))
        history = cur.fetchall()

        return {
            "event": event,
            "source_documents": docs,
            "extractions": extractions,
            "history": history,
        }
    finally:
        cur.close()
        conn.close()


@router.post("/events/manual")
<<<<<<< HEAD
def create_event_manual(event: ManualEvent):
<<<<<<< HEAD
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

=======
=======
def create_event_manual(event: ManualEvent,
                         user: CurrentUser = Depends(current_user)):
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
    """FR-7 manual entry + FR-20 recurring events. NFR-9: never depends on AI."""
    conn = get_db()
    cur = conn.cursor()
    try:
        start = _parse_date(event.event_date)
        if not isinstance(start, date):
            raise HTTPException(400, "Invalid event_date. Use DD MMM YYYY.")

        classification = event.classification or event.category or None
        recurrence_id = None
        dates = [start]

        # FR-20 — recurring series
        if event.recurrence in ("daily", "weekly", "monthly", "yearly"):
            rec_end_date  = _parse_date(event.end_date) if event.end_date else None
            rec_end_count = event.end_count or None
            # Guard: an open-ended recurrence (no end date and no count) would
            # otherwise generate up to MAX_OCCURRENCES rows. Cap it sensibly.
            if not rec_end_date and not rec_end_count:
                rec_end_count = DEFAULT_OCCURRENCES

            cur.execute("""
                INSERT INTO event_recurrence (frequency, interval, end_date, end_count)
                VALUES (%s, %s, %s, %s) RETURNING id
            """, (
                event.recurrence,
                max(1, event.interval or 1),
                rec_end_date,
                rec_end_count,
            ))
            recurrence_id = cur.fetchone()["id"]
            dates = _occurrence_dates(
                start, event.recurrence, event.interval or 1,
                rec_end_date, rec_end_count,
            )

        first_id = None
        for i, d in enumerate(dates):
            cur.execute("""
                INSERT INTO events
                    (users_id, title, event_date, event_time, venue, attendees,
                     classification, source, status, recurrence_id, parent_event_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'manual', 'upcoming', %s, %s)
                RETURNING id
            """, (
                user["id"], event.title, d, event.event_time or None,
                event.venue or None, event.attendees or None,
                classification, recurrence_id,
                first_id if i > 0 else None,
            ))
            eid = cur.fetchone()["id"]
            if first_id is None:
                first_id = eid
            # FR-17/FR-37 — reminders for each occurrence
            insert_reminders(cur, eid, event.reminders)

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('manual_entry', 'event', %s, %s)
        """, (first_id, f"{event.title}" + (f" (+{len(dates)-1} occurrences)" if len(dates) > 1 else "")))

        conn.commit()
        return {
            "status": "saved",
            "event_id": first_id,
            "occurrences": len(dates),
            "source": "manual",
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.patch("/events/{event_id}")
def update_event(event_id: int, update: EventUpdate,
                 user: CurrentUser = Depends(current_user)):
    """FR-16 — edit an existing event."""
    conn = get_db()
    cur = conn.cursor()
<<<<<<< HEAD

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

=======
    try:
        fields = {}
        if update.title      is not None: fields["title"]      = update.title
        if update.event_time is not None: fields["event_time"] = update.event_time or None
        if update.venue      is not None: fields["venue"]      = update.venue or None
        if update.attendees  is not None: fields["attendees"]  = update.attendees or None
        if update.category   is not None: fields["classification"] = update.category
        if update.event_date is not None:
            fields["event_date"] = _parse_date(update.event_date)

        if not fields:
            return {"status": "no changes", "event_id": event_id}

        set_clause = ", ".join(f"{k} = %s" for k in fields)
        values = list(fields.values()) + [event_id, user["id"]]
        cur.execute(
            f"UPDATE events SET {set_clause} "
            f"WHERE id = %s AND users_id = %s AND status != 'trashed'",
            values
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Event not found.")
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('edited', 'event', %s, %s)
        """, (event_id, f"Updated: {', '.join(fields.keys())}"))

        conn.commit()
        return {"status": "updated", "event_id": event_id}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.delete("/events/{event_id}")
<<<<<<< HEAD
<<<<<<< HEAD
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

=======
def delete_event(event_id: int, scope: str = "occurrence"):
=======
def delete_event(event_id: int, scope: str = "occurrence",
                 user: CurrentUser = Depends(current_user)):
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
    """FR-16/FR-20 — soft delete. scope='occurrence' trashes just this event;
    scope='series' trashes the whole recurring series it belongs to."""
    conn = get_db()
    cur = conn.cursor()
    try:
        if scope == "series":
            cur.execute("SELECT recurrence_id FROM events WHERE id = %s AND users_id = %s",
                        (event_id, user["id"]))
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "Event not found.")
            rec_id = row["recurrence_id"]
            if rec_id is not None:
                cur.execute("""
                    UPDATE events SET status = 'trashed', deleted_at = NOW()
                    WHERE recurrence_id = %s AND users_id = %s AND status != 'trashed'
                    RETURNING id
                """, (rec_id, user["id"]))
                trashed = [r["id"] for r in cur.fetchall()]
            else:
                # not actually recurring — fall back to single delete
                cur.execute("""
                    UPDATE events SET status = 'trashed', deleted_at = NOW()
                    WHERE id = %s AND users_id = %s AND status != 'trashed' RETURNING id
                """, (event_id, user["id"]))
                trashed = [r["id"] for r in cur.fetchall()]
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('trashed', 'event', %s, %s)
            """, (event_id, f"Soft deleted recurring series ({len(trashed)} occurrences)"))
            conn.commit()
            return {"status": "deleted", "scope": "series", "trashed_count": len(trashed)}

        # single occurrence
        cur.execute("""
            UPDATE events SET status = 'trashed', deleted_at = NOW()
            WHERE id = %s AND users_id = %s AND status != 'trashed'
        """, (event_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "Event not found.")
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'event', %s, 'Soft deleted by user')
        """, (event_id,))
        conn.commit()
        return {"status": "deleted", "scope": "occurrence", "event_id": event_id}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.post("/events/{event_id}/link-document")
<<<<<<< HEAD
<<<<<<< HEAD
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
=======
def link_document_to_event(event_id: int, body: dict):
=======
def link_document_to_event(event_id: int, body: dict,
                           user: CurrentUser = Depends(current_user)):
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
    """Q7 — link a second source document to an existing event."""
    conn = get_db()
    cur = conn.cursor()
    try:
        doc_id = body.get("doc_id")
        # Both the event and the document must belong to the caller.
        cur.execute("SELECT 1 FROM events WHERE id = %s AND users_id = %s",
                    (event_id, user["id"]))
        if cur.fetchone() is None:
            raise HTTPException(404, "Event not found.")
        cur.execute("SELECT 1 FROM documents WHERE id = %s AND users_id = %s",
                    (doc_id, user["id"]))
        if cur.fetchone() is None:
            raise HTTPException(404, "Document not found.")
        cur.execute("""
            INSERT INTO linked_documents
                (source_type, source_id, entity_type, entity_id, link_type, confirmed)
            VALUES ('document', %s, 'event', %s, 'source', TRUE)
            ON CONFLICT DO NOTHING
        """, (doc_id, event_id))
        conn.commit()
        return {"status": "linked", "event_id": event_id, "doc_id": body.get("doc_id")}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
