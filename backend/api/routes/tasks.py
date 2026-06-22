from fastapi import APIRouter
from typing import Optional
from api.models import ManualTask, TaskUpdate

router = APIRouter(tags=["Tasks"])


@router.get("/tasks/open")
def tasks_open():
    """FR-22, Dashboard — open tasks ordered by due date."""
    # TODO Day 5: SELECT * FROM tasks WHERE status='open' ORDER BY due_date
    return {"tasks": []}


@router.get("/tasks")
def list_tasks(
    status  : Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
):
    """FR-22 — list tasks with filters."""
    # TODO Day 5: SELECT with WHERE clauses
    return {"tasks": []}


@router.get("/tasks/{task_id}")
def get_task(task_id: int):
    """FR-22 — single task detail with source document."""
    # TODO Day 5: SELECT task + JOIN documents
    return {"task": None}


@router.post("/tasks/manual")
def create_task_manual(task: ManualTask):
    """FR-7 — manual task creation. No AI. Always works."""
    # TODO Day 5: INSERT INTO tasks (..., source='manual')
    return {"status": "saved", "task": task.model_dump()}


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate):
    """FR-22 — edit task fields."""
    # TODO Day 5: UPDATE tasks SET ... WHERE id = task_id
    return {"status": "updated", "task_id": task_id}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int):
    """FR-22 — soft delete (status = cancelled)."""
    # TODO Day 5: UPDATE tasks SET status='cancelled' WHERE id = task_id
    return {"status": "deleted", "task_id": task_id}
