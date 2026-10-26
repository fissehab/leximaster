"""Fetch the author and license of every recording the lexicon uses from the
Wikimedia Commons API, so the site's credits page can name them (grouped by
author). Saves data/cache/audio_credits.json; tools/build_site.py reads it.

    .venv/bin/python tools/audio_credits.py            # recordings not yet fetched
    .venv/bin/python tools/audio_credits.py --all      # fetch every one again

50 files per request, one request at a time; about 120 requests in all.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_dataset import CACHE, USER_AGENT, WORDS_JSON  # noqa: E402

OUT = CACHE / "audio_credits.json"
API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50


def file_name(source_url: str) -> str:
    """'…/Special:FilePath/en-us-abate.ogg' → 'en-us-abate.ogg'."""
    return unquote(source_url.rsplit("/", 1)[-1]).replace(" ", "_")


def plain(text: str) -> str:
    """Commons metadata is HTML ("<a href=…>SchwaSoup</a>"): keep the text."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def fetch(client: httpx.Client, names: list[str]) -> dict[str, dict]:
    r = client.get(API, params={
        "action": "query", "format": "json", "formatversion": "2", "prop": "imageinfo",
        "iiprop": "extmetadata", "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|Attribution",
        "titles": "|".join(f"File:{n}" for n in names)})
    r.raise_for_status()
    q = r.json()["query"]
    # The API normalizes titles (underscores, first letter) and follows redirects.
    back = {}
    for step in q.get("normalized", []) + q.get("redirects", []):
        back[step["to"]] = back.get(step["from"], step["from"])
    out = {}
    for page in q.get("pages", []):
        title = page["title"]
        original = back.get(title, title).removeprefix("File:").replace(" ", "_")
        info = (page.get("imageinfo") or [{}])[0].get("extmetadata") or {}
        get = lambda k: plain((info.get(k) or {}).get("value", ""))
        out[original] = {"author": get("Attribution") or get("Artist"), "license": get("LicenseShortName"),
                         "license_url": (info.get("LicenseUrl") or {}).get("value", ""),
                         "missing": "missing" in page}
    return out


def main() -> int:
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    names = sorted({file_name(w["audio"]["source_url"]) for w in words
                    if w.get("has_audio") and (w.get("audio") or {}).get("source_url")})
    known = {} if "--all" in sys.argv or not OUT.exists() else json.loads(OUT.read_text(encoding="utf-8"))
    todo = [n for n in names if n not in known]
    print(f"{len(names):,} recordings; {len(todo):,} to fetch")
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60) as client:
        for i in range(0, len(todo), BATCH):
            chunk = todo[i:i + BATCH]
            for attempt in range(5):
                try:
                    got = fetch(client, chunk)
                    break
                except (httpx.HTTPError, KeyError) as e:
                    wait = 5 * (attempt + 1)
                    print(f"  retry in {wait}s ({e})", flush=True)
                    time.sleep(wait)
            else:
                sys.exit("Commons didn't answer; run again later to continue.")
            for n in chunk:
                known[n] = got.get(n, {"author": "", "license": "", "license_url": "", "missing": True})
            OUT.write_text(json.dumps(known, ensure_ascii=False, indent=0), encoding="utf-8")
            print(f"  {min(i + BATCH, len(todo)):,}/{len(todo):,}", flush=True)
            time.sleep(1)   # one request a second: well within Wikimedia's limits
    blank = [n for n in names if not known[n]["license"]]
    print(f"saved {OUT.relative_to(ROOT)}; {len(blank)} without a license: {blank[:10]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
