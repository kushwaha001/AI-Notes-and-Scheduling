import os
from fastapi import APIRouter, Depends
from api.models import SearchRequest
from api.db import get_db
from api.config import NOTES_DIR
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Search"])


@router.post("/search")
def search(req: SearchRequest, user: CurrentUser = Depends(current_user)):
    """FR-29–32 — keyword search across events and documents (Qdrant fallback)."""
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    try:
        top_k = req.top_k or 10
        # Tokenise the query into words and require EVERY word to appear somewhere,
        # so "sample letter" still matches "sample-event-letter.pdf" (hyphens/dots
        # in filenames no longer defeat a multi-word search).
        tokens = [t for t in req.q.split() if t.strip()] or [req.q]
        like = lambda t: f"%{t}%"

        # Events — each token must match title/venue/attendees
        event_params = [uid]
        event_clauses = []
        for t in tokens:
            event_clauses.append("(title ILIKE %s OR venue ILIKE %s OR attendees ILIKE %s)")
            event_params += [like(t), like(t), like(t)]
        event_query = ("SELECT id, title, event_date, event_time, venue, attendees, status "
                       "FROM events WHERE status != 'trashed' AND users_id = %s AND "
                       + " AND ".join(event_clauses))
        if req.from_date:
            event_query += " AND event_date >= %s"; event_params.append(req.from_date)
        if req.to_date:
            event_query += " AND event_date <= %s"; event_params.append(req.to_date)
        event_query += " ORDER BY event_date DESC LIMIT %s"
        event_params.append(top_k)
        cur.execute(event_query, event_params)
        events = cur.fetchall()

        # Documents — each token must match filename or full text
        doc_params = [uid]
        doc_clauses = []
        for t in tokens:
            doc_clauses.append("(filename ILIKE %s OR full_text ILIKE %s)")
            doc_params += [like(t), like(t)]
        doc_params.append(top_k)
        cur.execute(
            "SELECT id, filename, file_type, status, uploaded_at FROM documents "
            "WHERE deleted_at IS NULL AND users_id = %s AND "
            + " AND ".join(doc_clauses) + " ORDER BY uploaded_at DESC LIMIT %s",
            doc_params)
        documents = cur.fetchall()

        # Notes (FR-31) — match the title in DB or the body in the Markdown file
        cur.execute("""
            SELECT id, title, classification
            FROM notes WHERE status = 'active' AND users_id = %s
            ORDER BY created_at DESC
        """, (uid,))
        lc_tokens = [t.lower() for t in tokens]
        notes = []
        for n in cur.fetchall():
            hay = (n["title"] or "").lower()
            path = os.path.join(NOTES_DIR, f"{n['id']}.md")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    hay += " " + f.read().lower()
            hit = all(t in hay for t in lc_tokens)
            if hit:
                notes.append({"id": n["id"], "title": n["title"], "classification": n["classification"]})
            if len(notes) >= top_k:
                break

        return {
            "query"      : req.q,
            "answer"     : "",
            "events"     : events,
            "documents"  : documents,
            "notes"      : notes,
            "search_type": "keyword",
        }
    finally:
        cur.close()
        conn.close()
