"""Fixes from the five-reviewer audit of 2026-11-12."""
import json
import re

import pytest

import build_dataset as b
from app.common import mentions
from tools.forms import _inflect

ACRONYM = re.compile(r"^(?:\([^)]*\)\s*)*(Initialism|Acronym|Abbreviation|Symbol|Chemical element symbol|ISO \d+)", re.I)


@pytest.fixture(scope="module")
def words():
    if not b.WORDS_JSON.exists():
        pytest.skip("no data/words.json")
    return {w["key"]: w for w in json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]}


def test_common_words_have_their_everyday_meaning(words):
    """'cat' was 'Acronym of Central Atlas Tamazight', 'be' beryllium: the
    capitalized Wiktionary page was fetched (seeds/lowercase_first.txt)."""
    for k in b.lowercase_first():
        w = words[k]
        assert w["word"] == k, f"{k}: shown as {w['word']!r}"
        first = w["meanings"][0]["senses"][0]["definition"]
        assert not ACRONYM.search(first), f"{k}: first sense {first!r}"
        core = w["nuance"]["core"]["definition"]
        assert not ACRONYM.search(core), f"{k}: core {core!r}"
    assert "animal" in words["cat"]["nuance"]["core"]["definition"].lower() or \
           "mammal" in words["cat"]["nuance"]["core"]["definition"].lower()


def test_lookup_can_try_lowercase_first():
    variants = []

    class Fake(b.DictionarySources):
        def __init__(self):
            self.network_failures = set()

        async def freedict(self, v):
            variants.append(v)
            return None

        async def wiktionary_defs(self, v):
            return []

    import asyncio
    asyncio.run(Fake().lookup("CAT", lower_first=True))
    assert variants[0] == "cat"


def test_past_forms_spelled_like_the_verb_are_shown():
    """'put' showed no past at all (forms.py dropped forms equal to the word)."""
    for verb in ["put", "cut", "set", "hit", "read"]:
        rows = dict(_inflect(verb, "VERB"))
        assert rows["past"] == verb and rows["past participle"] == verb, verb
    rows = dict(_inflect("lie", "VERB"))
    assert "lain" in rows["past participle"] and "lay" in rows["past"]
    assert _inflect("music", "NOUN") == []        # an uncountable noun shows no plural


def test_junk_examples_are_dropped():
    ws = [{"meanings": [{"senses": [
        {"definition": "x", "example": "(Can we add an example for this sense?)"},
        {"definition": "x", "example": "(The addition of quotations indicative of this usage is being sought:)"},
        {"definition": "x", "example": "almond:"},
        {"definition": "x", "example": "."},
        {"definition": "x", "example": "(oneself)"},
        {"definition": "x", "example": "Pitch contour: mid [lɛ˧]"},
        {"definition": "x", "example": "(transitive) She saved money."},
        {"definition": "x", "example": "three-star general"},
    ]}]}]
    assert b.clean_examples(ws) == 6
    got = [s["example"] for s in ws[0]["meanings"][0]["senses"]]
    assert got[-2:] == ["She saved money.", "three-star general"]


def test_malformed_ipa_is_repaired():
    ws = [{"phonetic": p} for p in ["/ˈbi()n/", "/ˈsɪt.i/ [ˈsɪɾ.i]/", "/ˈbeɪ.sɪs/>>/"]] + \
         [{"phonetic": "", "nuance": {"pronunciation": {"ipa": "/ˈflætəɹɚ/"}}}]
    b.tidy_phonetic(ws)
    assert [w["phonetic"] for w in ws] == ["/ˈbin/", "/ˈsɪt.i/", "/ˈbeɪ.sɪs/", "/ˈflætəɹɚ/"]


def test_tips_dont_argue_with_the_source(words):
    for w in words.values():
        tip = ((w.get("nuance") or {}).get("pronunciation") or {}).get("tip") or ""
        assert not re.search(r"\b(IPA|transcription)\b", tip), w["key"]


def test_a_search_for_a_verb_form_finds_the_verb():
    """'went' (no entry of its own) is listed as a form of 'go'."""
    data = {"forms": {"inflections": [["verb", [["past", "went"], ["past participle", "gone"]]]]}}
    terms = {t: ps for t, ps in mentions([("go", data)], {"go", "gone"})}
    assert terms["went"] == [["i", "go"]]
    assert "gone" not in terms                     # a headword has its own row


def test_everyday_basics_are_in(words):
    for k in ["daughter", "kitchen", "monday", "january", "two", "mouse", "yesterday", "police"]:
        assert k in words, k
    assert words["january"]["word"] == "January"
    assert "basics" in words["monday"]["domains"]


def test_service_worker_keeps_each_sounds_recording_and_only_claims_the_app_page():
    """Built site (docs/): each sound's recording is listed in the index and
    kept by pruneMedia; /guide/ isn't answered with the app."""
    sw = b.ROOT / "docs" / "sw.js"
    if not sw.exists():
        pytest.skip("site not built")
    text = sw.read_text(encoding="utf-8")
    assert "for (const f of w.x || []) used.add(f)" in text
    assert 'path === root || path === root + "index.html"' in text
    index = json.loads((b.ROOT / "docs" / "data" / "index.json").read_text(encoding="utf-8"))
    record = next(w for w in index["words"] if w["k"] == "record")
    assert record["x"] and record["xp"]
    assert index["offline_mb"] > 50


def test_main_sense_first_and_no_radio_codes(words):
    """'two' began with a NATO radio code; 'forty' with a bottle of beer;
    'a' and 'an' had no article sense (seeds/main_senses)."""
    for k, n in [("two", "2"), ("forty", "40"), ("hundred", "100")]:
        assert words[k]["meanings"][0]["senses"][0]["definition"] == f"The number {n}."
    assert words["a"]["meanings"][0]["pos"] == "article" and words["an"]["meanings"][0]["pos"] == "article"
    assert words["may"]["meanings"][-1]["senses"][0]["definition"].startswith("May: the fifth month")
    assert not any(b.NOT_A_SENSE_RE.search(s["definition"]) for w in words.values()
                   for m in w["meanings"] for s in m["senses"])
