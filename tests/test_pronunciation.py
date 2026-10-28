"""Shown pronunciations: the IPA clean-up and the hand corrections."""
import re
from pathlib import Path

import build_dataset as B

ROOT = Path(__file__).resolve().parent.parent


def test_normalize_ipa_drops_notes_and_unifies_vowels():
    assert B.normalize_ipa("/tə/ (unstressed); /tu/ (stressed)/") == "/tə/"
    assert B.normalize_ipa("/tə/ (unstɹessed), /tu/") == "/tə/"
    assert B.normalize_ipa("/ˈkiŋ/") == "/ˈkɪŋ/"
    assert B.normalize_ipa("/əˈnoɪ/") == "/əˈnɔɪ/"
    assert B.normalize_ipa("/ˈɹ(ə)ʊnd/") == "/ˈɹ(ə)ʊnd/"     # optional sounds stay


def test_pronunciation_fixes_are_well_formed():
    lines = [x for x in (ROOT / "seeds" / "fixes" / "pronunciation.txt").read_text(encoding="utf-8").splitlines()
             if x.strip() and not x.startswith("#")]
    assert len(lines) > 100
    keys = set()
    for line in lines:
        key, field, value = line.split(" | ")
        assert field == "phonetic"
        assert re.fullmatch(r"/[^/a-z]*[^/]*/", value) and not re.search(r"[A-Z]", value), line
        assert key not in keys, key
        keys.add(key)
    assert {"thank", "five", "bus", "milk", "to"} <= keys
