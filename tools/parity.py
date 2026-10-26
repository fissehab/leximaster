"""Check that the website (static/js/local/server.js over docs/) and the local
app (FastAPI over the same words.json) give the same answers.

    .venv/bin/python tools/build_site.py && .venv/bin/python tools/parity.py

Compares every word in the word list (definition, part of speech, domains,
name kind, pronunciation, audio) and the full entry of 50 words spread over
the alphabet. Both sides start from empty progress. Exit 1 on a difference.
Needs Playwright with Chrome (as the UI tests do).
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST_FIELDS = ("word", "def", "core_pos", "pos", "phonetic", "domains", "name_kind", "has_audio", "enriched",
               "freq_rank")
SKIP = {"id", "audio_url", "audio_accent", "notes", "list_actions"}  # ids and URL prefixes differ by design


def prune(v):
    """Drop empty values and the fields the site build leaves out (see
    tools/build_site.slim), so absent and empty compare equal."""
    if isinstance(v, dict):
        out = {k: prune(x) for k, x in v.items() if k not in ("us_usage", "ipa") and k not in SKIP}
        if "pronunciation" in out or "core" in out:
            out.pop("domains", None)  # the study notes' copy of the domains
        return {k: x for k, x in out.items() if x not in (None, "", [], {})}
    if isinstance(v, list):
        return [prune(x) for x in v]
    return v


def python_side(keys: list[str]) -> tuple[list[dict], dict[str, dict]]:
    os.environ["LEXIMASTER_DB"] = str(Path(tempfile.mkdtemp()) / "parity.db")
    sys.path.insert(0, str(ROOT))
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        words = c.get("/api/words").json()["words"]
        by_word = {w["word"]: w["id"] for w in words}
        full = {k: c.get(f"/api/words/{by_word[k]}").json() for k in keys}
    return words, full


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve_docs() -> str:
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}/docs/"


def js_side(url: str, keys: list[str]) -> tuple[list[dict], dict[str, dict]]:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        pg = b.new_page()
        pg.goto(url + "#home")
        pg.wait_for_function("!document.querySelector('.boot-note')", timeout=120000)
        words, full = pg.evaluate("""async keys => {
            const { api } = await import('./static/js/api.js');
            const words = (await api.get('/api/words')).words;
            const id = Object.fromEntries(words.map(w => [w.word, w.id]));
            const full = {};
            for (const k of keys) full[k] = await api.get('/api/words/' + id[k]);
            return [words, full];
        }""", keys)
        b.close()
    return words, full


def main() -> int:
    data = json.loads((ROOT / "data" / "words.json").read_text(encoding="utf-8"))["words"]
    keys = [w["word"] for w in data[:: max(1, len(data) // 50)]][:50]
    py_words, py_full = python_side(keys)
    js_words, js_full = js_side(serve_docs(), keys)
    problems = []
    if len(py_words) != len(js_words):
        problems.append(f"word count: Python {len(py_words)}, website {len(js_words)}")
    js_by = {w["word"]: w for w in js_words}
    for a in py_words:
        c = js_by.get(a["word"])
        if c is None:
            problems.append(f"{a['word']}: missing on the website")
            continue
        for k in LIST_FIELDS:
            if a.get(k) != c.get(k):
                problems.append(f"{a['word']}: {k} differs ({a.get(k)!r} vs {c.get(k)!r})")
    for k in keys:
        a, c = prune(py_full[k]), prune(js_full[k])
        for f in sorted(set(a) | set(c)):
            if json.dumps(a.get(f), sort_keys=True) != json.dumps(c.get(f), sort_keys=True):
                problems.append(f"{k}: full entry field {f} differs")
    for line in problems[:40]:
        print("  " + line)
    print(f"parity: {len(py_words):,} words, {len(keys)} full entries: "
          + ("identical" if not problems else f"{len(problems)} differences"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
