#!/usr/bin/env bash
# Start LexiMaster and open it in the browser.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8765}"
[ -x .venv/bin/python ] || ./setup.sh

if [ ! -f data/words.json ]; then
  echo "No dataset yet (data/words.json). Build it with: .venv/bin/python build_dataset.py"
  echo "Starting anyway; the app will be empty until the build has run."
fi

URL="http://localhost:${PORT}"
( for _ in $(seq 1 40); do
    if curl -s -o /dev/null "${URL}/api/health"; then open "$URL" 2>/dev/null || true; exit 0; fi
    sleep 0.25
  done ) &

echo "LexiMaster running at ${URL}  (Ctrl-C to stop)"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT}" --log-level warning
