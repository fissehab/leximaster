"""Flag shown pronunciations that disagree with the CMU Pronouncing Dictionary.

    .venv/bin/python tools/pron_audit.py [--min-zipf 4.0] [--all]

Compares each one-word entry's IPA in data/words.json with every CMU
pronunciation of the word, loosely: stress, syllable dots, flaps, reduced
vowels and the usual American variants (cot/caught, Mary/marry, ɚ/əɹ/ɝ) don't
count. What is left is printed, most common words first, with the closest
CMU form, for review. Reviewed corrections go in seeds/fixes/pronunciation.txt.
"""
from __future__ import annotations

import argparse
import collections
import itertools
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build_dataset as B  # noqa: E402

SAME = [("ɜɹ", "ɚ"), ("əɹ", "ɚ"), ("ɝ", "ɚ"), ("ɪɚ", "ɪɹ"), ("ɛɚ", "ɛɹ"), ("ʊɚ", "ʊɹ"), ("ɔɚ", "ɔɹ"),
        ("oɹ", "ɔɹ"), ("æɹ", "ɛɹ"), ("ʌ", "ə"), ("ɔ", "ɑ"), ("ɾ", "t"), ("ɫ", "l"), ("g", "ɡ"), ("ʍ", "w"),
        ("oʊ", "o"), ("eɪ", "e"), ("ɪɹ", "iɹ"), ("ʊɹ", "uɹ"), ("ɛɹ", "eɹ"), ("ju", "u"), ("tʃ", "tj"),
        ("ŋk", "nk"), ("ŋɡ", "nɡ"), ("ʊə", "əw"), ("uə", "əw"), ("ɪə", "iə")]


def loose(s: str) -> str:
    s = re.sub(r"([lmn])̩", r"ə\1", s)
    s = re.sub(r"[ˈˌ.‿\-ʰ̃ >ː]", "", s)
    for a, b in SAME:
        s = s.replace(a, b)
    s = re.sub(r"[ɪəʊiɛ]", "ə", s.replace("d", "t")).replace("ɚ", "əɹ")
    return re.sub(r"ə+", "ə", s)


def readings(ipa: str) -> set[str]:
    """The IPA with and without each optional "(…)" sound, loosely."""
    s = re.split(r"[;,\[\]/]", unicodedata.normalize("NFC", ipa).strip("/[] "))[0]
    parts = re.split(r"(\([^)]*\))", s)
    return {loose("".join(c)) for c in itertools.product(*[[p[1:-1], ""] if p.startswith("(") else [p] for p in parts])}


def distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--min-zipf", type=float, default=4.0, help="only words at least this common (default 4.0)")
    ap.add_argument("--all", action="store_true", help="every word, however rare")
    args = ap.parse_args()
    cmu = collections.defaultdict(list)
    for line in B.CMUDICT.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if line:
            w, *ph = line.split()
            cmu[re.sub(r"\(\d+\)$", "", w)].append(ph)
    words = json.loads((ROOT / "data" / "words.json").read_text(encoding="utf-8"))["words"]
    rows = []
    for w in words:
        ipa, word = w.get("phonetic"), w["word"]
        if not ipa or " " in word or "-" in word or word != word.lower():
            continue
        if not args.all and w.get("zipf", 0) < args.min_zipf:
            continue
        forms = ["/" + B.arpabet_ipa(v) + "/" for v in cmu.get(word, [])]
        if not forms or readings(ipa) & {loose(f.strip("/")) for f in forms}:
            continue
        plain = lambda s: re.sub(r"[ˈˌ.()/]", "", s)
        rows.append((w.get("zipf", 0), word, ipa, min(forms, key=lambda f: distance(plain(ipa), plain(f)))))
    rows.sort(reverse=True)
    for z, word, ipa, best in rows:
        print(f"{z:4.2f}  {word:<22} {ipa:<26} CMU {best}")
    print(f"{len(rows)} to review", file=sys.stderr)


if __name__ == "__main__":
    main()
