import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ── Upload paths (Windows-safe) ───────────────────────────────
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "docs")
AUDIO_DIR  = os.path.join(BASE_DIR, "uploads", "audio")
NOTES_DIR  = os.path.join(BASE_DIR, "notes")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR,  exist_ok=True)
os.makedirs(NOTES_DIR,  exist_ok=True)

# ── File limits ───────────────────────────────────────────────
MAX_SIZE  = 50 * 1024 * 1024   # 50 MB
MAX_AUDIO = 5 * 60             # 5 min in seconds
MAX_BATCH = int(os.getenv("MAX_BATCH", "20"))   # max files queued at once (FR-1, configurable)

ALLOWED_DOCS  = {"application/pdf", "image/jpeg", "image/png", "image/tiff"}
# .webm/.opus are what browsers record via MediaRecorder
ALLOWED_AUDIO = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".opus"}

# ── Ollama (local LLM/VLM on Windows + CUDA) ─────────────────
OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")   # NFR-7: swappable via env

# ── AI extraction toggles ────────────────────────────────────
AI_ENABLED           = os.getenv("AI_ENABLED", "true").lower() == "true"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))  # FR-10/FR-14
# Keep the model resident in VRAM between requests (efficiency — avoids cold starts)
OLLAMA_KEEP_ALIVE    = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
# FR-4 scan-quality floor: fewer readable chars than this → treat as unreadable
MIN_READABLE_CHARS   = int(os.getenv("MIN_READABLE_CHARS", "25"))

# ── Faster-Whisper STT ────────────────────────────────────────
# distil-large-v3: English-only, near large-v3 accuracy, ~6x faster. On GPU
# (cuda/float16) it transcribes a short clip in well under a second once warm.
WHISPER_MODEL        = os.getenv("WHISPER_MODEL",        "distil-large-v3")
WHISPER_DEVICE       = os.getenv("WHISPER_DEVICE",       "cuda")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
# Language hint skips auto-detection (faster + more reliable). Set to "" to
# auto-detect if you switch to a multilingual model.
WHISPER_LANGUAGE     = os.getenv("WHISPER_LANGUAGE", "en")

# ── Qdrant vector DB ──────────────────────────────────────────
QDRANT_HOST       = os.getenv("QDRANT_HOST",       "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "udaan_notes")

# ── Redis cache ───────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_TTL  = int(os.getenv("REDIS_TTL",  "3600"))

# ── Authentication (v2 — Keycloak / OIDC) ─────────────────────
# When AUTH_ENABLED is false the app behaves exactly like v1: every request is
# attributed to the seeded "default" user (single-user mode). This keeps dev and
# any air-gapped box where Keycloak isn't running fully functional (NFR-9).
AUTH_ENABLED   = os.getenv("AUTH_ENABLED", "false").lower() == "true"
# Base URL of the Keycloak server (no trailing slash), e.g. http://localhost:8080
KEYCLOAK_URL       = os.getenv("KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
KEYCLOAK_REALM     = os.getenv("KEYCLOAK_REALM", "udaan")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "udaan-frontend")
# Verify the token audience against the client id. Keycloak access tokens often
# carry aud="account", so this is off by default; turn on if you add an audience
# mapper for the client.
KEYCLOAK_VERIFY_AUD = os.getenv("KEYCLOAK_VERIFY_AUD", "false").lower() == "true"
# Derived OIDC endpoints
KEYCLOAK_ISSUER = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"

# ── PostgreSQL ────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME",     "udaan_db"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}
