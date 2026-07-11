"""
Tiny OpenAI-compatible embeddings server for the dev container.

The app's embeddings client (api/ai/embeddings.py) speaks the OpenAI
`/v1/embeddings` + `/v1/models` API. Groq (and many chat-only LLM servers) don't
serve embeddings, so this provides a local one for semantic search / Ask (RAG)
without a GPU: it uses fastembed (ONNX, CPU) with a small BGE model.

Run:  python dev-container/embed_server.py   (defaults to port 8100)
Then point the app's EMBED_BASE_URL at  http://localhost:8100/v1  (Settings page).
"""

import os

# Air-gapped hardening: the model is baked into the image cache, so never let
# huggingface_hub/fastembed try to reach the internet (which would hang on a
# network that exists but has no route out). Set these to 0 if you deliberately
# want to fetch a different, un-cached model on a connected box.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

from typing import List, Union

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

MODEL_NAME = os.getenv("EMBED_SERVER_MODEL", "BAAI/bge-small-en-v1.5")   # 384-dim, CPU
MODEL_ID   = os.getenv("EMBED_SERVER_ID", "bge-small-en-v1.5")
PORT       = int(os.getenv("EMBED_SERVER_PORT", "8100"))

app = FastAPI(title="dev embeddings", version="1.0")
_model = None


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model


class EmbedRequest(BaseModel):
    input: Union[str, List[str]]
    model: str | None = None


@app.get("/v1/models")
def list_models():
    return {"object": "list", "data": [{"id": MODEL_ID, "object": "model", "owned_by": "fastembed"}]}


@app.post("/v1/embeddings")
def embeddings(req: EmbedRequest):
    texts = [req.input] if isinstance(req.input, str) else list(req.input)
    vecs = [v.tolist() for v in _get_model().embed(texts)]
    data = [{"object": "embedding", "index": i, "embedding": v} for i, v in enumerate(vecs)]
    return {"object": "list", "data": data, "model": MODEL_ID,
            "usage": {"prompt_tokens": 0, "total_tokens": 0}}


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID}


if __name__ == "__main__":
    _get_model()   # warm the model (downloads on first run)
    uvicorn.run(app, host="0.0.0.0", port=PORT)
