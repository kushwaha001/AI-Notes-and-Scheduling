#!/usr/bin/env bash
# Start the FastAPI backend on :9000 (no autoreload — safer unattended; restart
# this script after code changes).
# Creates a container-appropriate backend/.env on first run.
set -euo pipefail

cd "$(dirname "$0")/../backend"

# First run: write a .env pointing at the in-container Postgres. Edit freely
# afterwards — or set the AI endpoints from the in-app Settings page instead.
if [ ! -f .env ]; then
  cat > .env <<'EOF'
# ── PostgreSQL (in-container) ──
DB_HOST=localhost
DB_PORT=5432
DB_NAME=udaan_db
DB_USER=postgres
DB_PASSWORD=postgres

# ── Single-user mode (no Keycloak) ──
AUTH_ENABLED=false

# ── LLM ──
# Set this live from the app's Settings page, or point it at your LAN vLLM here
# (include the /v1 suffix).
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=

# ── Embeddings (semantic search / Ask) ──
# Defaults to the bundled local embeddings server (scripts/start-embeddings.sh),
# so semantic search works out of the box. Override from Settings for a LAN one.
EMBED_BASE_URL=http://localhost:8100/v1
EMBED_MODEL=bge-small-en-v1.5

# ── Voice transcription (Whisper large-v3, CPU) ──
# Model is baked into the image. CPU/int8 so no GPU is needed (slower than GPU —
# a short note takes a few seconds to ~a minute). Set a GPU here if you have one.
WHISPER_MODEL=large-v3
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
WHISPER_BEAM_SIZE=1
WHISPER_LANGUAGE=en

# ── Document OCR (docling + easyocr, scanned images/photos) ──
# In-process docling on CPU. OCR_MODE=auto: digital PDFs skip OCR (fast); scans
# and images get OCR'd. Models are baked into the image.
DOCLING_DEVICE=cpu
OCR_MODE=auto

# ── Air-gapped: force local model caches (no HuggingFace network calls) ──
OFFLINE_MODE=true
EOF
  echo "✓ Wrote backend/.env (container defaults)"
fi

# Use the venv baked into the image (fall back to a fresh one if missing).
if [ ! -x .venv/bin/uvicorn ]; then
  echo "▶ venv missing — creating it..."
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt PyJWT
fi

echo "▶ Starting backend on http://0.0.0.0:9000  (docs: /docs)"
exec ./.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 9000
