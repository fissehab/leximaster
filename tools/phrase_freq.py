"""How common each multi-word entry is as a phrase, from Google Books Ngram.

    .venv/bin/python tools/phrase_freq.py          # fetch what's missing (resumable)
    .venv/bin/python tools/phrase_freq.py --stats  # what's cached

wordfreq scores a phrase by its words, so "be that as it may" (all common
words) looked as easy as "a lot". build_dataset.rank_zipf uses the phrase's
own frequency in American books (en-US 2019 corpus, 2015-2019, any case)
when it is known, as a Zipf value (log10 per billion); else its rarest word,
a step lower. Free, about one request a second; data/cache/phrase_freq.json
keeps every answer (0.0: not in the corpus), so a rerun only asks for new
phrases. Phrases of up to five words, letters only.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

CACHE = ROOT / "data" / "cache" / "phrase_freq.json"
URL = "https://books.google.com/ngrams/json"
BATCH = 20
PAUSE = 1.2   # seconds between requests


def queryable(phrase: str) -> bool:
    return " " in phrase and len(phrase.split()) <= 5 and re.fullmatch(r"[A-Za-z' -]+", phrase) is not None


def fetch(phrases: list[str], agent: str) -> dict[str, float]:
    q = urllib.parse.urlencode({"content": ",".join(phrases), "year_start": 2015, "year_end": 2019,
                                "corpus": "en-US-2019", "smoothing": 0, "case_insensitive": "true"})
    req = urllib.request.Request(f"{URL}?{q}", headers={"User-Agent": agent})
    with urllib.request.urlopen(req, timeout=60) as r:
        rows = json.load(r)
    out = {p.lower(): 0.0 for p in phrases}
    for row in rows:
        name = row["ngram"]
        # Case-insensitive answers come as "phrase (All)" with every casing summed.
        if name.endswith(" (All)"):
            name = name[:-6]
        elif any(x["ngram"] == f"{name} (All)" for x in rows):
            continue
        key = name.lower()
        if key in out:
            ts = row.get("timeseries") or []
            out[key] = max(out[key], sum(ts) / len(ts) if ts else 0.0)
    return out


def main() -> int:
    import build_dataset as b
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if "--stats" in sys.argv:
        found = sum(1 for v in cache.values() if v > 0)
        print(f"{len(cache):,} phrases cached, {found:,} found in the corpus")
        return 0
    words = json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    todo = sorted({w["word"].lower() for w in words if queryable(w["word"])} - set(cache))
    print(f"{len(todo):,} phrases to look up", flush=True)
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        for attempt in range(6):
            try:
                cache.update(fetch(part, b.USER_AGENT))
                break
            except Exception as e:   # rate limit or a network hiccup: wait and retry
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
