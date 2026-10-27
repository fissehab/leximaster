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
import re
import shutil
import sys
import time
import zlib
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.common import core_definition, quiz_synonyms  # noqa: E402

DOCS = ROOT / "docs"
STATIC = ROOT / "static"
DATA = ROOT / "data"
SHARDS = 64
DETAIL_FIELDS = ("phonetic", "meanings", "nuance", "source", "synonyms", "antonyms", "etymology",
                 "variant_of", "conversation", "also")
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


def media_files(words: list[dict]) -> dict[str, tuple[str, Path]]:
    """Each word's recording: key → (published path under media/, source file).
    American recordings are published as processed by tools/audio_norm.py
    (even loudness, a lead-in, names carrying a content hash); synthesized
    ones under the hashed name in data/cache/tts.json. A changed recording
    therefore gets a new URL, and no browser or service-worker cache can
    play the old one."""
    norm = _read(DATA / "cache" / "audio_norm.json")
    tts = _read(DATA / "cache" / "tts.json")
    out: dict[str, tuple[str, Path]] = {}
    for w in words:
        a = w.get("audio")
        if w.get("has_audio") and a:
            n = norm.get(a["file"])
            if n and (DATA / "audio_norm" / Path(n["file"]).name).exists():
                out[w["key"]] = (n["file"], DATA / "audio_norm" / Path(n["file"]).name)
            elif (DATA / a["file"]).exists():
                out[w["key"]] = (a["file"], DATA / a["file"])
            continue
        t = tts.get(w["key"]) or w.get("tts")
        if t and (DATA / t["file"]).exists():
            out[w["key"]] = (t["file"], DATA / t["file"])
    return out


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def build_data(words: list[dict], media: dict[str, tuple[str, Path]]) -> tuple[int, int]:
    index, shards = [], {i: {} for i in range(SHARDS)}
    for w in words:
        data = slim({k: w.get(k) for k in DETAIL_FIELDS if w.get(k) not in (None, "", [])})
        pos, definition = core_definition({"meanings": w.get("meanings") or [], "nuance": w.get("nuance")})
        s = shard_of(w["key"])
        entry = {"k": w["key"], "w": w["word"], "f": w.get("freq_rank"), "z": w.get("zipf"),
                 "d": w.get("domains") or [], "p": w.get("phonetic") or "",
                 "ps": [m["pos"] for m in w.get("meanings") or [] if m.get("pos")],
                 "cp": pos, "df": definition, "s": s}
        if w["key"] in media:
            entry["a" if w.get("has_audio") and w.get("audio") else "t"] = media[w["key"]][0]
        if w.get("nuance"):
            entry["e"] = 1
        if w.get("conversation"):
            entry["c"] = 1
        if w.get("name_kind"):
            entry["nk"] = w["name_kind"]
        if syn := quiz_synonyms(w):
            entry["sy"] = syn
        index.append(entry)
        shards[s][w["key"]] = data
    size = write_json(DOCS / "data" / "index.json", {"version": 1, "words": index})
    total = 0
    for i, shard in shards.items():
        total += write_json(DOCS / "data" / "detail" / f"{i:02d}.json", shard)
    return size, total


def copy_audio(words: list[dict], media: dict[str, tuple[str, Path]]) -> list[dict]:
    """Copy the recordings the lexicon uses (only those: docs/ is rebuilt from
    scratch, so nothing stale stays); return their attribution rows."""
    rows = []
    for w in words:
        if w["key"] not in media:
            continue
        rel, src = media[w["key"]]
        dst = DOCS / "media" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        a = w.get("audio")
        if not (w.get("has_audio") and a):
            continue
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
  <meta name="mobile-web-app-capable" content="yes">
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
        "id": urlparse(SITE_URL).path, "name": "LexiMaster", "short_name": "LexiMaster",
        "description": "American English vocabulary: advanced, professional, AI and everyday.",
        "start_url": "./", "scope": "./", "display": "standalone",
        "background_color": "#F3F4F7", "theme_color": "#2B47A8",
        "icons": [{"src": "static/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "static/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                  {"src": "static/icons/icon-512.png", "sizes": "512x512", "type": "image/png",
                   "purpose": "maskable"}],
        "shortcuts": [{"name": "Daily review", "short_name": "Review", "url": "./#review",
                       "icons": [{"src": "static/icons/icon-192.png", "sizes": "192x192", "type": "image/png"}]},
                      {"name": "Browse the lexicon", "short_name": "Browse", "url": "./#browse",
                       "icons": [{"src": "static/icons/icon-192.png", "sizes": "192x192", "type": "image/png"}]}],
    })


