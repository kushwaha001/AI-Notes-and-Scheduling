from typing import Optional
from fastapi import APIRouter, Depends
from api.db import get_db
from api.auth import require_admin, CurrentUser

router = APIRouter(tags=["Audit"])


@router.get("/audit-log")
def get_audit_log(
    entity_type: Optional[str] = None,
    entity_id  : Optional[int] = None,
    limit      : int = 50,
    admin: CurrentUser = Depends(require_admin),
):
    """FR-28 — read-only audit log."""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Resolve the entity's human name (document filename / event / task / note
        # title) so the log reads "… — Empowered Committee Meeting" instead of a
        # bare "Soft deleted by user".
        query = """
            SELECT a.*,
                   COALESCE(d.filename, e.title, t.title, n.title) AS entity_name
            FROM audit_log a
            LEFT JOIN documents d ON a.entity_type = 'document' AND a.entity_id = d.id
            LEFT JOIN events    e ON a.entity_type = 'event'    AND a.entity_id = e.id
            LEFT JOIN tasks     t ON a.entity_type = 'task'     AND a.entity_id = t.id
            LEFT JOIN notes     n ON a.entity_type = 'note'     AND a.entity_id = n.id
            WHERE 1=1
        """
        params = []
        if entity_type:
            query += " AND a.entity_type = %s"
            params.append(entity_type)
        if entity_id:
            query += " AND a.entity_id = %s"
            params.append(entity_id)
        query += " ORDER BY a.created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(query, params)
        return {"audit_log": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
