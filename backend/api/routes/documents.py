from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import csv
import hashlib
import html
import io
import os
import re
import logging
from api.config import UPLOAD_DIR, MAX_SIZE, MAX_BATCH, ALLOWED_DOCS
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Documents"])
log = logging.getLogger(__name__)


def _ref_series(ref: str):
    """The 'file series' of a reference number — the ref with its trailing running
    index or year dropped, so AB/12/2026 and AB/12/2025, or IDS/.../AI/01 and
    IDS/.../AI/02, share the series (e.g. 'AB/12' / 'IDS/.../AI'). HTML entities are
    decoded first (extraction sometimes stores '&amp;'). Returns the ref unchanged
    when there's no obvious index suffix (then only exact matches apply)."""
    if not ref:
        return None
    r = html.unescape(ref).strip()
    parts = [p for p in re.split(r"[/\\]", r) if p.strip()]
    # Drop a trailing short token that looks like a running index (01, A, 12) or a
    # 4-digit year, so all letters of one file share a series key.
    if len(parts) >= 2 and re.fullmatch(r"(?:19|20)\d{2}|[0-9A-Za-z]{1,4}", parts[-1].strip()):
        return "/".join(parts[:-1])
    return r


def _norm_ref(r):
    """Reference normalised for matching — HTML entities decoded ('&amp;'),
    upper-cased and trimmed, so encoded and OCR-cased refs still compare equal."""
    return html.unescape(r or "").upper().strip()


def _file_no(r):
    """The file number of a reference (longest digit run, e.g. 33018) — the most
    OCR-stable anchor for its series; separators and letters garble, digits don't."""
    m = re.findall(r"\d{3,}", r or "")
    return max(m, key=len) if m else None


def _run_idx(r):
    """The running index of a letter within its series (last number in the ref)."""
    m = re.findall(r"\d+", r or "")
    return int(m[-1]) if m else None

