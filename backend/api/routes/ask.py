"""
FR-29/30/31 — Ask your documents & notes (RAG).

Embeds the question, retrieves the most relevant chunks from Qdrant, and asks the
local model to answer using ONLY that context, with citations. Also exposes a
reindex endpoint to (re)build the vector index from existing content.
"""

import os
import json
import time
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from api.db import get_db
from api.auth import current_user, CurrentUser
from api.config import NOTES_DIR
from api.ai.llm import generate_json, generate_text

router = APIRouter(tags=["Ask"])
log = logging.getLogger(__name__)

# Simple in-process answer cache (efficiency). Schedule answers are dynamic so
# they're never cached. Invalidated on reindex.
_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 600  # seconds


def _cache_get(key):
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < _CACHE_TTL:
        return hit[1]
    _CACHE.pop(key, None)
    return None


def _cache_put(key, value):
    if len(_CACHE) > 200:
        _CACHE.clear()
    _CACHE[key] = (time.time(), value)


class AskRequest(BaseModel):
    q: str
    top_k: int = 5


class SimilarRequest(BaseModel):
    text: str
    top_k: int = 4
    exclude_kind: str | None = None
    exclude_id: str | None = None


def _route_question(question: str) -> dict:
    """FR-32 query router — schedule (calendar/DB) vs content (RAG)."""
    today = date.today().isoformat()
    prompt = (
        f"Today is {today}. Decide if the question is about the user's CALENDAR/SCHEDULE "
        f"(meetings, events, what's on, what's due, dates) or about document CONTENT.\n"
        f'Return strict JSON: {{"type":"schedule"|"content","from_date":"YYYY-MM-DD"|null,'
        f'"to_date":"YYYY-MM-DD"|null}}. For schedule questions, give the date range.\n'
        f"Question: {question}"
    )
    try:
        data = json.loads(generate_json(prompt, max_tokens=200))
        return data if isinstance(data, dict) else {"type": "content"}
    except Exception:
        return {"type": "content"}


def _answer_schedule(question: str, route: dict, user_id: int) -> dict:
    """FR-29 — answer schedule questions exactly from the database (never AI
    recall). Merges calendar MEETINGS (event_date) and task DEADLINES / reply-by
    dates (due_date), presented in CHRONOLOGICAL order. Recognises "what's
    overdue?" and lists only open items whose date has already passed."""
    today = date.today()
    ql = question.lower()
    overdue = any(w in ql for w in ("overdue", "over due", "past due", "past-due",
                                    "late", "missed", "behind"))
    frm = route.get("from_date")
    to  = route.get("to_date")

    conn = get_db(); cur = conn.cursor()
    try:
        if overdue:
            # Overdue = open task deadlines / reply-bys whose date is before today.
            cur.execute(
                "SELECT title, due_date, is_reply_task, status FROM tasks "
                "WHERE status = 'open' AND due_date IS NOT NULL AND due_date < %s "
                "AND users_id = %s ORDER BY due_date", (today, user_id))
            events, tasks = [], cur.fetchall()
        else:
            eq = ("SELECT title, event_date, event_time, venue FROM events "
                  "WHERE status != 'trashed' AND users_id = %s")
            ep = [user_id]
            if frm: eq += " AND event_date >= %s"; ep.append(frm)
            if to:  eq += " AND event_date <= %s"; ep.append(to)
            cur.execute(eq, ep); events = cur.fetchall()

            tq = ("SELECT title, due_date, is_reply_task, status FROM tasks "
                  "WHERE status != 'trashed' AND due_date IS NOT NULL AND users_id = %s")
            tp = [user_id]
            if frm: tq += " AND due_date >= %s"; tp.append(frm)
            if to:  tq += " AND due_date <= %s"; tp.append(to)
            cur.execute(tq, tp); tasks = cur.fetchall()
    finally:
        cur.close(); conn.close()

    def dmy(d):
        s = str(d).split("-")
        return f"{s[2]}/{s[1]}/{s[0]}" if len(s) == 3 else str(d)

    # Build one list keyed by (date, time) so everything reads in date order.
    items = []
    for r in events:
        tstr = str(r["event_time"])[:5] if r["event_time"] else None
        t = f" at {tstr}" if tstr else ""
        v = f" ({r['venue']})" if r["venue"] else ""
        items.append((str(r["event_date"]), tstr or "00:00",
                      f"- 📅 {dmy(r['event_date'])}{t} — {r['title']}{v}"))
    for r in tasks:
        kind = "reply due" if r["is_reply_task"] else "due"
        flag = " ⚠ overdue" if (str(r["due_date"]) < today.isoformat()
                                and r["status"] == "open") else ""
        done = " (done)" if r["status"] == "done" else ""
        items.append((str(r["due_date"]), "23:59",
                      f"- ✅ {dmy(r['due_date'])} — {r['title']} ({kind}){flag}{done}"))

    items.sort(key=lambda x: (x[0], x[1]))     # chronological

    if not items:
        ans = ("Nothing overdue — you're all caught up." if overdue
               else "Nothing scheduled or due in that period — no meetings and no task deadlines.")
    else:
        head = "Overdue items:" if overdue else "Here's what's on, in date order:"
        ans = head + "\n" + "\n".join(x[2] for x in items)

    return {"answer": ans, "sources": [], "query": question, "mode": "schedule"}


