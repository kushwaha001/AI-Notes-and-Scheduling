from typing import Optional
<<<<<<< HEAD
<<<<<<< HEAD
=======
from fastapi import APIRouter
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
=======
from fastapi import APIRouter, Depends
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
from api.db import get_db
from api.auth import require_admin, CurrentUser

router = APIRouter(tags=["Audit"])


@router.get("/audit-log")
def get_audit_log(
    entity_type: Optional[str] = None,
<<<<<<< HEAD
    entity_id: Optional[int] = None,
    limit: int = 50,
=======
    entity_id  : Optional[int] = None,
    limit      : int = 50,
    admin: CurrentUser = Depends(require_admin),
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
):
    """FR-28 — read-only audit log."""
<<<<<<< HEAD

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
=======
    conn = get_db()
    cur = conn.cursor()
    try:
        query = "SELECT * FROM audit_log WHERE 1=1"
        params = []
        if entity_type:
            query += " AND entity_type = %s"
            params.append(entity_type)
        if entity_id:
            query += " AND entity_id = %s"
            params.append(entity_id)
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(query, params)
        return {"audit_log": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
