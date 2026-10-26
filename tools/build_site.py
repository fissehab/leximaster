"""Build the static GitHub Pages site into docs/.

    .venv/bin/python tools/build_site.py

The site runs the whole app in the browser: static/js/local/server.js
replaces the FastAPI backend, sql.js provides SQLite, and each visitor's
progress is kept in their own browser (IndexedDB). Output:

    docs/index.html            the app shell (paths made relative)
    docs/static/...            CSS, JS, fonts, sql.js
    docs/data/index.json       one compact record per word (search, filters, quizzes)
    docs/data/detail/NN.json   full entries, 64 shards loaded on demand
    docs/media/audio/...       American recordings
    docs/credits.html          sources, licenses and per-recording attribution
    docs/sw.js, manifest       offline use and "Add to Home Screen"
"""
from __future__ import annotations

import hashlib
import html
import json
import shutil
import sys
import time
import zlib
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.common import core_definition  # noqa: E402

DOCS = ROOT / "docs"
STATIC = ROOT / "static"
DATA = ROOT / "data"
SHARDS = 64
DETAIL_FIELDS = ("phonetic", "meanings", "nuance", "source", "synonyms", "antonyms", "etymology",
                 "variant_of", "conversation")
SITE_URL = "https://fissehab.github.io/leximaster/"


def shard_of(key: str) -> int:
    return zlib.crc32(key.encode("utf-8")) % SHARDS


def write_json(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def slim(data: dict) -> dict:
    """Leave out what no screen shows: empty sense lists, the study notes'
    copies of the IPA and domains (already merged into the entry), the
    American-usage rating (used only by the build) and empty Bible fields."""
    data = json.loads(json.dumps(data))
    for m in data.get("meanings") or []:
        for k in ("synonyms", "antonyms"):
            if not m.get(k):
                m.pop(k, None)
        for sn in m["senses"]:
            for k in ("synonyms", "antonyms", "example"):
                if not sn.get(k):
                    sn.pop(k, None)
    n = data.get("nuance")
    if n:
        for k in ("us_usage", "domains"):
            n.pop(k, None)
        (n.get("pronunciation") or {}).pop("ipa", None)
        for k in ("traditions", "biblical_note"):
            if not n.get(k):
                n.pop(k, None)
    return data


def build_data(words: list[dict]) -> tuple[int, int]:
    index, shards = [], {i: {} for i in range(SHARDS)}
    for w in words:
        data = slim({k: w.get(k) for k in DETAIL_FIELDS if w.get(k) not in (None, "", [])})
        pos, definition = core_definition({"meanings": w.get("meanings") or [], "nuance": w.get("nuance")})
        s = shard_of(w["key"])
        entry = {"k": w["key"], "w": w["word"], "f": w.get("freq_rank"), "z": w.get("zipf"),
                 "d": w.get("domains") or [], "p": w.get("phonetic") or "",
                 "ps": [m["pos"] for m in w.get("meanings") or [] if m.get("pos")],
                 "cp": pos, "df": definition, "s": s}
        if w.get("has_audio") and w.get("audio"):
            entry["a"] = w["audio"]["file"]
        if w.get("nuance"):
            entry["e"] = 1
        if w.get("conversation"):
            entry["c"] = 1
        if w.get("name_kind"):
            entry["nk"] = w["name_kind"]
        index.append(entry)
        shards[s][w["key"]] = data
    size = write_json(DOCS / "data" / "index.json", {"version": 1, "words": index})
    total = 0
    for i, shard in shards.items():
        total += write_json(DOCS / "data" / "detail" / f"{i:02d}.json", shard)
    return size, total


def copy_audio(words: list[dict]) -> list[dict]:
    """Copy the recordings the lexicon uses; return their attribution rows."""
    rows = []
    for w in words:
        a = w.get("audio")
        if not (w.get("has_audio") and a):
            continue
        src = DATA / a["file"]
        if not src.exists():
            continue
        dst = DOCS / "media" / a["file"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        name = unquote(a.get("source_url", "").rsplit("/", 1)[-1])
        page = f"https://commons.wikimedia.org/wiki/File:{name.replace(' ', '_')}" if name else ""
        rows.append({"word": w["word"], "file": name, "page": page})
    return rows


def build_index_html(version: str) -> None:
    src = (STATIC / "index.html").read_text(encoding="utf-8")
    out = src.replace('href="/static/', 'href="static/').replace('src="/static/', 'src="static/')
    head_extra = f"""  <meta name="theme-color" content="#2B47A8">
  <meta name="description" content="Vocabulary trainer for precise, professional and everyday American English, with American pronunciation and spaced repetition.">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="static/icons/icon-180.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="LexiMaster">
  <script>window.LEXI_STATIC = true; window.LEXI_VERSION = "{version}";</script>
"""
    out = out.replace("</head>", head_extra + "</head>", 1)
    out = out.replace('<main id="view" tabindex="-1"></main>',
                      '<main id="view" tabindex="-1"><p class="boot-note">Loading the lexicon…</p></main>', 1)
    sw = """  <script>
    if ("serviceWorker" in navigator) {
      addEventListener("load", () => navigator.serviceWorker.register("sw.js")
        .then(reg => { window.LEXI_SW = reg; dispatchEvent(new Event("lexi-sw")); }).catch(() => {}));
    }
  </script>
"""
    out = out.replace("</body>", sw + "</body>", 1)
    assert "/static/" not in out, "absolute /static/ path left in index.html"
    (DOCS / "index.html").write_text(out, encoding="utf-8")


def build_icons() -> None:
    """PNG icons for the home screen, rendered from the same "L" mark as the favicon."""
    from playwright.sync_api import sync_playwright
    icon_dir = DOCS / "static" / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    page_html = """<html><body style="margin:0;background:#2B47A8;display:grid;place-items:center;
      width:{s}px;height:{s}px"><div style="font:700 {f}px Georgia,serif;color:#F0D48A;margin-top:{m}px">L</div>
      </body></html>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for size in (180, 192, 512):
            page = browser.new_page(viewport={"width": size, "height": size})
            page.set_content(page_html.format(s=size, f=int(size * 0.66), m=int(size * 0.04)))
            page.screenshot(path=str(icon_dir / f"icon-{size}.png"))
            page.close()
        browser.close()


def build_manifest() -> None:
    write_json(DOCS / "manifest.webmanifest", {
        "name": "LexiMaster", "short_name": "LexiMaster",
        "description": "American English vocabulary: advanced, professional, AI and everyday.",
        "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": "#F3F4F7", "theme_color": "#2B47A8",
        "icons": [{"src": "static/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "static/icons/icon-512.png", "sizes": "512x512", "type": "image/png",
                   "purpose": "any maskable"}],
    })


def build_service_worker(version: str, data_hash: str) -> None:
    shell = ["./", "index.html", "manifest.webmanifest", "data/index.json"]
    shell += sorted(str(p.relative_to(DOCS)) for p in (DOCS / "static").rglob("*")
                    if p.is_file() and p.suffix in (".css", ".js", ".woff2", ".wasm", ".png", ".html"))
    sw = f"""// LexiMaster offline support. The app shell and word index are cached on
// install; word details and recordings are cached the first time they load
// (or all at once from Stats → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
const VERSION = "{version}";
const SHELL = `shell-${{VERSION}}`;
const DATA = "data-{data_hash}";   // changes only when the word data does
const MEDIA = "media-v1";   // recordings never change, so they survive updates
const SHELL_FILES = {json.dumps(shell, indent=0)};

self.addEventListener("install", e => {{
  // cache: "reload" skips the browser's HTTP cache, so a fresh deploy can't
  // be stored with files left over from the last one.
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, {{ cache: "reload" }})))));
}});