def build_service_worker(version: str, data_hash: str, details: dict[str, str]) -> None:
    shell = ["./", "index.html", "manifest.webmanifest", "credits.html"]
    shell += sorted(str(p.relative_to(DOCS)) for p in (DOCS / "static").rglob("*")
                    if p.is_file() and p.suffix in (".css", ".js", ".woff2", ".wasm", ".png", ".html"))
    sw = f"""// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Stats → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "{version}";
const SHELL = `lexi-shell-${{VERSION}}`;
const DATA = "lexi-data-{data_hash}";   // changes only when the published word data does
// Recording names carry a hash of their content (media/audio/<word>.<hash>.m4a),
// so a corrected recording has a new URL: the media cache can outlive deploys.
const MEDIA = "lexi-media-v2";
const SHELL_FILES = {json.dumps(shell, indent=0)};
// Content hash (SHA-256, first 16 hex digits) of each word-detail file in this
// build: an offline download made under an earlier version keeps the files
// that haven't changed.
const DETAIL_HASHES = {json.dumps(details, indent=0, sort_keys=True)};
// Caches of this app from before the "lexi-" prefix.
const LEGACY = /^(shell-\\d{{14}}|data-[0-9a-f]{{8}}|media-v1)$/;

self.addEventListener("install", e => {{
  // cache: "no-cache" revalidates each file with the server, so a fresh deploy
  // can't be stored with files left over from the last one, while files the
  // browser just downloaded (first visit) aren't downloaded a second time.
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, {{ cache: "no-cache" }})))),
    caches.open(DATA).then(c => c.match("data/index.json").then(hit => hit || c.add(new Request("data/index.json", {{ cache: "no-cache" }})))),
  ]));
}});

self.addEventListener("message", e => {{
  if (e.data === "SKIP_WAITING") self.skipWaiting();
}});

async function sha16(res) {{
  const buf = await crypto.subtle.digest("SHA-256", await res.arrayBuffer());
  return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}}

// Carry the word details an earlier version cached (an offline download) into
// this version's data cache: unchanged files are copied; changed ones are
// downloaded again in the background.
async function migrateDetails(oldNames) {{
  const cache = await caches.open(DATA);
  const refetch = new Set();
  for (const name of oldNames) {{
    const old = await caches.open(name);
    for (const req of await old.keys()) {{
      const path = new URL(req.url).pathname.replace(/^.*\\/(data\\/detail\\/[^/]+)$/, "$1");
      const want = DETAIL_HASHES[path];
      if (!want || await cache.match(req, {{ ignoreSearch: true }})) continue;
      const res = await old.match(req);
      if (res && await sha16(res.clone()) === want) await cache.put(req, res);
      else refetch.add(req.url);
    }}
  }}
  return [...refetch];
}}

// Recordings no word of this version uses (replaced by a corrected one).
async function pruneMedia() {{
  const index = await (await caches.open(DATA)).match("data/index.json");
  if (!index) return;
  const used = new Set();
  for (const w of (await index.json()).words) {{
    if (w.a) used.add(w.a);
    if (w.t) used.add(w.t);
  }}
  const media = await caches.open(MEDIA);
  for (const req of await media.keys()) {{
    const m = new URL(req.url).pathname.match(/\\/media\\/(.+)$/);
    if (m && !used.has(decodeURIComponent(m[1]))) await media.delete(req);
  }}
}}

self.addEventListener("activate", e => {{
  e.waitUntil((async () => {{
    const keys = await caches.keys();
    const ours = keys.filter(k => k.startsWith("lexi-") || LEGACY.test(k));
    const oldData = ours.filter(k => k !== DATA && /^(lexi-)?data-/.test(k));
    let refetch = [];
    try {{ refetch = await migrateDetails(oldData); }} catch (err) {{}}
    await Promise.all(ours.filter(k => ![SHELL, DATA, MEDIA].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
    // In the background: changed detail files of an offline download, and
    // recordings nothing refers to any more.
    (async () => {{
      const cache = await caches.open(DATA);
      for (const url of refetch) {{
        try {{
          const res = await fetch(url, {{ cache: "no-cache" }});
          if (res.ok && res.status === 200) await cache.put(url, res);
        }} catch (err) {{ break; }}   // offline: they load when next needed
      }}
      await pruneMedia();
    }})().catch(() => {{}});
  }})());
}});

async function cacheFirst(req, name) {{
  const cache = await caches.open(name);
  const hit = await cache.match(req, {{ ignoreSearch: true }});
  if (hit) return hit;
  // no-cache: revalidate with the server, so a file the browser kept from the
  // last deploy is never stored under the new data version.
  const res = await fetch(req, {{ cache: "no-cache" }});
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}}

// The part of a cached recording a Range request asks for (Safari and some
// players always ask for ranges): 206 with the exact bytes.
async function rangeResponse(full, range) {{
  const body = await full.arrayBuffer();
  const size = body.byteLength;
  const m = /^bytes=(\\d*)-(\\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] !== "") {{
    start = Number(m[1]);
    end = m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  }} else if (m && m[2] !== "") {{
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }}
  if (start === undefined || start > end || start >= size) {{
    return new Response(null, {{ status: 416, headers: {{ "Content-Range": `bytes */${{size}}` }} }});
  }}
  return new Response(body.slice(start, end + 1), {{
    status: 206, statusText: "Partial Content",
    headers: {{
      "Content-Type": full.headers.get("Content-Type") || "audio/mp4",
      "Content-Range": `bytes ${{start}}-${{end}}/${{size}}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    }},
  }});
}}

async function media(req) {{
  const cache = await caches.open(MEDIA);
  const range = req.headers.get("Range");
  let hit = await cache.match(req.url, {{ ignoreSearch: true }});
  if (!hit) {{
    // The whole file, without the Range header, so the cache holds a
    // complete 200 that any later range can be cut from.
    const res = await fetch(req.url, {{ cache: "no-cache" }});
    if (!(res.ok && res.status === 200)) return res;
    await cache.put(req.url, res.clone());
    hit = res;
  }}
  return range ? rangeResponse(hit, range) : hit;
}}

self.addEventListener("fetch", e => {{
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.includes("/media/")) {{ e.respondWith(media(e.request).catch(() => fetch(e.request))); return; }}
  if (path.includes("/data/detail/") || path.endsWith("/data/index.json")) {{ e.respondWith(cacheFirst(e.request, DATA)); return; }}
  if (e.request.mode === "navigate" && /\\/(index\\.html)?$/.test(path)) {{
    // The app's page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }}
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, {{ ignoreSearch: true }}))
    .then(hit => hit || fetch(e.request)));
}});
"""
    (DOCS / "sw.js").write_text(sw, encoding="utf-8")


