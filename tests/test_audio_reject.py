"""Recordings that say the word wrongly (seeds/audio_reject) are never used,
and every word the app gives a recording has one that is not on the list."""
import json

import pytest

import build_dataset as B


def test_commons_file_names_match_however_the_url_spells_them():
    assert B.commons_file("https://commons.wikimedia.org/wiki/Special:FilePath/en-us-come.ogg") == "en-us-come.ogg"
    assert B.commons_file("https://commons.wikimedia.org/wiki/Special:FilePath/LL-Q1860_(eng)-Wodencafe-come.wav") \
        == "ll-q1860 (eng)-wodencafe-come.wav"
    assert B.commons_file("https://x/File:En-us-come.ogg") == "en-us-come.ogg"


def test_rejected_recordings_read_the_seed_lists(tmp_path, monkeypatch):
    (tmp_path / "a.txt").write_text("# header\nen-us-come.ogg | says tum\n"
                                    "en-us-controller.oga | says controller | comptroller\n")
    monkeypatch.setattr(B, "AUDIO_REJECT", tmp_path)
    r = B.rejected_recordings()
    assert r == {"en-us-come.ogg": None, "en-us-controller.oga": {"comptroller"}}
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/"
    assert B.is_rejected(r, url + "en-us-come.ogg", "cum")
    assert B.is_rejected(r, url + "en-us-controller.oga", "comptroller")
    assert not B.is_rejected(r, url + "en-us-controller.oga", "controller")


@pytest.mark.skipif(not B.WORDS_JSON.exists(), reason="no dataset")
def test_no_word_plays_a_rejected_recording():
    rejected = B.rejected_recordings()
    assert "en-us-come.ogg" in rejected
    words = json.loads(B.WORDS_JSON.read_text(encoding="utf-8"))["words"]
    used = {w["key"]: w["audio"]["source_url"] for w in words if w.get("audio") and w["audio"].get("source_url")}
    assert not [k for k, url in used.items() if B.is_rejected(rejected, url, k)
                or B.lingua_libre_speaker(url) in B.NOT_US_SPEAKERS]
