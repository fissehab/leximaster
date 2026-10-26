"""Audit data/words.json for content errors.

    .venv/bin/python tools/audit.py            # summary with examples
    .venv/bin/python tools/audit.py --keys     # also print the keys of entries to redo
    .venv/bin/python tools/audit.py --mark     # mark study notes that fail for --retry-failed
    .venv/bin/python tools/audit.py --check    # display rules only; exit 1 on a violation (site build)

Dictionary checks: leftover markup, broken punctuation, inflection-only
entries, non-American IPA, junk in synonym lists, weak etymologies.
Study-note checks: respelling stress against the IPA, British spelling,
empty required fields, examples that don't use the word, long verbatim
quotations in Bible notes, and tradition views that don't cover all three.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tools.check_examples import uses_entry  # noqa: E402
from build_dataset import (ENRICH_CACHE, FORM_OF_RE, WORDS_JSON, _flat, _similar,  # noqa: E402
                           append_jsonl, respelling_matches_ipa, sense_dup, us_spelling)

TRADITIONS = {"Eastern Orthodox", "Roman Catholic", "Protestant"}


def note_problems(w: dict) -> list[str]:
    """Problems in an entry's study notes (empty list when it passes)."""
    n = w.get("nuance")
    if not n:
        return []
    out = []
    pron = n.get("pronunciation") or {}
    if respelling_matches_ipa(pron.get("respelling", ""), w.get("phonetic", "")) is False:
        out.append("stress differs from IPA")
    for field in ("core", "usage_note", "collocations", "examples", "common_mistakes"):
        if not n.get(field):
            out.append(f"empty {field}")
    text = json.dumps({k: v for k, v in n.items() if k != "etymology"}, ensure_ascii=False)
    if us_spelling(text) != text:
        out.append("British spelling")
    ex = n.get("examples") or {}
    missing = [k for k, s in ex.items() if s and not uses_entry(w["word"], s)]
    if len(missing) >= 2:  # one paraphrased form ("bribing") is fine; two means the word is missing
        out.append("examples don't use the word")
    note = n.get("biblical_note") or ""
    for q in re.findall(r'[“"]([^“”"]{10,})[”"]', note):
        if len(q.split()) > 10:
            out.append("long quotation in Bible note")
            break
    trad = n.get("traditions") or []
    if trad and {t.get("tradition") for t in trad} != TRADITIONS:
        out.append("traditions incomplete")
    return out


def dictionary_problems(w: dict) -> list[str]:
    out = []
    defs = [s["definition"] for m in w["meanings"] for s in m["senses"]]
    if not defs:
        out.append("no definition")
    elif FORM_OF_RE.match(defs[0]):
        out.append("first sense is an inflection")
    blob = json.dumps(w["meanings"], ensure_ascii=False) + w.get("etymology", "")
    if re.search(r"\{\{|\}\}|\[\[|\]\]|<[a-z/]|&[a-z]+;|thumb\||rfdef|↑", blob):
        out.append("markup leak")
    if any(re.search(r"\(\s*\)|\s{2,}|\s[,.;]|^[,.;:]", d) for d in defs):
        out.append("broken punctuation")
    if re.search(r"[ɖʈɒ]|əʊ|ː|<", w.get("phonetic", "")):
        out.append("non-US IPA")
    if any(not re.fullmatch(r"[A-Za-z][A-Za-z '\-.]*", s) for s in w.get("synonyms", []) + w.get("antonyms", [])):
        out.append("odd synonym")
    return out


def display_problems(w: dict) -> list[str]:
    """The display rules normalize_display() guarantees (see build_dataset)."""
    out = []
    n = w.get("nuance") or {}
    core = n.get("core") or {}
    shown = [(m.get("pos", ""), s) for m in w["meanings"] for s in m["senses"] if not s.get("dup")]
    if core.get("definition") and any(_flat(s["definition"]) == _flat(core["definition"]) for _, s in shown):
        out.append("a sense repeats the definition")
    if shown and m_pos_first(shown, core):
        out.append("first sense restates the definition")
    word = w["word"].lower()
    if any(x.split(" (")[0].strip().lower() == word for x in n.get("word_family") or []):
        out.append("headword in its word family")
    if w.get("name_kind") and (w.get("synonyms") or w.get("antonyms")):
        out.append("dictionary synonyms on a name")
    reg = n.get("register") or []
    if "neutral" in reg and len(reg) > 1:
        out.append("neutral beside another register")
    conv = [e["text"] for e in w.get("conversation") or []]
    if any(_similar(a, b) for i, a in enumerate(conv) for b in conv[i + 1:]):
        out.append("near-duplicate conversation lines")
    return out


def m_pos_first(shown: list, core: dict) -> bool:
    pos, s = shown[0]
    return pos != "everyday English" and \
        sense_dup(s["definition"], pos, core.get("definition", ""), core.get("pos", "")) != ""


def check() -> int:
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    bad = collections.defaultdict(list)
    for w in words:
        for p in display_problems(w):
            bad[p].append(w["word"])
    for k, v in bad.items():
        print(f"  display rule broken: {k}: {len(v)}  e.g. {', '.join(v[:6])}")
    print(f"display rules: {'all hold' if not bad else 'BROKEN'} ({len(words):,} entries)")
    return 1 if bad else 0


def main() -> int:
    if "--check" in sys.argv:
        return check()
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    issues: dict[str, list[str]] = collections.defaultdict(list)
    redo: set[str] = set()
    for w in words:
        for p in dictionary_problems(w):
            issues[p].append(w["word"])
        for p in note_problems(w):
            issues[f"notes: {p}"].append(w["word"])
            redo.add(w["key"])
    enriched = sum(1 for w in words if w.get("nuance"))
    print(f"{len(words):,} entries · {enriched:,} with study notes")
    for k, v in sorted(issues.items(), key=lambda kv: -len(kv[1])):
        print(f"  {k}: {len(v)}  e.g. {', '.join(v[:6])}")
    if not issues:
        print("  no problems found")
    print(f"study notes to redo: {len(redo)}")
    if "--keys" in sys.argv:
        print(",".join(sorted(redo)))
    if "--mark" in sys.argv:
        for k in sorted(redo):
            append_jsonl(ENRICH_CACHE, {"key": k, "status": "failed", "reason": "failed the audit"})
        print(f"marked {len(redo)} for: build_dataset.py --stages enrich --retry-failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
