#!/usr/bin/env bash
# One-command setup: creates .venv and installs dependencies.
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! "$PY" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "Python 3.10+ is required (found $("$PY" --version 2>&1))." >&2
  exit 1
fi

[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
# requirements.txt runs the app; requirements-tools.txt adds the dataset
# build, audio and test tools. Set LEXIMASTER_APP_ONLY=1 to skip the tools.
if [ "${LEXIMASTER_APP_ONLY:-0}" = "1" ]; then
  .venv/bin/pip install --quiet -r requirements.txt
else
  .venv/bin/pip install --quiet -r requirements-tools.txt
fi
# ffmpeg (a system package, e.g. `brew install ffmpeg`) is needed for audio builds.
command -v ffmpeg >/dev/null || echo "Note: ffmpeg not found; install it to build audio (brew install ffmpeg)."
mkdir -p data/audio data/cache data/recordings

if [ ! -f .env ]; then
  cat > .env <<'ENV'
# Local settings for LexiMaster (not shared). Empty values are ignored.
# Identifies you to Wikimedia/Wiktionary, as their robot policy requires.
LEXIMASTER_CONTACT=
# Needed for the expand and enrich stages of build_dataset.py.
ANTHROPIC_API_KEY=
ENV
  echo "Created .env: fill in LEXIMASTER_CONTACT and ANTHROPIC_API_KEY."
fi

echo "Setup complete."
echo "Build the dataset:  .venv/bin/python build_dataset.py"
