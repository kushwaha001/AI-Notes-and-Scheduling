"""
Connections / backlinks — everything linked to one item, in one place.

Merges three relationship sources (no AI, deterministic):
  • source links   — linked_documents (a letter is the source of its events/tasks/
                     notes; conversely an event/task/note came *from* a letter)
  • soft links     — accepted semantic links between documents/notes (FR-25)
  • reference thread — documents sharing the same reference number or file series

Powers the 'Connections' panel + the mini graph on detail views. Read-only and
owner-scoped: only the caller's own items are returned.
"""

import logging
from fastapi import APIRouter, HTTPException, Depends

from api.db import get_db
from api.auth import current_user, CurrentUser
from api.routes.documents import _ref_series

router = APIRouter(tags=["Connections"])
log = logging.getLogger(__name__)

_KINDS = {"document", "note", "event", "task", "audio"}
_TABLE = {
    "document": ("documents", "filename"),
    "event":    ("events", "title"),
    "task":     ("tasks", "title"),
    "note":     ("notes", "title"),
    "audio":    ("audio", "file_path"),
}


def _title(cur, kind, item_id, uid):
    """Owned item's display title, or None when it isn't the caller's / doesn't exist."""
    spec = _TABLE.get(kind)
    if not spec:
        return None
    table, col = spec
    cur.execute(f"SELECT {col} AS t FROM {table} WHERE id = %s AND users_id = %s", (item_id, uid))
    r = cur.fetchone()
    return r["t"] if r else None


@router.get("/connections/{kind}/{item_id}")
def connections(kind: str, item_id: int, user: CurrentUser = Depends(current_user)):
    if kind not in _KINDS:
        raise HTTPException(400, "Unsupported kind.")
    uid = user["id"]
    conn = get_db()
    cur = conn.cursor()
    out, seen = [], set()

    def add(k, i, title, relation):
        key = (k, i)
        if key in seen or (k == kind and i == item_id):
            return
        t = title if title is not None else _title(cur, k, i, uid)
        if t is None:       # not owned / deleted → skip
            return
        seen.add(key)
        out.append({"kind": k, "id": i, "title": t, "relation": relation})

    try:
        center_title = _title(cur, kind, item_id, uid)
        if center_title is None:
            raise HTTPException(404, "Item not found.")

        # 1 — source links (linked_documents), both directions
        if kind in ("document", "audio"):
            cur.execute("SELECT entity_type, entity_id FROM linked_documents "
                        "WHERE source_type = %s AND source_id = %s", (kind, item_id))
            for r in cur.fetchall():
                add(r["entity_type"], r["entity_id"], None, "source of")
        else:
            cur.execute("SELECT source_type, source_id FROM linked_documents "
                        "WHERE entity_type = %s AND entity_id = %s", (kind, item_id))
            for r in cur.fetchall():
                add(r["source_type"], r["source_id"], None, "from letter")

        # 2 — accepted soft links (documents/notes)
        if kind in ("document", "note"):
            cur.execute("""
                SELECT a_kind, a_id, b_kind, b_id FROM soft_links
                WHERE status = 'accepted'
                  AND ((a_kind = %s AND a_id = %s) OR (b_kind = %s AND b_id = %s))
            """, (kind, item_id, kind, item_id))
            for r in cur.fetchall():
                other = (r["b_kind"], r["b_id"]) if (r["a_kind"], r["a_id"]) == (kind, item_id) else (r["a_kind"], r["a_id"])
                add(other[0], other[1], None, "linked")

        # 3 — reference-number thread (documents)
        if kind == "document":
            cur.execute("SELECT ref_number FROM documents WHERE id = %s AND users_id = %s", (item_id, uid))
            row = cur.fetchone()
            ref = row["ref_number"] if row else None
            if ref:
                cur.execute("""
                    SELECT id, filename FROM documents
                    WHERE users_id = %s AND id <> %s AND deleted_at IS NULL AND ref_number = %s
                """, (uid, item_id, ref))
                for r in cur.fetchall():
                    add("document", r["id"], r["filename"], "same reference")
                series = _ref_series(ref)
                if series and series != ref:
                    cur.execute("""
                        SELECT id, filename FROM documents
                        WHERE users_id = %s AND id <> %s AND deleted_at IS NULL AND ref_number LIKE %s
                    """, (uid, item_id, series + "/%"))
                    for r in cur.fetchall():
                        add("document", r["id"], r["filename"], "same series")
    finally:
        cur.close()
        conn.close()

    return {"center": {"kind": kind, "id": item_id, "title": center_title},
            "connections": out}
