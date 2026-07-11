"""
FR-25 — "Soft" links: AI-suggested relationships between content items.

Unlike FR-24 hard links (exact reference-number match, applied automatically),
soft links are *suggestions* derived from semantic similarity via the embedding
model. They are NEVER applied automatically — the user accepts or rejects each.

Flow:
  GET  /links/suggestions/{kind}/{id}  -> live similarity suggestions
  POST /links/accept                   -> user confirms a suggestion
  POST /links/reject                   -> user dismisses it (won't resurface)
  GET  /links/{kind}/{id}              -> accepted related items, for display

Degrades gracefully (NFR-9): if the embedding/vector service is down, suggestions
return empty rather than erroring.
"""

import os
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.config import NOTES_DIR
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Links"])
log = logging.getLogger(__name__)


class LinkDecision(BaseModel):
    a_kind: str
    a_id  : int
    b_kind: str
    b_id  : int


def _canonical(a_kind, a_id, b_kind, b_id):
    """Order a pair deterministically so (note,5)+(note,3) == (note,3)+(note,5)
    and matches the UNIQUE constraint regardless of which side asks."""
    if (a_kind, a_id) <= (b_kind, b_id):
        return a_kind, a_id, b_kind, b_id
    return b_kind, b_id, a_kind, a_id


def _owns(kind: str, item_id: int, user_id: int) -> bool:
    """True if the given note/document belongs to user_id."""
    table = {"document": "documents", "note": "notes"}.get(kind)
    if not table:
        return False
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute(f"SELECT 1 FROM {table} WHERE id = %s AND users_id = %s",
                    (item_id, user_id))
        return cur.fetchone() is not None
    finally:
        cur.close(); conn.close()


def _item_text(kind: str, item_id: int, user_id: int):
    """Return (title, text) for a note or document owned by user_id, else (None, None)."""
    if kind == "document":
        conn = get_db(); cur = conn.cursor()
        try:
            cur.execute(
                "SELECT filename, full_text FROM documents "
                "WHERE id = %s AND users_id = %s AND status != 'trashed'",
                (item_id, user_id))
            row = cur.fetchone()
            return (row["filename"], row["full_text"]) if row else (None, None)
        finally:
            cur.close(); conn.close()
    if kind == "note":
        if not _owns("note", item_id, user_id):
            return (None, None)
        path = os.path.join(NOTES_DIR, f"{item_id}.md")
        if not os.path.isfile(path):
            return (None, None)
        with open(path, "r", encoding="utf-8") as f:
            body = f.read()
        first = body.splitlines()[0] if body.splitlines() else f"Note {item_id}"
        title = first.lstrip("#").strip() or f"Note {item_id}"
        return (title, body)
    return (None, None)


