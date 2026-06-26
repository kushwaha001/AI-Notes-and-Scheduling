"""
AI Notes and Scheduling — FastAPI Backend
Author : Kanishk Kushwaha
Version: 1.0.0
Start  : uvicorn api.main:app --reload --port 9000
Docs   : http://localhost:9000/docs
"""

import logging
import httpx
import redis as redis_client
import psycopg2
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from api.config import (
    OLLAMA_HOST, QDRANT_HOST,
    REDIS_HOST, REDIS_PORT, DB_CONFIG,
)
from api.routes import (
    documents, events, tasks, voice,
    confirmations, queue, search,
    dashboard, audit, notes,
    trash, timeline, ask, backup,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-create DB and apply schema on every startup."""
    from api.db_init import init_db
    try:
        init_db()
    except Exception as exc:
        log.error("Startup DB init failed (continuing anyway): %s", exc)
    yield


# ── APP INIT ──────────────────────────────────────────────────
app = FastAPI(
    title="AI Notes Scheduler",
    version="1.0.0",
    description="Turn documents and voice notes into calendar events.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ROUTERS ───────────────────────────────────────────────────
app.include_router(documents.router)
app.include_router(events.router)
app.include_router(tasks.router)
app.include_router(voice.router)
app.include_router(confirmations.router)
app.include_router(queue.router)
app.include_router(search.router)
app.include_router(dashboard.router)
app.include_router(audit.router)
app.include_router(notes.router)
app.include_router(trash.router)
app.include_router(timeline.router)
app.include_router(ask.router)
app.include_router(backup.router)


# ── SYSTEM ENDPOINTS ──────────────────────────────────────────
@app.get("/health", tags=["System"])
def health():
    """Liveness check — always 200 even if AI services are down."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/services", tags=["System"])
async def check_services():
    """NFR-9 — real service health checks for frontend feature gating."""
    results = {}

    # Ollama (local LLM)
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
        results["ollama"] = "ok" if r.status_code == 200 else "error"
    except Exception:
        results["ollama"] = "unreachable"

    # Qdrant
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"{QDRANT_HOST}/collections")
        results["qdrant"] = "ok" if r.status_code == 200 else "error"
    except Exception:
        results["qdrant"] = "unreachable"

    # Redis
    try:
        r = redis_client.Redis(host=REDIS_HOST, port=REDIS_PORT, socket_timeout=2)
        r.ping()
        results["redis"] = "ok"
    except Exception:
        results["redis"] = "unreachable"

    # PostgreSQL
    try:
        conn = psycopg2.connect(**DB_CONFIG, connect_timeout=2)
        conn.close()
        results["postgres"] = "ok"
    except Exception:
        results["postgres"] = "unreachable"

    # Docling (document parsing)
    try:
        from api.ai.parser import docling_available
        results["docling"] = "ok" if docling_available() else "not installed"
    except Exception:
        results["docling"] = "not installed"

    # Overall AI extraction readiness (Ollama up + Docling installed)
    try:
        from api.ai.pipeline import ai_ready
        results["ai_extraction"] = "ready" if ai_ready() else "offline"
    except Exception:
        results["ai_extraction"] = "offline"

    # Whisper — voice transcription, loaded on demand
    results["whisper"] = "configured (loads on first audio upload)"

    return results


@app.get("/cache/stats", tags=["System"])
def cache_stats():
    # TODO Day 6: return real Redis cache stats
    return {"cached_queries": 0, "ttl_seconds": 3600, "similarity_threshold": 0.95}


@app.delete("/cache/clear", tags=["System"])
def clear_cache():
    # TODO Day 6: redis.delete all query_embedding:* keys
    return {"status": "cache cleared", "keys_removed": 0}


# ── WEBSOCKET ─────────────────────────────────────────────────
@app.websocket("/ws/processing-status")
async def processing_status_ws(websocket: WebSocket):
    """Q18 — live status push for upload processing (no page refresh)."""
    await websocket.accept()
    try:
        while True:
            data   = await websocket.receive_json()
            job_id = data.get("job_id", "")

            # TODO Day 3: poll processing_queue for this job_id
            # TODO Day 3: push real status as it changes
            await websocket.send_json({
                "job_id" : job_id,
                "status" : "queued",
                "message": "Waiting for AI server...",
            })
    except WebSocketDisconnect:
        pass
