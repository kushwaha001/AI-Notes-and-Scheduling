#!/usr/bin/env bash
# Serve the PRODUCTION build on :5173 (vite preview) — much faster than the dev
# server. Builds first if dist/ is missing or older than src/. The preview
# config proxies /api -> backend on :9000, so start the backend too (or use
# start-all.sh).
set -euo pipefail

cd "$(dirname "$0")/../front-end"

# node_modules is baked into the image; reinstall only if it is missing.
if [ ! -d node_modules ]; then
  echo "▶ Installing frontend dependencies..."
  npm install
fi

# Build if there is no dist yet, or any source file is newer than the build.
if [ ! -d dist ] || [ -n "$(find src index.html vite.config.js -newer dist -print -quit 2>/dev/null)" ]; then
  echo "▶ Building production bundle..."
  npm run build
fi

echo "▶ Serving production build on http://0.0.0.0:5173"
exec ./node_modules/.bin/vite preview --host 0.0.0.0 --port 5173 --strictPort
