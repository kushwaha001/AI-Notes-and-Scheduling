"""
FR-37 — Reminders / browser notifications.

Events carry one or more reminder offsets ("1day", "1hour", "15min"). This
module:
  • persists those offsets when an event is created (confirm flow + manual), and
  • exposes the reminders that are now *due* so the frontend can raise a browser
    notification, then mark them delivered so they don't fire twice.

Known limitation (per the spec): browser notifications only work while the tab
is open — the dashboard remains the reliable fallback. Nothing here depends on
the AI server, so it keeps working in degraded mode (NFR-9).
"""

import re
import logging
from datetime import timedelta

from fastapi import APIRouter
from api.db import get_db

router = APIRouter(tags=["Reminders"])
log = logging.getLogger(__name__)

# How a "remind_before" label maps to a time offset before the event.
_OFFSETS = {
    "1week": timedelta(weeks=1),
    "1day" : timedelta(days=1),
    "2hour": timedelta(hours=2),
    "1hour": timedelta(hours=1),
    "30min": timedelta(minutes=30),
    "15min": timedelta(minutes=15),
    "5min" : timedelta(minutes=5),
    "atstart": timedelta(0),
}


def offset_for(label: str) -> timedelta:
    """Best-effort parse of a reminder label into a timedelta before the event."""
    if not label:
        return timedelta(0)
    label = label.strip().lower().replace(" ", "")
    if label in _OFFSETS:
        return _OFFSETS[label]
    m = re.match(r"(\d+)(week|day|hour|min)", label)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        return {
            "week": timedelta(weeks=n),
            "day" : timedelta(days=n),
            "hour": timedelta(hours=n),
            "min" : timedelta(minutes=n),
        }[unit]
    return timedelta(0)


def insert_reminders(cur, event_id: int, labels) -> int:
    """Persist reminder rows for an event. Caller owns the transaction.
    De-duplicates and ignores empties. Returns count inserted."""
    seen, n = set(), 0
    for label in (labels or []):
        if not label or label in seen:
            continue
        seen.add(label)
        cur.execute(
            "INSERT INTO reminders (event_id, remind_before, delivered) VALUES (%s, %s, FALSE)",
            (event_id, label),
        )
        n += 1
    return n


@router.get("/reminders/due")
def reminders_due(window_min: int = 1):
    """Reminders whose fire-time has arrived (event datetime − offset ≤ now) and
    that haven't been delivered yet. The frontend polls this and shows a browser
    notification for each, then POSTs /reminders/{id}/delivered.

    `window_min` lets the client ask for reminders firing within the next N
    minutes too, so a slow poll interval doesn't miss a tight reminder."""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Events default to 09:00 when no time is set, so a date-only event still
        # produces a sensible reminder time.
        cur.execute("""
            SELECT r.id, r.remind_before, r.event_id,
                   e.title, e.event_date, e.event_time, e.venue,
                   (e.event_date + COALESCE(e.event_time, TIME '09:00')) AS event_at
            FROM reminders r
            JOIN events e ON e.id = r.event_id
            WHERE r.delivered = FALSE
              AND e.status != 'trashed'
              AND e.deleted_at IS NULL
            ORDER BY event_at
        """)
        rows = cur.fetchall()
    finally:
        cur.close()
        conn.close()

    from datetime import datetime
    now = datetime.now()
    due = []
    for r in rows:
        fire_at = r["event_at"] - offset_for(r["remind_before"])
        # due if we're past the fire time but the event itself hasn't passed long
        # ago (don't resurface reminders for events finished >1h ago)
        if fire_at <= now + timedelta(minutes=window_min) and r["event_at"] >= now - timedelta(hours=1):
            due.append({
                "id"           : r["id"],
                "event_id"     : r["event_id"],
                "title"        : r["title"],
                "venue"        : r["venue"],
                "remind_before": r["remind_before"],
                "event_date"   : str(r["event_date"]),
                "event_time"   : str(r["event_time"]) if r["event_time"] else None,
                "fire_at"      : fire_at.isoformat(),
            })
    return {"due": due}


@router.post("/reminders/{reminder_id}/delivered")
def mark_delivered(reminder_id: int):
    """Mark a reminder as shown so it never fires again."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE reminders SET delivered = TRUE WHERE id = %s", (reminder_id,))
        conn.commit()
        return {"status": "delivered", "id": reminder_id}
    finally:
        cur.close()
        conn.close()
