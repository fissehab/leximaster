"""Synthesized pronunciations (tools/tts.py): the American flap, and the words
that keep their t because Kokoro says the flap like an r."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import tts  # noqa: E402


class AnySymbol(dict):
    """Kokoro's vocabulary, for these tests: every symbol is known."""
    def __contains__(self, c):
        return True


class Tokenizer:
    """Kokoro's tokenizer stand-in: its own reading of a few words."""
    vocab = AnySymbol()
    READ = {"meta": "mˈɛɾə", "water": "wˈɔːɾɚ", "ladder": "lˈæɾɚ"}

    def phonemize(self, text):
        return self.READ[text]


def test_flap_by_default_and_t_when_asked():
    assert tts.to_phonemes("/ˈpleɪtənəst/", AnySymbol(), ["Platonist"]) == "plˈeɪɾənəst."
    assert tts.to_phonemes("/ˈpleɪtənəst/", AnySymbol(), ["Platonist"], flap=False) == "plˈeɪtənəst."
    assert tts.to_phonemes("/ˈwɔtər/", AnySymbol(), ["water"]) == "wˈɔːɾəɹ."


def test_listed_words_keep_their_t():
    tok = Tokenizer()
    ph, source = tts.plan({"word": "Platonist", "phonetic": "/ˈpleɪtənəst/"}, tok)
    assert (ph, source) == ("plˈeɪtənəst.", "ipa")
    # Read as text: Kokoro's own flap becomes the letter the word is spelled with.
    assert tts.plan({"word": "meta", "phonetic": ""}, tok) == ("mˈɛtə.", "text")
    # Words not on the list keep the flap, Kokoro's or the IPA's.
    assert tts.plan({"word": "water", "phonetic": ""}, tok) == ("wˈɔːɾɚ.", "text")
    assert tts.plan({"word": "ladder", "phonetic": ""}, tok) == ("lˈæɾɚ.", "text")
    assert "ɾ" in tts.plan({"word": "Plato", "phonetic": "/ˈpleɪtoʊ/"}, tok)[0]


@pytest.mark.skipif(not tts.WORDS_JSON.exists(), reason="no dataset")
def test_listed_words_are_synthesized_entries():
    words = {w["word"]: w for w in json.loads(tts.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    missing = sorted(n for n in tts.NO_FLAP if n not in words or words[n].get("has_audio"))
    assert not missing, f"NO_FLAP words that aren't synthesized entries: {missing}"
