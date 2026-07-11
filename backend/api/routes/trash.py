"""
FR-19 — Trash / soft delete with restore and timed purge.
No hard delete from the UI; the timed purge (default 30 days) is the only
permanent-removal path. Covers events, tasks, documents (DB) and notes (files).
"""

import os
import shutil
from fastapi import APIRouter, HTTPException, Depends
from api.db import get_db
from api.config import NOTES_DIR
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Trash"])

TRASH_DIR = os.path.join(NOTES_DIR, ".trash")
os.makedirs(TRASH_DIR, exist_ok=True)

PURGE_DAYS = 30  # configurable retention before permanent removal


@router.get("/trash")
def list_trash(user: CurrentUser = Depends(current_user)):
    """Unified listing of everything currently in trash."""
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    try:
        cur.execute("""
            SELECT id, title, event_date, deleted_at
            FROM events WHERE status = 'trashed' AND deleted_at IS NOT NULL AND users_id = %s
            ORDER BY deleted_at DESC
        """, (uid,))
        events = cur.fetchall()

        cur.execute("""
            SELECT id, title, due_date, deleted_at
            FROM tasks WHERE status = 'trashed' AND deleted_at IS NOT NULL AND users_id = %s
            ORDER BY deleted_at DESC
        """, (uid,))
        tasks = cur.fetchall()

        cur.execute("""
            SELECT id, filename, file_type, deleted_at
            FROM documents WHERE status = 'trashed' AND deleted_at IS NOT NULL AND users_id = %s
            ORDER BY deleted_at DESC
        """, (uid,))
        documents = cur.fetchall()

        # Notes — DB-backed metadata, body in NOTES_DIR/.trash
        cur.execute("""
            SELECT id, title, classification, deleted_at
            FROM notes WHERE status = 'trashed' AND deleted_at IS NOT NULL AND users_id = %s
            ORDER BY deleted_at DESC
        """, (uid,))
        notes = cur.fetchall()

        return {
            "events": events,
            "tasks": tasks,
            "documents": documents,
            "notes": notes,
            "purge_after_days": PURGE_DAYS,
        }
    finally:
        cur.close()
        conn.close()


@router.post("/trash/{entity_type}/{entity_id}/restore")
def restore_item(entity_type: str, entity_id: str,
                 user: CurrentUser = Depends(current_user)):
    """FR-19 — restore an item from trash to its active state."""
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    try:
        eid = int(entity_id)

        if entity_type == "note":
            cur.execute(
                "UPDATE notes SET status = 'active', deleted_at = NULL "
                "WHERE id = %s AND status = 'trashed' AND users_id = %s RETURNING id",
                (eid, uid),
            )
            if not cur.fetchone():
                raise HTTPException(404, "Trashed note not found.")
            src = os.path.join(TRASH_DIR, f"{eid}.md")
            dst = os.path.join(NOTES_DIR, f"{eid}.md")
            if os.path.exists(src):
                shutil.move(src, dst)
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('restored', 'note', %s, 'Restored from trash')
            """, (eid,))
            conn.commit()
            return {"status": "restored", "entity_type": "note", "id": eid}

        restore_map = {
            "event":    ("events",    "upcoming"),
            "task":     ("tasks",     "open"),
            "document": ("documents", "done"),
        }
        if entity_type not in restore_map:
            raise HTTPException(400, f"Unknown entity type '{entity_type}'.")
        table, active_status = restore_map[entity_type]

        cur.execute(
            f"UPDATE {table} SET status = %s, deleted_at = NULL "
            f"WHERE id = %s AND status = 'trashed' AND users_id = %s RETURNING id",
            (active_status, eid, uid),
        )
        if not cur.fetchone():
            raise HTTPException(404, f"Trashed {entity_type} not found.")

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('restored', %s, %s, 'Restored from trash')
        """, (entity_type, eid))
        conn.commit()
        return {"status": "restored", "entity_type": entity_type, "id": eid}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/trash/{entity_type}/{entity_id}")
def purge_item(entity_type: str, entity_id: str,
               user: CurrentUser = Depends(current_user)):
    """Permanent removal from trash (the only hard-delete path)."""
    conn = get_db()
    cur = conn.cursor()
    uid = user["id"]
    try:
        eid = int(entity_id)

        if entity_type == "note":
            # Verify ownership before touching files or the DB row.
            cur.execute("SELECT 1 FROM notes WHERE id = %s AND users_id = %s AND status = 'trashed'",
                        (eid, uid))
            if cur.fetchone() is None:
                raise HTTPException(404, "Trashed note not found.")
            # remove trashed body + version snapshots, then the DB row
            for p in (
                os.path.join(TRASH_DIR, f"{eid}.md"),
                os.path.join(NOTES_DIR, f"{eid}.md"),
            ):
                if os.path.exists(p):
                    os.remove(p)
            vdir = os.path.join(NOTES_DIR, ".versions", str(eid))
            if os.path.isdir(vdir):
                shutil.rmtree(vdir, ignore_errors=True)
            cur.execute("DELETE FROM notes WHERE id = %s AND users_id = %s AND status = 'trashed'",
                        (eid, uid))
            cur.execute("""
                INSERT INTO audit_log (action, entity_type, entity_id, detail)
                VALUES ('purged', 'note', %s, 'Permanently removed from trash')
            """, (eid,))
            conn.commit()
            return {"status": "purged", "entity_type": "note", "id": eid}

        table = {"event": "events", "task": "tasks", "document": "documents"}.get(entity_type)
        if not table:
            raise HTTPException(400, f"Unknown entity type '{entity_type}'.")
        cur.execute(f"DELETE FROM {table} WHERE id = %s AND users_id = %s AND status = 'trashed'",
                    (eid, uid))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('purged', %s, %s, 'Permanently removed from trash')
        """, (entity_type, eid))
        conn.commit()
        return {"status": "purged", "entity_type": entity_type, "id": eid}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/trash/purge-expired")
def purge_expired(user: CurrentUser = Depends(current_user)):
    """FR-19 — purge items trashed longer than the retention window."""
    conn = get_db()
    cur = conn.cursor()
    try:
        purged = {}
        for entity_type, table in (("event", "events"), ("task", "tasks"), ("document", "documents")):
            cur.execute(
                f"DELETE FROM {table} "
                f"WHERE status = 'trashed' "
                f"  AND deleted_at < NOW() - INTERVAL '{PURGE_DAYS} days' "
                f"  AND users_id = %s "
                f"RETURNING id",
                (user["id"],),
            )
            purged[entity_type] = len(cur.fetchall())
        conn.commit()
        return {"status": "ok", "purged": purged, "retention_days": PURGE_DAYS}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
