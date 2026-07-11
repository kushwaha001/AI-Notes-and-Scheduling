# ─────────────────────────────────────────────────────────────────────────────
# All-in-one DEV container.
#
#   code-server (VS Code in the browser)  +  the full app (FastAPI backend +
#   React frontend)  +  PostgreSQL,  with Node 20, a Python venv, and ALL local
#   AI models baked in (embeddings, Whisper large-v3, docling+easyocr OCR).
#
# Everything runs offline except the LLM, which you point at your LAN vLLM (or
# any OpenAI-compatible server) from the app's Settings page.
#
# Layer order: system deps → Python/JS deps → model warmup → app code. The app
# code is copied LAST, so editing it doesn't invalidate the (slow) model layers.
#
# Build/run with dev-container/run.sh. See dev-container/README.md.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# ── System dependencies ──────────────────────────────────────────────────────
# PostgreSQL, Tesseract, ffmpeg (Whisper audio decode), Node 20 (Vite 8).
RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql postgresql-contrib \
      tesseract-ocr tesseract-ocr-eng \
      ffmpeg \
      curl ca-certificates git sudo procps \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── code-server (VS Code in the browser) ─────────────────────────────────────
RUN curl -fsSL https://code-server.dev/install.sh | sh

# ── Non-root user to run code-server and the app ─────────────────────────────
RUN useradd -m -s /bin/bash coder \
    && echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder \
    && chmod 0440 /etc/sudoers.d/coder

ENV APP=/home/coder/project
ENV FASTEMBED_CACHE_PATH=/home/coder/.cache/fastembed
ENV HF_HOME=/home/coder/.cache/huggingface
WORKDIR $APP

# ── Backend Python deps (just requirements first, for layer caching) ─────────
# Python 3.11 → wheels for everything (no source compiles). Extras:
#   PyJWT          — needed when AUTH_ENABLED=true (missing from requirements).
#   fastembed      — CPU/ONNX embeddings for the bundled embeddings server.
#   faster-whisper — local voice transcription (CPU/int8).
#   torch (CPU)    — from the PyTorch CPU index so docling/easyocr don't pull the
#                    multi-GB CUDA build.
#   docling+easyocr— document parsing + OCR of scanned images/photos.
COPY --chown=coder:coder backend/requirements.txt $APP/backend/requirements.txt
RUN python3 -m venv $APP/backend/.venv \
    && $APP/backend/.venv/bin/pip install --no-cache-dir --upgrade pip \
    && $APP/backend/.venv/bin/pip install --no-cache-dir -r $APP/backend/requirements.txt PyJWT fastembed faster-whisper==1.2.1 \
    && $APP/backend/.venv/bin/pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && $APP/backend/.venv/bin/pip install --no-cache-dir docling==2.107.0 easyocr==1.7.2

# ── Pre-cache ALL local models AS the coder user ─────────────────────────────
# Running as 'coder' makes every HOME-relative cache (docling, EasyOCR) and the
# HF/fastembed caches land under /home/coder with the right ownership, so they're
# found at runtime and work fully offline.
COPY --chown=coder:coder dev-container/warmup_models.py $APP/dev-container/warmup_models.py
RUN su coder -c "HOME=/home/coder FASTEMBED_CACHE_PATH=/home/coder/.cache/fastembed HF_HOME=/home/coder/.cache/huggingface DOCLING_DEVICE=cpu \
      $APP/backend/.venv/bin/python $APP/dev-container/warmup_models.py"

# ── Frontend deps (manifests first, for layer caching) ───────────────────────
COPY --chown=coder:coder front-end/package.json front-end/package-lock.json $APP/front-end/
RUN cd $APP/front-end && (npm install || echo "npm install deferred to runtime")

# ── App source (LAST — edits here don't bust the deps/model layers above) ────
COPY --chown=coder:coder . $APP
RUN chown -R coder:coder /home/coder && (chmod +x $APP/scripts/*.sh || true)

USER coder
EXPOSE 8080 9000 5173 5432 8100

# Start ONLY code-server. Run scripts/*.sh from its terminal to start the app.
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", "/home/coder/project"]
