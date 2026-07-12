#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build and run the all-in-one dev container (code-server + backend + frontend).
# Run this on the HOST:   ./dev-container/run.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE=note-app-dev
NAME=note-app-dev

# Host ports (override if any are already in use, e.g. CODE_PORT=8090 ./run.sh).
CODE_PORT="${CODE_PORT:-8080}"   # code-server IDE
FE_PORT="${FE_PORT:-5173}"       # frontend
BE_PORT="${BE_PORT:-9000}"       # backend API

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Building image '$IMAGE' (first build pulls Node/Python/Postgres + deps — a few minutes)..."
docker build -t "$IMAGE" -f "$ROOT/dev-container/Dockerfile" "$ROOT"

echo "▶ Removing any previous '$NAME' container..."
docker rm -f "$NAME" >/dev/null 2>&1 || true

echo "▶ Starting container '$NAME'..."
docker run -d --name "$NAME" \
  -p "${CODE_PORT}:8080" \
  -p "${FE_PORT}:5173" \
  -p "${BE_PORT}:9000" \
  "$IMAGE"

cat <<EOF

✓ Container is up.

  1. Open the IDE:   http://localhost:${CODE_PORT}
  2. In its terminal (Terminal ▸ New Terminal), run:

         ./scripts/start-all.sh

     …or start pieces individually:
         ./scripts/start-db.sh
         ./scripts/start-backend.sh
         ./scripts/start-frontend.sh

  App URLs once started:
     Frontend  →  http://localhost:${FE_PORT}
     API docs  →  http://localhost:${BE_PORT}/docs

  Stop everything:   docker rm -f $NAME
EOF
