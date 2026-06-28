from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from api.models import ManualTask, TaskUpdate
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Tasks"])


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return s


@router.get("/tasks/open")
def tasks_open(user: CurrentUser = Depends(current_user)):
    """FR-22, Dashboard — open tasks ordered by due date."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM tasks
            WHERE status = 'open' AND deleted_at IS NULL AND users_id = %s
            ORDER BY due_date NULLS LAST, created_at
        """, (user["id"],))
        return {"tasks": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/tasks")
def list_tasks(
    status  : Optional[str] = None,
    category: Optional[str] = None,
    user: CurrentUser = Depends(current_user),
):
    """FR-22 — list tasks with filters."""
    conn = get_db()
    cur = conn.cursor()
    try:
        query = "SELECT * FROM tasks WHERE deleted_at IS NULL AND users_id = %s"
        params = [user["id"]]
        if status:
            query += " AND status = %s"
            params.append(status)
        if category:
            query += " AND classification = %s"
            params.append(category)
        query += " ORDER BY due_date NULLS LAST, created_at DESC"
        cur.execute(query, params)
        return {"tasks": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/tasks/{task_id}")
def get_task(task_id: int, user: CurrentUser = Depends(current_user)):
    """FR-22 — single task detail."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM tasks WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
            (task_id, user["id"])
        )
        task = cur.fetchone()
        if not task:
            raise HTTPException(404, "Task not found.")
        return {"task": task}
    finally:
        cur.close()
        conn.close()


@router.post("/tasks/manual")
def create_task_manual(task: ManualTask, user: CurrentUser = Depends(current_user)):
    """FR-7 — manual task creation. No AI. Always works."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO tasks (users_id, title, due_date, classification, source, status)
            VALUES (%s, %s, %s, %s, 'manual', 'open')
            RETURNING id
        """, (user["id"], task.title, _parse_date(task.due_date), task.category or None))
        task_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('manual_entry', 'task', %s, %s)
        """, (task_id, task.title))

        conn.commit()
        return {"status": "saved", "task_id": task_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate,
                user: CurrentUser = Depends(current_user)):
    """FR-22 — edit task fields."""
    conn = get_db()
    cur = conn.cursor()
    try:
        fields = {}
        if update.title    is not None: fields["title"]          = update.title
        if update.status   is not None: fields["status"]         = update.status
        if update.category is not None: fields["classification"] = update.category
        if update.due_date is not None: fields["due_date"]       = _parse_date(update.due_date)

        if not fields:
            return {"status": "no changes", "task_id": task_id}

        set_clause = ", ".join(f"{k} = %s" for k in fields)
        values = list(fields.values()) + [task_id, user["id"]]
        cur.execute(
            f"UPDATE tasks SET {set_clause} "
            f"WHERE id = %s AND users_id = %s AND deleted_at IS NULL",
            values
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Task not found.")
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('edited', 'task', %s, %s)
        """, (task_id, f"Updated: {', '.join(fields.keys())}"))

        conn.commit()
        return {"status": "updated", "task_id": task_id}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user: CurrentUser = Depends(current_user)):
    """FR-22 — soft delete."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE tasks SET status = 'trashed', deleted_at = NOW()
            WHERE id = %s AND users_id = %s AND deleted_at IS NULL
        """, (task_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(404, "Task not found.")
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'task', %s, 'Soft deleted by user')
        """, (task_id,))
        conn.commit()
        return {"status": "deleted", "task_id": task_id}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
