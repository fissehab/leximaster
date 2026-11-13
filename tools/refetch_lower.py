"""Fetch again, lowercase first, the words of seeds/lowercase_first.txt.

    .venv/bin/python tools/refetch_lower.py            # all listed words
    .venv/bin/python tools/refetch_lower.py cat be     # only these
    .venv/bin/python tools/refetch_lower.py --extras   # only synonyms, etymology, lemma

The first fetch took the capitalized Wiktionary page for these keys ("cat"
got CAT, "Central Atlas Tamazight"). Each new lookup is appended to
data/cache/dict.jsonl, whose last line per key wins, so the old one is
replaced on the next assemble. A key marked "+" in the seed keeps the old
page's senses after the everyday word's (REST after "rest"). Free: the Free
Dictionary API and Wiktionary only. Rebuild afterwards with
`python -c "import build_dataset as b; b.assemble()"`.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx  # noqa: E402

import build_dataset as b  # noqa: E402


async def refetch(keys: list[str]) -> int:
    seed = b.lowercase_first()
    done = b.read_jsonl(b.DICT_CACHE)
    failed = []
    async with httpx.AsyncClient(headers={"User-Agent": b.USER_AGENT}, timeout=30, follow_redirects=True) as http:
        src = b.DictionarySources(http, b.ACCENT)
        for k in keys:
            if k not in seed:
                sys.exit(f"{k}: not in seeds/lowercase_first.txt")
            try:
                entry = await src.lookup(k, lower_first=True)
            except Exception as e:  # network errors: report and go on
                failed.append(f"{k}: {type(e).__name__} {e}")
                continue
            if not entry or entry["word"] != k:
                failed.append(f"{k}: no lowercase entry (got {entry and entry['word']!r})")
                continue
            old = (done.get(k) or {}).get("entry") or {}
            if seed[k] and old.get("meanings"):
                entry["meanings"] = entry["meanings"] + old["meanings"]
            b.append_jsonl(b.DICT_CACHE, {"key": k, "status": "ok", "entry": entry})
            # Synonyms, etymology and the lemma's senses were fetched for the
            # old page too (extras.jsonl, last line wins).
            try:
                b.append_jsonl(b.EXTRAS_CACHE, {"key": k, **await b.fetch_extras(src, entry["word"], entry["meanings"])})
            except Exception as e:
                failed.append(f"{k} extras: {type(e).__name__} {e}")
            senses = sum(len(m.get("definitions") or m.get("senses") or []) for m in entry["meanings"])
            print(f"  {k}: {old.get('word', '?')} -> {entry['word']}, {senses} senses, {entry.get('phonetic') or 'no IPA'}",
                  flush=True)
    for f in failed:
        print("  failed:", f)
    return 1 if failed else 0


async def extras(keys: list[str]) -> int:
    """Only the extras, from the dictionary entry already cached."""
    done = b.read_jsonl(b.DICT_CACHE)
    async with httpx.AsyncClient(headers={"User-Agent": b.USER_AGENT}, timeout=30, follow_redirects=True) as http:
        src = b.DictionarySources(http, b.ACCENT)
        for k in keys:
            entry = done[k]["entry"]
            b.append_jsonl(b.EXTRAS_CACHE, {"key": k, **await b.fetch_extras(src, entry["word"], entry["meanings"])})
            print(f"  {k}: extras", flush=True)
    return 0


def main() -> int:
    extras_only = "--extras" in sys.argv
    keys = [a for a in sys.argv[1:] if not a.startswith("--")] or list(b.lowercase_first())
    if extras_only:
        return asyncio.run(extras(keys))
    return asyncio.run(refetch(keys))


if __name__ == "__main__":
    sys.exit(main())