NO_CREDIT_LICENSES = ("CC0", "Public domain")


def credit_author(raw: str) -> str:
    """A recording's author as Commons states it, reduced to the name:
    "Speaker: X Recorder: X" → X, "I, X" → X, "No machine-readable author
    provided. X assumed (…)" → X."""
    m = re.match(r"^No machine-readable author provided\. (.+?) assumed", raw)
    if m:
        return m.group(1)
    m = re.match(r"^Speaker: (.+?) Recorder: .+$", raw)
    if m:
        return m.group(1)
    return re.sub(r"^(I, |User:)", "", raw).strip()


def recording_credits(audio_rows: list[dict]) -> str:
    """The recordings grouped by author and license, most recordings first;
    each group folds open to its words, each linked to its Commons page
    (author, license and source). From tools/audio_credits.py's cache."""
    path = DATA / "cache" / "audio_credits.json"
    meta = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    groups: dict[tuple, list[dict]] = {}
    urls: dict[str, str] = {}   # license → its deed (files link the same license in slightly different ways)
    for r in audio_rows:
        if not r["page"]:
            continue
        m = meta.get(r["file"].replace(" ", "_"), {})
        lic = m.get("license", "")
        if lic in NO_CREDIT_LICENSES:
            key = ("", "Public domain or CC0")
        else:
            key = (credit_author(m.get("author", "")) or "Author not named on Commons", lic or "License on the file page")
            urls.setdefault(key[1], m.get("license_url", ""))
        groups.setdefault(key, []).append(r)
    order = sorted(groups.items(), key=lambda g: (g[0][1] == "Public domain or CC0", -len(g[1]), g[0][0].lower()))
    out = []
    for (author, lic), rows in order:
        url = urls.get(lic, "")
        words = ", ".join(f'<a href="{html.escape(r["page"])}">{html.escape(r["word"])}</a>'
                          for r in sorted(rows, key=lambda r: r["word"].lower()))
        lic_html = f'<a href="{html.escape(url)}">{html.escape(lic)}</a>' if url else html.escape(lic)
        who = (f"<strong>{html.escape(author)}</strong> · " if author else "<strong>No credit required</strong> · ")
        out.append(f'<details><summary>{who}{len(rows):,} recording{"s" if len(rows) != 1 else ""} · {lic_html}'
                   f'</summary><p class="words">{words}</p></details>')
    return "\n".join(out)


