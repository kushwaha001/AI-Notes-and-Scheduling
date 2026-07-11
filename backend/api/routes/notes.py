"""
Notes — FR-5, FR-13, FR-19, FR-28, FR-31, FR-36, FR-38, FR-39.

Design (per FR-38): metadata is keyed per-user in the `notes` table; the
plain-text/Markdown body lives in a file named by the integer note id.
This gives audit-trail references (integer entity_id), per-user keying,
classification tags, search and trash/restore — while keeping the body in
Markdown files as the spec requires.
"""

import os
import shutil
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.config import NOTES_DIR
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Notes"])


def _assert_owned(cur, note_id, user_id):
    """Raise 404 unless the active note belongs to user_id."""
    cur.execute("SELECT 1 FROM notes WHERE id = %s AND users_id = %s AND status = 'active'",
                (note_id, user_id))
    if cur.fetchone() is None:
        raise HTTPException(404, "Note not found.")

VERSIONS_DIR = os.path.join(NOTES_DIR, ".versions")
TRASH_DIR    = os.path.join(NOTES_DIR, ".trash")
os.makedirs(VERSIONS_DIR, exist_ok=True)
os.makedirs(TRASH_DIR, exist_ok=True)


class NotePayload(BaseModel):
    title         : Optional[str] = "Untitled Note"
    content       : str = ""
    classification: Optional[str] = "General"   # FR-36
    # Optional: attach this note to a calendar event or task (from the calendar
    # detail popups). Both must be present together, or both omitted.
    linked_entity_type: Optional[str] = None    # 'event' | 'task'
    linked_entity_id  : Optional[int] = None


def _note_path(note_id) -> str:
    return os.path.join(NOTES_DIR, f"{note_id}.md")


def _versions_path(note_id) -> str:
    p = os.path.join(VERSIONS_DIR, str(note_id))
    os.makedirs(p, exist_ok=True)
    return p


def _snapshot(note_id):
    """FR-39 — copy the current body to version history before overwriting."""
    path = _note_path(note_id)
    if os.path.exists(path):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        shutil.copy2(path, os.path.join(_versions_path(note_id), f"{ts}.md"))


def _write_body(note_id, title, content):
    header = f"# {title}\n\n" if title else ""
    with open(_note_path(note_id), "w", encoding="utf-8") as f:
        f.write(header + content)


def _entity_title(cur, entity_type, entity_id, user_id):
    """Return the title of the linked event/task (owned by the user), or None if
    it isn't a valid, owned entity."""
    if entity_type not in ("event", "task") or not entity_id:
        return None
    table = "events" if entity_type == "event" else "tasks"
    cur.execute(f"SELECT title FROM {table} WHERE id = %s AND users_id = %s",
                (entity_id, user_id))
    row = cur.fetchone()
    return row["title"] if row else None


@router.get("/notes")
def list_notes(classification: Optional[str] = None,
               user: CurrentUser = Depends(current_user)):
    """FR-38 — list active notes (metadata from DB, newest first)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        query = ("SELECT id, title, classification, linked_entity_type, "
                 "linked_entity_id, created_at, ai_summary, ai_tags FROM notes "
                 "WHERE status = 'active' AND users_id = %s")
        params = [user["id"]]
        if classification:
            query += " AND classification = %s"
            params.append(classification)
        query += " ORDER BY created_at DESC"
        cur.execute(query, params)
        rows = cur.fetchall()
        notes = []
        for r in rows:
            path = _note_path(r["id"])
            mtime = (datetime.fromtimestamp(os.stat(path).st_mtime).isoformat()
                     if os.path.exists(path) else r["created_at"].isoformat())
            notes.append({
                "id"                : r["id"],
                "title"             : r["title"],
                "classification"    : r["classification"],
                "modified_at"       : mtime,
                "linked_entity_type": r["linked_entity_type"],
                "linked_entity_id"  : r["linked_entity_id"],
                # human label for the linked event/task (None if it was deleted)
                "linked_entity_title": _entity_title(
                    cur, r["linked_entity_type"], r["linked_entity_id"], user["id"]),
                # AI auto-summary + tags (may be null until generated)
                "summary": r["ai_summary"],
                "tags"   : (r["ai_tags"].split(",") if r["ai_tags"] else []),
            })
        return {"notes": notes}
    finally:
        cur.close()
        conn.close()


def _body_preview(note_id, limit=160):
    """Return a short plaintext preview of a note's body (no title header)."""
    path = _note_path(note_id)
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")
    body = "\n".join(lines[2:]) if lines and lines[0].startswith("#") else "\n".join(lines)
    body = body.strip()
    return body[:limit] + ("…" if len(body) > limit else "")


