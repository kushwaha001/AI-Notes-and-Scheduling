#!/usr/bin/env bash
# Stop the backend, frontend and PostgreSQL (leaves code-server running).
set +e

echo "▶ Stopping backend..."
pkill -f "uvicorn api.main:app" 2>/dev/null && echo "  ✓ backend stopped" || echo "  · backend not running"

echo "▶ Stopping frontend..."
pkill -f "vite" 2>/dev/null && echo "  ✓ frontend stopped" || echo "  · frontend not running"

echo "▶ Stopping embeddings server..."
pkill -f "embed_server.py" 2>/dev/null && echo "  ✓ embeddings stopped" || echo "  · embeddings not running"

echo "▶ Stopping PostgreSQL..."
sudo service postgresql stop 2>/dev/null && echo "  ✓ postgres stopped" || echo "  · postgres not running"

echo "Done."
