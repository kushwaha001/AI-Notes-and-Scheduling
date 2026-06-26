<<<<<<< HEAD
from fastapi import APIRouter, HTTPException
from typing import Optional
from api.db import get_db
=======
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
from api.models import ManualTask, TaskUpdate
from api.db import get_db

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
def tasks_open():
<<<<<<< HEAD
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT *
            FROM tasks
            WHERE status = 'open'
              AND deleted_at IS NULL
            ORDER BY due_date
        """)

        return {
            "tasks": cur.fetchall()
        }

    finally:
        cur.close()
        conn.close()

=======
    """FR-22, Dashboard — open tasks ordered by due date."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT * FROM tasks
            WHERE status = 'open' AND deleted_at IS NULL
            ORDER BY due_date NULLS LAST, created_at
        """)
        return {"tasks": cur.fetchall()}
    finally:
        cur.close()
        conn.close()
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55


@router.get("/tasks")
def list_tasks(
    status  : Optional[str] = None,
    category: Optional[str] = None,
):
    """FR-22 — list tasks with filters."""
    conn = get_db()
    cur = conn.cursor()
<<<<<<< HEAD

    try:
        query = """
            SELECT *
            FROM tasks
            WHERE deleted_at IS NULL
        """

        params = []

        if status:
            query += " AND status = %s"
            params.append(status)

        if category:
            query += " AND classification = %s"
            params.append(category)

        query += " ORDER BY due_date"

        cur.execute(query, params)

        return {
            "tasks": cur.fetchall()
        }

    finally:
        cur.close()
        conn.close()


=======
    try:
        query = "SELECT * FROM tasks WHERE deleted_at IS NULL"
        params = []
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55


@router.get("/tasks/{task_id}")
def get_task(task_id: int):
<<<<<<< HEAD
    """FR-22 — single task detail with source document."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT *
            FROM tasks
            WHERE id = %s
              AND deleted_at IS NULL
        """, (task_id,))

        task = cur.fetchone()

        if not task:
            raise HTTPException(
                status_code=404,
                detail="Task not found"
            )

        cur.execute("""
            SELECT d.*
            FROM documents d
            JOIN linked_documents ld
              ON ld.source_type = 'document'
             AND ld.source_id = d.id
            WHERE ld.entity_type = 'task'
              AND ld.entity_id = %s
        """, (task_id,))

        documents = cur.fetchall()

        return {
            "task": task,
            "documents": documents
        }

=======
    """FR-22 — single task detail."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT * FROM tasks WHERE id = %s AND deleted_at IS NULL",
            (task_id,)
        )
        task = cur.fetchone()
        if not task:
            raise HTTPException(404, "Task not found.")
        return {"task": task}
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.post("/tasks/manual")
def create_task_manual(task: ManualTask):
    """FR-7 — manual task creation. No AI. Always works."""
    conn = get_db()
    cur = conn.cursor()
<<<<<<< HEAD

    try:
        cur.execute("""
            INSERT INTO tasks (
                users_id,
                title,
                due_date,
                classification,
                source,
                status
            )
            VALUES (
                1,
                %s,
                %s,
                %s,
                'manual',
                'open'
            )
            RETURNING id
        """, (
            task.title,
            task.due_date or None,
            task.category or None
        ))

        task_id = cur.fetchone()["id"]

        cur.execute("""
            INSERT INTO audit_log (
                action,
                entity_type,
                entity_id,
                detail
            )
            VALUES (
                'manual_entry',
                'task',
                %s,
                %s
            )
        """, (
            task_id,
            task.title
        ))

        conn.commit()

        return {
            "status": "saved",
            "task_id": task_id
        }

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

=======
    try:
        cur.execute("""
            INSERT INTO tasks (users_id, title, due_date, classification, source, status)
            VALUES (1, %s, %s, %s, 'manual', 'open')
            RETURNING id
        """, (task.title, _parse_date(task.due_date), task.category or None))
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate):
    """FR-22 — edit task fields."""
    conn = get_db()
    cur = conn.cursor()
<<<<<<< HEAD

    try:
        fields = []
        params = []

        if update.title is not None:
            fields.append("title = %s")
            params.append(update.title)

        if update.due_date is not None:
            fields.append("due_date = %s")
            params.append(update.due_date)

        if update.status is not None:
            fields.append("status = %s")
            params.append(update.status)

        if update.category is not None:
            fields.append("classification = %s")
            params.append(update.category)

        if not fields:
            raise HTTPException(
                status_code=400,
                detail="No fields supplied"
            )

        query = f"""
            UPDATE tasks
            SET {", ".join(fields)}
            WHERE id = %s
              AND deleted_at IS NULL
        """

        params.append(task_id)

        cur.execute(query, params)

        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Task not found"
            )

        cur.execute("""
            INSERT INTO audit_log (
                action,
                entity_type,
                entity_id,
                detail
            )
            VALUES (
                'edited',
                'task',
                %s,
                'Task updated'
            )
        """, (task_id,))

        conn.commit()

        return {
            "status": "updated",
            "task_id": task_id
        }

    except HTTPException:
        raise

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

=======
    try:
        fields = {}
        if update.title    is not None: fields["title"]          = update.title
        if update.status   is not None: fields["status"]         = update.status
        if update.category is not None: fields["classification"] = update.category
        if update.due_date is not None: fields["due_date"]       = _parse_date(update.due_date)

        if not fields:
            return {"status": "no changes", "task_id": task_id}

        set_clause = ", ".join(f"{k} = %s" for k in fields)
        values = list(fields.values()) + [task_id]
        cur.execute(
            f"UPDATE tasks SET {set_clause} WHERE id = %s AND deleted_at IS NULL",
            values
        )
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('edited', 'task', %s, %s)
        """, (task_id, f"Updated: {', '.join(fields.keys())}"))

        conn.commit()
        return {"status": "updated", "task_id": task_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int):
<<<<<<< HEAD
    """FR-22 — soft delete (status = cancelled)."""
    conn = get_db()
    cur = conn.cursor()

    try:
        cur.execute("""
            UPDATE tasks
            SET status = 'trashed',
                deleted_at = NOW()
            WHERE id = %s
              AND deleted_at IS NULL
        """, (task_id,))

        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Task not found"
            )

        cur.execute("""
            INSERT INTO audit_log (
                action,
                entity_type,
                entity_id,
                detail
            )
            VALUES (
                'trashed',
                'task',
                %s,
                'Task moved to trash'
            )
        """, (task_id,))

        conn.commit()

        return {
            "status": "deleted",
            "task_id": task_id
        }

    except HTTPException:
        raise

    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))

=======
    """FR-22 — soft delete."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE tasks SET status = 'trashed', deleted_at = NOW()
            WHERE id = %s AND deleted_at IS NULL
        """, (task_id,))
        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('trashed', 'task', %s, 'Soft deleted by user')
        """, (task_id,))
        conn.commit()
        return {"status": "deleted", "task_id": task_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()