self.addEventListener("message", e => {{
  if (e.data === "SKIP_WAITING") self.skipWaiting();
}});

self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => ![SHELL, DATA, MEDIA].includes(k)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
}});

async function cacheFirst(req, name) {{
  const cache = await caches.open(name);
  const hit = await cache.match(req, {{ ignoreSearch: true }});
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}}

self.addEventListener("fetch", e => {{
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.includes("/media/")) {{ e.respondWith(cacheFirst(e.request, MEDIA)); return; }}
  if (path.includes("/data/detail/")) {{ e.respondWith(cacheFirst(e.request, DATA)); return; }}
  if (e.request.mode === "navigate") {{
    // The page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }}
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, {{ ignoreSearch: true }}))
    .then(hit => hit || fetch(e.request)));
}});
"""
    (DOCS / "sw.js").write_text(sw, encoding="utf-8")


def build_credits(audio_rows: list[dict], n_words: int) -> None:
    rows = "\n".join(
        f'<tr><td>{html.escape(r["word"])}</td><td><a href="{html.escape(r["page"])}">{html.escape(r["file"])}</a></td></tr>'
        for r in sorted(audio_rows, key=lambda r: r["word"].lower()) if r["page"])
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LexiMaster · Sources and credits</title>
<link rel="stylesheet" href="static/fonts/fonts.css">
<link rel="stylesheet" href="static/css/tokens.css">
<script>try {{ const t = localStorage.getItem("lexi-theme"); if (["light", "dark", "mariana"].includes(t)) document.documentElement.dataset.theme = t; }} catch (e) {{}}</script>
<style>
  body {{ margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.6 var(--font-body); }}
  main {{ max-width: 860px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-left, 0px)) 64px; }}
  h1, h2 {{ font-family: var(--font-word); line-height: 1.2; }}
  h1 {{ font-size: 32px; }} h2 {{ font-size: 22px; margin-top: 36px; }}
  a {{ color: var(--lapis); }}
  .muted {{ color: var(--muted); }}
  .table-wrap {{ overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--surface); }}
  table {{ border-collapse: collapse; width: 100%; font: 14px/1.4 var(--font-ui); }}
  td {{ padding: 6px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }}
  td:first-child {{ font-family: var(--font-word); white-space: nowrap; }}
</style>
</head>
<body>
<main>
<p><a href="./">← Back to LexiMaster</a></p>
<h1>Sources and credits</h1>
<p>LexiMaster has {n_words:,} entries. Your study progress is stored only in this browser; nothing is sent to a server.</p>

<h2>Definitions, pronunciations and word origins</h2>
<p>Dictionary definitions, IPA transcriptions, synonyms, antonyms and etymologies come from
<a href="https://en.wiktionary.org/">Wiktionary</a>, by its contributors, under the
<a href="https://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0</a> license.
They were selected, re-ordered, shortened and converted to American spelling for this app; that adapted material is
shared under the same license. Some entries came from the
<a href="https://dictionaryapi.dev/">Free Dictionary API</a>, which is also built on Wiktionary.</p>
<p>American IPA for words without a Wiktionary transcription was converted from the
<a href="https://github.com/cmusphinx/cmudict">CMU Pronouncing Dictionary</a>, Copyright © 1993–2015
Carnegie Mellon University (<a href="licenses/cmudict-LICENSE.txt">license</a>).</p>

<h2>Example sentences, meanings and study notes</h2>
<p>Conversation examples, meanings for expressions that dictionaries don't list, the AI senses and the study notes
(usage notes, distinctions, collocations, pronunciation tips) were written for LexiMaster, with the help of Claude
by Anthropic.</p>

<h2>Software and fonts</h2>
<p><a href="https://sql.js.org/">sql.js</a> (SQLite in WebAssembly), MIT license
(<a href="static/vendor/sql.js-LICENSE">license</a>). Fonts: Literata, IBM Plex Sans and Charis SIL, under the SIL
Open Font License 1.1 (<a href="static/fonts/licenses/literata-OFL.txt">Literata</a>,
<a href="static/fonts/licenses/ibmplexsans-OFL.txt">IBM Plex Sans</a>,
<a href="static/fonts/licenses/charissil-OFL.txt">Charis SIL</a>).</p>

<h2>Recorded pronunciations</h2>
<p class="muted">{len(audio_rows):,} American English recordings from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>.
Each was converted from its original format to AAC (.m4a). Each recording's author and license (most are
Creative Commons Attribution-ShareAlike, some public domain) are on its file page, linked below.</p>
<div class="table-wrap"><table><tbody>
{rows}
</tbody></table></div>
</main>
</body>
</html>
"""
    (DOCS / "credits.html").write_text(page, encoding="utf-8")
    lic = DOCS / "licenses"
    lic.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "tools" / "licenses" / "cmudict-LICENSE.txt", lic / "cmudict-LICENSE.txt")


