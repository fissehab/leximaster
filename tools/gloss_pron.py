"""Pronunciations for the related words that have no entry of their own
(the short WordNet definitions in data/glossary.json, e.g. "stepladder").

    .venv/bin/python tools/gloss_pron.py fetch    # Wiktionary IPA + recordings (resumable, ~1 request/s)
    .venv/bin/python tools/gloss_pron.py build    # IPA and respelling of each term
    .venv/bin/python tools/gloss_pron.py audio    # a checked Kokoro recording of each (resumable)
    .venv/bin/python tools/gloss_pron.py stats

`fetch` keeps each answer in data/cache/gloss_wikt.json ({key: {"ipa": [...],
"audio": [...]}}; an empty answer is kept too, so a rerun only asks for new
terms). `build` picks the IPA (Wiktionary's American or unlabelled American
one, else the CMU dictionary's, else espeak's) and respells it
(tools/respell.py), into data/cache/gloss_pron.json. `audio` speaks each with
Kokoro as tools/tts.py speaks an entry, and checks it the same way
(data/tts/gloss/, manifest data/cache/gloss_tts.json). Each step ends by
adding what there is to data/glossary.json (attach(); tools/glossary.py does
too when it rewrites the file): "ipa", "re" (the respelling) and "a" (the
recording, under data/). All free.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build_dataset as b  # noqa: E402

GLOSSARY = ROOT / "data" / "glossary.json"
WIKT = ROOT / "data" / "cache" / "gloss_wikt.json"
PRON = ROOT / "data" / "cache" / "gloss_pron.json"
TTS = ROOT / "data" / "cache" / "gloss_tts.json"
PARSE = "https://en.wiktionary.org/w/api.php"
COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/{}"
PAUSE = 1.0


def terms() -> dict[str, str]:
    """Glossary key -> term, for the defined terms (not "see" pointers)."""
    g = json.loads(GLOSSARY.read_text(encoding="utf-8"))
    return {k: v["w"] for k, v in g.items() if "see" not in v}


def parse(text: str) -> dict:
    """US-or-unlabelled IPA and the recordings in a page's English section."""
    out = {"ipa": [], "audio": []}
    i = text.find("==English==")
    if i < 0:
        return out
    section = text[i + len("==English=="):]
    nxt = re.search(r"\n==[^=]", section)
    section = section[: nxt.start()] if nxt else section
    for m in re.finditer(r"\{\{IPA\|en\|([^}]*)\}\}", section):
        parts = m.group(1).split("|")
        labels = " ".join(p for p in parts if p.startswith("a="))
        acc = b.accent_of(labels) or ("other" if labels else "")
        for p in parts:
            if p.startswith(("/", "[")):
                out["ipa"].append({"text": p, "accent": acc})
    for m in re.finditer(r"\{\{audio\|en\|([^|}]+)([^}]*)\}\}", section):
        fname = m.group(1).strip()
        out["audio"].append({"file": fname, "url": COMMONS_FILE.format(quote(fname.replace(" ", "_"))),
                             "accent": b.accent_of(m.group(2) + " " + fname)})
    return out


def fetch() -> int:
    cache = json.loads(WIKT.read_text()) if WIKT.exists() else {}
    todo = [(k, w) for k, w in sorted(terms().items()) if k not in cache]
    print(f"{len(todo):,} terms to look up", flush=True)
    with httpx.Client(headers={"User-Agent": b.USER_AGENT}, timeout=30, follow_redirects=True) as client:
        for n, (k, w) in enumerate(todo, 1):
            params = {"action": "parse", "page": w.replace(" ", "_"), "prop": "wikitext",
                      "format": "json", "formatversion": "2", "redirects": "1"}
            for attempt in range(5):
                try:
                    r = client.get(PARSE, params=params)
                    if r.status_code == 429 or r.status_code >= 500:
                        raise httpx.HTTPError(f"HTTP {r.status_code}")
                    text = r.json().get("parse", {}).get("wikitext", "") if r.status_code == 200 else ""
                    cache[k] = parse(text)
                    break
                except (httpx.HTTPError, ValueError) as e:
                    wait = 20 * (attempt + 1)
                    print(f"  {k}: {e}; retrying in {wait}s", flush=True)
                    time.sleep(wait)
            if n % 200 == 0:
                WIKT.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True))
                print(f"  {n:,} / {len(todo):,}", flush=True)
            time.sleep(PAUSE)
    WIKT.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True))
    return 0


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def pick_ipa(key: str, term: str, wikt: dict) -> tuple[str, str]:
    """(IPA, where from) in the entries' style, as assemble shapes theirs."""
    ipa, src = b.pick_phonetic(wikt.get("ipa", []), "us"), "wiktionary"
    if not ipa:
        ipa, src = b.cmu_ipa(key, {}, term), "cmu"
    if not ipa:
        ipa, src = b.espeak_ipa(term), "espeak"
    if not ipa:
        return "", ""
    return b.drop_yod(key, b.ga_or(b.normalize_ipa(ipa))), src


