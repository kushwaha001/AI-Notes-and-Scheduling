"""
Qdrant vector store (FR-31/FR-32) — embedded local mode, no separate server.

Indexes document full-text and notes as embedded chunks, and does semantic
search. Stored on disk under backend/qdrant_data so it persists across restarts.
"""

import os
import hashlib
import logging

from api.config import BASE_DIR

log = logging.getLogger(__name__)

COLLECTION = "udaan_content"
_client = None


def get_client():
    global _client
    if _client is None:
        from qdrant_client import QdrantClient
        path = os.path.join(BASE_DIR, "qdrant_data")
        _client = QdrantClient(path=path)   # embedded — no server required
    return _client


def _ensure(dim: int):
    """Ensure the collection exists with the right vector size. If the embedding
    model changed (different dim), recreate it so a model swap never crashes."""
    from qdrant_client.models import Distance, VectorParams
    c = get_client()
    names = [col.name for col in c.get_collections().collections]
    if COLLECTION in names:
        try:
            existing = c.get_collection(COLLECTION).config.params.vectors.size
            if existing == dim:
                return
            log.warning("Embedding dim changed (%s -> %s); rebuilding index.", existing, dim)
            c.delete_collection(COLLECTION)
        except Exception:
            return
    c.create_collection(
        COLLECTION,
        vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
    )


def _chunks(text: str, size: int = 900, overlap: int = 120):
    text = (text or "").strip()
    out, i = [], 0
    while i < len(text):
        out.append(text[i:i + size])
        i += size - overlap
    return [c for c in out if c.strip()]


def _point_id(kind, item_id, idx):
    return int(hashlib.md5(f"{kind}-{item_id}-{idx}".encode()).hexdigest()[:15], 16)


def delete_item(kind: str, item_id):
    from qdrant_client.models import Filter, FieldCondition, MatchValue, FilterSelector
    try:
        get_client().delete(
            COLLECTION,
            points_selector=FilterSelector(filter=Filter(must=[
                FieldCondition(key="kind", match=MatchValue(value=kind)),
                FieldCondition(key="item_id", match=MatchValue(value=str(item_id))),
            ])),
        )
    except Exception:
        pass


def index_text(kind: str, item_id, title: str, text: str) -> int:
    """Embed and store the text for one item. Returns chunks indexed."""
    from qdrant_client.models import PointStruct
    from api.ai.embeddings import embed

    chunks = _chunks(text)
    if not chunks:
        return 0

    points = []
    for idx, ch in enumerate(chunks):
        vec = embed(f"{title}\n{ch}" if title else ch)
        _ensure(len(vec))
        points.append(PointStruct(
            id=_point_id(kind, item_id, idx),
            vector=vec,
            payload={"kind": kind, "item_id": str(item_id), "title": title or "", "text": ch},
        ))

    delete_item(kind, item_id)          # replace any previous version
    get_client().upsert(COLLECTION, points)
    return len(points)


def search(query: str, top_k: int = 5):
    """Semantic search across all indexed content."""
    from api.ai.embeddings import embed
    try:
        vec = embed(query)
        hits = get_client().query_points(COLLECTION, query=vec, limit=top_k).points
        return [{"score": float(h.score), **h.payload} for h in hits]
    except Exception as e:
        log.warning("Vector search failed: %s", e)
        return []


def vectorstore_available() -> bool:
    try:
        get_client()
        return True
    except Exception:
        return False
