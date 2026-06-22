from fastapi import APIRouter

router = APIRouter(tags=["Notes"])


@router.get("/notes")
def list_notes():
    """FR-38 — list all plain text notes stored as Markdown."""
    # TODO Day 6: scan notes/ directory for .md files
    return {"notes": []}


@router.get("/notes/{note_id}")
def get_note(note_id: str):
    """FR-38 — get one note's Markdown content."""
    # TODO Day 6: read notes/{note_id}.md
    return {"note": None, "content": ""}


@router.post("/notes/{note_id}/schedule")
def schedule_note(note_id: str):
    """Q4 — convert a plain note into a task/event via LLM extraction."""
    # TODO Day 6: read note content → send to vLLM → return extractions[]
    return {"job_id": "", "extractions": []}
