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
ALLOWED_AUDIO = {".wav", ".mp3", ".m4a", ".ogg"}

# ── Ollama (local LLM on Windows + CUDA) ─────────────────────
OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

# ── Faster-Whisper STT ────────────────────────────────────────
WHISPER_MODEL        = os.getenv("WHISPER_MODEL",        "medium")
WHISPER_DEVICE       = os.getenv("WHISPER_DEVICE",       "cuda")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")

# ── Qdrant vector DB ──────────────────────────────────────────
QDRANT_HOST       = os.getenv("QDRANT_HOST",       "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "udaan_notes")

# ── Redis cache ───────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_TTL  = int(os.getenv("REDIS_TTL",  "3600"))

# ── PostgreSQL ────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "database": os.getenv("DB_NAME",     "udaan_db"),
    "user":     os.getenv("DB_USER",     "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}
