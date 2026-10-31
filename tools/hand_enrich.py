"""Write the enrichment (the `nuance` section) by hand instead of with the
paid enrich stage, for words of one domain.

    # what to write: the words of a domain that have no enrichment yet,
    # with the same brief the enrich stage sends to Claude
    .venv/bin/python tools/hand_enrich.py brief liturgical_theology > todo.json

    # check entries ({"entries": [...]} in the enrich stage's schema) and
    # add them to data/cache/enrich.jsonl, as the enrich stage would
    .venv/bin/python tools/hand_enrich.py add entries.json [--dry-run]

    # only check them (words that are not in the lexicon yet, too)
    .venv/bin/python tools/hand_enrich.py check entries.json

    # entries for words no dictionary has, as hand entries
    # (seeds/entries/<name>.json, read by assemble)
    .venv/bin/python tools/hand_enrich.py hand entries.json seeds/entries/NAME.json

Entries are checked against build_dataset.ENTRY_SCHEMA and the respelling
must stress the same syllable as the IPA. Rebuild with
`python -c "import build_dataset as b; b.assemble()"` afterwards.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build_dataset as b  # noqa: E402


def problems(value, schema, where="entry"):
    """What is wrong with `value` against this (small) JSON schema."""
    t = schema.get("type")
    if t == "object":
        if not isinstance(value, dict):
            return [f"{where}: not an object"]
        out = [f"{where}: missing {k}" for k in schema.get("required", []) if k not in value]
        props = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            out += [f"{where}: unexpected {k}" for k in value if k not in props]
        for k, sub in props.items():
            if k in value:
                out += problems(value[k], sub, f"{where}.{k}")
        return out
    if t == "array":
        if not isinstance(value, list):
            return [f"{where}: not a list"]
        return [p for i, v in enumerate(value) for p in problems(v, schema["items"], f"{where}[{i}]")]
    if t == "string":
        if not isinstance(value, str):
            return [f"{where}: not a string"]
        if "enum" in schema and value not in schema["enum"]:
            return [f"{where}: {value!r} not one of {schema['enum']}"]
    return []


def brief(domain: str) -> None:
    lexicon = {w["key"]: w for w in b.read_json(b.WORDS_JSON, {"words": []})["words"]}
    done = b.read_jsonl(b.ENRICH_CACHE)
    todo = [{"key": k, "word": w["word"], "brief": b.word_brief(w)} for k, w in lexicon.items()
            if domain in (w.get("domains") or []) and (done.get(k) or {}).get("status") != "ok"]
    json.dump(todo, sys.stdout, ensure_ascii=False, indent=1)
    print(f"{len(todo)} words of {domain} to write", file=sys.stderr)


def checked(path: str, need_lexicon: bool):
    """(good, bad) entries of a file: (key, entry, problems)."""
    entries = json.loads(Path(path).read_text(encoding="utf-8"))["entries"]
    lexicon = {w["key"]: w for w in b.read_json(b.WORDS_JSON, {"words": []})["words"]}
    bad, good = [], []
    for e in entries:
        word = e.get("word", "?")
        k = b.norm_key(word)
        errs = problems(e, b.ENTRY_SCHEMA, word)
        if need_lexicon and k not in lexicon:
            errs.append(f"{word}: not in the lexicon (key {k})")
        p = e.get("pronunciation") or {}
        if not str(p.get("ipa", "")).startswith("/") or not str(p.get("ipa", "")).endswith("/"):
            errs.append(f"{word}: IPA {p.get('ipa')!r} must be between slashes")
        if b.respelling_matches_ipa(p.get("respelling", ""), p.get("ipa", "")) is False:
            errs.append(f"{word}: respelling {p.get('respelling')!r} stresses another syllable than {p.get('ipa')!r}")
        (bad if errs else good).append((k, e, errs))
    for _, _, errs in bad:
        print("\n".join(errs), file=sys.stderr)
    return good, bad


def check(path: str) -> None:
    good, bad = checked(path, need_lexicon=False)
    print(f"{len(good)} entries fine, {len(bad)} with problems", file=sys.stderr)
    sys.exit(1 if bad else 0)


def hand(path: str, out: str) -> None:
    """Hand entries (seeds/entries) from enrich-schema entries: the meaning
    is the core definition, the IPA the pronunciation's."""
    good, bad = checked(path, need_lexicon=False)
    if bad:
        sys.exit(f"{len(bad)} entries with problems: fix them first")
    rows = []
    for _, e, _ in good:
        nuance = {f: v for f, v in e.items() if f not in ("word", "domains")}
        rows.append({"word": e["word"], "domains": e["domains"], "phonetic": e["pronunciation"]["ipa"],
                     "meanings": [{"pos": e["core"]["pos"], "senses": [e["core"]["definition"]]}],
                     "etymology": e.get("etymology", ""), "nuance": nuance})
    Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(rows)} hand entries written to {out}", file=sys.stderr)


def add(path: str, dry_run: bool) -> None:
    good, bad = checked(path, need_lexicon=True)
    if not dry_run:
        for k, e, _ in good:
            nuance = {f: v for f, v in e.items() if f != "word"}
            b.append_jsonl(b.ENRICH_CACHE, {"key": k, "status": "ok", "nuance": nuance})
    print(f"{len(good)} entries {'would be ' if dry_run else ''}added, {len(bad)} with problems", file=sys.stderr)
    sys.exit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("brief").add_argument("domain")
    a = sub.add_parser("add")
    a.add_argument("file")
    a.add_argument("--dry-run", action="store_true")
    sub.add_parser("check").add_argument("file")
    hp = sub.add_parser("hand")
    hp.add_argument("file")
    hp.add_argument("out")
    args = ap.parse_args()
    if args.cmd == "brief":
        brief(args.domain)
    elif args.cmd == "check":
        check(args.file)
    elif args.cmd == "hand":
        hand(args.file, args.out)
    else:
        add(args.file, args.dry_run)


if __name__ == "__main__":
    main()
