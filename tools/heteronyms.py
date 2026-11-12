"""Words said more than one way (seeds/heteronyms.txt): which sound each
meaning takes, and the American recordings of each sound.

    .venv/bin/python tools/heteronyms.py report        # every meaning and the sound it got
    .venv/bin/python tools/heteronyms.py report --seed draft.txt   # the same for a draft list
    .venv/bin/python tools/heteronyms.py fetch         # download the Commons recordings named

build_dataset.assemble() calls attach() to give each listed entry "prons"
(one per sound: IPA, respelling, gloss, parts of speech, recording) and each
of its senses "pron" (the index of its sound). Recordings are downloaded to
data/audio/<word>.<form>.m4a (tools/audio_norm.py evens them out with the
rest) and listed in data/cache/heteronym_audio.json.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SEED = ROOT / "seeds" / "heteronyms.txt"
AUDIO_CACHE = ROOT / "data" / "cache" / "heteronym_audio.json"
COMMONS = ROOT / "data" / "cache" / "commons_us.json"
POS = {"noun", "verb", "adjective", "adverb", "preposition", "conjunction", "interjection", "pronoun", "particle"}


def load(path: Path = SEED) -> dict[str, list[dict]]:
    """key → its sounds in file order, each with its selectors:
    [(parts of speech or None for "*", compiled regex or None)]."""
    out: dict[str, list[dict]] = {}
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [x.strip() for x in line.split(" | ")]
        if len(parts) not in (5, 6):
            sys.exit(f"{path.name}:{n}: expected 5 or 6 fields, got {len(parts)}")
        key, applies, ipa, respell, gloss = parts[:5]
        if not re.fullmatch(r"/[^/]+/", ipa):
            sys.exit(f"{path.name}:{n}: IPA must be in slashes: {ipa!r}")
        sel = []
        for chunk in applies.split(";"):
            chunk = chunk.strip()
            pos_part, _, rx = chunk.partition("~")
            pos_part, rx = pos_part.strip(), rx.strip()
            if pos_part == "*":
                pos = None
            else:
                pos = {p.strip() for p in pos_part.split(",")}
                bad = pos - POS
                if bad:
                    sys.exit(f"{path.name}:{n}: unknown part of speech {sorted(bad)}")
            sel.append((pos, re.compile(rx, re.I) if rx else None))
        out.setdefault(key, []).append({"ipa": ipa, "respell": respell, "gloss": gloss,
                                        "commons": parts[5] if len(parts) == 6 else "", "sel": sel, "line": n})
    for key, prons in out.items():
        if len(prons) < 2:
            sys.exit(f"{path.name}:{prons[0]['line']}: {key} has one sound (use seeds/fixes for that)")
    return out


def which(prons: list[dict], pos: str, definition: str) -> int | None:
    """The index of the sound a sense takes: a matching regex first, then a
    plain part of speech, then "*"."""
    for i, p in enumerate(prons):
        if any(rx and (ps is None or pos in ps) and rx.search(definition) for ps, rx in p["sel"]):
            return i
    for i, p in enumerate(prons):
        if any(not rx and ps is not None and pos in ps for ps, rx in p["sel"]):
            return i
    for i, p in enumerate(prons):
        if any(not rx and ps is None for ps, rx in p["sel"]):
            return i
    return None


def assign(w: dict, prons: list[dict]) -> list[tuple[str, int, str, int | None]]:
    """(pos, sense index, definition, sound index) for every sense."""
    return [(m.get("pos", ""), i, s.get("definition", ""), which(prons, m.get("pos", ""), s.get("definition", "")))
            for m in w.get("meanings") or [] for i, s in enumerate(m.get("senses") or [])]


def stem(key: str, commons: str) -> str:
    """data/audio/ name for a sound's recording: record.verb.m4a."""
    from build_dataset import slug
    form = commons.split("-", 1)[1] if "-" in commons else commons
    return f"{slug(key)}.{slug(form)}"


def lead_first(w: dict, spec: list[dict]) -> list[dict]:
    """The sounds with the one of the entry's main meaning (the study notes'
    core definition) first, so the IPA, the main play button and the
    definition shown first all agree: rih-KAWRD when the core sense of
    "record" is the verb. Among sounds sharing that part of speech, the one
    most of its meanings take."""
    core = ((w.get("nuance") or {}).get("core") or {}).get("pos", "")
    counts = [0] * len(spec)
    for pos, _, d, k in assign(w, spec):
        if pos == core and d and k is not None:
            counts[k] += 1
    if not core or not any(counts):
        return spec
    lead = max(range(len(spec)), key=lambda i: (counts[i], -i))
    return [spec[lead]] + [p for i, p in enumerate(spec) if i != lead]


