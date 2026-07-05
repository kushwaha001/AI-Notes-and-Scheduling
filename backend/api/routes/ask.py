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

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from api.db import get_db
from api.auth import current_user, CurrentUser
from api.config import OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_KEEP_ALIVE, NOTES_DIR

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
        r = httpx.post(f"{OLLAMA_HOST}/api/generate",
                       json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json",
                             "stream": False, "keep_alive": OLLAMA_KEEP_ALIVE,
                             "options": {"temperature": 0}},
                       timeout=60)
        return json.loads(r.json().get("response", "{}"))
    except Exception:
        return {"type": "content"}


def _answer_schedule(question: str, route: dict, user_id: int) -> dict:
    """FR-29 — answer schedule questions exactly from the events database."""
    frm = route.get("from_date")
    to  = route.get("to_date")
    conn = get_db(); cur = conn.cursor()
    try:
        q = ("SELECT title, event_date, event_time, venue FROM events "
             "WHERE status != 'trashed' AND users_id = %s")
        params = [user_id]
        if frm:
            q += " AND event_date >= %s"; params.append(frm)
        if to:
            q += " AND event_date <= %s"; params.append(to)
        q += " ORDER BY event_date, event_time NULLS LAST"
        cur.execute(q, params)
        rows = cur.fetchall()
    finally:
        cur.close(); conn.close()

    if not rows:
        ans = "You have no events scheduled in that period."
    else:
        def fmt(r):
            d = str(r["event_date"]).split("-")
            ds = f"{d[2]}/{d[1]}/{d[0]}" if len(d) == 3 else str(r["event_date"])
            t = f" at {str(r['event_time'])[:5]}" if r["event_time"] else ""
            v = f" ({r['venue']})" if r["venue"] else ""
            return f"- {r['title']} on {ds}{t}{v}"
        ans = "Here is what's on:\n" + "\n".join(fmt(r) for r in rows)

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
            "Embedding model not available. Run:  ollama pull nomic-embed-text"
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
        r = httpx.post(
            f"{OLLAMA_HOST}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                  "keep_alive": OLLAMA_KEEP_ALIVE, "options": {"temperature": 0.2}},
            timeout=300,
        )
        r.raise_for_status()
        answer = r.json().get("response", "").strip()
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
        raise HTTPException(503, "Embedding model not available (ollama pull nomic-embed-text).")

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
