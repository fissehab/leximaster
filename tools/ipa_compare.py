"""Do two IPA transcriptions differ in sounds, not just notation?

Used by tools/audit.py --check: an entry with a synthesized recording is read
aloud from its shown IPA, so a shown IPA that disagrees with the study note's
IPA (cosmos given the plural's /ˈkɑzmɔɪ/, abrogate the adjective-like
/-ɡət/) is an error the learner hears. Unstressed vowels count as one sound
(/ɪ/, /ə/, /ʌ/), as do the r-colored vowels and /ɑ ɔ/, so acceptable
variants of a weak vowel don't count; a different consonant or full vowel does.
"""
from __future__ import annotations

import re

_SUBS = [("͡", ""), ("ː", ""), ("ˑ", ""), ("̯", ""), ("r", "ɹ"), ("ɚ", "əɹ"), ("ɝ", "əɹ"), ("ɜɹ", "əɹ"),
         ("ɾ", "t"), ("n̩", "ən"), ("l̩", "əl"), ("m̩", "əm"), ("ɫ", "l"), ("ɡ", "g"), ("ʌ", "ə"), ("ɪ", "ə"),
         ("ᵻ", "ə"), ("ɐ", "ə"), ("ʊ", "u"), ("oʊ", "O"), ("eɪ", "E"), ("aɪ", "A"), ("aʊ", "W"), ("ɔɪ", "Y"),
         ("ɑ", "a"), ("ɒ", "a"), ("ɔ", "a"), ("ɛ", "e"), ("o", "O"), ("tʃ", "C"), ("dʒ", "J")]
_VOWELS = set("əiuOEAWYaæe")


def sounds(ipa: str) -> str:
    s = re.sub(r"\([^)]*\)", "", ipa.strip("/[] ").lower())     # optional sounds
    for a, b in _SUBS:
        s = s.replace(a, b)
    return re.sub(r"[ˈˌ.\s‿\-']", "", s)


def differ(a: str, b: str) -> bool:
    """True when the consonants or the full (non-schwa) vowels differ."""
    x, y = sounds(a), sounds(b)
    if x == y:
        return False
    cons = lambda s: "".join(c for c in s if c not in _VOWELS)
    full = lambda s: "".join(c for c in s if c in _VOWELS and c != "ə")
    return cons(x) != cons(y) or full(x) != full(y)
