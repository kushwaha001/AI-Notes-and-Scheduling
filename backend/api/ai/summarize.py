"""
Local-LLM note summary + tags (air-gapped).

Uses the same OpenAI-compatible client as every other AI feature (api.ai.llm),
so it runs against the local vLLM/Ollama with no external calls. Best-effort by
design: if the LLM is offline or the text is too short it returns empties, so it
never blocks note saving (NFR-9).
"""

import json
import logging

from api.ai.llm import generate_json, llm_available

log = logging.getLogger(__name__)

_PROMPT = """Read the note below. Write ONE short, factual sentence summarising it,
and choose 2 to 4 short topic tags (single words or short phrases, lowercase).
Return a STRICT JSON object only: {{"summary": "<one sentence>", "tags": ["tag", ...]}}
Use ONLY what is in the note. Do not invent facts. Output JSON only, no commentary.

NOTE:
\"\"\"{text}\"\"\"
"""


def _safe_json(raw: str):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        i, j = raw.find("{"), raw.rfind("}")
        if i != -1 and j > i:
            try:
                return json.loads(raw[i:j + 1])
            except json.JSONDecodeError:
                return None
    return None


def summarize_and_tag(text: str) -> dict:
    """Return {"summary": str, "tags": [str]} for a note body. Empty on any failure."""
    text = (text or "").strip()
    if len(text) < 20 or not llm_available():
        return {"summary": "", "tags": []}
    try:
        raw = generate_json(_PROMPT.format(text=text[:6000]), max_tokens=200)
    except Exception as e:
        log.warning("Note summarize failed: %s", e)
        return {"summary": "", "tags": []}

    data = _safe_json(raw) or {}
    summary = (data.get("summary") or "").strip()
    tags = [str(t).strip().lower() for t in (data.get("tags") or []) if str(t).strip()][:4]
    return {"summary": summary, "tags": tags}
