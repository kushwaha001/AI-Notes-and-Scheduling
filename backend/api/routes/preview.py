"""
Item preview — a summarised 'peek' at any item (title + summary + key fields),
with the full body available on demand. Powers the click-to-preview panel so the
user sees a letter summarised, then expands to the full text without leaving the
view. Owner-scoped; uses already-stored extractions / ai_summary (no AI call).
"""

import os
import logging

from fastapi import APIRouter, HTTPException, Depends
from api.db import get_db
from api.auth import current_user, CurrentUser
from api.config import NOTES_DIR

router = APIRouter(tags=["Preview"])
log = logging.getLogger(__name__)


@router.get("/preview/{kind}/{item_id}")
def preview(kind: str, item_id: int, user: CurrentUser = Depends(current_user)):
    uid = user["id"]
    conn = get_db()
    cur = conn.cursor()
    try:
        if kind == "document":
            cur.execute("SELECT filename, full_text, ref_number, letter_status, file_type "
                        "FROM documents WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
                        (item_id, uid))
            d = cur.fetchone()
            if not d:
                raise HTTPException(404, "Not found.")
            cur.execute("""
                SELECT subject, event_date, event_time, venue, reply_by, deadline
                FROM extractions WHERE source_type = 'document' AND source_id = %s
                ORDER BY extracted_at DESC LIMIT 1
            """, (item_id,))
            ex = cur.fetchone()
            fields = {}
            if ex:
                if ex["subject"]: fields["subject"] = ex["subject"]
                if ex["venue"]:   fields["venue"] = ex["venue"]
                if ex["event_time"]: fields["time"] = str(ex["event_time"])[:5]
                for k in ("event_date", "reply_by", "deadline"):
                    if ex[k]: fields[k] = ex[k].isoformat()
            return {
                "kind": kind, "id": item_id, "title": d["filename"],
                "summary": (ex["subject"] if ex and ex["subject"] else d["filename"]),
                "fields": fields, "ref_number": d["ref_number"],
                "letter_status": d["letter_status"], "file_type": d["file_type"],
                "body": (d["full_text"] or "")[:8000], "has_image": True,
            }

        if kind == "note":
            cur.execute("SELECT title, ai_summary FROM notes "
                        "WHERE id = %s AND users_id = %s AND status = 'active'", (item_id, uid))
            n = cur.fetchone()
            if not n:
                raise HTTPException(404, "Not found.")
            body = ""
            path = os.path.join(NOTES_DIR, f"{item_id}.md")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    body = f.read()
            return {"kind": kind, "id": item_id, "title": n["title"],
                    "summary": n["ai_summary"] or "", "fields": {},
                    "body": body[:8000], "has_image": False}

        if kind in ("event", "task"):
            table = "events" if kind == "event" else "tasks"
            cur.execute(f"SELECT * FROM {table} WHERE id = %s AND users_id = %s", (item_id, uid))
            r = cur.fetchone()
            if not r:
                raise HTTPException(404, "Not found.")
            fields = {}
            if kind == "event":
                if r["event_date"]: fields["date"] = r["event_date"].isoformat()
                if r.get("venue"): fields["venue"] = r["venue"]
                if r.get("event_time"): fields["time"] = str(r["event_time"])[:5]
            else:
                if r["due_date"]: fields["due"] = r["due_date"].isoformat()
                fields["status"] = r["status"]
                if r.get("priority"): fields["priority"] = r["priority"]
            return {"kind": kind, "id": item_id, "title": r["title"],
                    "summary": "", "fields": fields, "body": "", "has_image": False}

        raise HTTPException(400, "Unsupported kind.")
    finally:
        cur.close()
        conn.close()
