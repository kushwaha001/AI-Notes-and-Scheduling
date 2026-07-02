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

# ── LLM (OpenAI-compatible API: vLLM, Ollama /v1, TEI, …) ─────
# Every model is reached by URL now (NFR-7). vLLM and Ollama both expose the
# OpenAI-compatible /v1 API, so one client works for either — just point the URL.
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
# Model id the server serves (vLLM --served-model-name). Leave EMPTY to auto-pick
# the first model the server reports at /v1/models (handy when you're unsure).
LLM_MODEL    = os.getenv("LLM_MODEL", "")
LLM_API_KEY  = os.getenv("LLM_API_KEY", "")
# Ask for a strict JSON object back. If a server rejects this param we retry
# without it automatically, so it's safe to leave on.
LLM_JSON_MODE = os.getenv("LLM_JSON_MODE", "true").lower() == "true"

# ── Embeddings (OpenAI-compatible: a separate vLLM/TEI, or the same server) ──
EMBED_BASE_URL = (os.getenv("EMBED_BASE_URL") or LLM_BASE_URL).rstrip("/")
EMBED_MODEL    = os.getenv("EMBED_MODEL", "bge-m3")
EMBED_API_KEY  = os.getenv("EMBED_API_KEY", "")

# ── Docling (document parsing) ────────────────────────────────
# Empty = run Docling in-process (bundled). Set to your running docling-serve base
# URL (e.g. http://OFFICE-DOCLING:5001) to offload parsing to that server.
DOCLING_URL          = os.getenv("DOCLING_URL", "").rstrip("/")
DOCLING_API_KEY      = os.getenv("DOCLING_API_KEY", "")
DOCLING_CONVERT_PATH = os.getenv("DOCLING_CONVERT_PATH", "/v1/convert/file")

# ── OCR policy ────────────────────────────────────────────────
# auto  = OCR only when a PDF has no text layer (scans/images); skip digital PDFs
# force = always OCR;  off = never OCR
OCR_MODE = os.getenv("OCR_MODE", "auto").lower()

# Device for in-process Docling (layout + OCR models). On a single GPU that also
# runs the LLM/Whisper, the layout model can hit CUDA out-of-memory. Options:
#   auto = use CUDA if available, and automatically fall back to CPU on a GPU
#          failure (recommended — robust under VRAM pressure);
#   cpu  = always CPU (safe, slower — the GPU stays free for the LLM/Whisper);
#   cuda = force CUDA (fastest, but fails if VRAM is exhausted).
# Ignored when DOCLING_URL is set (remote docling-serve does its own placement).
DOCLING_DEVICE = os.getenv("DOCLING_DEVICE", "auto").lower()

# ── Air-gapped / offline ML mode ──────────────────────────────
# In a no-internet deployment the model caches are pre-staged, but some ML libs
# (HuggingFace / Transformers, used by Whisper and in-process Docling) still try
# to "check for updates" over HTTPS on load — which hangs on a dead network.
# OFFLINE_MODE=true forces them to use ONLY the local cache. Set it on the
# air-gapped box; leave false on an internet box that builds the model caches.
OFFLINE_MODE = os.getenv("OFFLINE_MODE", "false").lower() == "true"
if OFFLINE_MODE:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

# ── AI extraction toggles ────────────────────────────────────
AI_ENABLED           = os.getenv("AI_ENABLED", "true").lower() == "true"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))  # FR-10/FR-14
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
# Beam search width. 1 = greedy (fastest); 5 = the Whisper default (more accurate,
# negligible cost on a dedicated GPU). Raise for accuracy, lower for raw speed.
WHISPER_BEAM_SIZE    = int(os.getenv("WHISPER_BEAM_SIZE", "5"))

# ── Qdrant vector DB ──────────────────────────────────────────
# Empty QDRANT_URL = embedded on-disk store (backend/qdrant_data, single process,
# zero setup). Set QDRANT_URL to a running server (recommended for multi-user and
# multiple workers), e.g. http://OFFICE-QDRANT:6333, plus QDRANT_API_KEY if it
# requires one. The health check follows whichever mode is active.
QDRANT_URL        = os.getenv("QDRANT_URL", "").rstrip("/")
QDRANT_API_KEY    = os.getenv("QDRANT_API_KEY", "")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "udaan_content")

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
