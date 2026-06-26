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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.config import NOTES_DIR
from api.db import get_db

router = APIRouter(tags=["Notes"])

VERSIONS_DIR = os.path.join(NOTES_DIR, ".versions")
TRASH_DIR    = os.path.join(NOTES_DIR, ".trash")
os.makedirs(VERSIONS_DIR, exist_ok=True)
os.makedirs(TRASH_DIR, exist_ok=True)


class NotePayload(BaseModel):
    title         : Optional[str] = "Untitled Note"
    content       : str = ""
    classification: Optional[str] = "General"   # FR-36


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


@router.get("/notes")
def list_notes(classification: Optional[str] = None):
    """FR-38 — list active notes (metadata from DB, newest first)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        query = "SELECT id, title, classification, created_at FROM notes WHERE status = 'active'"
        params = []
        if classification:
            query += " AND classification = %s"
            params.append(classification)
        query += " ORDER BY created_at DESC"
        cur.execute(query, params)
        notes = []
        for r in cur.fetchall():
            path = _note_path(r["id"])
            mtime = (datetime.fromtimestamp(os.stat(path).st_mtime).isoformat()
                     if os.path.exists(path) else r["created_at"].isoformat())
            notes.append({
                "id"            : r["id"],
                "title"         : r["title"],
                "classification": r["classification"],
                "modified_at"   : mtime,
            })
        return {"notes": notes}
    finally:
        cur.close()
        conn.close()


@router.get("/notes/{note_id}")
def get_note(note_id: int):
    """FR-38 — read one note's metadata + Markdown body."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM notes WHERE id = %s AND status = 'active'", (note_id,))
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
        }
    finally:
        cur.close()
        conn.close()


@router.post("/notes")
def create_note(note: NotePayload):
    """FR-5 — create a note (DB row + Markdown file + audit)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO notes (users_id, title, classification, status)
            VALUES (1, %s, %s, 'active') RETURNING id
        """, (note.title, note.classification or "General"))
        nid = cur.fetchone()["id"]

        _write_body(nid, note.title, note.content)

        cur.execute("INSERT INTO note_versions (note_id, version_number) VALUES (%s, 1)", (nid,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('manual_entry', 'note', %s, %s)
        """, (nid, note.title))
        conn.commit()
        return {"note_id": nid, "title": note.title, "status": "created"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/notes/{note_id}")
def update_note(note_id: int, note: NotePayload):
    """FR-38/FR-39 — update body, snapshot prior version, audit the edit."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM notes WHERE id = %s AND status = 'active'", (note_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Note not found.")

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
def list_versions(note_id: int):
    """FR-39 — list saved versions of a note (newest first)."""
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
def get_version(note_id: int, version: str):
    """FR-39 — read the content of a specific historical version."""
    vpath = os.path.join(VERSIONS_DIR, str(note_id), f"{version}.md")
    if not os.path.exists(vpath):
        raise HTTPException(404, "Version not found.")
    with open(vpath, "r", encoding="utf-8") as f:
        content = f.read()
    return {"note_id": note_id, "version": version, "content": content}


@router.delete("/notes/{note_id}")
def delete_note(note_id: int):
    """FR-19 — soft delete: mark trashed, move file to trash, audit."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE notes SET status = 'trashed', deleted_at = NOW() "
            "WHERE id = %s AND status = 'active' RETURNING title",
            (note_id,),
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


@router.post("/notes/{note_id}/schedule")
def schedule_note(note_id: int):
    """Q4 — convert note into task/event via LLM extraction (AI not yet wired)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM notes WHERE id = %s AND status = 'active'", (note_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Note not found.")
    finally:
        cur.close()
        conn.close()
    return {
        "job_id"     : "",
        "extractions": [],
        "message"    : "AI extraction not yet configured. Use manual event/task creation.",
    }
