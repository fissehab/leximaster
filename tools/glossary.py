"""Short definitions for the related words that have no entry of their own:
synonyms, antonyms, "Compared with" and word-family words. Tapping one of
those opens a small definition from Open English WordNet instead of nothing.

    .venv/bin/python tools/glossary.py

Reads data/words.json and Open English WordNet (downloaded once to
data/cache/, CC BY 4.0), writes data/glossary.json:

    {"term": {"w": "term", "base": "lemma"?, "form_of": "lemma"?,
              "senses": [[pos, definition, example], ...], "syn": [...]},
     "kings": {"see": "king"}, ...}

"base" is the dictionary form defined in the term's place ("bubbles" ->
"bubble"); "form_of" names the word a defined term is also a form of
("stopped"). "see" points at a LexiMaster headword the term is a form of (a plural, a
past tense), so the app opens that entry. A term found in neither is left
out; the app then offers a dictionary search. tools/build_site.py publishes
the file in shards; the local app reads it whole (/api/gloss).
"""
from __future__ import annotations

import gzip
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.common import gloss_key as norm  # noqa: E402

DATA = ROOT / "data"
WORDNET = DATA / "cache" / "english-wordnet-2025.xml.gz"
WORDNET_URL = ("https://github.com/globalwordnet/english-wordnet/releases/download/"
               "2025-edition/english-wordnet-2025.xml.gz")
OUT = DATA / "glossary.json"
POS = {"n": "noun", "v": "verb", "a": "adjective", "s": "adjective", "r": "adverb"}
MAX_SENSES, MAX_PER_POS, MAX_SYN = 5, 3, 6

# WordNet's "morphy" endings: (suffix, replacement), tried in order.
ENDINGS = [("ies", "y"), ("ses", "s"), ("xes", "x"), ("zes", "z"), ("ches", "ch"), ("shes", "sh"),
           ("men", "man"), ("es", "e"), ("es", ""), ("s", ""), ("ied", "y"), ("ed", "e"), ("ed", ""),
           ("ying", "ie"), ("ing", "e"), ("ing", ""), ("ier", "y"), ("iest", "y"), ("er", ""), ("est", ""),
           ("er", "e"), ("est", "e"), ("ily", "y"), ("ally", "al"), ("ly", ""), ("ly", "le")]


def base_forms(term: str) -> list[str]:
    """Candidate dictionary forms of an inflected word, most likely first."""
    out = []
    words = term.split(" ")
    head = words[0] if len(words) > 1 else term     # "running away" -> "run away"
    for suffix, repl in ENDINGS:
        if head.endswith(suffix) and len(head) - len(suffix) >= 2:
            stem = head[: -len(suffix)] + repl
            out.append(stem)
            if repl == "" and len(stem) > 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiouls":
                out.append(stem[:-1])                # "stopped" -> "stop"
    if len(words) > 1:
        out = [" ".join([s, *words[1:]]) for s in out]
    if term.startswith("to "):
        out.insert(0, term[3:])
    return list(dict.fromkeys(out))


def load_wordnet() -> tuple[dict[str, list[str]], dict[str, tuple]]:
    """lemma -> synset ids in WordNet's order; synset id -> (pos, definition, example, member lemmas)."""
    if not WORDNET.exists():
        print(f"Downloading Open English WordNet to {WORDNET.relative_to(ROOT)} …")
        WORDNET.parent.mkdir(parents=True, exist_ok=True)
        tmp = WORDNET.with_suffix(".part")
        urllib.request.urlretrieve(WORDNET_URL, tmp)
        tmp.rename(WORDNET)
    lemmas: dict[str, list[str]] = defaultdict(list)
    entry_form: dict[str, str] = {}
    raw: dict[str, tuple] = {}
    for _, el in ET.iterparse(gzip.open(WORDNET), events=("end",)):
        if el.tag == "LexicalEntry":
            form = el.find("Lemma").get("writtenForm")
            entry_form[el.get("id")] = form
            for s in el.findall("Sense"):
                lemmas[form.lower()].append(s.get("synset"))
            for f in el.findall("Form"):                 # irregular forms ("went", "mice")
                lemmas.setdefault("=" + f.get("writtenForm").lower(), []).append(form.lower())
            el.clear()
        elif el.tag == "Synset":
            d, ex = el.find("Definition"), el.find("Example")
            raw[el.get("id")] = (el.get("partOfSpeech"), d.text if d is not None else "",
                                 ex.text if ex is not None else "", (el.get("members") or "").split())
            el.clear()
    synsets = {sid: (pos, d, ex, [entry_form[m] for m in members if m in entry_form])
               for sid, (pos, d, ex, members) in raw.items()}
    return lemmas, synsets


