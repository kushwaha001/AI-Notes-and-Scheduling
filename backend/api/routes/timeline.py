"""
FR-34 — Unified timeline: notes and scheduled items in one chronological view,
with tap-through to source.
"""

import os
from datetime import datetime
from fastapi import APIRouter
from api.db import get_db
from api.config import NOTES_DIR

router = APIRouter(tags=["Timeline"])


@router.get("/timeline")
def timeline(limit: int = 100):
    """Merge events, tasks and notes into one chronological list (newest first)."""
    conn = get_db()
    cur = conn.cursor()
    items = []
    try:
        # Events — keyed by event_date
        cur.execute("""
            SELECT id, title, event_date, event_time, venue, classification, source, created_at
            FROM events WHERE status != 'trashed'
        """)
        for e in cur.fetchall():
            when = e["event_date"]
            items.append({
                "kind": "event",
                "id": e["id"],
                "title": e["title"],
                "date": str(when) if when else None,
                "time": str(e["event_time"]) if e["event_time"] else None,
                "subtitle": e["venue"] or "",
                "classification": e["classification"],
                "source": e["source"],
            })

        # Tasks — keyed by due_date (fall back to created_at)
        cur.execute("""
            SELECT id, title, due_date, status, classification, source, created_at
            FROM tasks WHERE deleted_at IS NULL
        """)
        for t in cur.fetchall():
            when = t["due_date"] or t["created_at"]
            items.append({
                "kind": "task",
                "id": t["id"],
                "title": t["title"],
                "date": str(when).split(" ")[0] if when else None,
                "time": None,
                "subtitle": f"Task — {t['status']}",
                "classification": t["classification"],
                "source": t["source"],
            })

        # Notes — DB metadata, timestamped by the Markdown file
        cur.execute("""
            SELECT id, title, classification, created_at
            FROM notes WHERE status = 'active'
        """)
        for n in cur.fetchall():
            path = os.path.join(NOTES_DIR, f"{n['id']}.md")
            when = (datetime.fromtimestamp(os.stat(path).st_mtime)
                    if os.path.exists(path) else n["created_at"])
            items.append({
                "kind": "note",
                "id": n["id"],
                "title": n["title"],
                "date": when.date().isoformat(),
                "time": when.strftime("%H:%M"),
                "subtitle": "Note",
                "classification": n["classification"],
                "source": "manual",
            })
    finally:
        cur.close()
        conn.close()

    # Sort newest first; items with no date sink to the bottom
    items.sort(key=lambda i: i["date"] or "0000-00-00", reverse=True)
    return {"timeline": items[:limit]}
