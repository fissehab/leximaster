"""Common phrases (November 2026): the IPA a phrase shows, the dictionary
senses left out, and spelling notes that name the British form."""
import json
import re
from pathlib import Path

import pytest

import build_dataset as B

ROOT = Path(__file__).resolve().parent.parent


def test_phrase_stress_comes_from_the_study_notes():
    w = {"key": "line-item", "word": "line item", "phonetic": "/ˌlaɪn ˈaɪtəm/", "phonetic_source": "cmu",
         "nuance": {"pronunciation": {"ipa": "/ˈlaɪn ˌaɪtəm/", "respelling": "LYNE eye-tum"}}}
    assert B.polish_ipa(w) == "study" and w["phonetic"] == "/ˈlaɪn ˌaɪtəm/"
    # A single word keeps its dictionary IPA.
    w = {"key": "item", "word": "item", "phonetic": "/ˈaɪtəm/", "phonetic_source": "cmu",
         "nuance": {"pronunciation": {"ipa": "/ˈaɪtɛm/", "respelling": "EYE-tem"}}}
    assert B.polish_ipa(w) == "" and w["phonetic"] == "/ˈaɪtəm/"


def test_study_ipa_that_is_worse_is_not_used():
    assert B.phrase_ipa_ok("line item", "/ˈlaɪn ˌaɪtəm/")
    assert not B.phrase_ipa_ok("book of job", "/dʒoʊb/")                # words missing
    assert not B.phrase_ipa_ok("baseball field", "/ˈbeɪsˌbɔl ˈfild/")  # a main stress on every word
    assert not B.phrase_ipa_ok("water cooler", "/ˈwɔɾɚ ˌkulɚ/")        # narrow flap
    w = {"key": "book-of-job", "word": "Book of Job", "phonetic": "/ˌbʊk əv ˈdʒoʊb/", "phonetic_source": "wiktionary",
         "nuance": {"pronunciation": {"ipa": "/dʒoʊb/", "respelling": "JOHB"}}}
    B.polish_ipa(w)
    assert w["phonetic"] == "/ˌbʊk əv ˈdʒoʊb/"


def test_hidden_senses_and_the_fallback(tmp_path, monkeypatch):
    (tmp_path / "hide").mkdir()
    (tmp_path / "hide" / "x.txt").write_text("# test\nhot-dog | the penis\nstrap-on | to put on a harness\n")
    monkeypatch.setattr(B, "SEEDS", tmp_path)
    sense = lambda d: {"definition": d, "example": "", "synonyms": [], "antonyms": []}
    entry = lambda key, defs, core: {"key": key, "word": key.replace("-", " "), "synonyms": [], "antonyms": [],
                                     "meanings": [{"pos": "noun", "senses": [sense(d) for d in defs]}],
                                     "nuance": {"core": {"pos": "noun", "definition": core}}}
    words = [entry("hot-dog", ["A sausage in a bun.", "The penis."], "A cooked sausage in a long bun."),
             entry("strap-on", ["To put on a harness."], "To fasten something on with a strap.")]
    B.hide_senses(words)
    assert [s["definition"] for s in words[0]["meanings"][0]["senses"]] == ["A sausage in a bun."]
    assert words[1]["meanings"] == []   # only the study notes' definition is shown


def test_spelling_mistakes_keep_the_british_form():
    n = B.us_spelling_deep({"common_mistakes": ["Spelling it 'humour' in American English.", "Saying colour."],
                            "usage_note": "Their colour."})
    assert n["common_mistakes"] == ["Spelling it 'humour' in American English.", "Saying color."]
    assert n["usage_note"] == "Their color."


def test_hide_and_drop_lists_are_well_formed():
    for path in (ROOT / "seeds" / "hide").glob("*.txt"):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#"):
                key, sid = (x.strip() for x in line.split("|", 1))
                assert re.fullmatch(r"[\w'/-]+", key) and key == key.lower() and re.fullmatch(r"[a-z ]+", sid), (path.name, line)


@pytest.mark.skipif(not B.WORDS_JSON.exists(), reason="no dataset")
def test_phrases_are_in_the_lexicon_with_american_ipa():
    words = {w["key"]: w for w in json.loads(B.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    for key, ipa in [("line-item", "/ˈlaɪn ˌaɪtəm/"), ("credit-card", "/ˈkɹɛdɪt ˌkɑɹd/"),
                     ("figure-out", "/ˌfɪɡjɚ ˈaʊt/"), ("in-the-same-boat", "/ɪn ðə ˌseɪm ˈboʊt/")]:
        assert words[key]["phonetic"] == ipa, (key, words[key]["phonetic"])
    assert "common_phrases" in words["line-item"]["domains"]
    assert words["life-style"]["word"] == "lifestyle"
    assert "fresh-off-the-boat" not in words and "give-into" not in words
