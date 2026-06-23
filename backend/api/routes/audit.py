from fastapi import APIRouter
from typing import Optional
from api.db import get_db

router = APIRouter(tags=["Audit"])


@router.get("/audit-log")
def get_audit_log(
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    limit: int = 50,
):
    """FR-28 — read-only audit log."""

    conn = get_db()
    cur = conn.cursor()

    try:
        query = """
            SELECT *
            FROM audit_log
            WHERE 1=1
        """

        params = []

        if entity_type:
            query += " AND entity_type = %s"
            params.append(entity_type)

        if entity_id:
            query += " AND entity_id = %s"
            params.append(entity_id)

        query += """
            ORDER BY created_at DESC
            LIMIT %s
        """
        params.append(limit)

        cur.execute(query, params)

        return {
            "audit_log": cur.fetchall()
        }

    finally:
        cur.close()
        conn.close()