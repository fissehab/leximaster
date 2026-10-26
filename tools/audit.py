"""Audit data/words.json for content errors.

    .venv/bin/python tools/audit.py            # summary with examples
    .venv/bin/python tools/audit.py --keys     # also print the keys of entries to redo
    .venv/bin/python tools/audit.py --mark     # mark study notes that fail for --retry-failed

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
from build_dataset import (ENRICH_CACHE, FORM_OF_RE, WORDS_JSON, append_jsonl,  # noqa: E402
                           respelling_matches_ipa, us_spelling)

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


def main() -> int:
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