def build_credits(audio_rows: list[dict], n_words: int, n_tts: int = 0) -> None:
    rows = recording_credits(audio_rows)
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
  details {{ border-bottom: 1px solid var(--rule); padding: 10px 0; }}
  summary {{ cursor: pointer; font: 15px/1.5 var(--font-ui); }}
  .words {{ margin: 8px 0 4px; font: 14px/1.7 var(--font-ui); }}
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
<p class="muted">{len(audio_rows):,} American English recordings from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>,
by the volunteers below, under the licenses shown. Each was converted from its original format to AAC (.m4a).
Open a name to see the words; each word links to its recording's page, with the full author and license details.</p>
{rows}

<h2>Synthesized pronunciations</h2>
<p>The {n_tts:,} entries without an American recording have a natural synthesized one, made for LexiMaster with
<a href="https://github.com/hexgrad/kokoro">Kokoro</a> (the Kokoro-82M model by hexgrad,
<a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>), voice “Heart”, through
<a href="https://github.com/thewh1teagle/kokoro-onnx">kokoro-onnx</a> (MIT license). Rare words and names are spoken from
each entry's reviewed American IPA; common words and everyday phrases are read by the model directly.</p>
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
    media = media_files(words)
    index_size, detail_size = build_data(words, media)
    audio_rows = copy_audio(words, media)
    build_index_html(version)
    build_icons()
    build_manifest()
    build_credits(audio_rows, len(words), sum(1 for w in words if not w.get("has_audio") and w["key"] in media))
    h = hashlib.sha256()
    details = {}
    for f in [DOCS / "data" / "index.json", *sorted((DOCS / "data" / "detail").glob("*.json"))]:
        b = f.read_bytes()
        h.update(b)
        if f.parent.name == "detail":
            details[f"data/detail/{f.name}"] = hashlib.sha256(b).hexdigest()[:16]
    data_hash = h.hexdigest()[:8]
    build_service_worker(version, data_hash, details)
    (DOCS / ".nojekyll").write_text("")
    files = [p for p in DOCS.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(f"docs/: {len(files):,} files, {total / 1e6:.1f} MB · index.json {index_size / 1e6:.1f} MB · "
          f"details {detail_size / 1e6:.1f} MB in {SHARDS} files · {len(audio_rows):,} recordings · "
          f"largest file {biggest.relative_to(DOCS)} {biggest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
