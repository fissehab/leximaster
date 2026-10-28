"""Word forms for each entry: its inflections (tenses, plural, comparative)
and the related words built from it in other parts of speech ("analyze":
analysis, analytical, analytically). build_dataset.py's assemble() adds
them to every entry as "forms":

    {"inflections": [["verb", [["he/she/it", "abides"], ["past", "abided, abode"], ...]], ...],
     "related": ["abiding (adjective)", "abidance (noun)", ...]}

Inflections come from lemminflect (its lexicon only, so no guessed forms);
related words from the study notes' word family first, then Open English
WordNet's derivation and pertainym links (CC BY 4.0, the file
tools/glossary.py downloads), cached in data/cache/wordnet_forms.json.
"""
from __future__ import annotations

import gzip
import json
import re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from lemminflect import getAllInflections
from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
WORDNET = ROOT / "data" / "cache" / "english-wordnet-2025.xml.gz"
CACHE = ROOT / "data" / "cache" / "wordnet_forms.json"
POS = {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}
UPOS = {"verb": "VERB", "noun": "NOUN", "adjective": "ADJ", "adverb": "ADV"}
# Tag -> label, in the order shown.
TAGS = {"VERB": [("VBZ", "he/she/it"), ("VBD", "past"), ("VBN", "past participle"), ("VBG", "-ing form")],
        "NOUN": [("NNS", "plural")],
        "ADJ": [("JJR", "comparative"), ("JJS", "superlative")],
        "ADV": [("RBR", "comparative"), ("RBS", "superlative")]}
MAX_RELATED = 12
RARE = 1.5          # Zipf below which a second spelling is left out
UNCOUNTABLE = 1.8   # a plural this much rarer than the word: an uncountable noun

PLAIN = re.compile(r"[A-Za-z][A-Za-z' -]*[A-Za-z]")       # not ".22-caliber"
_ISE = re.compile(r"(?<=[a-z]{2})is(e|ed|es|ing|er|ation|ations)$")


def british(form: str) -> bool:
    """WordNet lists both spellings; LexiMaster is American ("acclimatise")."""
    us = _ISE.sub(r"iz\1", form)
    return us != form and zipf_frequency(us, "en") >= zipf_frequency(form, "en")


_derived: dict[str, list[list[str]]] | None = None


def derivations() -> dict[str, list[list[str]]]:
    """lowercase lemma -> [[related lemma, part of speech], ...] from WordNet's
    derivation, pertainym and participle links, both ways."""
    global _derived
    if _derived is not None:
        return _derived
    if CACHE.exists() and WORDNET.exists() and CACHE.stat().st_mtime >= WORDNET.stat().st_mtime:
        _derived = json.loads(CACHE.read_text(encoding="utf-8"))
        return _derived
    if not WORDNET.exists():
        _derived = {}
        return _derived
    sense = {}                         # sense id -> (lemma, pos)
    links = []                         # (sense id, target sense id)
    for _, el in ET.iterparse(gzip.open(WORDNET), events=("end",)):
        if el.tag == "LexicalEntry":
            lemma = el.find("Lemma")
            form, pos = lemma.get("writtenForm"), POS.get(lemma.get("partOfSpeech"), "")
            for s in el.findall("Sense"):
                sense[s.get("id")] = (form, pos)
                links += [(s.get("id"), r.get("target")) for r in s.findall("SenseRelation")
                          if r.get("relType") in ("derivation", "pertainym", "participle")]
            el.clear()
        elif el.tag == "Synset":
            el.clear()
    out: dict[str, dict[tuple, None]] = defaultdict(dict)
    for a, b in links:
        if a in sense and b in sense and sense[a][0].lower() != sense[b][0].lower():
            out[sense[a][0].lower()][sense[b]] = None
            out[sense[b][0].lower()][sense[a]] = None
    _derived = {k: [list(x) for x in v] for k, v in sorted(out.items())}
    CACHE.write_text(json.dumps(_derived, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return _derived


def _inflect(word: str, upos: str) -> list[list[str]]:
    """[[label, "form, form"], ...] for one part of speech; [] when the
    lexicon doesn't know the word or every form is the word itself. A phrasal
    verb inflects its first word ("give up" -> "gave up")."""
    head, _, rest = word.partition(" ")
    if rest and upos != "VERB":
        return []
    forms = getAllInflections(head, upos=upos)
    if not forms:
        return []
    if "VBN" not in forms and "VBD" in forms:          # regular verbs list the past once
        forms["VBN"] = forms["VBD"]
    rows = []
    for tag, label in TAGS[upos]:
        got = list(dict.fromkeys(forms.get(tag, ())))
        if len(got) > 1:                               # keep a second spelling only when it's in use
            got = [g for i, g in enumerate(got) if i == 0 or zipf_frequency(g, "en") >= RARE]
        if tag == "NNS" and head in got[1:]:
            # "graces, grace": the plural shown is "graces". "informations,
            # information": a plural far rarer than the word (an uncountable
            # noun) is not shown.
            mass = zipf_frequency(got[0], "en") < zipf_frequency(head, "en") - UNCOUNTABLE
            got = [head] if mass else [g for g in got if g != head]
        if got and got != [head]:
            rows.append([label, ", ".join(f"{g} {rest}".strip() for g in got)])
    return rows


def forms_for(word: str, poses: list[str], family: list[str], shares_stem) -> dict:
    """The "forms" field of an entry. `poses` are its parts of speech, most
    important first; `family` the study notes' word family ("x (noun)");
    `shares_stem(member, word)` keeps only members built on the same word."""
    inflections = []
    for p in dict.fromkeys(poses):
        if p in UPOS and (rows := _inflect(word, UPOS[p])):
            same = next((x for x in inflections if x[1] == rows), None)
            if same:                                   # "quick": adjective and adverb alike
                same[0] += f", {p}"
            else:
                inflections.append([p, rows])
    # The study notes' family may name an inflection used as its own word
    # ("abiding (adjective)"); WordNet's links may not.
    own = {f.strip().lower() for _, rows in inflections for _, v in rows for f in v.split(",")}
    related, seen = [], {word.lower()}
    for x in family:
        base, _, label = x.partition(" (")
        base = base.strip()
        if base.lower() in own and re.search(r"plural|past|participle|tense|person|form|comparative|superlative", label):
            continue                                   # "criteria (plural noun)": already an inflection
        if base.lower() not in seen:
            seen.add(base.lower())
            related.append(x)
    seen |= own
    wn = [] if " " in word else [
        (f, p) for f, p in derivations().get(word.lower(), [])
        if f.lower() not in seen and PLAIN.fullmatch(f) and not british(f)
        and shares_stem(f, word) and zipf_frequency(f, "en") >= 1.0]
    wn.sort(key=lambda fp: -zipf_frequency(fp[0], "en"))
    for f, p in wn:
        if len(related) >= MAX_RELATED:
            break
        if f.lower() not in seen:
            seen.add(f.lower())
            related.append(f"{f} ({p})")
    out = {}
    if inflections:
        out["inflections"] = inflections
    if related:
        out["related"] = related
    return out