_MIME = {
    "pdf":  "application/pdf",
    "jpg":  "image/jpeg",
    "png":  "image/png",
    "tiff": "image/tiff",
}


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, inline: bool = False,
                      user: CurrentUser = Depends(current_user)):
    """FR-27 — open/download the original uploaded document (the record).
    ?inline=1 serves it with an inline disposition so it renders inside an
    <iframe> preview instead of triggering a browser download."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT filename, file_path, file_type FROM documents "
                    "WHERE id = %s AND users_id = %s", (doc_id, user["id"]))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")
        if not os.path.exists(doc["file_path"]):
            raise HTTPException(410, "Original file is no longer on disk.")
        return FileResponse(
            doc["file_path"],
            media_type=_MIME.get(doc["file_type"], "application/octet-stream"),
            filename=doc["filename"],
            content_disposition_type="inline" if inline else "attachment",
        )
    finally:
        cur.close()
        conn.close()


@router.post("/upload")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...),
                          user: CurrentUser = Depends(current_user)):
    """FR-1 validate format/size, FR-3 duplicate check, NFR-6 queue, FR-8 extract."""

    if file.content_type not in ALLOWED_DOCS:
        raise HTTPException(400, f"File type '{file.content_type}' not allowed. Use PDF, JPG, PNG or TIFF.")

    contents = await file.read()

    if len(contents) > MAX_SIZE:
        raise HTTPException(400, "File exceeds 50 MB limit.")

    file_hash = hashlib.sha256(contents).hexdigest()
    file_type = file.content_type.split("/")[-1]
    if file_type == "jpeg":
        file_type = "jpg"

    conn = get_db()
    cur  = conn.cursor()
    # Namespace the stored file by owner so two users uploading the same
    # filename don't clobber each other on disk.
    dest = os.path.join(UPLOAD_DIR, f"u{user['id']}_{file.filename}")

    try:
        # FR-1: batch limit — no more than MAX_BATCH files in one batch.
        # A "batch" = files uploaded within the last 60s (sequential uploads).
        # Using a rolling window (not a cumulative count) so it can't permanently
        # block uploads while files sit unprocessed in the queue.
        cur.execute("""
            SELECT COUNT(*) AS n FROM documents
            WHERE uploaded_at > NOW() - INTERVAL '60 seconds' AND deleted_at IS NULL
              AND users_id = %s
        """, (user["id"],))
        if cur.fetchone()["n"] >= MAX_BATCH:
            raise HTTPException(
                400,
                f"Batch limit reached: up to {MAX_BATCH} files per batch. "
                f"Please wait a moment before uploading more."
            )

        # FR-3: hash-based duplicate check
        cur.execute("SELECT id, filename, file_path, deleted_at FROM documents "
                    "WHERE file_hash = %s AND users_id = %s", (file_hash, user["id"]))
        existing = cur.fetchone()
        if existing:
            if existing["deleted_at"] is None:
                # an active document already has this exact file
                raise HTTPException(409, f"Duplicate file: already uploaded as '{existing['filename']}' (doc id {existing['id']}).")

            # The match is in the trash — restore it instead of blocking (FR-19).
            with open(existing["file_path"], "wb") as f:
                f.write(contents)
            cur.execute("UPDATE documents SET status = 'queued', deleted_at = NULL WHERE id = %s", (existing["id"],))
            cur.execute("""
                UPDATE processing_queue SET status = 'waiting', processed_at = NULL
                WHERE document_id = %s RETURNING id
            """, (existing["id"],))
            row = cur.fetchone()
            if row:
                queue_id = row["id"]
            else:
                cur.execute("INSERT INTO processing_queue (document_id, status) VALUES (%s,'waiting') RETURNING id", (existing["id"],))
                queue_id = cur.fetchone()["id"]
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('restored', 'document', %s, 'Restored via re-upload')
            """, (existing["id"],))
            conn.commit()

            ai_on = False
            try:
                from api.ai.pipeline import ai_ready, process_document
                if ai_ready():
                    ai_on = True
                    background_tasks.add_task(process_document, existing["id"])
            except Exception:
                pass
            return {
                "status": "restored" if not ai_on else "processing",
                "job_id": queue_id, "doc_id": existing["id"], "filename": existing["filename"],
                "size_kb": len(contents) // 1024,
                "message": "This file was in the trash — it has been restored"
                           + (" and is being re-processed." if ai_on else "."),
                "extractions": [],
            }

        with open(dest, "wb") as f:
            f.write(contents)

        cur.execute("""
            INSERT INTO documents
                (users_id, filename, file_hash, file_path, file_type, status)
            VALUES (%s, %s, %s, %s, %s, 'queued')
            RETURNING id
        """, (user["id"], file.filename, file_hash, dest, file_type))
        doc_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO processing_queue (document_id, status)
            VALUES (%s, 'waiting')
            RETURNING id
        """, (doc_id,))
        queue_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('uploaded', 'document', %s, %s)
        """, (doc_id, file.filename))

        conn.commit()

        # FR-8/NFR-9 — kick off AI extraction in the background if available;
        # otherwise the doc stays queued and can be processed later (degraded mode).
        ai_on = False
        try:
            from api.ai.pipeline import ai_ready, process_document
            if ai_ready():
                ai_on = True
                background_tasks.add_task(process_document, doc_id)
        except Exception as e:
            log.warning("AI not available, leaving doc %s queued: %s", doc_id, e)

        return {
            "status"     : "processing" if ai_on else "queued",
            "job_id"     : queue_id,
            "doc_id"     : doc_id,
            "filename"   : file.filename,
            "size_kb"    : len(contents) // 1024,
            "message"    : ("AI extraction started — refresh to see results."
                            if ai_on else
                            "File accepted and queued. AI is offline; it will be processed when available."),
            "extractions": []
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        if os.path.exists(dest):
            os.remove(dest)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/documents")
def list_documents(user: CurrentUser = Depends(current_user)):
    """FR-2 — list all uploaded documents with status."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT d.id, d.filename, d.file_type, d.status, d.uploaded_at,
                   d.ref_number, d.letter_status,
                   pq.status AS queue_status, pq.retry_count
            FROM   documents d
            LEFT JOIN processing_queue pq ON pq.document_id = d.id
            WHERE  d.deleted_at IS NULL AND d.users_id = %s
            ORDER BY d.uploaded_at DESC
        """, (user["id"],))
        return {"documents": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/documents/register")
def correspondence_register(user: CurrentUser = Depends(current_user)):
    """A correspondence register: every letter with its reference number, status,
    dates and reply-by — for review and CSV/print export. Declared before the
    /documents/{id} routes so 'register' isn't parsed as an id."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT d.id, d.filename, d.ref_number, d.letter_status,
                   d.classification, d.uploaded_at,
                   (SELECT MIN(e.reply_by) FROM extractions e
                    WHERE e.source_type = 'document' AND e.source_id = d.id
                      AND e.reply_by IS NOT NULL) AS reply_by
            FROM documents d
            WHERE d.deleted_at IS NULL AND d.users_id = %s
            ORDER BY d.uploaded_at DESC
        """, (user["id"],))
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()
    return {"register": [{
        "id": r["id"], "filename": r["filename"], "ref_number": r["ref_number"],
        "letter_status": r["letter_status"], "classification": r["classification"],
        "uploaded_at": r["uploaded_at"].isoformat() if r["uploaded_at"] else None,
        "reply_by": r["reply_by"].isoformat() if r["reply_by"] else None,
    } for r in rows]}


