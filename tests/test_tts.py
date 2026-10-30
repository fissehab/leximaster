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


def test_remade_recording_keeps_the_voice_a_retry_chose(tmp_path, monkeypatch):
    """A re-made word keeps the voice and speed a retry chose for it, and the
    retry mark, so the next re-make keeps them too."""
    class Kokoro:
        def __init__(self, *a):
            self.tokenizer = Tokenizer()
            self.calls = []
        def create(self, ph, voice, speed, is_phonemes):
            self.calls.append((voice, speed))
            return [0.0] * 240, 24000
    fake = type(sys)("kokoro_onnx")
    fake.Kokoro = Kokoro
    monkeypatch.setitem(sys.modules, "kokoro_onnx", fake)
    for name in ("MODEL", "VOICES"):
        (tmp_path / name).touch()
        monkeypatch.setattr(tts, name, tmp_path / name)
    (tmp_path / "tts").mkdir()
    monkeypatch.setattr(tts, "DATA", tmp_path)
    monkeypatch.setattr(tts, "OUT_DIR", tmp_path / "tts")
    monkeypatch.setattr(tts, "MANIFEST", tmp_path / "tts.json")
    monkeypatch.setattr(tts, "targets", lambda only=None: [{"key": "meta", "word": "meta", "phonetic": ""}])
    def write_hashed(audio, sr, stem):
        p = tmp_path / "tts" / f"{stem}.0123abcd.m4a"
        p.touch()
        return p
    monkeypatch.setattr(tts, "write_hashed", write_hashed)
    (tmp_path / "tts" / "meta.89abcdef.m4a").touch()
    tts.save_manifest({"meta": {"file": "tts/meta.89abcdef.m4a", "phonemes": "mˈɛɾə.", "source": "text",
                                "voice": "am_michael", "speed": 0.8, "retried": True}})
    tts.generate()
    entry = tts.load_manifest()["meta"]
    assert (entry["phonemes"], entry["voice"], entry["speed"], entry["retried"]) == ("mˈɛtə.", "am_michael", 0.8, True)


def test_ically_written_with_an_extra_syllable_is_said_ick_lee():
    assert tts.to_phonemes("/hɪpəˈkɹɪtɪkəlli/", AnySymbol(), ["hypocritically"], flap=False) == "hɪpəkɹˈɪtɪkli."
    assert tts.to_phonemes("/ˈkwɪzək(ə)lli/", AnySymbol(), ["quizzically"]) == "kwˈɪzəkli."
    assert tts.to_phonemes("/ˈsoʊlli/", AnySymbol(), ["solely"]) == "sˈoʊlli."      # a real double l stays


def test_hand_written_pronunciations_come_first():
    tok = Tokenizer()
    assert tts.plan({"word": "F1 score", "phonetic": "/ˌɛf ˈskɔɹ/"}, tok) == ("ˌɛf wˈʌn skˈɔːɹ.", "said")
    assert tts.plan({"word": "Meshach", "phonetic": "/ˈmɛʃˌeɪˌsiˌeɪtʃ/", "name_kind": "person"}, tok) == ("mˈiːʃæk.", "said")


@pytest.mark.skipif(not tts.WORDS_JSON.exists(), reason="no dataset")
def test_hand_written_words_are_synthesized_entries():
    words = {w["word"]: w for w in json.loads(tts.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    missing = sorted(n for n in tts.SAY if n not in words or words[n].get("has_audio"))
    assert not missing, f"SAY words that aren't synthesized entries: {missing}"
    assert all(ph.endswith(".") and "ɾ" not in ph for ph in tts.SAY.values())


def test_wrong_recordings_are_synthesized():
    import build_dataset
    words = {w["key"]: w for w in json.loads(tts.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    wrong = sorted(k for k in build_dataset.WRONG_RECORDING if k not in words or words[k].get("has_audio"))
    assert not wrong, f"WRONG_RECORDING words that still play the recording, or aren't entries: {wrong}"
