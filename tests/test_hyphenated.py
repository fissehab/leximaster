"""Hyphenated terms (November 2026): their IPA, the senses they leave out,
and that "jaw-dropping" and its kind are in the lexicon."""
import json

import pytest

import build_dataset as B


def test_hyphenated_words_take_the_study_notes_stress():
    # CMU pieced together "nail" + "biting" with the stress on the last part.
    w = {"key": "nail-biting", "word": "nail-biting", "phonetic": "/ˌneɪl ˈbaɪtɪŋ/", "phonetic_source": "cmu",
         "nuance": {"pronunciation": {"ipa": "/ˈneɪl ˌbaɪtɪŋ/", "respelling": "NAYL bye-ting"}}}
    assert B.polish_ipa(w) == "study" and w["phonetic"] == "/ˈneɪl ˌbaɪtɪŋ/"
    # Study IPA that loses a part is not used.
    w = {"key": "nail-biting", "word": "nail-biting", "phonetic": "/ˌneɪl ˈbaɪtɪŋ/", "phonetic_source": "cmu",
         "nuance": {"pronunciation": {"ipa": "/ˈneɪlbaɪtɪŋ/", "respelling": "NAYL-bye-ting"}}}
    B.polish_ipa(w)
    assert w["phonetic"] == "/ˌneɪl ˈbaɪtɪŋ/"


def test_empty_ipa_counts_as_missing():
    w = {"key": "24/7", "word": "24/7", "phonetic": "//", "phonetic_source": "cmu",
         "nuance": {"pronunciation": {"ipa": "/ˌtwɛnti ˌfɔɹ ˈsɛvən/", "respelling": "twen-tee fohr SEV-uhn"}}}
    assert B.polish_ipa(w) == "study" and w["phonetic"] == "/ˌtwɛnti ˌfɔɹ ˈsɛvən/"


def test_a_longer_id_hides_one_of_two_senses_that_start_alike(tmp_path, monkeypatch):
    (tmp_path / "hide").mkdir()
    (tmp_path / "hide" / "x.txt").write_text("double-whammy | a series of two events that causes positive\n")
    monkeypatch.setattr(B, "SEEDS", tmp_path)
    sense = lambda d: {"definition": d, "example": "", "synonyms": [], "antonyms": []}
    w = {"key": "double-whammy", "word": "double whammy", "synonyms": [], "antonyms": [],
         "meanings": [{"pos": "noun", "senses": [sense("A series of two events that causes adverse effects."),
                                                 sense("A series of two events that causes positive effects.")]}],
         "nuance": {"core": {"pos": "noun", "definition": "Two bad things at once."}}}
    B.hide_senses([w])
    assert [s["definition"] for s in w["meanings"][0]["senses"]] == ["A series of two events that causes adverse effects."]


def test_a_fix_can_empty_a_field(tmp_path, monkeypatch):
    (tmp_path / "fixes").mkdir()
    (tmp_path / "fixes" / "x.txt").write_text("smart-aleck | nuance.etymology | \n")
    monkeypatch.setattr(B, "SEEDS", tmp_path)
    monkeypatch.setattr(B, "ROOT", tmp_path)
    w = {"key": "smart-aleck", "word": "smart aleck", "meanings": [], "synonyms": [], "antonyms": [],
         "nuance": {"etymology": "A doubtful story."}}
    B.apply_fixes([w])
    assert w["nuance"]["etymology"] == ""


