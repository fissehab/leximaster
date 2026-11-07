"""Shown pronunciations: the IPA clean-up and the hand corrections."""
import json
import re
from pathlib import Path

import pytest

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


# ------------------------------------------- IPA for words CMU doesn't have

needs_cmu = pytest.mark.skipif(not B.CMUDICT.exists(), reason="CMU dictionary not downloaded (CI)")


@pytest.fixture
def no_espeak(monkeypatch):
    """The rules alone, as in a build without Kokoro installed."""
    monkeypatch.setattr(B, "_espeak_tok", False)


@needs_cmu
def test_endings_keep_the_stem_not_a_second_word(no_espeak):
    # The old fallback read these as two words: cap + ABLY, lee + PURR, red + ACTION.
    cases = {"capably": "/ˈkeɪpəbli/", "laughably": "/ˈlæfəbli/", "unmanageably": "/ənˈmænɪdʒəbli/",
             "defeatable": "/dɪˈfitəbəl/", "leaper": "/ˈlipɚ/", "maintainer": "/meɪnˈteɪnɚ/",
             "hoarder": "/ˈhɔɹdɚ/", "parer": "/ˈpɛɹɚ/", "witchery": "/ˈwɪtʃəɹi/", "steerage": "/ˈstɪɹɪdʒ/",
             "validator": "/ˈvælədeɪtɚ/", "punster": "/ˈpʌnstɚ/", "rhymester": "/ˈɹaɪmstɚ/"}
    for word, ipa in cases.items():
        assert B.cmu_ipa(word, {}, word) == ipa, word
    assert B.cmu_ipa("balladeer", {}, "balladeer") == ""     # not ballade + er
    assert B.cmu_ipa("mediatory", {}, "mediatory") == ""     # not mediator + y


@needs_cmu
def test_prefixed_words_keep_the_stems_stress(no_espeak):
    assert B.cmu_ipa("nontrivial", {}, "nontrivial") == "/ˌnɑnˈtɹɪviəl/"
    assert B.cmu_ipa("pretrained", {}, "pretrained") == "/ˌpɹiˈtɹeɪnd/"
    assert B.cmu_ipa("reprover", {}, "reprover") == "/ˌɹiˈpɹuvɚ/"       # reprove + er, not rep + rover


@needs_cmu
def test_a_phrase_word_is_said_as_its_own_entry_says(no_espeak):
    known = {"redaction": "/ɹɪˈdækʃən/"}
    assert B.cmu_ipa("redaction-criticism", known, "redaction criticism") == "/ɹɪˌdækʃən ˈkɹɪtɪˌsɪzəm/"
    assert B.cmu_ipa("redaction-criticism", known, "redaction criticism", legacy=True) \
        == "/ˌɹɛdˌækʃən ˈkɹɪtɪˌsɪzəm/"                               # the old red + action


@needs_cmu
def test_real_compounds_still_split_and_names_never(no_espeak):
    for word, ipa in {"showerhead": "ˈʃaʊɚˌhɛd", "sweatband": "ˈswɛtˌbænd", "traceback": "ˈtɹeɪsˌbæk"}.items():
        assert B.compound_ipa(word) == ipa
    assert B.compound_ipa("capably") == "" and B.compound_ipa("bootable") == ""   # word + ending
    assert B.compound_ipa("jotham", "Jotham") == ""                                # a name


@needs_cmu
def test_espeak_rejects_splits_it_does_not_hear():
    pytest.importorskip("kokoro_onnx")
    assert B.compound_ipa("redaction") == ""                    # espeak stresses -DAC-
    assert B.compound_ipa("mammon") == ""                       # no split sounds like it
    assert B.compound_ipa("heartrending") == "ˈhɑɹtˌɹɛndɪŋ"     # heart + rending, not hear + trending
    assert B.compound_ipa("eigenspace") == "ˈaɪɡənˌspeɪs"
    assert B.espeak_ipa("capably") == "/ˈkeɪpəbli/"
    assert B.cmu_ipa("descant", {}, "descant") != "/ˈdiˌskænt/"   # not de + scant


def test_a_copied_reading_is_recognized():
    assert B.same_ipa("/ˈkæpˌeɪ.bli/", "/ˈkæpˌeɪbli/")
    assert B.same_ipa("/ˌred.ækʃən/", "/ˌɹɛd.ækʃən/") is False   # e/ɛ differ: not a copy
    assert not B.same_ipa("/ˈkeɪpəbli/", "/ˈkæpˌeɪbli/")


@pytest.mark.skipif(not B.WORDS_JSON.exists(), reason="dataset not built (CI)")
def test_no_rule_made_ipa_reads_an_ending_as_a_word():
    words = json.loads(B.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    bad = [w["word"] for w in words if w.get("phonetic_source") in ("cmu", "espeak")
           and (re.search(r"ˌeɪb(ə)?l[i]?/$", w["phonetic"]) and w["word"].endswith(("able", "ably"))
                or re.search(r"ˌ[^ˈˌ\s/]*ɝ/$", w["phonetic"]) and w["word"].endswith(("er", "or"))
                or "ˌɹɛdˌækʃən" in w["phonetic"])
           and w["key"] not in B.KEEP_OLD_IPA and not B.cmu_lookup(w["key"])]   # CMU's own: silencer
    assert not bad, bad[:20]
