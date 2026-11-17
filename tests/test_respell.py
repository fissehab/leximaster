"""The respelling of a related word's IPA (tools/respell.py) and the
pronunciations added to the glossary (tools/gloss_pron.py)."""
from __future__ import annotations

import json

import build_dataset as b
from tools import gloss_pron
from tools.respell import respell


def test_respelling_in_the_study_notes_style():
    assert respell("/ˈstɛpˌlædɚ/") == "STEP-lad-er"
    assert respell("/ɪˈpɪtəmi/") == "ih-PIT-uh-mee"
    assert respell("/ˈfaɪsɪs/") == "FY-sis"
    assert respell("/hʌl/") == "HUL"                       # one syllable, no mark: stressed
    # A phrase: stressed words in capitals, the little unmarked ones low.
    assert respell("/ʌp ənd ˈkʌmɪŋ/") == "up und KUM-ing"
    assert respell("/ˌpaɪn ˈtɹi/") == "PINE TREE"
    assert respell("/əˌlaʊ ɪn/") == "uh-LOW in"            # only secondary marks: they are the stresses


def test_the_respelling_stresses_the_ipa_syllable():
    for ipa in ("/ˈstɛpˌlædɚ/", "/dɪˈploʊmə/", "/ˈhu.lɪ.ɡən/", "/daɪəˈtɛtɪks/", "/ˈɛniəˌɡɹæm/"):
        assert b.respelling_matches_ipa(respell(ipa), ipa) is not False, ipa


def test_attach_adds_ipa_respelling_and_recording(tmp_path, monkeypatch):
    (tmp_path / "pron.json").write_text(json.dumps({"stepladder": {"ipa": "/ˈstɛpˌlædɚ/", "re": "STEP-lad-er",
                                                                   "src": "cmu"}}))
    (tmp_path / "tts.json").write_text(json.dumps({"stepladder": {"file": "tts/gloss/stepladder.0a1b2c3d.m4a",
                                                                  "ipa": "/ˈstɛpˌlædɚ/"}}))
    monkeypatch.setattr(gloss_pron, "PRON", tmp_path / "pron.json")
    monkeypatch.setattr(gloss_pron, "TTS", tmp_path / "tts.json")
    monkeypatch.setattr(gloss_pron, "ROOT", tmp_path)
    (tmp_path / "data" / "tts" / "gloss").mkdir(parents=True)
    g = {"stepladder": {"w": "stepladder", "senses": [], "syn": []}, "kings": {"see": "king"}}
    gloss_pron.attach(g)
    assert g["kings"] == {"see": "king"}
    assert (g["stepladder"]["re"], "a" in g["stepladder"]) == ("STEP-lad-er", False)   # no file yet
    (tmp_path / "data" / "tts" / "gloss" / "stepladder.0a1b2c3d.m4a").write_bytes(b"x")
    assert gloss_pron.attach(g)["stepladder"]["a"] == "tts/gloss/stepladder.0a1b2c3d.m4a"
    # A recording of an older IPA isn't kept.
    (tmp_path / "pron.json").write_text(json.dumps({"stepladder": {"ipa": "/ˈstɛplædɚ/", "re": "STEP-lad-er"}}))
    assert "a" not in gloss_pron.attach(g)["stepladder"]


def test_ipa_is_wiktionary_american_first():
    wikt = {"ipa": [{"accent": "uk", "text": "/ˈæb.ɪs/"}, {"accent": "us", "text": "/ˈæb.əs/"}]}
    assert gloss_pron.pick_ipa("abbess", "abbess", wikt) == ("/ˈæb.əs/", "wiktionary")
    ipa, src = gloss_pron.pick_ipa("stepladder", "stepladder", {})
    assert src in ("cmu", "espeak") and ipa.startswith("/")
