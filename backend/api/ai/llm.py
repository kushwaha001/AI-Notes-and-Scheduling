"""
OpenAI-compatible LLM client.

Works with vLLM, Ollama's /v1 endpoint, or any server implementing the OpenAI
chat-completions + models API. Configure via LLM_BASE_URL / LLM_MODEL /
LLM_API_KEY (config.py). No vendor SDK — plain httpx, so nothing new to add to
the offline wheel bundle.
"""

import logging
import httpx

from api.config import LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_JSON_MODE

log = logging.getLogger(__name__)

_resolved_model = None


def auth_headers() -> dict:
    h = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        h["Authorization"] = f"Bearer {LLM_API_KEY}"
    return h


def resolve_model() -> str:
    """The configured model id, or — when LLM_MODEL is blank — the first model the
    server reports at /v1/models (cached). Lets you point at a vLLM without
    knowing its exact --served-model-name."""
    global _resolved_model
    if LLM_MODEL:
        return LLM_MODEL
    if _resolved_model:
        return _resolved_model
    r = httpx.get(f"{LLM_BASE_URL}/models", headers=auth_headers(), timeout=5)
    r.raise_for_status()
    data = r.json().get("data") or []
    if not data:
        raise RuntimeError(f"No models served at {LLM_BASE_URL}/models")
    _resolved_model = data[0].get("id")
    return _resolved_model


def _chat(prompt: str, temperature: float, max_tokens: int, want_json: bool) -> str:
    body = {
        "model": resolve_model(),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if want_json and LLM_JSON_MODE:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(f"{LLM_BASE_URL}/chat/completions", json=body,
                   headers=auth_headers(), timeout=300)
    # Some servers reject response_format — drop it and retry once.
    if r.status_code == 400 and "response_format" in body:
        body.pop("response_format")
        r = httpx.post(f"{LLM_BASE_URL}/chat/completions", json=body,
                       headers=auth_headers(), timeout=300)
    r.raise_for_status()
    return r.json()["choices"][0]["message"].get("content") or ""


def generate_json(prompt: str, max_tokens: int = 512) -> str:
    """Deterministic JSON answer (temperature 0)."""
    return _chat(prompt, temperature=0, max_tokens=max_tokens, want_json=True)


def generate_text(prompt: str, temperature: float = 0.2, max_tokens: int = 1024) -> str:
    """Free-form text answer (RAG)."""
    return _chat(prompt, temperature=temperature, max_tokens=max_tokens, want_json=False)


def llm_available() -> bool:
    """True if the LLM server responds at /v1/models."""
    try:
        r = httpx.get(f"{LLM_BASE_URL}/models", headers=auth_headers(), timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def model_available() -> bool:
    """True if the configured model is actually served (or any model is, when
    LLM_MODEL is blank/auto)."""
    try:
        r = httpx.get(f"{LLM_BASE_URL}/models", headers=auth_headers(), timeout=3)
        if r.status_code != 200:
            return False
        ids = [m.get("id", "") for m in (r.json().get("data") or [])]
        if not LLM_MODEL:
            return len(ids) > 0
        base = LLM_MODEL.split(":")[0]
        return any(i == LLM_MODEL or i.split(":")[0] == base for i in ids)
    except Exception:
        return False
