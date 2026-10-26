"""Check hand-written conversation examples against the everyday seed lists.

    .venv/bin/python tools/check_examples.py [domain ...]
    .venv/bin/python tools/check_examples.py --files SEED.txt EXAMPLES.txt

For each everyday domain, every entry in seeds/domain_<domain>.txt must have
at least two examples in seeds/examples/<domain>.txt, and each example
should contain the entry (inflected verbs and separated phrasal verbs
count). Exit status 1 if any entry is missing or short.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_dataset import EVERYDAY_DOMAINS, SEEDS, load_seed_file, norm_key  # noqa: E402

IRREGULAR = {
    "be": "am is are was were been being", "bite": "bit bitten", "dive": "dove dived",
    "tie": "tied tying", "dry": "dried dries", "unwind": "unwound",
    "lie": "lay lain lying", "begin": "began begun", "blow": "blew blown",
    "break": "broke broken", "bring": "brought", "build": "built", "burn": "burnt burned",
    "buy": "bought", "catch": "caught", "choose": "chose chosen", "come": "came",
    "cut": "cut", "deal": "dealt", "do": "did done does", "draw": "drew drawn",
    "drink": "drank drunk", "drive": "drove driven", "eat": "ate eaten", "fall": "fell fallen",
    "feel": "felt", "fight": "fought", "find": "found", "fly": "flew flown flies",
    "forget": "forgot forgotten", "freeze": "froze frozen", "get": "got gotten",
    "give": "gave given", "go": "went gone goes", "grow": "grew grown", "hang": "hung",
    "have": "had has", "hear": "heard", "hide": "hid hidden", "hit": "hit", "hold": "held",
    "keep": "kept", "know": "knew known", "lay": "laid", "lead": "led", "leave": "left",
    "lend": "lent", "let": "let", "light": "lit", "lose": "lost",
    "make": "made", "mean": "meant", "meet": "met", "pay": "paid", "put": "put",
    "read": "read", "ride": "rode ridden", "ring": "rang rung", "rise": "rose risen",
    "run": "ran", "say": "said", "see": "saw seen", "sell": "sold", "send": "sent",
    "set": "set", "shake": "shook shaken", "shoot": "shot", "show": "showed shown",
    "shut": "shut", "sing": "sang sung", "sit": "sat", "sleep": "slept", "speak": "spoke spoken",
    "spend": "spent", "split": "split", "stand": "stood", "steal": "stole stolen",
    "stick": "stuck", "swim": "swam swum", "swing": "swung", "take": "took taken",
    "teach": "taught", "tear": "tore torn", "tell": "told", "think": "thought",
    "throw": "threw thrown", "wake": "woke woken", "wear": "wore worn", "win": "won",
    "wind": "wound", "write": "wrote written",
}


def parse_examples(path: Path) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    key = None
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"\s*-\s*(?:\[[^\]]+\]\s*)?(.+)$", line)
        if m and key:
            out[key].append(m.group(1).strip())
        elif not m:
            key = norm_key(line.strip())
            out.setdefault(key, [])
    return out


PRONOUNS = ("you your yours yourself my mine myself his him himself her hers herself their them "
            "themselves our us ourselves its it i me we they he she").split()
PRONOUN_RE = "(?:" + "|".join(sorted(map(re.escape, PRONOUNS), key=len, reverse=True)) + r"|\w+'s)"


def word_forms(w: str) -> str:
    """Regex alternation for a word and its inflections. A pronoun in an
    idiom matches any pronoun ("bite your tongue" -> "bit my tongue")."""
    w = w.lower()
    if w in PRONOUNS:
        return PRONOUN_RE
    forms = {re.escape(w)}
    forms |= {re.escape(x) for x in IRREGULAR.get(w, "").split()}
    stem = w[:-1] if len(w) > 3 and w.endswith("e") else w
    stem = w[:-1] + "i" if len(w) > 3 and w.endswith("y") and w[-2] not in "aeiou" else stem
    forms.add(re.escape(stem) + r"[a-z]{0,4}")
    if len(w) <= 4 and w[-1] not in "aeiouwy":  # stop -> stopped, run -> running
        forms.add(re.escape(w + w[-1]) + r"(?:ed|ing|er)")
    return "(?:" + "|".join(sorted(forms, key=len, reverse=True)) + ")"


def uses_entry(entry: str, sentence: str) -> bool:
    words = [w for w in re.split(r"[\s-]+", re.sub(r"[?!.,…]+", "", entry.lower())) if w]
    # "someone"/"something" stand for any object: "pick someone up" matches
    # "pick the kids up" (the gap between words allows it).
    words = [w for w in words if w not in ("someone", "someone's", "something")]
    if not words:
        return True
    if len(words) <= 3:  # phrasal verbs may be separated: "picked you up"
        gap = r"(?:[\s-]+[\w'’]+){0,3}?[\s-]+"
        pat = word_forms(words[0]) + "".join(gap + word_forms(w) for w in words[1:])
    else:  # longer expressions: the words in order, loosely
        pat = r"[\s\S]*?".join(word_forms(w) for w in words)
    text = re.sub(r"[,;:]", " ", sentence.lower().replace("’", "'"))  # "great, thanks" = "great thanks"
    return re.search(r"(?<![\w])" + pat + r"(?![\w])", text) is not None


def check(domain: str, seed: Path | None = None, examples_path: Path | None = None) -> tuple[int, list[str]]:
    entries = load_seed_file(seed or SEEDS / f"domain_{domain}.txt")
    examples = parse_examples(examples_path or SEEDS / "examples" / f"{domain}.txt")
    problems, errors, seen = [], 0, set()
    for word, _ in entries:
        k = norm_key(word)
        if k in seen:
            continue
        seen.add(k)
        ex = examples.get(k, [])
        if len(ex) < 2:
            errors += 1
            problems.append(f"MISSING  {word!r}: {len(ex)} example(s)")
            continue
        unused = [s for s in ex if not uses_entry(word, s)]
        if unused:
            problems.append(f"CHECK    {word!r}: entry not found in: {unused[0]!r}"
                            + (f" (+{len(unused) - 1} more)" if len(unused) > 1 else ""))
        long_ = [s for s in ex if len(s.split()) > 30]
        if long_:
            problems.append(f"LONG     {word!r}: {long_[0][:60]!r}…")
    extra = sorted(set(examples) - seen)
    for k in extra:
        problems.append(f"EXTRA    {k!r} is not in domain_{domain}.txt")
    total = sum(len(v) for v in examples.values())
    print(f"{domain:15} entries {len(seen):4} · examples {total:5} · missing {errors}")
    return errors, problems


def main() -> int:
    if len(sys.argv) == 4 and sys.argv[1] == "--files":  # --files SEED EXAMPLES: check one part
        errors, problems = check(Path(sys.argv[2]).stem, Path(sys.argv[2]), Path(sys.argv[3]))
        for p in problems:
            print("   ", p)
        return 1 if errors else 0
    domains = sys.argv[1:] or EVERYDAY_DOMAINS + ["artificial_intelligence"]
    bad = 0
    for d in domains:
        errors, problems = check(d)
        bad += errors
        for p in problems:
            print("   ", p)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
