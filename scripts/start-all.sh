#!/usr/bin/env bash
# One-shot: start PostgreSQL, then the backend and frontend in the background.
# Logs go to logs/backend.log and logs/frontend.log.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
mkdir -p "$ROOT/logs"

# 1) Database (foreground — quick).
bash "$DIR/start-db.sh"

# 2) Embeddings server (background) — powers semantic search / Ask.
echo "▶ Starting embeddings (logs: logs/embed.log)"
nohup bash "$DIR/start-embeddings.sh" > "$ROOT/logs/embed.log" 2>&1 &

# 3) Backend (background).
echo "▶ Starting backend  (logs: logs/backend.log)"
nohup bash "$DIR/start-backend.sh" > "$ROOT/logs/backend.log" 2>&1 &

# 4) Frontend (background).
echo "▶ Starting frontend (logs: logs/frontend.log)"
nohup bash "$DIR/start-frontend.sh" > "$ROOT/logs/frontend.log" 2>&1 &

sleep 2
cat <<EOF

✓ Everything is starting up.
     Frontend    →  http://localhost:5173
     API docs    →  http://localhost:9000/docs
     code-server →  http://localhost:8080
     embeddings  →  http://localhost:8100  (internal, for semantic search)

  Watch the logs:   tail -f logs/backend.log logs/frontend.log logs/embed.log
  Stop the app:     ./scripts/stop-all.sh

  Note: set the LLM Base URL on the app's Settings page (semantic search's
  embeddings are already served locally on :8100).
EOF
