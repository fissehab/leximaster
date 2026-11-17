"""The English course's pronunciation fixes (tools/course_audio.py): the
phonemizer's /z/ in "used to", "supposed to" and "excuse me" becomes the
/s/ or /z/ Americans say, and only when "to" (or "me") follows."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import course_audio  # noqa: E402


def fix(ph: str) -> str:
    for pat, rep in course_audio.RULES:
        ph = re.sub(pat, rep, ph)
    return ph


def test_used_supposed_excuse():
    assert fix("ðɛɹ jˈuːzd təbi") == "ðɛɹ jˈuːst təbi"
    assert fix("juːl ɡɛt jˈuːzd tʊ ɪt") == "juːl ɡɛt jˈuːst tʊ ɪt"
    assert fix("aɪ dˈɪdnt jˈuːz tə lˈaɪk") == "aɪ dˈɪdnt jˈuːs tə lˈaɪk"
    assert fix("aɪm səpˈoʊzd tə kˈɔːl") == "aɪm səpˈoʊst tə kˈɔːl"
    assert fix("ɛkskjˈuːs mˌiː") == "ɛkskjˈuːz mˌiː"


def test_other_uses_left_alone():
    assert fix("kæn aɪ jˈuːz tˈaɪm") == "kæn aɪ jˈuːz tˈaɪm"      # use time
    assert fix("ɐn ɛkskjˈuːs") == "ɐn ɛkskjˈuːs"                 # an excuse
