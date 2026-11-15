"""Which prepositions are good English after each grammar-quiz word, from
Google Books Ngram, so a quiz never offers one of them as wrong.

    .venv/bin/python tools/pattern_preps.py          # fetch what's missing (resumable)
    .venv/bin/python tools/pattern_preps.py --stats

A grammar question ("impatient ___ sb" → with) offers wrong prepositions;
"impatient of" is formal but correct, so it mustn't be one. For each verb
or adjective with a preposition pattern, this asks how common "word + prep"
is in American books for each preposition the quiz could offer, and caches
the answers in data/cache/pattern_preps.json. build_dataset.assemble() turns
them into nuance.also_preps (common enough to count as right; see
ALSO_PREP_SHARE). Free, about one request a second.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.phrase_freq import PAUSE, fetch  # noqa: E402

CACHE = ROOT / "data" / "cache" / "pattern_preps.json"
PREPS = ("on", "in", "at", "of", "to", "for", "with", "about", "from", "by")   # the quiz's COMMON_PREPS
BATCH = 20


def pattern_words(words: list[dict]) -> list[str]:
    """Verbs and adjectives whose patterns use a preposition (the words a
    grammar question can be built on: app/api/practice.py PREPOSITIONS, which
    includes "into", "against" …), single words only."""
    from app.api.practice import PREPOSITIONS
    out = set()
    for w in words:
        n = w.get("nuance") or {}
        pos = ((n.get("core") or {}).get("pos") or "").lower()
        if pos not in ("verb", "adjective") or " " in w["word"]:
            continue
        pats = " ".join(n.get("patterns") or []).lower()
        if any(re.search(rf"\b{p}\b", pats) for p in PREPOSITIONS):
            out.add(w["word"].lower())
    return sorted(out)


def main() -> int:
    import build_dataset as b
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if "--stats" in sys.argv:
        print(f"{len(cache):,} word + preposition pairs cached")
        return 0
    words = json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    todo = [f"{w} {p}" for w in pattern_words(words) for p in PREPS if f"{w} {p}" not in cache]
    print(f"{len(todo):,} pairs to look up", flush=True)
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        for attempt in range(6):
            try:
                cache.update(fetch(part, b.USER_AGENT))
                break
            except Exception as e:
                wait = 30 * (attempt + 1)
                print(f"  {type(e).__name__} {e}; retrying in {wait}s", flush=True)
                time.sleep(wait)
        else:
            print("  giving up for now; run again to continue", flush=True)
            break
        if (i // BATCH) % 20 == 0:
            CACHE.write_text(json.dumps(cache, sort_keys=True))
            print(f"  {min(i + BATCH, len(todo)):,} / {len(todo):,}", flush=True)
        time.sleep(PAUSE)
    CACHE.write_text(json.dumps(cache, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
