"""Build a small site (data/index.json, detail and mention files) from
tests/fixtures/words_sample.json, the 200 words the Python tests use, so the
website's engine (static/js/local/server.js) can be tested in Node without a
full build:

    python tests/js/fixture_site.py OUT_DIR
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import tools.build_site as bs  # noqa: E402


def sample_words() -> list[dict]:
    """The sample words with their levels (build_dataset.word_level, as a real
    build gives them); the sample file itself has none."""
    from build_dataset import word_level
    words = json.loads((ROOT / "tests" / "fixtures" / "words_sample.json").read_text(encoding="utf-8"))["words"]
    for w in words:
        w.setdefault("level", word_level(w))
    return words


def main(out: Path) -> int:
    words = sample_words()
    out.mkdir(parents=True, exist_ok=True)
    bs.DOCS = out                                   # every writer below writes under DOCS
    (out / "data" / "gloss").mkdir(parents=True, exist_ok=True)
    ids = out / "word_ids.json"                     # a ledger of its own, not seeds/word_ids.json
    real_ids = bs.word_ids
    bs.word_ids = lambda ws, path=ids: real_ids(ws, path)
    bs.build_mentions(words)
    bs.build_data(words, {})
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
