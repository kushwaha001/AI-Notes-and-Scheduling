import os
from fastapi import APIRouter
from api.models import SearchRequest
from api.db import get_db
from api.config import NOTES_DIR

router = APIRouter(tags=["Search"])


@router.post("/search")
def search(req: SearchRequest):
    """FR-29–32 — keyword search across events and documents (Qdrant fallback)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        q = f"%{req.q}%"
        top_k = req.top_k or 10

        # Events
        event_params = [q, q, q]
        event_query = """
            SELECT id, title, event_date, event_time, venue, attendees, status
            FROM events
            WHERE status != 'trashed'
              AND (title ILIKE %s OR venue ILIKE %s OR attendees ILIKE %s)
        """
        if req.from_date:
            event_query += " AND event_date >= %s"
            event_params.append(req.from_date)
        if req.to_date:
            event_query += " AND event_date <= %s"
            event_params.append(req.to_date)
        event_query += " ORDER BY event_date DESC LIMIT %s"
        event_params.append(top_k)
        cur.execute(event_query, event_params)
        events = cur.fetchall()

        # Documents
        cur.execute("""
            SELECT id, filename, file_type, status, uploaded_at
            FROM documents
            WHERE deleted_at IS NULL
              AND (filename ILIKE %s OR full_text ILIKE %s)
            ORDER BY uploaded_at DESC
            LIMIT %s
        """, (q, q, top_k))
        documents = cur.fetchall()

        # Notes (FR-31) — match the title in DB or the body in the Markdown file
        cur.execute("""
            SELECT id, title, classification
            FROM notes WHERE status = 'active'
            ORDER BY created_at DESC
        """)
        term = req.q.lower().strip()
        notes = []
        for n in cur.fetchall():
            hit = term in (n["title"] or "").lower()
            if not hit:
                path = os.path.join(NOTES_DIR, f"{n['id']}.md")
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as f:
                        hit = term in f.read().lower()
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
