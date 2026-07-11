"""
FR-39 — Automated local backup (Dev Lan, no cloud safety net).

Exports the database tables to JSON and copies the Markdown notes into a
timestamped folder under backend/backups/. Records the time so the Status page
(FR-41) can show the last successful backup.
"""

import os
import json
import shutil
import logging
from datetime import datetime, date, time

from fastapi import APIRouter, HTTPException, Depends

from api.db import get_db
from api.auth import require_admin, CurrentUser
from api.config import BASE_DIR, NOTES_DIR

router = APIRouter(tags=["Backup"])
log = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(BASE_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

_TABLES = ["users", "documents", "extractions", "events", "event_recurrence",
           "tasks", "notes", "note_versions", "linked_documents", "soft_links",
           "reminders", "processing_queue", "audit_log"]


def _json_default(o):
    if isinstance(o, (datetime, date, time)):
        return str(o)
    return str(o)


def _run_backup():
    """Export DB tables + notes to a timestamped folder. Returns (dest, count)."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUP_DIR, ts)
    os.makedirs(dest, exist_ok=True)

    conn = get_db()
    cur = conn.cursor()
    count = 0
    try:
        for table in _TABLES:
            cur.execute(f"SELECT * FROM {table}")
            rows = cur.fetchall()
            count += len(rows)
            with open(os.path.join(dest, f"{table}.json"), "w", encoding="utf-8") as f:
                json.dump(rows, f, default=_json_default, ensure_ascii=False, indent=2)

        # copy the Markdown notes (excluding internal version/trash folders)
        if os.path.isdir(NOTES_DIR):
            shutil.copytree(NOTES_DIR, os.path.join(dest, "notes"),
                            ignore=shutil.ignore_patterns(".versions", ".trash"))

        cur.execute("INSERT INTO backups (path, item_count) VALUES (%s, %s)", (dest, count))
        cur.execute("SELECT id FROM system_status LIMIT 1")
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE system_status SET last_backup_at = NOW() WHERE id = %s", (row["id"],))
        else:
            cur.execute("INSERT INTO system_status (model_loaded, last_backup_at) VALUES (FALSE, NOW())")
        conn.commit()
        return dest, count
    finally:
        cur.close()
        conn.close()


def auto_backup_if_due(max_age_hours: int = 24):
    """FR-39 — called at startup. Runs a backup only if the newest one is older
    than max_age_hours (or none exists), so the app keeps a fresh local snapshot
    without piling up a backup on every restart. Never raises."""
    try:
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute("""
                SELECT 1 FROM backups
                WHERE created_at > NOW() - (%s * INTERVAL '1 hour')
                LIMIT 1
            """, (max_age_hours,))
            recent = cur.fetchone()
        finally:
            cur.close()
            conn.close()
        if recent:
            return
        dest, count = _run_backup()
        log.info("Auto-backup created: %s (%s rows)", dest, count)
    except Exception as e:
        log.warning("Auto-backup skipped: %s", e)


@router.post("/backup")
def create_backup(admin: CurrentUser = Depends(require_admin)):
    """Run a backup now."""
    try:
        dest, count = _run_backup()
        return {"status": "ok", "path": dest, "rows": count}
    except Exception as e:
        log.error("Backup failed: %s", e)
        raise HTTPException(500, str(e))


@router.get("/backup/last")
def last_backup(admin: CurrentUser = Depends(require_admin)):
    """Last successful backup + total count (for the Status page)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT path, item_count, created_at FROM backups ORDER BY created_at DESC LIMIT 1")
        last = cur.fetchone()
        cur.execute("SELECT COUNT(*) AS n FROM backups")
        total = cur.fetchone()["n"]
        return {"last": last, "total": total}
    finally:
        cur.close()
        conn.close()
