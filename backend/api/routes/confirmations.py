import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.models import ConfirmItem, DismissItem
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Confirm"])
log = logging.getLogger(__name__)


def _job_owner(cur, job_id):
    """Return the user id that owns the document behind a queue job, or None."""
    cur.execute("""
        SELECT d.users_id FROM processing_queue pq
        JOIN documents d ON d.id = pq.document_id
        WHERE pq.id = %s
    """, (job_id,))
    row = cur.fetchone()
    return row["users_id"] if row else None


def _find_duplicate_event(cur, user_id, title, event_date):
    """Return the id of an existing (non-trashed) event with the same title on the
    same day for this user, or None. Prevents the same event being added twice —
    e.g. re-extracting a document or confirming twice. Title match is
    case-insensitive and whitespace-trimmed; a NULL date can't duplicate."""
    if not event_date or not title:
        return None
    cur.execute("""
        SELECT id FROM events
        WHERE users_id = %s
          AND event_date = %s
          AND status != 'trashed'
          AND LOWER(TRIM(title)) = LOWER(TRIM(%s))
        LIMIT 1
    """, (user_id, event_date, title))
    row = cur.fetchone()
    return row["id"] if row else None


@router.post("/confirmations/confirm")
def confirm_item(item: ConfirmItem, user: CurrentUser = Depends(current_user)):
    """FR-14 — human approves one extracted item (event or task)."""
    conn = get_db()
    cur  = conn.cursor()

    try:
        if _job_owner(cur, item.job_id) != user["id"]:
            raise HTTPException(404, "Job not found.")

        if item.item_type == "event":
            # Duplicate guard — if this event is already on the calendar for the
            # same day, don't add it again. We still link the source document and
            # mark the extraction confirmed, then report it as a duplicate.
            dup_id = _find_duplicate_event(cur, user["id"], item.title, item.event_date or None)
            if dup_id is not None:
                cur.execute("""
                    INSERT INTO linked_documents
                        (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                    SELECT 'document', document_id, 'event', %s, 'source', TRUE
                    FROM   processing_queue
                    WHERE  id = %s
                    LIMIT  1
                    ON CONFLICT DO NOTHING
                """, (dup_id, item.job_id))
                cur.execute("""
                    UPDATE extractions SET status = 'confirmed'
                    WHERE source_type = 'document' AND id = %s AND status = 'pending'
                """, (item.item_index,))
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
                    "status"   : "duplicate",
                    "item_type": "event",
                    "id"       : dup_id,
                    "title"    : item.title,
                    "message"  : f"“{item.title}” is already on the calendar for that day — not added again.",
                }

            cur.execute("""
                INSERT INTO events
                    (users_id, title, event_date, event_time, venue, attendees,
                     classification, source, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'ai', 'upcoming')
                RETURNING id
            """, (
                user["id"],
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
                    VALUES (%s, %s, %s, TRUE, 'Reply', 'ai', 'open')
                    RETURNING id
                """, (user["id"], f"Reply: {item.title}", item.reply_by))
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
                VALUES (%s, %s, %s, %s, 'ai', 'open')
                RETURNING id
            """, (
                user["id"],
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

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


class ConfirmAll(BaseModel):
    job_id: int


@router.post("/confirmations/confirm-all")
def confirm_all(body: ConfirmAll, user: CurrentUser = Depends(current_user)):
    """One-click: insert EVERY pending extraction for a document into the
    calendar/tasks at once — no per-item review. Used by the simplified upload
    flow (the user is asked once, after extraction, then everything is added)."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        if _job_owner(cur, body.job_id) != user["id"]:
            raise HTTPException(404, "Job not found.")

        cur.execute("SELECT document_id FROM processing_queue WHERE id = %s", (body.job_id,))
        row = cur.fetchone()
        doc_id = row["document_id"] if row else None

        cur.execute("""
            SELECT id, item_type, subject, event_date, event_time, venue,
                   attendees, deadline, reply_by
            FROM   extractions
            WHERE  source_type = 'document' AND source_id = %s AND status = 'pending'
            ORDER BY extracted_at
        """, (doc_id,))
        rows = cur.fetchall()

        from api.routes.reminders import insert_reminders
        events_added = tasks_added = events_skipped = 0

        for ex in rows:
            title = ex["subject"] or "Untitled"
            is_event = ex["item_type"] == "event" and ex["event_date"] is not None

            if is_event:
                # Duplicate guard — skip an event already on the calendar for the
                # same day (also catches duplicates within this same batch, since
                # rows are inserted as we iterate). The extraction is still marked
                # confirmed and the source document linked to the existing event.
                dup_id = _find_duplicate_event(cur, user["id"], title, ex["event_date"])
                if dup_id is not None:
                    cur.execute("""
                        INSERT INTO linked_documents
                            (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                        VALUES ('document', %s, 'event', %s, 'source', TRUE)
                        ON CONFLICT DO NOTHING
                    """, (doc_id, dup_id))
                    cur.execute("UPDATE extractions SET status = 'confirmed' WHERE id = %s", (ex["id"],))
                    events_skipped += 1
                    continue

                cur.execute("""
                    INSERT INTO events
                        (users_id, title, event_date, event_time, venue, attendees,
                         source, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'ai', 'upcoming')
                    RETURNING id
                """, (user["id"], title, ex["event_date"], ex["event_time"],
                      ex["venue"], ex["attendees"]))
                event_id = cur.fetchone()["id"]
                events_added += 1
                # sensible default reminder so the event isn't silent
                insert_reminders(cur, event_id, ["1day"])
                cur.execute("""
                    INSERT INTO linked_documents
                        (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                    VALUES ('document', %s, 'event', %s, 'source', TRUE)
                    ON CONFLICT DO NOTHING
                """, (doc_id, event_id))

                # a reply-by date becomes a reply task (FR-23)
                if ex["reply_by"]:
                    cur.execute("""
                        INSERT INTO tasks
                            (users_id, title, due_date, is_reply_task, classification, source, status)
                        VALUES (%s, %s, %s, TRUE, 'Reply', 'ai', 'open')
                        RETURNING id
                    """, (user["id"], f"Reply: {title}", ex["reply_by"]))
                    reply_id = cur.fetchone()["id"]
                    tasks_added += 1
                    cur.execute("""
                        INSERT INTO linked_documents
                            (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                        VALUES ('document', %s, 'task', %s, 'source', TRUE)
                        ON CONFLICT DO NOTHING
                    """, (doc_id, reply_id))
            else:
                due = ex["deadline"] or ex["reply_by"] or ex["event_date"]
                cur.execute("""
                    INSERT INTO tasks
                        (users_id, title, due_date, classification, source, status)
                    VALUES (%s, %s, %s, NULL, 'ai', 'open')
                    RETURNING id
                """, (user["id"], title, due))
                task_id = cur.fetchone()["id"]
                tasks_added += 1
                cur.execute("""
                    INSERT INTO linked_documents
                        (source_type, source_id, entity_type, entity_id, link_type, confirmed)
                    VALUES ('document', %s, 'task', %s, 'source', TRUE)
                    ON CONFLICT DO NOTHING
                """, (doc_id, task_id))

            cur.execute("UPDATE extractions SET status = 'confirmed' WHERE id = %s", (ex["id"],))
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('confirmed', %s, %s, %s)
            """, ("event" if is_event else "task", ex["id"], title))

        # clear the job + mark the document done
        if doc_id is not None:
            cur.execute("UPDATE processing_queue SET status = 'done', processed_at = NOW() WHERE id = %s",
                        (body.job_id,))
            cur.execute("UPDATE documents SET status = 'done' WHERE id = %s", (doc_id,))

        conn.commit()
        return {
            "status": "added",
            "events_added": events_added,
            "tasks_added": tasks_added,
            "events_skipped": events_skipped,
            "total": events_added + tasks_added,
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/confirmations/dismiss-all")
def dismiss_all(body: ConfirmAll, user: CurrentUser = Depends(current_user)):
    """One-click: dismiss ALL pending extractions for a document (the document
    itself is kept and stays searchable). Pairs with the simplified upload flow."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        if _job_owner(cur, body.job_id) != user["id"]:
            raise HTTPException(404, "Job not found.")

        cur.execute("SELECT document_id FROM processing_queue WHERE id = %s", (body.job_id,))
        row = cur.fetchone()
        doc_id = row["document_id"] if row else None

        cur.execute("""
            UPDATE extractions SET status = 'dismissed'
            WHERE source_type = 'document' AND source_id = %s AND status = 'pending'
        """, (doc_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('dismissed', 'document', %s, 'User dismissed all proposals')
        """, (doc_id,))
        if doc_id is not None:
            cur.execute("UPDATE processing_queue SET status = 'dismissed' WHERE id = %s", (body.job_id,))
            cur.execute("UPDATE documents SET status = 'done' WHERE id = %s", (doc_id,))

        conn.commit()
        return {"status": "dismissed", "job_id": body.job_id}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/confirmations/dismiss")
def dismiss_item(item: DismissItem, user: CurrentUser = Depends(current_user)):
    """FR-14a — discard proposal but keep the document."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        if _job_owner(cur, item.job_id) != user["id"]:
            raise HTTPException(404, "Job not found.")
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
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/confirmations/pending")
def pending_confirmations(user: CurrentUser = Depends(current_user)):
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
            WHERE  pq.status = 'awaiting_confirm' AND d.users_id = %s
            GROUP BY pq.id, d.filename, d.uploaded_at
            ORDER BY d.uploaded_at DESC
        """, (user["id"],))
        return {"pending": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/confirmations/{job_id}")
def confirmation_detail(job_id: int, user: CurrentUser = Depends(current_user)):
    """FR-14 — the document + its AI-extracted fields for the confirm screen."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT pq.id AS job_id, d.id AS doc_id, d.filename, d.file_type,
                   d.uploaded_at, d.full_text
            FROM   processing_queue pq
            JOIN   documents d ON d.id = pq.document_id
            WHERE  pq.id = %s AND d.users_id = %s
        """, (job_id, user["id"]))
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
