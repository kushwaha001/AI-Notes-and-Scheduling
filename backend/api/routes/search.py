from fastapi import APIRouter
from api.models import SearchRequest

router = APIRouter(tags=["Search"])


@router.post("/search")
def search(req: SearchRequest):
    """FR-29–32 — schedule/content/semantic search with keyword fallback."""
    # TODO Day 6: FR-32 query router (schedule vs content branch)
    # TODO Day 6: schedule branch → SQL query against events table
    # TODO Day 6: content branch → BGE embed + Qdrant search + reranker
    # TODO Day 6: fallback to keyword-only if Qdrant is down (NFR-9)
    return {
        "query"      : req.q,
        "answer"     : "",
        "events"     : [],
        "documents"  : [],
        "search_type": "keyword",
    }
