"""A plain stress respelling from American IPA, in the style of the entries'
study notes: /ˈstɛpˌlædɚ/ → "STEP-lad-er", /ɪˈpɪtəmi/ → "ih-PIT-uh-mee".
For words that have no study notes (the related words of data/glossary.json).

    .venv/bin/python tools/respell.py "/ˈstɛpˌlædɚ/"
    .venv/bin/python tools/respell.py --compare    # against every entry's own respelling
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Longest first. Vowels (with a following r where the pair is one sound).
VOWELS = [("ɪəɹ", "eer"), ("ʊəɹ", "oor"), ("ʌɪ", "Y"), ("ai", "Y"), ("au", "ow"), ("aɪɚ", "y-er"), ("aɪə", "y-uh"), ("aʊɚ", "ow-er"), ("ɑɹ", "ar"), ("ɔɹ", "or"), ("oɹ", "or"),
          ("ɛɹ", "air"), ("eɹ", "air"), ("æɹ", "air"), ("ɪɹ", "eer"), ("iɹ", "eer"), ("ʊɹ", "oor"), ("uɹ", "oor"),
          ("ɝ", "ur"), ("ɜɹ", "ur"), ("ɜ", "ur"), ("ɚ", "er"), ("əɹ", "er"),
          ("aɪ", "Y"), ("aʊ", "ow"), ("ɔɪ", "oy"), ("oɪ", "oy"), ("eɪ", "ay"), ("oʊ", "oh"), ("əʊ", "oh"),
          ("ju", "yoo"), ("i", "ee"), ("u", "oo"), ("ɪ", "I"), ("ɛ", "E"), ("e", "ay"), ("æ", "a"),
          ("ʌ", "U"), ("ə", "U"), ("ɐ", "U"), ("ᵻ", "I"), ("ʊ", "uu"), ("ɑ", "ah"), ("ɒ", "ah"), ("ɔ", "aw"),
          ("o", "oh"), ("a", "ah")]
CONSONANTS = [("tʃ", "ch"), ("dʒ", "j"), ("ʃ", "sh"), ("ʒ", "zh"), ("θ", "th"), ("ð", "th"), ("ŋ", "ng"),
              ("ɹ", "r"), ("r", "r"), ("j", "y"), ("ɡ", "g"), ("g", "g"), ("ɾ", "t"), ("ʔ", "t"), ("x", "k"),
              ("ɫ", "l"), ("ʍ", "w"), ("p", "p"), ("b", "b"), ("t", "t"), ("d", "d"), ("k", "k"), ("f", "f"),
              ("v", "v"), ("s", "s"), ("z", "z"), ("h", "h"), ("m", "m"), ("n", "n"), ("l", "l"), ("w", "w")]
SHORT = {"I", "E", "a", "U", "uu"}   # checked vowels: a stressed one takes the next consonant ("PIT-uh")


def tokens(word_ipa: str) -> list[tuple[str, str]]:
    """[(kind, text)]: kind "V" (vowel, text its respelling), "C"
    (consonant), "'" primary or "," secondary stress, "." a syllable break."""
    s, out, i = word_ipa, [], 0
    while i < len(s):
        c = s[i]
        if c in "ˈˌ.":
            out.append(({"ˈ": "'", "ˌ": ",", ".": "."}[c], ""))
            i += 1
            continue
        for ipa, sp in VOWELS:
            if s.startswith(ipa, i):
                out.append(("V", sp))
                i += len(ipa)
                break
        else:
            for ipa, sp in CONSONANTS:
                if s.startswith(ipa, i):
                    out.append(("C", sp))
                    i += len(ipa)
                    break
            else:
                i += 1   # length marks, diacritics, anything unknown
    return out


ONSETS = None


def onsets() -> set[tuple[str, ...]]:
    global ONSETS
    if ONSETS is None:
        import build_dataset as b
        spell = dict(CONSONANTS)
        ONSETS = {tuple(spell.get(b.ARPABET[c], b.ARPABET[c]) for c in o) for o in b.ONSETS} | {()}
        ONSETS |= {(c,) for _, c in CONSONANTS}
    return ONSETS


def syllables(word_ipa: str) -> list[dict]:
    """[{"on": [...], "v": "...", "coda": [...], "stress": 0|1|2}]: each
    vowel with the consonants before it (the longest English onset), and the
    ones left over at the end."""
    toks = tokens(word_ipa)
    sylls, cons, stress, brk = [], [], 0, False
    for kind, text in toks:
        if kind == "C":
            cons.append(text)
        elif kind in "',":
            stress = 1 if kind == "'" else 2
            brk = True
        elif kind == ".":
            brk = True
        elif kind == "V":
            if sylls:
                if brk:
                    split = 0      # a mark says where the syllable starts
                    while cons[split:] and tuple(cons[split:]) not in onsets():
                        split += 1
                else:
                    split = len(cons)
                    while split > 0 and tuple(cons[split - 1:]) in onsets():
                        split -= 1
                sylls[-1]["coda"] += cons[:split]
                cons = cons[split:]
            sylls.append({"on": cons, "v": text, "coda": [], "stress": stress})
            cons, stress, brk = [], 0, False
    if sylls:
        sylls[-1]["coda"] += cons
    elif cons:
        sylls.append({"on": cons, "v": "", "coda": [], "stress": 0})
    return sylls


def respell_word(word_ipa: str) -> str:
    sylls = syllables(word_ipa)
    # A stressed checked vowel keeps the next consonant: PIT-uh, not PI-tuh.
    for a, b in zip(sylls, sylls[1:]):
        if a["v"] in SHORT and not a["coda"] and b["on"] and a["stress"]:
            a["coda"].append(b["on"].pop(0))
    parts = []
    for n, s in enumerate(sylls):
        v, closed = s["v"], bool(s["coda"])
        if v == "I":
            v = "i" if closed else "ih"
        elif v == "E":
            v = "e" if closed else "eh"
        elif v == "U":
            v = "u" if closed else "uh"
        elif v == "uu":
            v = "uu" if not closed else "oo"
        elif v == "Y":
            if not s["on"] and not closed:
                v = "eye"
            elif closed and len(s["coda"]) == 1 and s["coda"][0] not in ("ng", "th", "sh", "ch", "zh", "y", "w"):
                v = "i" + s["coda"].pop() + "e"
            else:
                v = "y"
        text = "".join(s["on"]) + v + "".join(s["coda"])
        if text.startswith("y-"):
            text = text[2:]
        parts.append(text.upper() if s["stress"] == 1 else text)
    return "-".join(p for p in parts if p).replace("--", "-")


def respell(ipa: str) -> str:
    """"STEP-lad-er" for /ˈstɛpˌlædɚ/; each word of a phrase respelled."""
    s = ipa.strip()
    if s.startswith("/") and "/" in s[1:]:
        s = s[1:s.index("/", 1)]
    s = s.split(",")[0].strip().strip("/[]")
    s = re.sub(r"\(([^)]*)\)", r"\1", s).replace("‿", " ").replace("-", " ")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c) or c == "̩")
    s = re.sub(r"([lmn])̩", r"ə\1", s)
    if "ˈ" not in s:
        s = s.replace("ˌ", "ˈ")    # only secondary marks: they are the stresses
    words = s.split()
    # Without marks, a one-word entry's only syllable is stressed; so is a
    # phrase word's with a secondary mark (/ˌpaɪn ˈtɹi/ "PINE TREE"), while
    # its unmarked little words stay low ("up und KUM-ing").
    out = []
    for w in words:
        if len(words) == 1 and "ˈ" not in w:
            w = "ˈ" + w.replace("ˌ", "")
        elif len(words) > 1 and "ˈ" not in w and re.match(r"ˌ[^ˌ]*$", w):
            w = "ˈ" + w[1:]
        out.append(respell_word(w))
    return " ".join(out)


def compare() -> int:
    import json
    import build_dataset as b
    words = json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    n = same = stress_ok = 0
    bad = []
    for w in words:
        own = ((w.get("nuance") or {}).get("pronunciation") or {}).get("respelling", "")
        if not own or not w.get("phonetic") or " " in w["word"]:
            continue
        mine = respell(w["phonetic"])
        n += 1
        same += mine.lower() == own.lower()
        ok = b.respelling_matches_ipa(mine, w["phonetic"])
        stress_ok += ok is not False
        if ok is False and len(bad) < 40:
            bad.append((w["word"], w["phonetic"], mine, own))
    print(f"{n:,} words: {same / n:.0%} spelled exactly as the study notes, "
          f"{stress_ok / n:.1%} stress the IPA's syllable")
    for x in bad:
        print("  ", *x)
    import random
    random.seed(1)
    sample = random.sample([w for w in words if w.get("phonetic") and " " not in w["word"]], 40)
    for w in sample:
        print(f"  {w['word']:20} {w['phonetic']:24} {respell(w['phonetic']):24} "
              f"{((w.get('nuance') or {}).get('pronunciation') or {}).get('respelling', '')}")
    return 0


if __name__ == "__main__":
    if "--compare" in sys.argv:
        sys.exit(compare())
    print(respell(sys.argv[1]))
