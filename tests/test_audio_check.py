"""The listening check of human recordings (tools/audio_check.py): another
form of the word or another phrase is a fault; a spelling Whisper chose is not."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from audio_check import fault  # noqa: E402


def test_another_form_or_phrase_is_a_fault():
    assert "another form" in fault("reaffirm", "Reaffirmed.")
    assert "another form" in fault("make sense", "Makes sense.")
    assert "more words" in fault("brass tacks", "Get down to brass tacks.")
    assert "words missing" in fault("be going to", "Going to.")


def test_what_whisper_writes_differently_is_not():
    assert fault("faith", "Faith.") == ""
    assert fault("a lot", "Alot.") == ""
    assert fault("time out", "Timeout.") == ""
    assert fault("Abimelech", "Abimalak.") == ""        # a rare word misheard
    assert fault("bare", "Bear.") == ""                  # a homophone
    assert fault("oh my god", "Oh my God!") == ""


def test_numerals_homophones_and_a_swallowed_o_are_not():
    assert fault("hundred", "100.") == ""
    assert fault("one hundred percent", "100%") == ""
    assert fault("canvass", "Canvas.") == ""
    assert fault("cat-o'-nine-tails", "Cat nine tails.") == ""
    assert "another form" in fault("intersperse", "Interspersed.")
