from fastapi import APIRouter
from typing import Optional

router = APIRouter(tags=["Audit"])


@router.get("/audit-log")
def get_audit_log(
    entity_type: Optional[str] = None,
    entity_id  : Optional[int] = None,
    limit      : int = 50,
):
    """FR-28 — read-only audit log, user-visible (no admin role in v1)."""
    # TODO Day 4: SELECT * FROM audit_log WHERE ... ORDER BY created_at DESC LIMIT %s
    return {"audit_log": []}
