#!/usr/bin/env bash
# (Re)install dependencies. Normally already baked into the dev image — use this
# only after a clean checkout or a dependency change.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ Backend: Python venv + requirements"
cd "$ROOT/backend"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r requirements.txt PyJWT

echo "▶ Frontend: npm install"
cd "$ROOT/front-end"
npm install

echo "✓ Setup complete. Start with:  ./scripts/start-all.sh"
