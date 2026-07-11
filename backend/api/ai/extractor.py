"""
FR-8/FR-10/FR-11 — Structured field extraction via an OpenAI-compatible LLM.

Takes the document text (from Docling) and asks the configured model (vLLM /
Ollama, see api.ai.llm) to return structured JSON fields with per-field
confidence. Then applies date validation:
  * a meeting date in the past is flagged (meeting_date_flag) — implausible
  * a reply-by date in the past is valid but flagged overdue (reply_by_overdue)
  * unreadable / missing fields are left null — never invented (FR-11)
"""

import json
import logging
from datetime import datetime, date

from api.config import LLM_MODEL
from api.ai.llm import generate_json, generate_json_vision, resolve_model

log = logging.getLogger(__name__)

FIELDS = ["subject", "event_date", "event_time", "event_end_time", "venue", "attendees",
          "ref_number", "deadline", "reply_by"]

# Shared field schema + rules — identical for the text and vision prompts so both
# paths produce the same JSON shape and go through the same normaliser.
_SCHEMA = """Return a STRICT JSON object with these keys:
- "subject": a short title for THIS item. For a letter/meeting use its subject line; for a task/reminder/action write a concise action title (e.g. "Submit action taken report"). ALWAYS provide a non-null 3-6 word title — never null.
- "event_date": the meeting/event date as "DD MMM YYYY" (e.g. "09 Jun 2026"), or null
- "event_time": START time as "HH:MM" 24-hour, or null
- "event_end_time": END time as "HH:MM" 24-hour when a time RANGE is given (e.g. "1430-1600 hrs", "from 2:30 to 4:00 PM"); else null
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
- If a time RANGE is given ("1430-1600 hrs", "from 2:30 to 4:00 PM"), put the START in "event_time" and the END in "event_end_time". A single time leaves "event_end_time" null.
- ALWAYS give "subject" a short title. If there is no explicit subject line, summarise the main action or topic in 3-6 words. Never return null for subject.
- Use null for anything not present (except subject). Do not hallucinate.
- Output JSON only, no commentary."""

_PROMPT = """You are a precise information extractor for official letters, notices, meeting invites and voice notes.
Today's date is {today}. Resolve relative dates ("tomorrow", "next Friday") to actual calendar dates.
Read the text below and extract ONLY information that is actually present.

""" + _SCHEMA + """

EXAMPLE 1 (a meeting)
Input: "Subject: Budget Meeting. Date: 09 Jun 2026 at 10:00 AM, Room 4. Ref AB/12. Reply by 05 Jun 2026."
Output: {{"subject":"Budget Meeting","event_date":"09 Jun 2026","event_time":"10:00","venue":"Room 4","attendees":null,"ref_number":"AB/12","deadline":null,"reply_by":"05 Jun 2026","item_type":"event","field_confidence":{{"subject":0.95,"event_date":0.95,"event_time":0.9,"venue":0.9,"attendees":0,"ref_number":0.9,"deadline":0,"reply_by":0.9}}}}

EXAMPLE 2 (a reminder / task — note the derived subject title)
Input: "Remind me to submit the action taken report on the committee minutes by 15 Jul 2026."
Output: {{"subject":"Submit action taken report","event_date":null,"event_time":null,"venue":null,"attendees":null,"ref_number":null,"deadline":"15 Jul 2026","reply_by":null,"item_type":"task","field_confidence":{{"subject":0.9,"event_date":0,"event_time":0,"venue":0,"attendees":0,"ref_number":0,"deadline":0.9,"reply_by":0}}}}

DOCUMENT:
\"\"\"
{text}
\"\"\"
"""

_VISION_PROMPT = """You are a precise information extractor for official letters, notices, meeting invites and HANDWRITTEN notes.
Today's date is {today}. Resolve relative dates ("tomorrow", "next Friday") to actual calendar dates.
Carefully READ the attached page image(s) — including any handwriting — and extract ONLY information that is actually present.

""" + _SCHEMA


def _model_label() -> str:
    """The model id to record on the extraction row (best-effort)."""
    try:
        return resolve_model()
    except Exception:
        return LLM_MODEL or "llm"


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


def _fallback_title(text: str):
    """A concise title derived from the source text — used only when the model
    fails to provide a subject, so a task/note never lands completely untitled."""
    import re
    t = " ".join((text or "").split())
    if not t:
        return None
    # strip common voice/letter lead-ins
    t = re.sub(r"^(please\s+|kindly\s+|remind me to\s+|reminder to\s+|note to\s+|"
               r"i need to\s+|we need to\s+|subject\s*:\s*)", "", t, flags=re.I)
    title = " ".join(t.split()[:8]).rstrip(" .,;:-")
    return (title[:80] or None)


def _normalise(data: dict, source_text: str = None) -> dict:
    """Turn a raw model JSON dict into the DB-ready extraction row. Shared by the
    text and vision paths so both apply the same date parsing + FR-11 sanity flags."""
    data = data or {}
    conf = dict(data.get("field_confidence") or {})

    event_date = _parse_date(data.get("event_date"))
    deadline   = _parse_date(data.get("deadline"))
    reply_by   = _parse_date(data.get("reply_by"))
    today = date.today()

    subject = (data.get("subject") or "").strip() or None
    if not subject:                              # model gave no title — derive one
        subject = _fallback_title(source_text)
        if subject:
            conf["subject"] = max(float(conf.get("subject", 0) or 0), 0.4)

    return {
        "subject":          subject,
        "event_date":       event_date,
        "event_time":       _clean_time(data.get("event_time")),
        "event_end_time":   _clean_time(data.get("event_end_time")),
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
        "model_name":       _model_label(),
    }


def extract_fields(text: str) -> dict:
    """Run the model on OCR/parsed text and return a normalised extraction dict."""
    prompt = _PROMPT.format(text=text[:12000], today=date.today().isoformat())
    raw = generate_json(prompt)
    data = _safe_json(raw)
    if data is None:
        # one repair attempt — re-prompt for valid JSON only
        log.warning("Model returned non-JSON; retrying once.")
        raw = generate_json(prompt + "\n\nReturn ONLY valid JSON, nothing else.")
        data = _safe_json(raw) or {}
    return _normalise(data, source_text=text)


def extract_fields_from_images(images: list) -> dict:
    """Run the vision model directly on page image(s) — used for scans and
    handwriting, which OCR reads poorly. Same JSON shape as the text path."""
    prompt = _VISION_PROMPT.format(today=date.today().isoformat())
    raw = generate_json_vision(prompt, images)
    data = _safe_json(raw)
    if data is None:
        log.warning("Vision model returned non-JSON; retrying once.")
        raw = generate_json_vision(prompt + "\n\nReturn ONLY valid JSON, nothing else.", images)
        data = _safe_json(raw) or {}
    return _normalise(data)