def referenced_terms(words: list[dict]) -> set[str]:
    """Every synonym, antonym, compared-with and word-family term the app shows."""
    terms = set()
    for w in words:
        n = w.get("nuance") or {}
        meanings = w.get("meanings") or []
        found = [*(w.get("synonyms") or []), *(w.get("antonyms") or []), *(n.get("antonyms") or []),
                 *(s for m in meanings for s in (m.get("synonyms") or [])),
                 *(s for m in meanings for s in (m.get("antonyms") or [])),
                 *((d or {}).get("vs", "") for d in (n.get("distinctions") or [])),
                 *(n.get("word_family") or [])]
        terms.update(norm(t) for t in found if isinstance(t, str) and t.strip())
    terms.discard("")
    return terms


def gloss(term: str, lemma: str, lemmas, synsets) -> dict:
    senses, per_pos, syn = [], defaultdict(int), []
    for sid in lemmas[lemma]:
        pos, definition, example, members = synsets[sid]
        p = POS.get(pos, pos)
        if not definition or per_pos[p] >= MAX_PER_POS or len(senses) >= MAX_SENSES:
            continue
        per_pos[p] += 1
        # A synset's example may use another of its words ("an addition to
        # property taxes" under "increase"): kept only when it shows this one.
        stem = lemma.split(" ")[0][:max(3, len(lemma.split(" ")[0]) - 2)]
        senses.append([p, definition, example if stem in example.lower() else ""])
        syn += [m for m in members if m.lower() not in (lemma, term) and m not in syn]
    out = {"w": term, "senses": senses, "syn": syn[:MAX_SYN]}
    if lemma != term:
        out["base"] = lemma
    return out


def main() -> None:
    words = json.loads((DATA / "words.json").read_text(encoding="utf-8"))["words"]
    heads = {}
    for w in words:
        heads.setdefault(w["word"].lower(), w["word"])
        for a in w.get("also") or []:
            heads.setdefault(a.lower(), w["word"])
    lemmas, synsets = load_wordnet()
    out, counts = {}, defaultdict(int)
    for term in sorted(referenced_terms(words)):
        if term in heads and heads[term].lower() == term:
            counts["entry"] += 1
            continue
        if term in heads:                                    # another spelling of a headword
            out[term] = {"see": heads[term]}
            counts["see"] += 1
            continue
        irregular = lemmas.get("=" + term, [])
        candidates = [*irregular, *base_forms(term)]
        see = next((c for c in candidates if c in heads), None)
        if see and term not in lemmas:
            out[term] = {"see": heads[see]}
            counts["see"] += 1
            continue
        base = next((c for c in candidates if c in lemmas and c != term), None)
        lemma = term if term in lemmas else base
        if lemma:
            out[term] = gloss(term, lemma, lemmas, synsets)
            if lemma == term and base:                       # "stopped": an adjective, and a form of "stop"
                out[term]["form_of"] = heads.get(base, base)
            counts["wordnet"] += 1
        else:
            counts["none"] += 1
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(out):,} terms ({OUT.stat().st_size / 1e6:.1f} MB) · "
          f"{counts['entry']:,} have entries · {counts['see']:,} point to an entry · "
          f"{counts['wordnet']:,} defined from WordNet · {counts['none']:,} not found")


if __name__ == "__main__":
    sys.exit(main())
