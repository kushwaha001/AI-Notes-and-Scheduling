"""
Qdrant vector store (FR-31/FR-32) — embedded OR server, chosen by config.

Indexes document full-text and notes as embedded chunks, and does semantic
search. When QDRANT_URL is set it talks to a Qdrant server (recommended for
multi-user / multiple workers); otherwise it uses the embedded on-disk store
under backend/qdrant_data, which persists across restarts.
"""

import os
import hashlib
import logging

from api.config import BASE_DIR, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION

log = logging.getLogger(__name__)

COLLECTION = QDRANT_COLLECTION
_client = None


def get_client():
    global _client
    if _client is None:
        from qdrant_client import QdrantClient
        if QDRANT_URL:
            _client = QdrantClient(url=QDRANT_URL, api_key=(QDRANT_API_KEY or None))
        else:
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


def index_text(kind: str, item_id, title: str, text: str, user_id=None) -> int:
    """Embed and store the text for one item. Returns chunks indexed.

    `user_id` is stamped into each point's payload so semantic search can be
    scoped to a single owner (v2 multi-user). None = unscoped (legacy)."""
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
            payload={"kind": kind, "item_id": str(item_id), "title": title or "",
                     "text": ch,
                     "user_id": str(user_id) if user_id is not None else ""},
        ))

    delete_item(kind, item_id)          # replace any previous version
    get_client().upsert(COLLECTION, points)
    return len(points)


def search(query: str, top_k: int = 5, user_id=None):
    """Semantic search across indexed content. When `user_id` is given, only
    that owner's content is returned (v2 multi-user isolation)."""
    from api.ai.embeddings import embed
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    try:
        vec = embed(query)
        flt = None
        if user_id is not None:
            flt = Filter(must=[FieldCondition(
                key="user_id", match=MatchValue(value=str(user_id)))])
        hits = get_client().query_points(
            COLLECTION, query=vec, limit=top_k, query_filter=flt).points
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