@pytest.mark.skipif(not B.WORDS_JSON.exists(), reason="no dataset")
def test_hyphenated_terms_are_in_the_lexicon():
    words = {w["key"]: w for w in json.loads(B.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    for key, word, ipa in [("jaw-dropping", "jaw-dropping", "/ˈdʒɔ ˌdɹɑpɪŋ/"),
                           ("tongue-in-cheek", "tongue-in-cheek", None),
                           ("x-ray", "X-ray", "/ˈɛks ˌɹeɪ/"),
                           ("letdown", "letdown", None),     # filed under "let down" by the dictionary
                           ("24/7", "24/7", "/ˌtwɛnti ˌfɔɹ ˈsɛvən/")]:
        assert words[key]["word"] == word and words[key]["nuance"]["core"]["definition"], key
        assert ipa is None or words[key]["phonetic"] == ipa, (key, words[key]["phonetic"])
    assert words["heck"]["synonyms"] == ["darn", "gosh"]
    assert "doing-nothing" in words and "non-nonsense" not in words


def test_partial_ipa_counts_as_missing():
    # Wiktionary's /æ- -d/ only shows how "astonished" differs from "astonish".
    w = {"key": "astonished", "word": "astonished", "phonetic": "/æ- -d/", "phonetic_source": "wiktionary",
         "nuance": {"pronunciation": {"ipa": "/əˈstɑnɪʃt/", "respelling": "uh-STAH-nisht"}}}
    assert B.polish_ipa(w) == "study" and w["phonetic"] == "/əˈstɑnɪʃt/"
    assert not B.phonetic_needs_study_ipa({"word": "well-being", "phonetic": "/ˌwɛlˈbiɪŋ/", "phonetic_source": "manual"})


def test_wiktionary_editor_notes_are_not_shown():
    sense = lambda d: {"definition": d, "example": ""}
    w = {"key": "accompany", "word": "accompany", "nuance": None, "meanings": [{"pos": "verb", "senses": [
        sense("To go with as a companion."), sense("To cohabit (with). (Can we add an example for this sense?)"),
        sense("(Can we verify this sense?) To be found at the same time."),
        sense('Totally objectionable (Can we add an example for this sense? (Is it different from "vile"?)).')]}]}
    B.drop_editor_notes([w])
    assert [s["definition"] for s in w["meanings"][0]["senses"]] == [
        "To go with as a companion.", "To cohabit (with).", "Totally objectionable."]
    # A doubted sense that is all the entry has stays, without the note.
    w = {"key": "x", "word": "x", "nuance": None, "meanings": [{"pos": "noun", "senses": [sense("(Can we verify this sense?) A thing.")]}]}
    B.drop_editor_notes([w])
    assert w["meanings"][0]["senses"][0]["definition"] == "A thing."


def test_vowels_side_by_side_are_two_syllables_unless_a_diphthong():
    # pree-uh-PROO-vul: i and ə are two syllables; aɪ, oʊ and r-colored glides are one.
    assert B.respelling_matches_ipa("pree-uh-PROO-vul", "/ˌpɹiəˈpɹuvəl/")
    assert B.respelling_matches_ipa("pree-dye-uh-BEE-teez", "/ˌpɹidaɪəˈbitiz/")
    assert B.respelling_matches_ipa("ree-ih-LEK-shun", "/ˌɹiɪˈlɛkʃən/")
    assert B.respelling_matches_ipa("koh-in-SIDE", "/ˌkoʊɪnˈsaɪd/")
    assert B.respelling_matches_ipa("rih-tire-EE", "/ɹɪˌtaɪɚˈi/")
    assert B.respelling_matches_ipa("bye-oh-dye-VURS", "/ˌbaɪoʊdaɪˈvɝs/")
    assert not B.respelling_matches_ipa("pree-UH-proo-vul", "/ˌpɹiəˈpɹuvəl/")


def test_broken_dictionary_ipa_takes_the_study_ipa():
    for p in ["/ˈsiˈsfaɪɚ/", "/ˈkoʊ(ˌ)faʊndɚ/"]:
        assert B.phonetic_needs_study_ipa({"word": "ceasefire", "phonetic": p, "phonetic_source": "wiktionary"})
    assert B.phonetic_needs_study_ipa({"word": "dawg", "phonetic": "/ɔ/", "phonetic_source": "wiktionary"})
    assert not B.phonetic_needs_study_ipa({"word": "awe", "phonetic": "/ɔ/", "phonetic_source": "wiktionary"})
