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


def test_british_transcriptions_that_drop_an_r_are_caught():
    assert B.drops_r("artful", "/ˈɑtf(ʊ)l/")
    assert B.drops_r("computer vision", "/kəmˈpjutə ˈvɪʒən/")
    assert not B.drops_r("artful", "/ˈɑɹtfəl/")
    assert not B.drops_r("overlap", "/ˌoʊvɚˈlæp/")
    assert not B.drops_r("rhythm", "/ˈɹɪðəm/")            # no r after a vowel
    assert not B.drops_r("bulimia nervosa", "/-ˈlɪm.i.ə-/")  # IPA for part of the phrase: not judged


def test_recordings_by_british_speakers_are_never_american():
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/LL-Q1860_%28eng%29-Vealhurl-circadian.wav"
    assert B.lingua_libre_speaker(url) == "Vealhurl" and "Vealhurl" in B.NOT_US_SPEAKERS
    assert B.lingua_libre_speaker("https://x/LL-Q1860_(eng)-Vealhurl-low-key.wav") == "Vealhurl"
    assert B.lingua_libre_speaker("https://x/LL-Q1860_(eng)-Flame,_not_lame-abductive.wav") == "Flame, not lame"
    assert B.lingua_libre_speaker("https://x/en-us-abandon.ogg") == ""
    assert not B.NOT_US_SPEAKERS & set(B.COMMONS_US_SPEAKERS)
