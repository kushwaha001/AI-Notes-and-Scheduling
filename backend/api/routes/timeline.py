"""
FR-34 — Unified timeline: notes and scheduled items in one chronological view,
with tap-through to source.
"""

import os
from datetime import datetime, date
from collections import defaultdict
from fastapi import APIRouter
from api.db import get_db
from api.config import NOTES_DIR

router = APIRouter(tags=["Timeline"])


@router.get("/timeline")
def timeline(limit: int = 200):
    """Merge events, tasks and notes into one chronological list (newest first).
    Recurring event series are collapsed to a single entry (with an occurrence
    count) so the timeline isn't flooded by repeats. ALL tasks and notes are
    always returned so they never get hidden."""
    conn = get_db()
    cur = conn.cursor()
    items = []
    try:
        # Non-recurring events — listed individually (most recent `limit`)
        cur.execute("""
            SELECT id, title, event_date, event_time, venue, classification, source
            FROM events
            WHERE status != 'trashed' AND recurrence_id IS NULL
            ORDER BY event_date DESC NULLS LAST
            LIMIT %s
        """, (limit,))
        for e in cur.fetchall():
            items.append({
                "kind": "event",
                "id": e["id"],
                "title": e["title"],
                "date": str(e["event_date"]) if e["event_date"] else None,
                "time": str(e["event_time"]) if e["event_time"] else None,
                "subtitle": e["venue"] or "",
                "classification": e["classification"],
                "source": e["source"],
                "recurring": False,
                "occurrences": 1,
            })

        # Recurring events — collapse each series to ONE entry (next upcoming,
        # or the latest past), with the total occurrence count.
        cur.execute("""
            SELECT id, title, event_date, event_time, venue, classification, source, recurrence_id
            FROM events
            WHERE status != 'trashed' AND recurrence_id IS NOT NULL
        """)
        series = defaultdict(list)
        for e in cur.fetchall():
            series[e["recurrence_id"]].append(e)

        today = date.today()
        for occ in series.values():
            occ.sort(key=lambda x: x["event_date"])
            upcoming = [o for o in occ if o["event_date"] and o["event_date"] >= today]
            rep = upcoming[0] if upcoming else occ[-1]
            items.append({
                "kind": "event",
                "id": rep["id"],
                "title": rep["title"],
                "date": str(rep["event_date"]) if rep["event_date"] else None,
                "time": str(rep["event_time"]) if rep["event_time"] else None,
                "subtitle": rep["venue"] or "",
                "classification": rep["classification"],
                "source": rep["source"],
                "recurring": True,
                "occurrences": len(occ),
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
                "recurring": False,
                "occurrences": 1,
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
                "recurring": False,
                "occurrences": 1,
            })
    finally:
        cur.close()
        conn.close()

    # Sort newest first; items with no date sink to the bottom.
    # No extra truncation here — events are already capped, tasks/notes are few.
    items.sort(key=lambda i: i["date"] or "0000-00-00", reverse=True)
    return {"timeline": items}