def build() -> int:
    from respell import respell
    wikt, out = _read(WIKT), {}
    for k, w in sorted(terms().items()):
        ipa, src = pick_ipa(k, w, wikt.get(k) or {})
        if ipa:
            out[k] = {"ipa": ipa, "re": respell(ipa), "src": src}
    PRON.write_text(json.dumps(out, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
    by = {s: sum(1 for v in out.values() if v["src"] == s) for s in ("wiktionary", "cmu", "espeak")}
    print(f"{len(out):,} / {len(terms()):,} terms have IPA: " + ", ".join(f"{n:,} from {s}" for s, n in by.items()))
    return attach_file()


def audio() -> int:
    """Kokoro, as tools/tts.py: plan() chooses the IPA or the text, judge()
    checks the take, and RETRY's voices are tried when it fails."""
    import tts
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(str(tts.MODEL), str(tts.VOICES))
    tok = kokoro.tokenizer
    base, small = tts._whisper("base.en"), tts._whisper("small.en")
    pron, m, names = _read(PRON), _read(TTS), terms()
    (tts.OUT_DIR / "gloss").mkdir(parents=True, exist_ok=True)
    todo = [k for k in sorted(pron) if k in names and (m.get(k, {}).get("ipa") != pron[k]["ipa"]
            or not (tts.DATA / m[k]["file"]).exists())]
    print(f"{len(todo):,} to speak", flush=True)
    t0, failed = time.time(), 0
    for n, k in enumerate(todo, 1):
        p = pron[k]
        w = {"key": k, "word": names[k],
             "phonetic": p["ipa"] if p["src"] != "espeak" else ""}
        ph, source = tts.plan(w, tok)
        takes = [(tts.voice_for(ph), tts.SPEED)] + [t for t in tts.RETRY if t != (tts.voice_for(ph), tts.SPEED)]
        best = None
        for voice, speed in takes:
            wav, sr = tts.synth(kokoro, ph, voice, speed)
            res = tts.judge(w, ph, tts.resample16k(wav, sr), base, small, tok)
            best = best or (wav, sr, voice, speed, res)
            if not res.get("fail"):
                best = (wav, sr, voice, speed, res)
                break
        wav, sr, voice, speed, res = best
        failed += bool(res.get("fail"))
        dst = tts.write_hashed(wav, sr, "gloss/" + tts.slug(k))
        old = m.get(k, {}).get("file")
        if old and old != f"tts/gloss/{dst.name}":
            (tts.DATA / old).unlink(missing_ok=True)
        m[k] = {"file": f"tts/gloss/{dst.name}", "ipa": p["ipa"], "phonemes": ph, "source": source,
                "voice": voice, **({"speed": speed} if speed != tts.SPEED else {}), **res}
        if n % 200 == 0 or n == len(todo):
            TTS.write_text(json.dumps(m, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
            print(f"  {n:,}/{len(todo):,} · {n / (time.time() - t0):.1f}/s · {failed:,} no take passed", flush=True)
    TTS.write_text(json.dumps(m, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")
    return attach_file()


def attach(glossary: dict) -> dict:
    """Add each defined term's IPA, respelling and recording (from build and
    audio) to the glossary's records, in place."""
    pron, m = _read(PRON), _read(TTS)
    for k, rec in glossary.items():
        for f in ("ipa", "re", "a"):
            rec.pop(f, None)
        if "see" in rec or k not in pron:
            continue
        rec["ipa"], rec["re"] = pron[k]["ipa"], pron[k]["re"]
        t = m.get(k)
        if t and t["ipa"] == pron[k]["ipa"] and (ROOT / "data" / t["file"]).exists():
            rec["a"] = t["file"]
    return glossary


def attach_file() -> int:
    g = attach(json.loads(GLOSSARY.read_text(encoding="utf-8")))
    GLOSSARY.write_text(json.dumps(g, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"{GLOSSARY.relative_to(ROOT)}: {sum(1 for r in g.values() if 'ipa' in r):,} with IPA, "
          f"{sum(1 for r in g.values() if 'a' in r):,} with a recording")
    return 0


def stats() -> int:
    cache = json.loads(WIKT.read_text()) if WIKT.exists() else {}
    t = terms()
    have = [k for k in t if k in cache]
    print(f"{len(have):,} / {len(t):,} looked up; "
          f"{sum(1 for k in have if cache[k]['ipa']):,} with IPA, "
          f"{sum(1 for k in have if any(a['accent'] == 'us' for a in cache[k]['audio'])):,} with a US recording")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stats"
    sys.path.insert(0, str(ROOT / "tools"))
    sys.exit({"fetch": fetch, "build": build, "audio": audio, "stats": stats}[cmd]())