def main() -> None:
    sys.path.insert(0, str(ROOT))
    from tools.audit import check
    if check():
        sys.exit("Not building the site: the word data breaks a display rule (tools/audit.py --check).")
    from tools.gen_shared import main as gen_shared
    gen_shared()
    words = json.loads((DATA / "words.json").read_text(encoding="utf-8"))["words"]
    if DOCS.exists():
        shutil.rmtree(DOCS)
    DOCS.mkdir()
    shutil.copytree(STATIC, DOCS / "static", ignore=shutil.ignore_patterns("index.html", ".DS_Store"))
    version = time.strftime("%Y%m%d%H%M%S")
    index_size, detail_size = build_data(words)
    audio_rows = copy_audio(words)
    build_index_html(version)
    build_icons()
    build_manifest()
    build_credits(audio_rows, len(words))
    data_hash = hashlib.sha256((DATA / "words.json").read_bytes()).hexdigest()[:8]
    build_service_worker(version, data_hash)
    (DOCS / ".nojekyll").write_text("")
    files = [p for p in DOCS.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(f"docs/: {len(files):,} files, {total / 1e6:.1f} MB · index.json {index_size / 1e6:.1f} MB · "
          f"details {detail_size / 1e6:.1f} MB in {SHARDS} files · {len(audio_rows):,} recordings · "
          f"largest file {biggest.relative_to(DOCS)} {biggest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
