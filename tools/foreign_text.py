"""Words in other alphabets, removed from the learner-facing text.

LexiMaster shows English only: a word history or Bible note keeps the Latin
spelling of a foreign word ("Hebrew 'adonai' means 'my lord'", "from an
Ancient Greek word meaning “indivisible”") but not the word in its own
script. Kept: Greek letters used as math symbols (π, σ, Δx, the eigenvalue
λ), pronunciation symbols (/θ/), accented Latin letters (café, agapē) and
letterlike math symbols (ℝ). build_dataset.strip_foreign_words applies it;
tools/audit.py checks nothing is left.
"""
from __future__ import annotations

import re
import unicodedata

# Blocks of other alphabets (Greek is decided per word, below). Letterlike
# and mathematical symbols (ℝ, ℵ, 𝒞) are not here.
_RANGES = ((0x0400, 0x058F), (0x0590, 0x08FF), (0x0900, 0x109F), (0x10A0, 0x10FF), (0x1100, 0x11FF),
           (0x1200, 0x19FF), (0x1A00, 0x1CFF), (0x2C00, 0x2C5F), (0x2D00, 0x2DFF), (0x2E80, 0x9FFF),
           (0xA000, 0xA6FF), (0xA800, 0xABFF), (0xAC00, 0xD7FF), (0xF900, 0xFAFF), (0xFB1D, 0xFDFF),
           (0xFE70, 0xFEFF), (0xFF66, 0xFFDC), (0x10000, 0x1D3FF), (0x1D800, 0x1EFFF), (0x20000, 0x3FFFF))
GAP = ""   # where a removed word was, until the text is tidied


def foreign_char(c: str) -> bool:
    o = ord(c)
    return o >= 0x400 and any(a <= o <= b for a, b in _RANGES) and unicodedata.category(c)[0] in "LM"


def greek(c: str) -> bool:
    return (0x370 <= ord(c) <= 0x3FF or 0x1F00 <= ord(c) <= 0x1FFF) and unicodedata.category(c)[0] == "L"


def mark(c: str) -> bool:
    return unicodedata.category(c) == "Mn"


def strip_foreign(text: str, all_greek: bool = False) -> tuple[str, bool]:
    """Remove words written in other alphabets; returns the text and whether
    a removed word was part of the sentence itself ("The letter ن in the
    Arabic script"), not an aside. Greek letters used as math symbols (π, σ,
    Δx) stay, except where all_greek (etymologies, Bible notes); so do Greek
    letters inside a Latin word (the IPA θ in brɛθ)."""
    if not any(ord(c) >= 0x370 for c in text):
        return text, False
    pieces, changed = [], False
    for tok in re.split(r"(\s+)", text):
        latin = re.search(r"[A-Za-zÀ-ɏ]", tok)
        if latin and any(foreign_char(c) for c in tok):
            # a transliteration with a letter of another alphabet (dъska): the whole word
            pre, post = re.match(r"^([^\w]*)", tok).group(1), re.search(r"([^\w]*)$", tok).group(1)
            pieces.append(pre + GAP + post); changed = True
            continue
        out, i = [], 0
        while i < len(tok):
            c = tok[i]
            if foreign_char(c) or (greek(c) and not latin):
                j = i + 1
                while j < len(tok) and (foreign_char(tok[j]) or greek(tok[j]) or mark(tok[j]) or tok[j] in "‌‍־׳״'’-"):
                    j += 1
                run = tok[i:j]
                is_greek = not any(foreign_char(x) for x in run)
                accented = any(mark(x) or "WITH" in unicodedata.name(x, "") for x in run)
                if not is_greek or all_greek or accented or sum(map(greek, run)) >= 3:
                    out.append(GAP); changed = True
                else:
                    out.append(run)
                i = j
                continue
            out.append(c); i += 1
        pieces.append("".join(out))
    return tidy("".join(pieces)) if changed else (text, False)


G = GAP
GLOSS = r"“[^”]*”(?:,\s*“[^”]*”)*"


def _a(m: re.Match) -> str:
    lang = m.group(2)
    return f"{m.group(1)} {'an' if lang[0] in 'AEIOU' else 'a'} {lang} word meaning {m.group(3)}"


OPENERS = {"From", "Via", "Compare", "Borrowed", "Inherited", "See", "Cf", "Also", "Likely", "Probably"}


