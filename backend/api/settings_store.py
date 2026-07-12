"""
Runtime-editable app settings, DB-backed with an in-process cache.

Lets the LLM endpoint (vLLM URL, model, key, system prompt) be changed from the
Settings page WITHOUT editing .env or restarting — essential on an air-gapped
box. Values saved here override the .env defaults in api.config; a blank value
falls back to the env default.
"""

import logging
from threading import Lock

from api.db import get_db

log = logging.getLogger(__name__)

_cache = None            # dict of saved overrides, or None until first load
_lock = Lock()
_READY = False


def _ensure_table(cur):
    global _READY
    if _READY:
        return
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key        TEXT PRIMARY KEY,
            value      TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    _READY = True


def _load() -> dict:
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        conn = get_db(); cur = conn.cursor()
        try:
            _ensure_table(cur)
            conn.commit()
            cur.execute("SELECT key, value FROM app_settings")
            _cache = {r["key"]: r["value"] for r in cur.fetchall()}
        except Exception as e:               # never let settings break the app
            log.warning("Settings load failed (using env defaults): %s", e)
            _cache = {}
        finally:
            cur.close(); conn.close()
        return _cache


def get_setting(key: str, default: str = "") -> str:
    """Saved override for `key`, else `default` (usually the env value)."""
    val = _load().get(key)
    return val if val not in (None, "") else default


def get_setting_exact(key: str, default: str = ""):
    """Like get_setting, but an explicitly-saved EMPTY value is returned as ""
    (it does NOT fall back to the default). Needed where blank is meaningful —
    e.g. model blank = auto-detect, api_key blank = send no key. Only a key
    that was never saved falls back to `default`."""
    data = _load()
    return data[key] if key in data else default


def set_settings(values: dict):
    """Upsert overrides and refresh the cache. A value of None DELETES the row
    (full fallback to env); an empty string is stored as an explicit blank."""
    global _cache
    conn = get_db(); cur = conn.cursor()
    try:
        _ensure_table(cur)
        for k, v in values.items():
            if v is None:
                cur.execute("DELETE FROM app_settings WHERE key = %s", (k,))
            else:
                cur.execute("""
                    INSERT INTO app_settings (key, value, updated_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
                """, (k, v))
        conn.commit()
    finally:
        cur.close(); conn.close()
    with _lock:
        _cache = None                        # reload on next read
