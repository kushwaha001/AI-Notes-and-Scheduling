"""
Text embeddings via an OpenAI-compatible server (vLLM, TEI, Ollama /v1).

Configure with EMBED_BASE_URL / EMBED_MODEL / EMBED_API_KEY (config.py). Used for
semantic search and the Ask (RAG) feature. No vendor SDK — plain httpx.
"""

import logging
import httpx

from api.config import EMBED_BASE_URL, EMBED_MODEL, EMBED_API_KEY

log = logging.getLogger(__name__)

_resolved_model = None


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if EMBED_API_KEY:
        h["Authorization"] = f"Bearer {EMBED_API_KEY}"
    return h


def _model() -> str:
    """Configured EMBED_MODEL, or the first model the server reports if blank."""
    global _resolved_model
    if EMBED_MODEL:
        return EMBED_MODEL
    if _resolved_model:
        return _resolved_model
    r = httpx.get(f"{EMBED_BASE_URL}/models", headers=_headers(), timeout=5)
    r.raise_for_status()
    data = r.json().get("data") or []
    if not data:
        raise RuntimeError(f"No embedding model served at {EMBED_BASE_URL}/models")
    _resolved_model = data[0].get("id")
    return _resolved_model


def embed(text: str):
    """Return the embedding vector for a piece of text (OpenAI /v1/embeddings)."""
    r = httpx.post(
        f"{EMBED_BASE_URL}/embeddings",
        json={"model": _model(), "input": text or ""},
        headers=_headers(),
        timeout=60,
    )
    r.raise_for_status()
    data = r.json().get("data") or []
    if not data:
        raise RuntimeError("Embedding server returned no data")
    return data[0]["embedding"]


def embed_available() -> bool:
    """True if the embedding server responds at /v1/models."""
    try:
        r = httpx.get(f"{EMBED_BASE_URL}/models", headers=_headers(), timeout=3)
        return r.status_code == 200
    except Exception:
        return False
