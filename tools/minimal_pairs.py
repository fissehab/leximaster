"""Find minimal pairs for the Sounds listening game (Listen and choose).

A minimal pair is two words that differ in one sound only: ship / sheep.
Both words must be everyday words (zipf >= --min-zipf) with an American
recording by a person (data/words.json, has_audio), a plain one-word
spelling, and one clear pronunciation. Heteronyms (live, read, bow...) are
left out: the recording may say the other one. So are rude words.

With --failed (the Whisper check of the human recordings, run with the
word as a hint: {key: {"pm": 0..1}}), a word is left out when even then
the recognizer did not hear that word in its recording. With --heard
({key: {"match": 0..1}}, one or more files) only words heard exactly
without a hint are kept: stricter, and it drops many short words.

Writes static/js/say-pairs.js: PAIRS_FOUND = {contrast: [[a, b], ...]},
the word with the card's sound first, most common pairs first.

    .venv/bin/python tools/minimal_pairs.py --failed hprompt.json
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The card's sound first. (pool / pull is left out: two pairs only.) A contrast may also accept other sounds for its
# second half (`also`): American English says boss and dog with either.
CONTRASTS = {
    "θ-s": ("θ", "s"), "θ-t": ("θ", "t"), "ð-d": ("ð", "d"),
    "v-b": ("v", "b"), "v-w": ("v", "w"), "f-p": ("f", "p"), "p-b": ("p", "b"),
    "ɹ-l": ("ɹ", "l"), "ʃ-tʃ": ("ʃ", "tʃ"), "ʃ-s": ("ʃ", "s"), "z-s": ("z", "s"), "ŋ-n": ("ŋ", "n"),
    "ɪ-i": ("ɪ", "i"), "æ-ɛ": ("æ", "ɛ"), "ʌ-ɑ": ("ʌ", "ɑ"), "ɝ-ʌ": ("ɝ", "ʌ"),
    # The letters a and o: hot / hat, law / low, not / note.
    "ɑ-æ": ("ɑ", "æ"), "ɔ-oʊ": ("ɔ", "oʊ"), "ɑ-oʊ": ("ɑ", "oʊ"),
}
ALSO = {"ʌ-ɑ": {"ɔ"}}

# Spelled the same, said two ways: the recording may be the other word.
HETERONYMS = set("""
live lives read lead leads wind winds wound close closes tear tears bow bows row rows sow sows dove does
bass use uses used excuse refuse minute object content desert present record produce project permit
conduct contract convert subject suspect rebel separate moderate graduate estimate alternate
polish wound august invalid entrance resume lives putting axes bases buffet house houses mouth
abuse console compact compound conflict contest contrast decrease escort export import increase insult
perfect progress protest refund reject survey transfer upset address advocate associate attribute
deliberate duplicate elaborate intimate learned blessed aged wicked crooked ragged sewer tower
the a an of to""".split())   # the last few: the recording may be the weak form (thuh, uh)

RUDE = set("""
shit shits shat bitch bitches piss pissed fuck fucks dick dicks cock cocks cunt tit tits titty ass asses
arse butt butts crap fart farts damn hell nigger nigga fag fags faggot slut sluts whore whores bastard
rape raped rapist sex sexy porn penis vagina boob boobs nipple nipples poop pee peed puke
semen sperm anal anus horny hooker pimp prick screw screwed suck sucks sucked knob
""".split())

# Not words a learner should practice with: sounds, names, slang, bits.
ODD = set("""
er uh um ah oh eh hmm huh ha mm dan don ken tao bro pro herein dang kook min
wis haute hart bain vail pol prof plat ab lib sup bot burr lube alt mel lei coll cor ret queer nat rec
sal kemp fam femme hajj cum dom sta pic sim ich fend pes lees
""".split())

VOWELS = set("iɪɛæəʌɑɔʊuɚɝ") | {"eɪ", "aɪ", "oʊ", "aʊ", "ɔɪ"}

DIPH = ["eɪ", "aɪ", "oʊ", "aʊ", "ɔɪ", "tʃ", "dʒ"]


def tokens(ipa):
    """American IPA as a list of sounds, or None if it has optional parts."""
    s = ipa.strip().strip("/")
    if not s or re.search(r"[()\[\]>,~ \-]", s):
        return None
    s = re.sub(r"[ˈˌ.ʰ̟̥̪̬̃ʔ]", "", s)
    s = s.replace("ɡ", "g").replace("ɫ", "l").replace("ᵻ", "ɪ").replace("ɨ", "ɪ").replace("ʴ", "")
    s = s.replace("ɜɹ", "ɝ").replace("ɜ", "ɝ").replace("n̩", "ən").replace("l̩", "əl").replace("m̩", "əm").replace("̩", "")
    s = s.replace("r", "ɹ")
    out, i = [], 0
    while i < len(s):
        two = s[i:i + 2]
        if two in DIPH:
            out.append(two); i += 2
        else:
            out.append(s[i]); i += 1
    if any(t in "eaoc" for t in out):   # a stray e, a, o: not American IPA we know
        return None
    return out


def heard_ok(files):
    ok = set()
    for f in files:
        for k, v in json.loads(Path(f).read_text()).items():
            if v.get("match", 0) >= 1.0:
                ok.add(k)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-zipf", type=float, default=3.0)
    ap.add_argument("--heard", nargs="*", default=[])
    ap.add_argument("--failed")
    ap.add_argument("--out", default=str(ROOT / "static/js/say-pairs.js"))
    args = ap.parse_args()
    ok = heard_ok(args.heard) if args.heard else None
    failed = {k for k, v in json.loads(Path(args.failed).read_text()).items() if v.get("pm", 0) < 1} if args.failed else set()

    words = {}
    for w in json.loads((ROOT / "data/words.json").read_text())["words"]:
        word, key = w.get("word", ""), w.get("key", "")
        if not w.get("has_audio") or not re.fullmatch(r"[a-z]{2,}", word) or word in HETERONYMS or word in RUDE:
            continue
        if float(w.get("zipf") or 0) < args.min_zipf or (ok is not None and key not in ok) or key in failed or word in ODD:
            continue
        t = tokens(w.get("phonetic") or "")
        if t:
            words[word] = (t, float(w["zipf"]))

    # Index by sound shape with one slot blanked: words in the same bucket
    # differ only at that slot.
    # r against l only before a vowel (right / light): after a vowel, as in
    # here / hill, the vowel changes too. A vowel against a vowel not before
    # r: dear and deer sound the same for most Americans.
    def fair(name, t, i):
        after = t[i + 1] if i + 1 < len(t) else None
        if name == "ɹ-l": return after in VOWELS
        if CONTRASTS[name][0] in VOWELS: return after != "ɹ"
        return True

    buckets = {}
    for word, (t, _) in words.items():
        for i in range(len(t)):
            buckets.setdefault((tuple(t[:i]), tuple(t[i + 1:])), []).append((t[i], word, i))
    found = {c: {} for c in CONTRASTS}
    for group in buckets.values():
        if len(group) < 2:
            continue
        for name, (a, b) in CONTRASTS.items():
            seconds = {b} | ALSO.get(name, set())
            for sa, wa, i in group:
                if sa != a or not fair(name, words[wa][0], i):
                    continue
                for sb, wb, _ in group:
                    if sb in seconds and wa != wb:
                        found[name][(wa, wb)] = min(words[wa][1], words[wb][1])
    out = {}
    for name, pairs in found.items():
        # A word in at most three pairs of a contrast, so one word doesn't fill a round.
        uses, keep = {}, []
        for (a, b), z in sorted(pairs.items(), key=lambda p: (-p[1], p[0])):
            if uses.get(a, 0) >= 3 or uses.get(b, 0) >= 3:
                continue
            uses[a] = uses.get(a, 0) + 1; uses[b] = uses.get(b, 0) + 1
            keep.append([a, b])
        out[name] = keep
    lines = ["// Generated by tools/minimal_pairs.py: do not edit. Minimal pairs for the",
             "// Sounds listening game, the word with the card's sound first, most common",
             "// first. Every word has an American recording by a person.",
             "export const PAIRS_FOUND = {"]
    for name, pairs in out.items():
        lines.append(f'  "{name}": {json.dumps(pairs, ensure_ascii=False, separators=(",", ":"))},')
    lines.append("};")
    Path(args.out).write_text("\n".join(lines) + "\n")
    for name, pairs in out.items():
        print(f"{name:6} {len(pairs):4}  " + ", ".join("/".join(p) for p in pairs[:8]))
    print("total", sum(len(p) for p in out.values()))


if __name__ == "__main__":
    main()
