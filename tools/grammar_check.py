"""Grammar check of the example sentences learners see and are quizzed on.

    .venv/bin/python tools/grammar_check.py            # check (resumable), write the report
    .venv/bin/python tools/grammar_check.py --report   # list what was found

Runs LanguageTool locally (free; the first run downloads it, about 250 MB,
and needs Java) over the study-note examples (everyday, professional,
analytical) and the conversation lines of every entry. Only grammar rules
are kept: agreement, verb forms, articles, confused words, missing or
repeated words. Spelling (rare words are not mistakes) and style are left
out. Most findings are false alarms (headword spellings, casual dialogue,
technical usage); the 2026-11-15 run's real errors are in
seeds/fixes/grammar_2026_11_15.txt. Each finding is a candidate: read it, and fix real errors by hand in
seeds/fixes/*.txt. Results: data/cache/grammar_check.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OUT = ROOT / "data" / "cache" / "grammar_check.json"
KEEP = {"GRAMMAR", "CONFUSED_WORDS", "COLLOCATIONS", "NONSTANDARD_PHRASES", "MISC"}
SKIP_RULES = {"WHITESPACE_RULE", "EN_QUOTES", "DASH_RULE", "COMMA_PARENTHESIS_WHITESPACE",
              "UPPERCASE_SENTENCE_START", "MORFOLOGIK_RULE_EN_US", "EN_UNPAIRED_BRACKETS",
              # compares spellings across the whole text, i.e. unrelated sentences checked together
              "EN_WORD_COHERENCY"}
CHUNK = 60   # sentences per call (one text, blank lines between)


def sentences(words: list[dict]):
    for w in words:
        if "reference" in w.get("domains", []):
            continue
        ex = (w.get("nuance") or {}).get("examples") or {}
        for k in ("everyday", "professional", "analytical"):
            if ex.get(k):
                yield w["key"], f"nuance.examples.{k}", ex[k]
        for i, line in enumerate(w.get("conversation") or []):
            if line.get("text"):
                yield w["key"], f"conversation.{i}.text", line["text"]


def main() -> int:
    import build_dataset as b
    done = json.loads(OUT.read_text()) if OUT.exists() else {"checked": [], "found": []}
    if "--report" in sys.argv:
        by_rule: dict[str, int] = {}
        for f in done["found"]:
            by_rule[f["rule"]] = by_rule.get(f["rule"], 0) + 1
        print(f"{len(done['checked']):,} keys checked, {len(done['found']):,} findings")
        for r, n in sorted(by_rule.items(), key=lambda x: -x[1]):
            print(f"  {n:5}  {r}")
        return 0
    import language_tool_python
    tool = language_tool_python.LanguageTool("en-US")
    words = json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    checked = set(done["checked"])
    todo = [s for s in sentences(words) if s[0] not in checked]
    print(f"{len(todo):,} sentences to check", flush=True)
    for i in range(0, len(todo), CHUNK):
        part = todo[i:i + CHUNK]
        text, starts = "", []
        for _, _, s in part:
            starts.append(len(text))
            text += s.strip() + "\n\n"
        for m in tool.check(text):
            if m.rule_id in SKIP_RULES or (m.category or "").upper() not in KEEP:
                continue
            j = max(k for k, st in enumerate(starts) if st <= m.offset)
            key, field, s = part[j]
            done["found"].append({"key": key, "field": field, "sentence": s, "rule": m.rule_id,
                                  "message": m.message, "at": m.offset - starts[j], "len": m.error_length,
                                  "fix": (m.replacements or [""])[0]})
        done["checked"] = sorted(checked | {k for k, _, _ in part})
        checked = set(done["checked"])
        if (i // CHUNK) % 25 == 0:
            OUT.write_text(json.dumps(done))
            print(f"  {min(i + CHUNK, len(todo)):,} / {len(todo):,}  ({len(done['found']):,} found)", flush=True)
    OUT.write_text(json.dumps(done))
    tool.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
