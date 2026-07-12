"""
'Needs attention' digest — what's slipping, so nothing rots unticked.

Detection is deterministic SQL (overdue = open task with due_date < today, etc.),
honouring the product rule that schedule answers come from the database, not the
AI. The local LLM only phrases a friendly one-line briefing on top, and only when
it's reachable — otherwise a deterministic sentence is used (NFR-9).
"""

import logging
from fastapi import APIRouter, Depends

from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Attention"])
log = logging.getLogger(__name__)


def _rows(cur, sql, params):
    cur.execute(sql, params)
    return [{"id": r["id"], "title": r["title"],
             "due_date": r["due_date"].isoformat() if r["due_date"] else None,
             "is_reply_task": r["is_reply_task"]} for r in cur.fetchall()]


@router.get("/attention")
def attention(user: CurrentUser = Depends(current_user)):
    """Rule-based buckets of what needs the user + an AI-phrased briefing line."""
    uid = user["id"]
    conn = get_db()
    cur = conn.cursor()
    try:
        overdue = _rows(cur, """
            SELECT id, title, due_date, is_reply_task FROM tasks
            WHERE users_id = %s AND status = 'open' AND deleted_at IS NULL
              AND due_date IS NOT NULL AND due_date < CURRENT_DATE
            ORDER BY due_date
        """, (uid,))
        due_today = _rows(cur, """
            SELECT id, title, due_date, is_reply_task FROM tasks
            WHERE users_id = %s AND status = 'open' AND deleted_at IS NULL
              AND due_date = CURRENT_DATE
            ORDER BY is_reply_task DESC
        """, (uid,))
        due_soon = _rows(cur, """
            SELECT id, title, due_date, is_reply_task FROM tasks
            WHERE users_id = %s AND status = 'open' AND deleted_at IS NULL
              AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + 3
            ORDER BY due_date
        """, (uid,))

        cur.execute("""
            SELECT COUNT(*) AS n FROM processing_queue pq
            JOIN documents d ON d.id = pq.document_id
            WHERE pq.status = 'awaiting_confirm' AND d.users_id = %s
        """, (uid,))
        awaiting = cur.fetchone()["n"]

        cur.execute("""
            SELECT COUNT(*) AS n FROM events
            WHERE users_id = %s AND status <> 'trashed' AND deleted_at IS NULL
              AND event_date = CURRENT_DATE
        """, (uid,))
        meetings_today = cur.fetchone()["n"]
    finally:
        cur.close()
        conn.close()

    replies_due = [t for t in (overdue + due_today) if t["is_reply_task"]]

    return {
        "overdue": overdue,
        "due_today": due_today,
        "due_soon": due_soon,
        "replies_due": replies_due,
        "awaiting_confirm": awaiting,
        "meetings_today": meetings_today,
        "briefing": _briefing(len(overdue), len(due_today), len(replies_due),
                              awaiting, meetings_today),
    }


def _facts(overdue, today, replies, awaiting, meetings):
    bits = []
    if overdue: bits.append(f"{overdue} overdue task{'s' if overdue != 1 else ''}")
    if today:   bits.append(f"{today} due today")
    if replies: bits.append(f"{replies} repl{'ies' if replies != 1 else 'y'} to send")
    if awaiting: bits.append(f"{awaiting} awaiting confirmation")
    if meetings: bits.append(f"{meetings} meeting{'s' if meetings != 1 else ''} today")
    return bits


def _briefing(overdue, today, replies, awaiting, meetings):
    bits = _facts(overdue, today, replies, awaiting, meetings)
    if not bits:
        return "You're all caught up — nothing needs attention right now."
    summary = bits[0] if len(bits) == 1 else ", ".join(bits[:-1]) + " and " + bits[-1]
    deterministic = "You have " + summary + "."

    # Best-effort: let the local LLM phrase it more naturally. Never blocks or
    # fails the request — falls back to the deterministic sentence.
    try:
        from api.ai.llm import llm_available, generate_text
        if llm_available():
            prompt = ("Write ONE short, friendly sentence for a work dashboard that states "
                      f"exactly these facts and nothing more: {summary}. Sentence only.")
            out = (generate_text(prompt, temperature=0.2, max_tokens=60) or "").strip()
            if out:
                return out.split("\n")[0][:200]
    except Exception as e:
        log.warning("Attention briefing LLM phrasing failed: %s", e)
    return deterministic