@router.get("/documents/register.csv")
def correspondence_register_csv(user: CurrentUser = Depends(current_user)):
    """The correspondence register as a CSV download — same rows as
    /documents/register, for print/offline filing. Declared before the
    /documents/{id} routes so 'register.csv' isn't parsed as an id."""
    rows = correspondence_register(user)["register"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "ref_number", "filename", "classification",
                "letter_status", "uploaded_at", "reply_by"])
    for r in rows:
        w.writerow([r["id"], r["ref_number"] or "", r["filename"] or "",
                    r["classification"] or "", r["letter_status"] or "",
                    r["uploaded_at"] or "", r["reply_by"] or ""])
    return Response(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="register.csv"'},
    )


@router.get("/documents/{doc_id}/thread")
def document_thread(doc_id: int, user: CurrentUser = Depends(current_user)):
    """The letter's correspondence thread — every document in the same file
    series, anchored on the file number (which survives OCR garbling of the
    separators) and ordered by running index so the series reads first → latest.
    Includes the requested document itself; no usable reference → empty thread.
    Declared before /documents/{doc_id} to keep the register/id ordering rule."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, ref_number FROM documents "
                    "WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
                    (doc_id, user["id"]))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")
        key = _file_no(doc["ref_number"]) or _ref_series(_norm_ref(doc["ref_number"]))
        if not key:
            return {"thread": []}
        cur.execute("""
            SELECT id, filename, ref_number, uploaded_at, letter_status
            FROM documents
            WHERE users_id = %s AND deleted_at IS NULL
              AND ref_number IS NOT NULL AND ref_number <> ''
        """, (user["id"],))
        members = []
        for i, r in enumerate(cur.fetchall()):
            if (_file_no(r["ref_number"]) or _ref_series(_norm_ref(r["ref_number"]))) != key:
                continue
            order = _run_idx(r["ref_number"])
            members.append(((order if order is not None else 10000 + i,
                             r["uploaded_at"].isoformat() if r["uploaded_at"] else ""), r))
    finally:
        cur.close()
        conn.close()
    members.sort(key=lambda m: m[0])
    return {"thread": [{
        "id": r["id"], "filename": r["filename"], "ref_number": r["ref_number"],
        "uploaded_at": r["uploaded_at"].isoformat() if r["uploaded_at"] else None,
        "letter_status": r["letter_status"],
    } for _, r in members]}


@router.post("/documents/{doc_id}/draft-reply")
def draft_reply_endpoint(doc_id: int, user: CurrentUser = Depends(current_user)):
    """Draft a reply to a letter with the local LLM (air-gapped). Returns editable
    text; the frontend lets the user save it as a note."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT full_text, ref_number FROM documents "
                    "WHERE id = %s AND users_id = %s AND deleted_at IS NULL", (doc_id, user["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Document not found.")
    finally:
        cur.close()
        conn.close()
    if not (row["full_text"] or "").strip():
        raise HTTPException(400, "This document has no readable text to reply to.")
    from api.ai.generate import draft_reply
    try:
        draft = draft_reply(row["full_text"], row["ref_number"])
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"doc_id": doc_id, "draft": draft, "ref_number": row["ref_number"]}


