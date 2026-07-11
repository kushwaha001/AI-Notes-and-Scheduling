"""
OpenAI-compatible LLM client.

Works with vLLM, Ollama's /v1 endpoint, or any server implementing the OpenAI
chat-completions + models API. Config comes from .env (api.config) but every
value can be overridden at runtime from the Settings page (api.settings_store) —
so the vLLM URL/model/key can be changed on an air-gapped box without a restart.
No vendor SDK — plain httpx, so nothing new to add to the offline wheel bundle.
"""

import logging
import httpx

from api.config import LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_JSON_MODE
from api.settings_store import get_setting, get_setting_exact

log = logging.getLogger(__name__)

# (base_url, model_id) of the last auto-resolution — invalidated when the URL changes.
_resolved = (None, None)


def current_config() -> dict:
    """Live LLM config: saved Settings-page overrides, else .env defaults.
    base_url blank → env (a URL is always needed). model/api_key use EXACT
    semantics: once saved, blank MEANS blank (auto-detect / no key) — otherwise
    pointing at a LAN vLLM would silently keep the env's Groq model name/key."""
    json_mode = get_setting("llm_json_mode", "true" if LLM_JSON_MODE else "false")
    return {
        "base_url": get_setting("llm_base_url", LLM_BASE_URL).rstrip("/"),
        "model": get_setting_exact("llm_model", LLM_MODEL),
        "api_key": get_setting_exact("llm_api_key", LLM_API_KEY),
        "json_mode": str(json_mode).lower() == "true",
        "system_prompt": get_setting_exact("llm_system_prompt", ""),
    }


def auth_headers(cfg: dict = None) -> dict:
    cfg = cfg or current_config()
    h = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        h["Authorization"] = f"Bearer {cfg['api_key']}"
    return h


def resolve_model(cfg: dict = None) -> str:
    """The configured model id, or — when the model is blank — the first model the
    server reports at /v1/models (cached per base URL). Lets you point at a vLLM
    without knowing its exact --served-model-name."""
    global _resolved
    cfg = cfg or current_config()
    if cfg["model"]:
        return cfg["model"]
    if _resolved[0] == cfg["base_url"] and _resolved[1]:
        return _resolved[1]
    r = httpx.get(f"{cfg['base_url']}/models", headers=auth_headers(cfg), timeout=5)
    r.raise_for_status()
    data = r.json().get("data") or []
    if not data:
        raise RuntimeError(f"No models served at {cfg['base_url']}/models")
    _resolved = (cfg["base_url"], data[0].get("id"))
    return _resolved[1]


def _build_body(messages: list, temperature: float, max_tokens: int,
                want_json: bool, cfg: dict) -> dict:
    body = {
        "model": resolve_model(cfg),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if want_json and cfg["json_mode"]:
        body["response_format"] = {"type": "json_object"}
    return body


def _post(body: dict, cfg: dict) -> str:
    r = httpx.post(f"{cfg['base_url']}/chat/completions", json=body,
                   headers=auth_headers(cfg), timeout=300)
    # Some servers reject response_format — drop it and retry once.
    if r.status_code == 400 and "response_format" in body:
        body.pop("response_format")
        r = httpx.post(f"{cfg['base_url']}/chat/completions", json=body,
                       headers=auth_headers(cfg), timeout=300)
    r.raise_for_status()
    return r.json()["choices"][0]["message"].get("content") or ""


def _chat(prompt: str, temperature: float, max_tokens: int, want_json: bool,
          with_system: bool = False) -> str:
    cfg = current_config()
    messages = []
    # The custom system prompt applies only to free-form answers (Ask AI / RAG).
    # Structured extraction keeps its own carefully-tuned prompt untouched.
    if with_system and cfg["system_prompt"]:
        messages.append({"role": "system", "content": cfg["system_prompt"]})
    messages.append({"role": "user", "content": prompt})
    return _post(_build_body(messages, temperature, max_tokens, want_json, cfg), cfg)


def _chat_vision(prompt: str, images: list, temperature: float,
                 max_tokens: int, want_json: bool) -> str:
    """Multimodal chat: a text prompt plus one or more image data-URIs, sent as
    the OpenAI vision `content` array (works with vLLM VLMs and cloud vision APIs)."""
    cfg = current_config()
    content = [{"type": "text", "text": prompt}]
    content += [{"type": "image_url", "image_url": {"url": u}} for u in images]
    messages = [{"role": "user", "content": content}]
    return _post(_build_body(messages, temperature, max_tokens, want_json, cfg), cfg)


def generate_json(prompt: str, max_tokens: int = 512) -> str:
    """Deterministic JSON answer (temperature 0)."""
    return _chat(prompt, temperature=0, max_tokens=max_tokens, want_json=True)


def generate_json_vision(prompt: str, images: list, max_tokens: int = 512) -> str:
    """Deterministic JSON answer from image input (vision extraction)."""
    return _chat_vision(prompt, images, temperature=0, max_tokens=max_tokens, want_json=True)


def generate_text(prompt: str, temperature: float = 0.2, max_tokens: int = 1024) -> str:
    """Free-form text answer (RAG) — honours the custom system prompt, if set."""
    return _chat(prompt, temperature=temperature, max_tokens=max_tokens,
                 want_json=False, with_system=True)


def llm_available() -> bool:
    """True if the LLM server responds at /v1/models."""
    try:
        cfg = current_config()
        r = httpx.get(f"{cfg['base_url']}/models", headers=auth_headers(cfg), timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def model_available() -> bool:
    """True if the configured model is actually served (or any model is, when
    the model setting is blank/auto)."""
    try:
        cfg = current_config()
        r = httpx.get(f"{cfg['base_url']}/models", headers=auth_headers(cfg), timeout=3)
        if r.status_code != 200:
            return False
        ids = [m.get("id", "") for m in (r.json().get("data") or [])]
        if not cfg["model"]:
            return len(ids) > 0
        base = cfg["model"].split(":")[0]
        return any(i == cfg["model"] or i.split(":")[0] == base for i in ids)
    except Exception:
        return False