@router.get("/notes/for/{entity_type}/{entity_id}")
def notes_for_entity(entity_type: str, entity_id: int,
                     user: CurrentUser = Depends(current_user)):
    """Notes attached to a specific event or task (shown in its detail popup)."""
    if entity_type not in ("event", "task"):
        raise HTTPException(400, "entity_type must be 'event' or 'task'.")
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, title, classification, created_at
            FROM notes
            WHERE status = 'active' AND users_id = %s
              AND linked_entity_type = %s AND linked_entity_id = %s
            ORDER BY created_at DESC
        """, (user["id"], entity_type, entity_id))
        notes = [{
            "id"            : r["id"],
            "title"         : r["title"],
            "classification": r["classification"],
            "created_at"    : r["created_at"].isoformat(),
            "preview"       : _body_preview(r["id"]),
        } for r in cur.fetchall()]
        return {"notes": notes}
    finally:
        cur.close()
        conn.close()


@router.get("/notes/{note_id}")
def get_note(note_id: int, user: CurrentUser = Depends(current_user)):
    """FR-38 — read one note's metadata + Markdown body."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM notes WHERE id = %s AND users_id = %s AND status = 'active'",
                    (note_id, user["id"]))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Note not found.")
        path = _note_path(note_id)
        content = ""
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
        return {
            "note_id"       : note_id,
            "title"         : row["title"],
            "classification": row["classification"],
            "content"       : content,
            "summary"       : row.get("ai_summary"),
            "tags"          : (row["ai_tags"].split(",") if row.get("ai_tags") else []),
        }
    finally:
        cur.close()
        conn.close()


