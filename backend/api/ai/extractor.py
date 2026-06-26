"""
FR-8/FR-10/FR-11 — Structured field extraction with a local model via Ollama.

Takes the document text (from Docling) and asks the local model (default
gemma3:4b, configurable via OLLAMA_MODEL) to return structured JSON fields with
per-field confidence. Then applies date validation:
  * a meeting date in the past is flagged (meeting_date_flag) — implausible
  * a reply-by date in the past is valid but flagged overdue (reply_by_overdue)
  * unreadable / missing fields are left null — never invented (FR-11)
"""

import json
import logging
from datetime import datetime, date

import httpx

from api.config import OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_KEEP_ALIVE

log = logging.getLogger(__name__)

FIELDS = ["subject", "event_date", "event_time", "venue", "attendees",
          "ref_number", "deadline", "reply_by"]

_PROMPT = """You are a precise information extractor for official letters, notices, meeting invites and voice notes.
Today's date is {today}. Resolve relative dates ("tomorrow", "next Friday") to actual calendar dates.
Read the text below and extract ONLY information that is actually present.

Return a STRICT JSON object with these keys:
- "subject": short title/subject of the letter or meeting, or null
- "event_date": the meeting/event date as "DD MMM YYYY" (e.g. "09 Jun 2026"), or null
- "event_time": time as "HH:MM" 24-hour, or null
- "venue": location, or null
- "attendees": comma-separated names, or null
- "ref_number": reference/file number, or null
- "deadline": action deadline date as "DD MMM YYYY", or null
- "reply_by": reply-by / suspense date as "DD MMM YYYY", or null
- "item_type": "event" if it describes a meeting/appointment, otherwise "task"
- "field_confidence": an object mapping EACH field above (except item_type) to a number 0.0-1.0

Rules:
- NEVER invent or guess a date. If a date is not clearly written, use null and confidence 0.
- For relative dates, compute the ACTUAL calendar date from today ({today}). "tomorrow" = today + 1 day; "next Friday" = the first Friday strictly after today.
- Use null for anything not present. Do not hallucinate.
- Output JSON only, no commentary.

EXAMPLE
Input: "Subject: Budget Meeting. Date: 09 Jun 2026 at 10:00 AM, Room 4. Ref AB/12. Reply by 05 Jun 2026."
Output: {{"subject":"Budget Meeting","event_date":"09 Jun 2026","event_time":"10:00","venue":"Room 4","attendees":null,"ref_number":"AB/12","deadline":null,"reply_by":"05 Jun 2026","item_type":"event","field_confidence":{{"subject":0.95,"event_date":0.95,"event_time":0.9,"venue":0.9,"attendees":0,"ref_number":0.9,"deadline":0,"reply_by":0.9}}}}

DOCUMENT:
\"\"\"
{text}
\"\"\"
"""


def ollama_available() -> bool:
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def model_available() -> bool:
    """True only if the configured OLLAMA_MODEL has actually been pulled."""
    try:
        r = httpx.get(f"{OLLAMA_HOST}/api/tags", timeout=3)
        names = [m.get("name", "") for m in r.json().get("models", [])]
        base = OLLAMA_MODEL.split(":")[0]
        return any(n == OLLAMA_MODEL or n.split(":")[0] == base for n in names)
    except Exception:
        return False


def _ollama_generate(prompt: str) -> str:
    r = httpx.post(
        f"{OLLAMA_HOST}/api/generate",
        json={
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "keep_alive": OLLAMA_KEEP_ALIVE,   # keep model resident → no cold start
            "options": {"temperature": 0},
        },
        timeout=300,
    )
    r.raise_for_status()
    return r.json().get("response", "")


def _parse_date(value):
    """Parse a model-produced date string into a date, or None. Never guesses."""
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    for fmt in ("%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b, %Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def _clean_time(value):
    if not value or not isinstance(value, str):
        return None
    v = value.strip()
    for fmt in ("%H:%M", "%I:%M %p", "%I%p", "%I:%M%p"):
        try:
            return datetime.strptime(v, fmt).strftime("%H:%M")
        except ValueError:
            continue
    return None


def _safe_json(raw: str) -> dict:
    """Parse JSON, tolerating code fences or surrounding prose."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass
    return None


def extract_fields(text: str) -> dict:
    """Run the model and return a normalised extraction dict ready for the DB."""
    prompt = _PROMPT.format(text=text[:12000], today=date.today().isoformat())
    raw = _ollama_generate(prompt)
    data = _safe_json(raw)
    if data is None:
        # one repair attempt — re-prompt for valid JSON only
        log.warning("Model returned non-JSON; retrying once.")
        raw = _ollama_generate(prompt + "\n\nReturn ONLY valid JSON, nothing else.")
        data = _safe_json(raw) or {}

    conf = data.get("field_confidence") or {}

    event_date = _parse_date(data.get("event_date"))
    deadline   = _parse_date(data.get("deadline"))
    reply_by   = _parse_date(data.get("reply_by"))
    today = date.today()

    return {
        "subject":          (data.get("subject") or None),
        "event_date":       event_date,
        "event_time":       _clean_time(data.get("event_time")),
        "venue":            (data.get("venue") or None),
        "attendees":        (data.get("attendees") or None),
        "ref_number":       (data.get("ref_number") or None),
        "deadline":         deadline,
        "reply_by":         reply_by,
        # FR-11 date sanity flags
        "meeting_date_flag": bool(event_date and event_date < today),
        "reply_by_overdue":  bool(reply_by and reply_by < today),
        "item_type":        "task" if data.get("item_type") == "task" else "event",
        "field_confidence": {k: float(conf.get(k, 0) or 0) for k in FIELDS},
        "model_name":       OLLAMA_MODEL,
    }