@router.post("/documents/{doc_id}/reextract")
def reextract_document(doc_id: int, background_tasks: BackgroundTasks,
                       user: CurrentUser = Depends(current_user)):
    """FR-14a — re-run extraction on a stored document. Previous extractions are
    kept (versioned by status), the new one goes through the confirm screen."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id FROM documents WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
                    (doc_id, user["id"]))
        if not cur.fetchone():
            raise HTTPException(404, "Document not found.")
        # keep prior pending extractions as history (mark superseded)
        cur.execute("""
            UPDATE extractions SET status = 'dismissed'
            WHERE source_type = 'document' AND source_id = %s AND status = 'pending'
        """, (doc_id,))
        cur.execute("UPDATE documents SET status = 'queued' WHERE id = %s", (doc_id,))
        cur.execute("""
            UPDATE processing_queue
            SET status = 'waiting', processed_at = NULL, retry_count = retry_count + 1
            WHERE document_id = %s
        """, (doc_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('extracted', 'document', %s, 'Re-extraction requested')
        """, (doc_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()

    ai_on = False
    try:
        from api.ai.pipeline import ai_ready, process_document
        if ai_ready():
            ai_on = True
            background_tasks.add_task(process_document, doc_id)
    except Exception as e:
        log.warning("Re-extract: AI unavailable for doc %s: %s", doc_id, e)

    return {"status": "reprocessing" if ai_on else "queued", "doc_id": doc_id}


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, user: CurrentUser = Depends(current_user)):
    """FR-27 — document detail + linked events/tasks + ref-number related docs."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT * FROM documents WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
                    (doc_id, user["id"]))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")

        cur.execute("""
            SELECT e.id, e.title, e.event_date, e.event_time, e.status
            FROM   events e
            JOIN   linked_documents ld
                   ON ld.entity_type = 'event' AND ld.entity_id = e.id
            WHERE  ld.source_type = 'document' AND ld.source_id = %s
        """, (doc_id,))
        linked_events = cur.fetchall()

        cur.execute("""
            SELECT t.id, t.title, t.due_date, t.status
            FROM   tasks t
            JOIN   linked_documents ld
                   ON ld.entity_type = 'task' AND ld.entity_id = t.id
            WHERE  ld.source_type = 'document' AND ld.source_id = %s
        """, (doc_id,))
        linked_tasks = cur.fetchall()

        # FR-24 — documents that share the same reference number (deterministic)
        related_docs = []
        if doc.get("ref_number"):
            cur.execute("""
                SELECT id, filename, uploaded_at FROM documents
                WHERE ref_number = %s AND id <> %s AND deleted_at IS NULL
                  AND users_id = %s
                ORDER BY uploaded_at DESC
            """, (doc["ref_number"], doc_id, user["id"]))
            related_docs = cur.fetchall()

        return {
            "document": doc,
            "linked_events": linked_events,
            "linked_tasks": linked_tasks,
            "related_documents": related_docs,
        }
    finally:
        cur.close()
        conn.close()


class LetterStatusBody(BaseModel):
    status: str   # open | replied | closed


@router.patch("/documents/{doc_id}/letter-status")
def set_letter_status(doc_id: int, body: LetterStatusBody,
                      user: CurrentUser = Depends(current_user)):
    """Move a letter along its correspondence lifecycle (open → replied → closed)."""
    if body.status not in ("open", "replied", "closed"):
        raise HTTPException(400, "status must be open, replied or closed.")
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE documents SET letter_status = %s "
                    "WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
                    (body.status, doc_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "Document not found.")
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('status_changed', 'document', %s, %s)
        """, (doc_id, f"Letter marked {body.status}"))
        conn.commit()
        return {"doc_id": doc_id, "letter_status": body.status}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/documents/{doc_id}/related")
