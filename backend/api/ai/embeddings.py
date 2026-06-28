"""
Local text embeddings via Ollama (FR-31 semantic search).

Uses a small embedding model (default nomic-embed-text). Configurable via
EMBED_MODEL. Pull it with:  ollama pull nomic-embed-text
"""

import os
import httpx

from api.config import OLLAMA_HOST, OLLAMA_KEEP_ALIVE

# bge-m3 — stronger retrieval, multilingual, 8192-token context (NFR-1).
# Swap via EMBED_MODEL; rebuild the index after changing (dim differs per model).
EMBED_MODEL = os.getenv("EMBED_MODEL", "bge-m3")


def embed(text: str):
    """Return the embedding vector for a piece of text."""
    r = httpx.post(
        f"{OLLAMA_HOST}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text or "", "keep_alive": OLLAMA_KEEP_ALIVE},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()["embedding"]


def embed_available() -> bool:
    """True only if the embedding model has been pulled into Ollama."""
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        names = [m.get("name", "") for m in r.json().get("models", [])]
        base = EMBED_MODEL.split(":")[0]
        return any(n.split(":")[0] == base for n in names)
    except Exception:
        return False