@router.post("/notes")
def create_note(note: NotePayload, user: CurrentUser = Depends(current_user)):
    """FR-5 — create a note (DB row + Markdown file + audit). Optionally attaches
    the note to an event/task when linked_entity_type/id are supplied."""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Only accept a link to an event/task the caller actually owns.
        link_type, link_id = None, None
        if note.linked_entity_type and note.linked_entity_id:
            if _entity_title(cur, note.linked_entity_type, note.linked_entity_id, user["id"]) is None:
                raise HTTPException(404, "Linked event/task not found.")
            link_type = note.linked_entity_type
            link_id   = note.linked_entity_id

        cur.execute("""
            INSERT INTO notes (users_id, title, classification, status,
                               linked_entity_type, linked_entity_id)
            VALUES (%s, %s, %s, 'active', %s, %s) RETURNING id
        """, (user["id"], note.title, note.classification or "General",
              link_type, link_id))
        nid = cur.fetchone()["id"]

        _write_body(nid, note.title, note.content)

        cur.execute("INSERT INTO note_versions (note_id, version_number) VALUES (%s, 1)", (nid,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('manual_entry', 'note', %s, %s)
        """, (nid, note.title))
        conn.commit()
        return {"note_id": nid, "title": note.title, "status": "created"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/notes/{note_id}")
def update_note(note_id: int, note: NotePayload,
                user: CurrentUser = Depends(current_user)):
    """FR-38/FR-39 — update body, snapshot prior version, audit the edit."""
    conn = get_db()
    cur = conn.cursor()
    try:
        _assert_owned(cur, note_id, user["id"])

        _snapshot(note_id)                       # FR-39 version history
        _write_body(note_id, note.title, note.content)

        cur.execute(
            "UPDATE notes SET title = %s, classification = %s WHERE id = %s",
            (note.title, note.classification or "General", note_id),
        )
        cur.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 AS v FROM note_versions WHERE note_id = %s",
            (note_id,),
        )
        v = cur.fetchone()["v"]
        cur.execute(
            "INSERT INTO note_versions (note_id, version_number) VALUES (%s, %s)",
            (note_id, v),
        )
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('edited', 'note', %s, %s)
        """, (note_id, note.title))
        conn.commit()
        return {"note_id": note_id, "status": "updated", "version": v}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/notes/{note_id}/versions")
def list_versions(note_id: int, user: CurrentUser = Depends(current_user)):
    """FR-39 — list saved versions of a note (newest first)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        _assert_owned(cur, note_id, user["id"])
    finally:
        cur.close()
        conn.close()
    vdir = os.path.join(VERSIONS_DIR, str(note_id))
    versions = []
    if os.path.isdir(vdir):
        for fname in sorted(os.listdir(vdir), reverse=True):
            if not fname.endswith(".md"):
                continue
            stamp = fname[:-3]
            try:
                saved_at = datetime.strptime(stamp[:15], "%Y%m%d_%H%M%S").isoformat()
            except ValueError:
                saved_at = stamp
            versions.append({"version": stamp, "saved_at": saved_at})
    return {"note_id": note_id, "versions": versions}


@router.get("/notes/{note_id}/versions/{version}")
def get_version(note_id: int, version: str,
                user: CurrentUser = Depends(current_user)):
    """FR-39 — read the content of a specific historical version."""
    conn = get_db()
    cur = conn.cursor()
    try:
        _assert_owned(cur, note_id, user["id"])
    finally:
        cur.close()
        conn.close()
    vpath = os.path.join(VERSIONS_DIR, str(note_id), f"{version}.md")
    if not os.path.exists(vpath):
        raise HTTPException(404, "Version not found.")
    with open(vpath, "r", encoding="utf-8") as f:
        content = f.read()
    return {"note_id": note_id, "version": version, "content": content}


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, user: CurrentUser = Depends(current_user)):
    """FR-19 — soft delete: mark trashed, move file to trash, audit."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE notes SET status = 'trashed', deleted_at = NOW() "
            "WHERE id = %s AND users_id = %s AND status = 'active' RETURNING title",
            (note_id, user["id"]),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Note not found.")

        src = _note_path(note_id)
        if os.path.exists(src):
            shutil.move(src, os.path.join(TRASH_DIR, f"{note_id}.md"))

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'note', %s, 'Soft deleted by user')
        """, (note_id,))
        conn.commit()
        return {"note_id": note_id, "status": "trashed"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/notes/{note_id}/summarize")
def summarize_note(note_id: int, user: CurrentUser = Depends(current_user)):
    """Generate (or refresh) the note's AI one-line summary + topic tags with the
    local LLM, store them, and return them. Best-effort — returns empties when the
    LLM is offline, and never fails the request (NFR-9)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        _assert_owned(cur, note_id, user["id"])

        content = ""
        path = _note_path(note_id)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

        from api.ai.summarize import summarize_and_tag
        st = summarize_and_tag(content)

        cur.execute(
            "UPDATE notes SET ai_summary = %s, ai_tags = %s WHERE id = %s",
            (st["summary"] or None, ",".join(st["tags"]) or None, note_id),
        )
        conn.commit()
        return {"note_id": note_id, "summary": st["summary"], "tags": st["tags"]}
    finally:
        cur.close()
        conn.close()


@router.post("/notes/{note_id}/schedule")
def schedule_note(note_id: int, user: CurrentUser = Depends(current_user)):
    """Extract the tasks/events implied by a note (local LLM), for the user to
    review and add. Nothing is saved here — the frontend confirms each item."""
    conn = get_db()
    cur = conn.cursor()
    content = ""
    try:
        _assert_owned(cur, note_id, user["id"])
        path = _note_path(note_id)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
    finally:
        cur.close()
        conn.close()

    from api.ai.generate import extract_actions
    items = extract_actions(content)
    return {"note_id": note_id, "items": items,
            "message": "" if items else "No tasks or events found in this note."}