def related_items(doc_id: int, user: CurrentUser = Depends(current_user)):
    """FR-24/FR-25 — 'what does this letter connect to?'. Merges three signals into
    one ranked list of past items:
      • same reference number (exact)      — highest confidence
      • same file series (ref minus year)  — ongoing correspondence
      • semantically similar content       — via the embedding/vector store
    Also pulls in the events/tasks that hang off the matched letters, so the user
    sees the whole thread. Read-only; the UI offers to link (human confirms)."""
    related, seen = [], set()

    def add(kind, item_id, title, reason, extra=None):
        key = (kind, item_id)
        if key in seen or (kind == "document" and item_id == doc_id):
            return
        seen.add(key)
        related.append({"kind": kind, "id": item_id, "title": title or f"{kind} {item_id}",
                        "reason": reason, **(extra or {})})

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, filename, full_text, ref_number FROM documents "
                    "WHERE id = %s AND users_id = %s", (doc_id, user["id"]))
        doc = cur.fetchone()
        if not doc:
            raise HTTPException(404, "Document not found.")
        ref = doc["ref_number"]

        # 1 + 2 — reference number: exact, then same series
        if ref:
            cur.execute("""
                SELECT id, filename, ref_number FROM documents
                WHERE users_id = %s AND id <> %s AND deleted_at IS NULL AND ref_number = %s
                ORDER BY uploaded_at DESC
            """, (user["id"], doc_id, ref))
            for r in cur.fetchall():
                add("document", r["id"], r["filename"], "same reference", {"ref_number": r["ref_number"]})

            series = _ref_series(ref)
            if series and series != ref:
                cur.execute("""
                    SELECT id, filename, ref_number FROM documents
                    WHERE users_id = %s AND id <> %s AND deleted_at IS NULL AND ref_number LIKE %s
                    ORDER BY uploaded_at DESC
                """, (user["id"], doc_id, series + "/%"))
                for r in cur.fetchall():
                    add("document", r["id"], r["filename"], "same series", {"ref_number": r["ref_number"]})

        # events/tasks that hang off the matched letters
        for mid in [it["id"] for it in related if it["kind"] == "document"]:
            cur.execute("""
                SELECT e.id, e.title FROM events e
                JOIN linked_documents ld ON ld.entity_type = 'event' AND ld.entity_id = e.id
                WHERE ld.source_type = 'document' AND ld.source_id = %s AND e.status <> 'trashed'
            """, (mid,))
            for r in cur.fetchall():
                add("event", r["id"], r["title"], "on a related letter")
            cur.execute("""
                SELECT t.id, t.title FROM tasks t
                JOIN linked_documents ld ON ld.entity_type = 'task' AND ld.entity_id = t.id
                WHERE ld.source_type = 'document' AND ld.source_id = %s AND t.status <> 'trashed'
            """, (mid,))
            for r in cur.fetchall():
                add("task", r["id"], r["title"], "on a related letter")
    finally:
        cur.close()
        conn.close()

    # 3 — semantic matches (documents + notes), best-effort (NFR-9)
    try:
        from api.ai.embeddings import embed_available
        from api.ai.vectorstore import search
        if doc["full_text"] and embed_available():
            for h in search(doc["full_text"][:2000], top_k=8, user_id=user["id"]):
                hk, hid = h.get("kind"), h.get("item_id")
                if not hk or hid is None:
                    continue
                try:
                    hid = int(hid)
                except (TypeError, ValueError):
                    continue
                add(hk, hid, h.get("title", ""), "similar content", {"score": round(float(h["score"]), 3)})
    except Exception as e:
        log.warning("Related semantic search failed for doc %s: %s", doc_id, e)

    return {"related": related[:12]}


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, user: CurrentUser = Depends(current_user)):
    """Soft delete — file stays on disk per FR-27."""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            UPDATE documents
            SET status = 'trashed', deleted_at = NOW()
            WHERE id = %s AND users_id = %s AND deleted_at IS NULL
        """, (doc_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "Document not found.")

        # Clear its processing-queue row too — otherwise a doc trashed mid-pipeline
        # stays visible as "processing"/"waiting" on the status page forever.
        cur.execute("DELETE FROM processing_queue WHERE document_id = %s", (doc_id,))
        cur.execute("UPDATE extractions SET status = 'dismissed' "
                    "WHERE source_type = 'document' AND source_id = %s AND status = 'pending'",
                    (doc_id,))

        # Cascade: trash the events/tasks that were created FROM this document, so
        # deleting a letter also removes the meeting/task it produced (otherwise
        # they linger on the calendar). Only 'source' links — never soft/AI hints.
        cur.execute("""
            SELECT entity_type, entity_id FROM linked_documents
            WHERE source_type = 'document' AND source_id = %s
              AND entity_type IN ('event', 'task') AND link_type IN ('source', 'hard_auto')
        """, (doc_id,))
        derived = cur.fetchall()
        ev_ids = [r["entity_id"] for r in derived if r["entity_type"] == "event"]
        tk_ids = [r["entity_id"] for r in derived if r["entity_type"] == "task"]
        if ev_ids:
            cur.execute("UPDATE events SET status = 'trashed', deleted_at = NOW() "
                        "WHERE id = ANY(%s) AND users_id = %s AND status != 'trashed'",
                        (ev_ids, user["id"]))
        if tk_ids:
            cur.execute("UPDATE tasks SET status = 'trashed', deleted_at = NOW() "
                        "WHERE id = ANY(%s) AND users_id = %s AND status != 'trashed'",
                        (tk_ids, user["id"]))

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'document', %s, %s)
        """, (doc_id, f"Soft deleted by user (also removed {len(ev_ids)} event(s), {len(tk_ids)} task(s))"))
        conn.commit()
        return {"status": "deleted", "doc_id": doc_id,
                "events_removed": len(ev_ids), "tasks_removed": len(tk_ids)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
