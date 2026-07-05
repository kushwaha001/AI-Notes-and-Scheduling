<<<<<<< HEAD
from fastapi import APIRouter, HTTPException
from typing import Optional
from api.db import get_db
=======
from datetime import datetime
from typing import Optional

<<<<<<< HEAD
from fastapi import APIRouter, HTTPException
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
=======
from fastapi import APIRouter, HTTPException, Depends
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
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
<<<<<<< HEAD
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
=======
def tasks_open(user: CurrentUser = Depends(current_user)):
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55


@router.get("/tasks")
def list_tasks(
    status  : Optional[str] = None,
    category: Optional[str] = None,
    user: CurrentUser = Depends(current_user),
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55


@router.get("/tasks/{task_id}")
<<<<<<< HEAD
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
=======
def get_task(task_id: int, user: CurrentUser = Depends(current_user)):
<<<<<<< HEAD
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
    """FR-22 — single task detail."""
=======
    """FR-22 — single task detail with its source documents, the AI-parsed
    extraction fields that produced it, and the audit history (mirrors the event
    detail so the task popup can show the same information)."""
>>>>>>> d0a6006dc5b0b6eb55723fa96e1b8506554ae1fc
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
<<<<<<< HEAD
        return {"task": task}
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
=======

        # Linked source documents (FR-26/FR-27)
        cur.execute("""
            SELECT d.id, d.filename, d.file_type, d.classification,
                   d.full_text, d.uploaded_at
            FROM documents d
            JOIN linked_documents ld
                ON ld.source_type = 'document' AND ld.source_id = d.id
            WHERE ld.entity_type = 'task' AND ld.entity_id = %s
        """, (task_id,))
        docs = cur.fetchall()

        # AI-parsed extraction fields from those source documents (FR-8, FR-10)
        extractions = []
        if docs:
            doc_ids = [d["id"] for d in docs]
            cur.execute("""
                SELECT subject, event_date, event_time, venue, attendees,
                       ref_number, deadline, reply_by, reply_by_overdue,
                       meeting_date_flag, field_confidence, model_name,
                       item_type, status, extracted_at
                FROM extractions
                WHERE source_type = 'document' AND source_id = ANY(%s)
                ORDER BY extracted_at DESC
            """, (doc_ids,))
            extractions = cur.fetchall()

        # Audit history for this task (FR-28)
        cur.execute("""
            SELECT action, detail, created_at
            FROM audit_log
            WHERE entity_type = 'task' AND entity_id = %s
            ORDER BY created_at DESC
        """, (task_id,))
        history = cur.fetchall()

        return {
            "task": task,
            "source_documents": docs,
            "extractions": extractions,
            "history": history,
        }
>>>>>>> d0a6006dc5b0b6eb55723fa96e1b8506554ae1fc
    finally:
        cur.close()
        conn.close()


@router.post("/tasks/manual")
def create_task_manual(task: ManualTask, user: CurrentUser = Depends(current_user)):
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate,
                user: CurrentUser = Depends(current_user)):
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()


@router.delete("/tasks/{task_id}")
<<<<<<< HEAD
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
=======
def delete_task(task_id: int, user: CurrentUser = Depends(current_user)):
>>>>>>> 3f5068ce881006c02bfba08e3a519f0324183c1b
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
>>>>>>> 162d4fa688f7facfdeedcef9f7f595a90b1d5e55
    finally:
        cur.close()
        conn.close()
