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
        return self.READ.get(text, "")


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


@pytest.mark.skipif(not tts.WORDS_JSON.exists(), reason="no dataset")
def test_wrong_recordings_are_synthesized():
    import build_dataset
    words = {w["key"]: w for w in json.loads(tts.WORDS_JSON.read_text(encoding="utf-8"))["words"]}
    wrong = sorted(k for k in build_dataset.WRONG_RECORDING if k not in words or words[k].get("has_audio"))
    assert not wrong, f"WRONG_RECORDING words that still play the recording, or aren't entries: {wrong}"


def test_a_doubled_r_colored_vowel_keeps_both_syllables():
    """Kokoro says ɚɚ as one ɚ: "devourer" was heard as "devour"."""
    assert tts.to_phonemes("/dɪˈvaʊɚɚ/", AnySymbol(), ["devourer"]) == "dɪvˈaʊɚɹɚ."


def test_primary_stress_from_kokoro_when_the_ipa_has_only_secondary():
    ipa = "/ˌtɹænsənˌdɛntəl/"
    # Kokoro stresses the third syllable: that secondary stress is promoted.
    assert tts.to_phonemes(ipa, AnySymbol(), ["transcendental"], reading="tɹˌænsəndˈɛntəl.") == "tɹˌænsəndˈɛntəl."
    # Without a reading (or one that stresses no marked syllable): the first, as before.
    assert tts.to_phonemes(ipa, AnySymbol(), ["transcendental"]) == "tɹˈænsəndˌɛntəl."
    assert tts.promote("sˈɪɡmˌɔɪd".replace("ˈ", "ˌ"), "sˈɪɡmɔɪd") == "sˈɪɡmˌɔɪd"


def test_final_v_or_f_gets_the_clear_voice():
    assert tts.voice_for("lˈʌv.") == tts.VF_VOICE and tts.voice_for("ɡˈuːf.") == tts.VF_VOICE
    assert tts.voice_for("lˈʌvz.") == tts.VOICE and tts.voice_for("vˈæn.") == tts.VOICE


def test_commas_are_spoken_with_a_pause():
    import numpy as np

    class Kokoro:
        calls = []

        def create(self, ph, voice, speed, is_phonemes):
            self.calls.append(ph)
            return np.ones(100, dtype=np.float32), 1000

    k = Kokoro()
    audio, sr = tts.synth(k, "fˈeɪθ, hˈoʊp, ænd lˈʌv.", "af_bella", 1.0)
    assert k.calls == ["fˈeɪθ,", "hˈoʊp,", "ænd lˈʌv."]
    assert len(audio) == 3 * 100 + 2 * int(sr * tts.PAUSE) and audio[150] == 0
    k.calls.clear()
    tts.synth(k, "lˈʌv.", "af_bella", 1.0)
    assert k.calls == ["lˈʌv."]


class Reader:
    """Kokoro's reading of what Whisper heard, for the check."""
    READ = {"love": "lˈʌv", "Loves.": "lˈʌvz.", "Love.": "lˈʌv.", "devour": "dɪvˈaʊɚ", "Devour.": "dɪvˈaʊɚ.",
            "devourer": "dɪvˈaʊɚɹɚ", "Abimelech": "ɐbˈɪməlˌɛk", "Abimalak.": "ɐbˈɪmɐlˌæk.",
            "Enemy.": "ˈɛnəmi.", "anomie": "ˈænəmi", "boxes": "bˈɑːksᵻz", "Boxes.": "bˈɑːksᵻz.", "loves.": "lˈʌvz."}

    def phonemize(self, text):
        return self.READ[text]


def test_the_check_flags_an_added_s_and_a_lost_syllable():
    r = Reader()
    assert tts.flags("love", "lˈʌv.", "Loves.", r) == {"plural": "loves"}
    assert tts.flags("love", "lˈʌv.", "Love.", r) == {}
    assert tts.flags("boxes", "bˈɑːksᵻz.", "Boxes.", r) == {}
    assert tts.flags("devourer", "dɪvˈaʊɚɹɚ.", "Devour.", r)["syllables"] == -1
    # A rare word spelled differently but sounding like itself is no fault.
    assert tts.flags("Abimelech", "ɐbˈɪməlˌɛk.", "Abimalak.", r) == {}
    # Whisper's article before a lone word is not a syllable said.
    assert tts.flags("love", "lˈʌv.", "A love.", r) == {}
    assert tts.flags("love", "lˈʌv.", "The loves.", r) == {"plural": "loves"}


def test_a_fault_counts_only_when_both_models_hear_it():
    plural = {"plural": "loves"}
    assert tts.failures(plural, plural, rare=False, small_match=0.9) == ["plural"]
    assert tts.failures(plural, {}, rare=False, small_match=1.0) == []
    far = {"distance": 0.6}
    assert tts.failures(far, far, rare=False, small_match=0.5) == ["distance"]
    assert tts.failures(far, far, rare=True, small_match=0.5) == []           # rare: distance only reported
    assert tts.failures({"syllables": 1}, {"syllables": -1}, rare=True, small_match=0.5) == []
