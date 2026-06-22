from fastapi import APIRouter

router = APIRouter(tags=["Dashboard"])


@router.get("/pending-replies")
def pending_replies():
    """FR-23 — items with reply_by date within 2 days."""
    # TODO Day 5: SELECT * FROM events WHERE reply_by <= NOW() + INTERVAL '2 days'
    return {"pending_replies": []}


@router.get("/dashboard")
def dashboard_summary():
    """FR-33, FR-34 — aggregated dashboard (today events, open tasks, pending)."""
    # TODO Day 5: run all 4 queries and merge results
    return {
        "today_events"          : [],
        "open_tasks"            : [],
        "pending_replies"       : [],
        "pending_confirmations" : []
    }
