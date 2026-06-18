from fastapi import APIRouter
from typing import Optional
from api.models import ManualEvent, EventUpdate

router = APIRouter(tags=["Events"])


@router.get("/events/today")
def events_today():
    """FR-33 — today's meetings for dashboard."""
    # TODO Day 4: SELECT * FROM events WHERE event_date = CURRENT_DATE ORDER BY event_time
    return {"events": [], "date": ""}


@router.get("/events")
def list_events(
    from_date: Optional[str] = None,
    to_date  : Optional[str] = None,
    status   : Optional[str] = None,
):
    """FR-16 — list events with optional date range and status filter."""
    # TODO Day 4: SELECT with WHERE clauses
    return {"events": []}


@router.get("/events/{event_id}")
def get_event(event_id: int):
    """FR-16 — single event with source document links."""
    # TODO Day 4: SELECT event + JOIN event_documents + JOIN documents
    return {"event": None, "source_documents": []}


@router.post("/events/manual")
def create_event_manual(event: ManualEvent):
    """FR-7 — manual entry, no AI. NFR-9: never depends on vLLM."""
    # TODO Day 2: INSERT INTO events (..., source='manual')
    # TODO Day 4: write audit_log action='manual_entry'
    return {"status": "saved", "event": event.model_dump(), "source": "manual"}


@router.patch("/events/{event_id}")
def update_event(event_id: int, update: EventUpdate):
    """FR-16 — edit an existing event."""
    # TODO Day 4: UPDATE events SET ... WHERE id = event_id
    # TODO Day 4: write audit_log action='edited'
    return {"status": "updated", "event_id": event_id}


@router.delete("/events/{event_id}")
def delete_event(event_id: int):
    """FR-16 — soft delete, keeps audit trail."""
    # TODO Day 4: UPDATE events SET status='deleted' WHERE id = event_id
    # TODO Day 4: write audit_log action='deleted'
    return {"status": "deleted", "event_id": event_id}


@router.post("/events/{event_id}/link-document")
def link_document_to_event(event_id: int, body: dict):
    """Q7 — link a second source document to an existing event."""
    # TODO Day 4: INSERT INTO event_documents (event_id, document_id)
    return {"status": "linked", "event_id": event_id, "doc_id": body.get("doc_id")}
