"""
Settings — runtime AI/LLM configuration (vLLM URL, model, API key, system prompt).

Backs the Settings page so the LLM endpoint can be repointed (e.g. Groq → a LAN
vLLM) on an air-gapped deployment without editing .env or restarting. Saved
values live in app_settings (api.settings_store) and override the env defaults;
clearing a field falls back to .env.
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import current_user, CurrentUser
from api.config import VISION_MODE
from api.settings_store import get_setting, set_settings
from api.ai.llm import current_config

router = APIRouter(prefix="/settings", tags=["Settings"])
log = logging.getLogger(__name__)

KEY_MASK = "••••••••"    # sent to the UI instead of the real key

VISION_MODES = ("off", "auto", "on")


class LlmSettingsIn(BaseModel):
    base_url: str = ""
    model: str = ""
    api_key: str = ""          # KEY_MASK → keep the stored key unchanged
    json_mode: bool = True
    system_prompt: str = ""
    vision_mode: Optional[str] = None   # off | auto | on; omitted → unchanged


def _vision_mode() -> str:
    """Live vision mode: saved Settings override, else the VISION_MODE env."""
    mode = get_setting("vision_mode", VISION_MODE)
    return mode if mode in VISION_MODES else "off"


def _probe(base_url: str, api_key: str) -> dict:
    """Hit {base_url}/models and report reachability + served model ids."""
    hdr = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        r = httpx.get(f"{base_url.rstrip('/')}/models", headers=hdr, timeout=6)
        if r.status_code != 200:
            return {"ok": False, "error": f"HTTP {r.status_code} from {base_url}/models"}
        ids = [m.get("id", "") for m in (r.json().get("data") or [])]
        return {"ok": True, "models": ids}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/llm")
def get_llm_settings(user: CurrentUser = Depends(current_user)):
    """Current live config (env + overrides merged), key masked, plus a probe."""
    cfg = current_config()
    probe = _probe(cfg["base_url"], cfg["api_key"])
    return {
        "base_url": cfg["base_url"],
        "model": cfg["model"],
        "api_key": KEY_MASK if cfg["api_key"] else "",
        "json_mode": cfg["json_mode"],
        "system_prompt": cfg["system_prompt"],
        "vision_mode": _vision_mode(),
        "status": probe,
    }


@router.put("/llm")
def save_llm_settings(body: LlmSettingsIn, user: CurrentUser = Depends(current_user)):
    """Persist overrides; applied immediately (the client reads config per call).

    Semantics: clearing the Server URL resets EVERYTHING to the .env defaults.
    With a URL set, a blank model means auto-detect and a blank key means send
    no key — exactly what a LAN vLLM needs. vision_mode is independent of the
    URL reset (it drives the extraction pipeline, not the LLM endpoint)."""
    if body.vision_mode is not None:
        if body.vision_mode not in VISION_MODES:
            raise HTTPException(400, "vision_mode must be off, auto or on.")
        set_settings({"vision_mode": body.vision_mode})
    if not body.base_url.strip():
        # Full reset — delete all overrides, fall back to .env.
        set_settings({k: None for k in (
            "llm_base_url", "llm_model", "llm_api_key", "llm_json_mode", "llm_system_prompt")})
    else:
        values = {
            "llm_base_url": body.base_url.strip(),
            "llm_model": body.model.strip(),
            "llm_json_mode": "true" if body.json_mode else "false",
            "llm_system_prompt": body.system_prompt.strip(),
        }
        if body.api_key.strip() != KEY_MASK:     # mask back = leave key as-is
            values["llm_api_key"] = body.api_key.strip()
        set_settings(values)
    cfg = current_config()
    log.info("LLM settings updated: url=%s model=%s vision=%s",
             cfg["base_url"], cfg["model"] or "(auto)", _vision_mode())
    return {"status": "saved", "applied": {"base_url": cfg["base_url"], "model": cfg["model"] or "(auto)",
                                           "vision_mode": _vision_mode()}}


@router.post("/llm/test")
def test_llm_settings(body: LlmSettingsIn, user: CurrentUser = Depends(current_user)):
    """Probe a candidate config WITHOUT saving it — used by the Test button."""
    key = body.api_key.strip()
    if key == KEY_MASK:                      # testing with the stored key
        key = current_config()["api_key"]
    return _probe(body.base_url.strip() or current_config()["base_url"], key)
