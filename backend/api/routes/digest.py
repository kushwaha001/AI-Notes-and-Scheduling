"""
Morning digest — the one call the dashboard makes on load.

Counts are deterministic SQL, honouring the product rule that schedule answers
come from the database, not the AI. The local LLM only phrases a warm 1-3
sentence morning brief on top, and only when it's reachable — otherwise a
deterministic sentence is used (NFR-9). Loading the digest also runs the
auto-escalation sweep: open tasks past their due date are bumped to Critical.
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends

from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Digest"])
log = logging.getLogger(__name__)

# LLM brief per (user_id, date) — repeated dashboard loads within a day reuse
# the phrased brief instead of re-calling the LLM.
_brief_cache = {}


def _escalate_overdue(cur, uid):
    """Idempotently bump open tasks past their due date to Critical. The WHERE
    clause itself skips rows that are already Critical, so re-running on every
    dashboard load never double-bumps or duplicates audit rows."""
    cur.execute("""
        UPDATE tasks SET priority = 'Critical'
        WHERE users_id = %s AND status = 'open' AND deleted_at IS NULL
          AND due_date IS NOT NULL AND due_date < CURRENT_DATE
          AND (priority IS NULL OR priority <> 'Critical')
        RETURNING id
    """, (uid,))
    bumped = [r["id"] for r in cur.fetchall()]
    for tid in bumped:
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('escalated', 'task', %s, 'Auto-escalated to Critical — due date passed')
        """, (tid,))
    if bumped:
        log.info("Digest: auto-escalated %d overdue task(s) to Critical.", len(bumped))


@router.get("/digest")
def digest(user: CurrentUser = Depends(current_user)):
    """Today's counts + an AI-phrased morning brief (deterministic fallback)."""
    uid = user["id"]
    conn = get_db()
    cur = conn.cursor()
    try:
        _escalate_overdue(cur, uid)
        conn.commit()

        cur.execute("""
            SELECT COUNT(*) AS n FROM events
            WHERE users_id = %s AND status <> 'trashed' AND deleted_at IS NULL
              AND event_date = CURRENT_DATE
        """, (uid,))
        meetings_today = cur.fetchone()["n"]

        # Open letters whose earliest extracted reply-by falls within the week
        # (overdue ones included — they still need a reply).
        cur.execute("""
            SELECT COUNT(*) AS n FROM documents d
            WHERE d.users_id = %s AND d.deleted_at IS NULL AND d.letter_status = 'open'
              AND (SELECT MIN(e.reply_by) FROM extractions e
                   WHERE e.source_type = 'document' AND e.source_id = d.id
                     AND e.reply_by IS NOT NULL) <= CURRENT_DATE + 7
        """, (uid,))
        replies_due_week = cur.fetchone()["n"]

        cur.execute("""
            SELECT COUNT(*) AS n FROM tasks
            WHERE users_id = %s AND status = 'open' AND deleted_at IS NULL
              AND due_date IS NOT NULL AND due_date < CURRENT_DATE
        """, (uid,))
        overdue_tasks = cur.fetchone()["n"]

        cur.execute("""
            SELECT COUNT(*) AS n FROM extractions e
            WHERE e.status = 'pending'
              AND ((e.source_type = 'document' AND EXISTS (
                        SELECT 1 FROM documents d WHERE d.id = e.source_id
                          AND d.users_id = %s AND d.deleted_at IS NULL))
                OR (e.source_type = 'audio' AND EXISTS (
                        SELECT 1 FROM audio a WHERE a.id = e.source_id
                          AND a.users_id = %s AND a.deleted_at IS NULL)))
        """, (uid, uid))
        awaiting_confirm = cur.fetchone()["n"]
    finally:
        cur.close()
        conn.close()

    counts = {
        "meetings_today": meetings_today,
        "replies_due_week": replies_due_week,
        "overdue_tasks": overdue_tasks,
        "awaiting_confirm": awaiting_confirm,
    }
    today = date.today().isoformat()
    return {"date": today, "counts": counts, "brief": _brief(uid, today, counts)}


def _facts(c):
    bits = []
    if c["meetings_today"]:   bits.append(f"{c['meetings_today']} meeting{'s' if c['meetings_today'] != 1 else ''} today")
    if c["replies_due_week"]: bits.append(f"{c['replies_due_week']} letter{'s' if c['replies_due_week'] != 1 else ''} to reply to this week")
    if c["overdue_tasks"]:    bits.append(f"{c['overdue_tasks']} overdue task{'s' if c['overdue_tasks'] != 1 else ''}")
    if c["awaiting_confirm"]: bits.append(f"{c['awaiting_confirm']} extraction{'s' if c['awaiting_confirm'] != 1 else ''} awaiting confirmation")
    return bits


def _brief(uid, today, counts):
    key = (uid, today)
    if key in _brief_cache:
        return _brief_cache[key]

    bits = _facts(counts)
    if not bits:
        deterministic = "Good morning — you're all caught up. Nothing needs your attention today."
    else:
        summary = bits[0] if len(bits) == 1 else ", ".join(bits[:-1]) + " and " + bits[-1]
        deterministic = "Good morning. On your plate: " + summary + "."

    # Best-effort: let the local LLM phrase it more warmly. Never blocks or
    # fails the request — falls back to the deterministic sentence, and only a
    # successful LLM brief is cached (so an offline LLM is retried next load).
    try:
        from api.ai.llm import llm_available, generate_text
        if llm_available():
            prompt = ("Write a warm, human morning brief (1-3 short sentences) for a work "
                      "dashboard that states exactly these facts and nothing more: "
                      f"{summary if bits else 'nothing pending — all caught up'}. "
                      "No names, no markdown, sentences only.")
            out = (generate_text(prompt, temperature=0.3, max_tokens=120) or "").strip()
            if out:
                out = " ".join(out.split())[:400]
                # keep the cache from growing forever — drop other days' briefs
                for k in [k for k in _brief_cache if k[1] != today]:
                    del _brief_cache[k]
                _brief_cache[key] = out
                return out
    except Exception as e:
        log.warning("Digest brief LLM phrasing failed: %s", e)
    return deterministic