@router.get("/links/suggestions/{kind}/{item_id}")
def suggestions(kind: str, item_id: int, top_k: int = 5,
                user: CurrentUser = Depends(current_user)):
    """FR-25 — semantically related items the user might want to link."""
    title, text = _item_text(kind, item_id, user["id"])
    if not text:
        return {"suggestions": []}

    try:
        from api.ai.embeddings import embed_available
        from api.ai.vectorstore import search
        if not embed_available():
            return {"suggestions": [], "reason": "embedding model offline"}
        hits = search(text[:2000], top_k=top_k + 6, user_id=user["id"])
    except Exception as e:
        log.warning("Soft-link search failed: %s", e)
        return {"suggestions": [], "reason": "vector store unavailable"}

    # Already-decided pairs shouldn't be re-suggested.
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a_kind, a_id, b_kind, b_id, status FROM soft_links
            WHERE (a_kind = %s AND a_id = %s) OR (b_kind = %s AND b_id = %s)
        """, (kind, item_id, kind, item_id))
        decided = {}
        for r in cur.fetchall():
            other = (r["b_kind"], r["b_id"]) if (r["a_kind"], r["a_id"]) == (kind, item_id) else (r["a_kind"], r["a_id"])
            decided[other] = r["status"]
    finally:
        cur.close(); conn.close()

    # Group chunk hits back to their parent item, keep best score, drop self.
    best = {}
    for h in hits:
        hk, hid = h.get("kind"), h.get("item_id")
        if not hk or hid is None:
            continue
        try:
            hid = int(hid)
        except (TypeError, ValueError):
            continue
        if (hk, hid) == (kind, item_id):
            continue
        if decided.get((hk, hid)) in ("accepted", "rejected"):
            continue
        if (hk, hid) not in best or h["score"] > best[(hk, hid)]["score"]:
            best[(hk, hid)] = {"kind": hk, "id": hid, "title": h.get("title", ""), "score": round(float(h["score"]), 3)}

    out = sorted(best.values(), key=lambda x: x["score"], reverse=True)[:top_k]
    return {"source": {"kind": kind, "id": item_id, "title": title}, "suggestions": out}


@router.post("/links/accept")
def accept(d: LinkDecision, user: CurrentUser = Depends(current_user)):
    """User confirms a suggested link (FR-25)."""
    if not (_owns(d.a_kind, d.a_id, user["id"]) and _owns(d.b_kind, d.b_id, user["id"])):
        raise HTTPException(404, "Item not found.")
    a_kind, a_id, b_kind, b_id = _canonical(d.a_kind, d.a_id, d.b_kind, d.b_id)
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO soft_links (a_kind, a_id, b_kind, b_id, status, decided_at)
            VALUES (%s, %s, %s, %s, 'accepted', NOW())
            ON CONFLICT (a_kind, a_id, b_kind, b_id)
            DO UPDATE SET status = 'accepted', decided_at = NOW()
        """, (a_kind, a_id, b_kind, b_id))
        conn.commit()
        return {"status": "accepted"}
    finally:
        cur.close(); conn.close()


@router.post("/links/reject")
def reject(d: LinkDecision, user: CurrentUser = Depends(current_user)):
    """User dismisses a suggestion — it won't be suggested again (FR-25)."""
    if not (_owns(d.a_kind, d.a_id, user["id"]) and _owns(d.b_kind, d.b_id, user["id"])):
        raise HTTPException(404, "Item not found.")
    a_kind, a_id, b_kind, b_id = _canonical(d.a_kind, d.a_id, d.b_kind, d.b_id)
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO soft_links (a_kind, a_id, b_kind, b_id, status, decided_at)
            VALUES (%s, %s, %s, %s, 'rejected', NOW())
            ON CONFLICT (a_kind, a_id, b_kind, b_id)
            DO UPDATE SET status = 'rejected', decided_at = NOW()
        """, (a_kind, a_id, b_kind, b_id))
        conn.commit()
        return {"status": "rejected"}
    finally:
        cur.close(); conn.close()


@router.get("/links/{kind}/{item_id}")
def accepted_links(kind: str, item_id: int,
                   user: CurrentUser = Depends(current_user)):
    """Accepted soft links for an item, resolved to titles for display."""
    if not _owns(kind, item_id, user["id"]):
        raise HTTPException(404, "Item not found.")
    conn = get_db(); cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a_kind, a_id, b_kind, b_id FROM soft_links
            WHERE status = 'accepted'
              AND ((a_kind = %s AND a_id = %s) OR (b_kind = %s AND b_id = %s))
        """, (kind, item_id, kind, item_id))
        rows = cur.fetchall()
    finally:
        cur.close(); conn.close()

    linked = []
    for r in rows:
        other = (r["b_kind"], r["b_id"]) if (r["a_kind"], r["a_id"]) == (kind, item_id) else (r["a_kind"], r["a_id"])
        title, _ = _item_text(other[0], other[1], user["id"])
        linked.append({"kind": other[0], "id": other[1], "title": title or f"{other[0]} {other[1]}"})
    return {"linked": linked}
