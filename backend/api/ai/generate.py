"""
Local-LLM generation helpers (air-gapped): pull actionable items out of a note,
and draft a reply to a letter. Both use the same OpenAI-compatible client as the
rest of the app (api.ai.llm) and are best-effort — they return empties / raise a
clear error rather than inventing content.
"""

import json
import logging
from datetime import date

from api.ai.llm import generate_json, generate_text, llm_available

log = logging.getLogger(__name__)


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


_ACTIONS_PROMPT = """You extract ACTION ITEMS from a personal note. Today is {today}.
Read the note and list every task or scheduled event it implies. Resolve relative
dates ("tomorrow", "next Friday") to actual calendar dates.

Return STRICT JSON only:
{{"items": [
  {{"type": "task"|"event", "title": "...", "date": "DD MMM YYYY"|null, "time": "HH:MM"|null, "venue": ""|null}}
]}}
Rules: only what the note actually implies; never invent dates; an item with a
specific date/time/place is an "event", otherwise a "task". Output JSON only.

NOTE:
\"\"\"{text}\"\"\""""


def extract_actions(text: str) -> list:
    """Return a list of proposed action items from a note body. Empty on failure."""
    text = (text or "").strip()
    if len(text) < 8 or not llm_available():
        return []
    try:
        raw = generate_json(_ACTIONS_PROMPT.format(text=text[:6000], today=date.today().isoformat()),
                            max_tokens=500)
    except Exception as e:
        log.warning("Note action extraction failed: %s", e)
        return []
    data = _safe_json(raw) or {}
    out = []
    for it in (data.get("items") or [])[:12]:
        title = (it.get("title") or "").strip()
        if not title:
            continue
        out.append({
            "item_type": "event" if it.get("type") == "event" else "task",
            "title": title,
            "date": (it.get("date") or "").strip() or None,
            "time": (it.get("time") or "").strip() or None,
            "venue": (it.get("venue") or "").strip() or None,
        })
    return out


_REPLY_PROMPT = """You draft a concise, formal reply letter. Today is {today}.
Below is an incoming letter{ref_line}. Write a professional reply that acknowledges
it and responds to its main points. Keep it brief and neutral. Do NOT invent facts,
names, dates or figures that are not present. Return the reply text only (no JSON,
no preamble).

INCOMING LETTER:
\"\"\"{text}\"\"\""""


def draft_reply(letter_text: str, ref_number: str | None = None) -> str:
    """Draft a reply to a letter. Raises RuntimeError when the LLM is unavailable."""
    if not llm_available():
        raise RuntimeError("AI model not available (LLM server offline).")
    ref_line = f" with reference {ref_number}" if ref_number else ""
    prompt = _REPLY_PROMPT.format(text=(letter_text or "")[:6000],
                                  ref_line=ref_line, today=date.today().isoformat())
    return (generate_text(prompt, temperature=0.3, max_tokens=600) or "").strip()


_CAPTURE_PROMPT = """Turn a quick one-line note into a single task or event. Today is {today}.
Resolve relative dates ("tomorrow", "next Tuesday"). Return STRICT JSON only:
{{"type": "task"|"event", "title": "...", "date": "DD MMM YYYY"|null, "time": "HH:MM"|null,
  "venue": ""|null, "priority": "Low"|"Medium"|"High"|"Critical"}}
An item with a clear date/time/place is an "event", otherwise a "task". Never invent
a date. Default priority Medium unless the text implies urgency. JSON only.

INPUT: "{text}\""""


def parse_capture(text: str) -> dict:
    """Parse a natural-language quick-capture line into one item. Raises RuntimeError
    when the LLM is offline."""
    if not llm_available():
        raise RuntimeError("AI model not available (LLM server offline).")
    raw = generate_json(_CAPTURE_PROMPT.format(text=(text or "").strip()[:400],
                                               today=date.today().isoformat()), max_tokens=200)
    data = _safe_json(raw) or {}
    prio = data.get("priority")
    if prio not in ("Low", "Medium", "High", "Critical"):
        prio = "Medium"
    return {
        "item_type": "event" if data.get("type") == "event" else "task",
        "title": (data.get("title") or "").strip() or text.strip()[:80],
        "date": (data.get("date") or "").strip() or None,
        "time": (data.get("time") or "").strip() or None,
        "venue": (data.get("venue") or "").strip() or None,
        "priority": prio,
    }
