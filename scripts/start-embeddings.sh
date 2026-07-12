#!/usr/bin/env bash
# Start the bundled OpenAI-compatible embeddings server (fastembed, CPU/ONNX) on
# :8100. It powers semantic search / Ask (RAG) when your LLM server doesn't serve
# embeddings (e.g. Groq, or a chat-only vLLM). The app's EMBED_BASE_URL points
# here by default (see start-backend.sh); override from the Settings page to use a
# dedicated embeddings server on your LAN instead.
set -euo pipefail

cd "$(dirname "$0")/../backend"

echo "▶ Starting embeddings server on http://0.0.0.0:8100 (model: bge-small-en-v1.5)"
exec ./.venv/bin/python /home/coder/project/dev-container/embed_server.py