def tidy(s: str) -> tuple[str, bool]:
    """Close up the text around removed words (only there)."""
    capital = s[:1].isupper() or s[:1] == G
    junk = r"[\s/／,;:·|'’\-–+]"
    for _ in range(8):
        before = s
        s = re.sub(rf"{G}(?:{junk}*{G})+", G, s)                        # neighbors: one gap
        s = re.sub(rf"{G}\s+(?:or|and)\s+{G}", G, s)
        s = re.sub(rf"\*+{junk}*{G}{junk}*\*+", G, s)                     # *word*, **reconstructed*
        s = re.sub(rf"⟨{G}⟩|\[{G}\]", G, s)
        if s == before:
            break
    for _ in range(6):
        before = s
        s = re.sub(rf"\s*\(\s*{G}\s*\)", "", s)                             # (word): an aside, gone
        s = re.sub(rf"(‘|“|«|'){G}(’|”|»|')", G, s)                        # 'word'
        s = re.sub(rf"\(\s*[A-Z][\w ]*:\s*{G}\s*\)", G, s)                 # (Chinese: word)
        s = re.sub(rf"\(\s*{G}\s*[,;]\s*", "(", s)                         # (word, “gloss”)
        s = re.sub(rf"\(\s*[A-Z][\w ]*:\s*{G}\s*[,;]\s*", "(", s)             # (Russian: name; 1856–1922)
        # a word and its spelling in Latin letters: keep the spelling
        s = re.sub(rf"{G}\s*\(([^()“”,{G}]{{1,40}}),\s*({GLOSS})\)", r"\1 (\2)", s)
        s = re.sub(rf"{G}\s*\(((?:[^\W\d_]|[\s,'’ʾʿ-])+?)\)", lambda m: m.group(1) if len(m.group(1).split()) <= 4 and not re.search(r"\b(?:plural|singular|genitive|nominative|from|see|compare)\b", m.group(1)) else m.group(0), s)
        # from Ancient Greek word (“gloss”): from an Ancient Greek word meaning “gloss”
        s = re.sub(rf"\b([Ff]rom|of)\s+(?:the\s+)?((?:[A-Z][\w-]*\s)*?[A-Z][\w-]*)\s+{G}\s*\(({GLOSS})\)", _a, s)
        s = re.sub(rf"\b(from|and|of|with|to)\s+{G}\s*\(({GLOSS})\)", r"\1 a word meaning \2", s)
        s = re.sub(rf"\+\s*{G}\s*\(({GLOSS})\)", r"+ a word meaning \1", s)
        s = re.sub(rf"\s*\+\s*{G}(?=\s*(?:[,.;)]|$))", G, s)              # "… + word," at the end
        s = re.sub(rf"\b((?:[A-Z][a-z][\w-]*\s)*[A-Z][a-z][\w-]*)\s+{G}\s*\(({GLOSS})\)", lambda m: m.group(0) if m.group(1) in OPENERS else f"{m.group(1)} ({m.group(2)})", s)
        s = re.sub(rf"(?<!\w){G}\s*\(({GLOSS})\)", r"a word meaning \1", s)
        s = re.sub(rf"\b([Ff]rom)\s+{G},\s+from\b", r"\1", s)               # From word, from …
        s = re.sub(rf"\s+(?:from|or|and)\s+{G}(?=\s+(?:from|or|and)\b|\s*[,.;)]|\s*$)", "", s)
        s = re.sub(rf"\((?:\s|[,;:/·+=]|\bor\b|\band\b|\be\.g\.|\bfrom\b|\bcompare\b|\bcf\.|\bsee\b|\balso\b)*{G}(?:\s|[,;:/·+=]|\bor\b|\band\b|\bfrom\b|{G})*\)", "", s)
        if s == before:
            break
    # "from Ancient Greek word,": the language is enough
    s = re.sub(rf"\b((?:[A-Z][\w-]*\s)*[A-Z][\w-]*)\s*{G}(?!\s*\()", lambda m: m.group(0) if m.group(1) in OPENERS else m.group(1), s)
    # ", from word." or ", oblique stem of word": a clause with nothing left
    s = re.sub(rf"(^|[,;(])\s*[^,;.()“”]{{0,40}}?{G}(?=\s*(?:[,.;)]|$))", lambda m: "(" if m.group(1) == "(" else "", s)
    # a gap left in the running text: the sentence needed that word
    bare = bool(re.search(rf"(?:^|[\s(])(?:the|a|an|letter|character|word|spelling|root|is|are)?\s*{G}(?=\s+[a-z]|\s*$|\s+(?:is|are|in|and|or)\b)", s)) \
        and not re.search(rf"\b(?:from|of|in|and)\s+(?:[A-Z][\w-]*\s)*[A-Z][\w-]*\s*{G}", s)
    bare = bool(re.search(rf"(?<![A-Z][a-z]{{2}} ){G}", s)) and bare
    s = s.replace(G, "")
    s = re.sub(r"\bthe (verb|noun|adjective) a word meaning", r"a \1 meaning", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    s = re.sub(r"\s+([,.;:)\]])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\(\)|\[\]", "", s)
    s = re.sub(r",\s*([,.;)\]])", r"\1", s)
    s = re.sub(r"\s{2,}", " ", s)
    s = s.strip(" ,;:")
    if capital and s[:1].islower():
        s = s[0].upper() + s[1:]
    return ("" if not re.search(r"\w", s) else s), bare