def attach(words: list[dict], data_dir: Path, tts: dict) -> int:
    """Give each listed entry its sounds (see the module docstring), the
    sound of its main meaning first (lead_first). The entry's IPA becomes its
    first sound's; its main recording becomes that
    sound's recording, or, when the entry's own recording isn't one we
    know the form of, a synthesized one of that sound (has_audio off)."""
    if not SEED.exists():
        return 0
    table = load()
    rec = json.loads(AUDIO_CACHE.read_text(encoding="utf-8")) if AUDIO_CACHE.exists() else {}
    by_key = {w["key"]: w for w in words}
    missing = sorted(set(table) - set(by_key))
    if missing:
        sys.exit(f"seeds/heteronyms.txt: no entry for {', '.join(missing)}")
    for key, spec in table.items():
        w = by_key[key]
        spec = lead_first(w, spec)
        rows = assign(w, spec)
        lost = [f"{p} {i}: {d[:60]}" for p, i, d, k in rows if k is None and d]
        if lost:
            sys.exit(f"seeds/heteronyms.txt: {key} has meanings no sound covers: {lost}")
        prons = []
        for n, p in enumerate(spec):
            used = sorted({pos for pos, _, d, k in rows if k == n and d}, key=lambda x: [m["pos"] for m in w["meanings"]].index(x))
            listed = sorted({x for ps, _ in p["sel"] if ps for x in ps})
            out = {"ipa": p["ipa"], "respell": p["respell"], "gloss": p["gloss"], "pos": used or listed}
            r = rec.get(stem(key, p["commons"])) if p["commons"] else None
            if r and (data_dir / r["file"]).exists():
                out["audio"] = {"file": r["file"], "source_url": r["source_url"], "accent": "us"}
            else:
                t = tts.get(f"{key}~{n}" if n else key)   # the first sound: the entry's own
                if t and (data_dir / t["file"]).exists():
                    out["tts"] = {"file": t["file"], "voice": t["voice"]}
            prons.append(out)
        for m in w["meanings"]:
            for s in m["senses"]:
                k = which(spec, m.get("pos", ""), s.get("definition", ""))
                if k is not None:
                    s["pron"] = k
        w["prons"] = prons
        w["phonetic"] = prons[0]["ipa"]
        first = prons[0]
        if first.get("audio"):
            w["audio"], w["has_audio"] = dict(first["audio"]), True
            w.pop("tts", None)
        elif w.get("has_audio"):
            # The entry's own recording: which sound it says isn't known.
            w["audio"], w["has_audio"] = None, False
        if not w["has_audio"]:
            t = tts.get(key)
            if t and (data_dir / t["file"]).exists():
                w["tts"] = {"file": t["file"], "voice": t["voice"]}
        w.setdefault("status", {})["audio"] = w["has_audio"]
    return len(table)


def report(seed: Path = SEED) -> int:
    from build_dataset import WORDS_JSON
    table = load(seed)
    words = {w["key"]: w for w in json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    commons = json.loads(COMMONS.read_text(encoding="utf-8"))
    for key, spec in table.items():
        w = words.get(key)
        if not w:
            print(f"!! {key}: no entry")
            continue
        print(f"== {key}")
        for n, p in enumerate(spec):
            note = ""
            if p["commons"] and p["commons"] not in commons:
                note = f"  !! no Commons recording {p['commons']!r}"
            print(f"   [{n}] {p['ipa']} {p['respell']} · {p['gloss']}{note}")
        for pos, i, d, k in assign(w, spec):
            if d:
                print(f"      {'!!' if k is None else k} {pos[:4]} {i}: {d[:90]}")
    return 0


def fetch() -> int:
    import httpx
    from build_dataset import AUDIO, USER_AGENT, convert_audio
    table = load()
    commons = json.loads(COMMONS.read_text(encoding="utf-8"))
    rec = json.loads(AUDIO_CACHE.read_text(encoding="utf-8")) if AUDIO_CACHE.exists() else {}
    todo = []
    for key, spec in table.items():
        for p in spec:
            if not p["commons"]:
                continue
            if p["commons"] not in commons:
                sys.exit(f"seeds/heteronyms.txt:{p['line']}: no Commons recording {p['commons']!r}")
            name = stem(key, p["commons"])
            if name in rec and (ROOT / "data" / rec[name]["file"]).exists():
                continue
            todo.append((name, commons[p["commons"]][0]))
    print(f"{len(todo)} recordings to download", flush=True)
    AUDIO.mkdir(parents=True, exist_ok=True)
    failed = []
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True) as http:
        for name, file in todo:
            url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + quote(file.replace(" ", "_"))
            for attempt in range(5):
                r = http.get(url)
                if r.status_code == 429 or r.status_code >= 500:
                    time.sleep(2 ** attempt * 2)
                    continue
                break
            if r.status_code != 200 or len(r.content) < 1000:
                failed.append(f"{name}: HTTP {r.status_code}")
                continue
            ext = Path(file).suffix.lower() or ".ogg"
            src = AUDIO / f"{name}{ext}"
            src.write_bytes(r.content)
            dst = convert_audio(src)
            if dst.suffix not in (".m4a", ".mp3"):
                failed.append(f"{name}: could not convert {file}")
                continue
            rec[name] = {"file": f"audio/{dst.name}", "source_url": url}
            AUDIO_CACHE.write_text(json.dumps(rec, ensure_ascii=False, indent=0), encoding="utf-8")
            print(f"  {name} ← {file}", flush=True)
            time.sleep(0.5)
    for f in failed:
        print("  failed:", f)
    return 1 if failed else 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "report":
        return report(Path(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else SEED)
    if cmd == "fetch":
        return fetch()
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main())