_RAG_PROMPT = """You are a helpful assistant answering questions about the user's own documents and notes.
Use ONLY the context below. If the answer is not in the context, say you don't know.
Cite the sources you used like [1], [2].

CONTEXT:
{context}

QUESTION: {question}

ANSWER:"""


@router.post("/ask")
def ask(req: AskRequest, user: CurrentUser = Depends(current_user)):
    """FR-29/30/32 — route to a DB schedule answer or a RAG content answer."""
    from api.ai.embeddings import embed_available
    from api.ai.vectorstore import search

    # FR-32 — schedule questions are answered from the calendar DB, never recall
    route = _route_question(req.q)
    if route.get("type") == "schedule":
        return _answer_schedule(req.q, route, user["id"])

    if not embed_available():
        raise HTTPException(
            503,
            "Embedding server not reachable. Check EMBED_BASE_URL / EMBED_MODEL."
        )

    # Efficiency — return a cached answer for a repeated question.
    # Cache key is per-user so answers never leak across users.
    cache_key = f"{user['id']}:{req.q.strip().lower()}"
    cached = _cache_get(cache_key)
    if cached:
        return {**cached, "cached": True}

    hits = search(req.q, req.top_k, user_id=user["id"])
    if not hits:
        return {"answer": "I couldn't find anything relevant in your documents or notes.",
                "sources": [], "query": req.q}

    context = "\n\n".join(f"[{i + 1}] {h.get('title') or h.get('kind')}: {h['text']}"
                          for i, h in enumerate(hits))
    prompt = _RAG_PROMPT.format(context=context, question=req.q)

    try:
        answer = generate_text(prompt, temperature=0.2).strip()
    except Exception as e:
        raise HTTPException(503, f"Model error: {e}")

    # de-duplicate sources by item
    seen, sources = set(), []
    for i, h in enumerate(hits):
        key = (h.get("kind"), h.get("item_id"))
        if key in seen:
            continue
        seen.add(key)
        sources.append({
            "n": i + 1, "kind": h.get("kind"), "item_id": h.get("item_id"),
            "title": h.get("title"), "score": round(h.get("score", 0), 3),
        })

    result = {"answer": answer, "sources": sources, "query": req.q}
    _cache_put(cache_key, result)
    return result


@router.post("/ask/similar")
def similar(req: SimilarRequest, user: CurrentUser = Depends(current_user)):
    """FR-25 — soft suggestions: semantically similar notes/documents (suggestions
    only; the user decides). Never auto-applied."""
    from api.ai.embeddings import embed_available
    from api.ai.vectorstore import search
    if not embed_available() or not req.text.strip():
        return {"suggestions": []}

    hits = search(req.text, req.top_k + 3, user_id=user["id"])
    out, seen = [], set()
    for h in hits:
        kind, item_id = h.get("kind"), str(h.get("item_id"))
        if req.exclude_kind == kind and req.exclude_id == item_id:
            continue
        key = (kind, item_id)
        if key in seen:
            continue
        seen.add(key)
        out.append({"kind": kind, "item_id": item_id, "title": h.get("title"),
                    "score": round(h.get("score", 0), 3)})
        if len(out) >= req.top_k:
            break
    return {"suggestions": out}


@router.post("/ask/reindex")
def reindex(user: CurrentUser = Depends(current_user)):
    """(Re)build the semantic index from the caller's documents and notes."""
    from api.ai.embeddings import embed_available
    from api.ai.vectorstore import index_text

    _CACHE.clear()   # answers may change after reindex

    if not embed_available():
        raise HTTPException(503, "Embedding server not reachable. Check EMBED_BASE_URL / EMBED_MODEL.")

    uid = user["id"]
    indexed_docs = indexed_notes = chunks = 0

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, filename, full_text FROM documents
            WHERE full_text IS NOT NULL AND deleted_at IS NULL AND users_id = %s
        """, (uid,))
        for d in cur.fetchall():
            n = index_text("document", d["id"], d["filename"], d["full_text"], user_id=uid)
            if n:
                indexed_docs += 1
                chunks += n

        cur.execute("SELECT id, title FROM notes WHERE status = 'active' AND users_id = %s", (uid,))
        notes = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    # note bodies live in files
    for note in notes:
        path = os.path.join(NOTES_DIR, f"{note['id']}.md")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                body = f.read()
            n = index_text("note", note["id"], note["title"], body, user_id=uid)
            if n:
                indexed_notes += 1
                chunks += n

    return {"status": "ok", "documents": indexed_docs, "notes": indexed_notes, "chunks": chunks}
