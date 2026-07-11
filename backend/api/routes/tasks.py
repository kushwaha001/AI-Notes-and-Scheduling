from datetime import datetime, date
from calendar import monthrange
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.models import ManualTask, TaskUpdate
from api.db import get_db
from api.auth import current_user, CurrentUser

router = APIRouter(tags=["Tasks"])

MAX_TASK_OCCURRENCES = 60   # safety cap for recurring task generation


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%d %b %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return s


def _step(d: date, freq: str, interval: int) -> date:
    """Advance a due date by one recurrence step (daily/weekly/monthly)."""
    interval = max(1, interval or 1)
    if freq == "daily":
        return date.fromordinal(d.toordinal() + interval)
    if freq == "weekly":
        return date.fromordinal(d.toordinal() + 7 * interval)
    if freq == "monthly":
        m = d.month - 1 + interval
        y = d.year + m // 12
        m = m % 12 + 1
        return date(y, m, min(d.day, monthrange(y, m)[1]))
    return d


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
    """FR-22 — single task detail with its source documents, the AI-parsed
    extraction fields that produced it, and the audit history (mirrors the event
    detail so the task popup can show the same information)."""
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
    finally:
        cur.close()
        conn.close()


@router.post("/tasks/manual")
def create_task_manual(task: ManualTask, user: CurrentUser = Depends(current_user)):
    """FR-7 — manual task creation. No AI. Always works. Optional recurrence spawns
    repeated instances (daily/weekly/monthly)."""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Build the list of due dates (one, or several for a recurring task).
        base = _parse_date(task.due_date)
        dates = [base]
        if task.recurrence in ("daily", "weekly", "monthly") and isinstance(base, date):
            n = max(1, min(MAX_TASK_OCCURRENCES, task.count or 1))
            cur_d = base
            while len(dates) < n:
                cur_d = _step(cur_d, task.recurrence, task.interval or 1)
                dates.append(cur_d)

        first_id = None
        for d in dates:
            cur.execute("""
                INSERT INTO tasks (users_id, title, due_date, classification, priority, source, status)
                VALUES (%s, %s, %s, %s, %s, 'manual', 'open')
                RETURNING id
            """, (user["id"], task.title, d, task.category or None, task.priority or "Medium"))
            tid = cur.fetchone()["id"]
            if first_id is None:
                first_id = tid

        cur.execute("""
            INSERT INTO audit_log (action, entity_type, entity_id, detail)
            VALUES ('manual_entry', 'task', %s, %s)
        """, (first_id, task.title + (f" (×{len(dates)})" if len(dates) > 1 else "")))

        conn.commit()
        return {"status": "saved", "task_id": first_id, "created": len(dates)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


class ParseRequest(BaseModel):
    text: str


@router.post("/tasks/parse")
def parse_capture_endpoint(req: ParseRequest, user: CurrentUser = Depends(current_user)):
    """Natural-language quick capture: 'pay bill next Tuesday, high priority' →
    parsed fields for the user to confirm and save. Local LLM."""
    from api.ai.generate import parse_capture
    try:
        return parse_capture(req.text)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


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
        if update.priority is not None: fields["priority"]       = update.priority
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

        # Correspondence lifecycle: completing a reply task marks the source
        # letter 'replied' (only if it's still open — never downgrades a manual
        # 'closed'). Ties the reply-by workflow to the letter's status.
        if fields.get("status") == "done":
            cur.execute("SELECT is_reply_task FROM tasks WHERE id = %s", (task_id,))
            row = cur.fetchone()
            if row and row["is_reply_task"]:
                cur.execute("""
                    UPDATE documents SET letter_status = 'replied'
                    WHERE letter_status = 'open' AND users_id = %s AND id IN (
                        SELECT source_id FROM linked_documents
                        WHERE source_type = 'document' AND entity_type = 'task' AND entity_id = %s
                    )
                """, (user["id"], task_id))

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
