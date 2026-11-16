"""Fixes from the grammar check of the example sentences (2026-11-15) and the
stray-alphabet rule (tools/audit.py) it led to."""
import json

import pytest

import build_dataset as b
from tools.audit import foreign_letters


@pytest.fixture(scope="module")
def words():
    if not b.WORDS_JSON.exists():
        pytest.skip("no data/words.json")
    return {w["key"]: w for w in json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]}


def test_no_letters_from_other_alphabets_in_english_text(words):
    assert [k for k, w in words.items() if foreign_letters(w)] == []


def test_the_rule_catches_and_allows_the_right_things():
    def entry(**nuance):
        return {"word": "x", "meanings": [], "nuance": nuance}
    assert foreign_letters(entry(usage_note="It is common in家庭 conversation."))
    assert foreign_letters(entry(collocations=["a известный peace dove"]))
    assert foreign_letters({"word": "x", "nuance": {}, "meanings": [{"senses": [{"definition": "Тo develop."}]}]})
    # English only, even in asides, Bible notes and word histories
    assert foreign_letters(entry(usage_note="A Russian word (юродивый) used in English."))
    assert foreign_letters(entry(biblical_note="Hebrew 'adonai' (אֲדֹנָי) means 'my lord'."))
    assert foreign_letters({"word": "x", "etymology": "From Ancient Greek *ἄτομος*.", "nuance": {}, "meanings": []})
    # Math and pronunciation symbols and accented Latin letters are English text.
    assert not foreign_letters(entry(core={"definition": "An angle between 0 and π radians; σ is the standard deviation."},
                                     common_mistakes=["Saying /t/ for /θ/."], usage_note="A café; the Greek agapē; ℝn."))


def test_foreign_words_keep_their_latin_spelling():
    from tools.foreign_text import strip_foreign
    assert strip_foreign("Hebrew 'adonai' (אֲדֹנָי) means 'my lord'.", True) == ("Hebrew 'adonai' means 'my lord'.", False)
    assert strip_foreign("From Ancient Greek *ἄτομος* (“indivisible”), from *ἀ-* + *τέμνω* + *-ος*.", True)[0] == \
        "From an Ancient Greek word meaning “indivisible”."
    assert strip_foreign("Son of; equivalent to Hebrew בן (ben).")[0] == "Son of; equivalent to Hebrew ben."
    assert strip_foreign("The letter ж (ž) in Russian is always hard.")[0] == "The letter ž in Russian is always hard."
    assert strip_foreign("A prefecture-level unit in Inner Mongolia (Chinese: 盟).")[0] == "A prefecture-level unit in Inner Mongolia."
    assert strip_foreign("The letter ن in the Arabic script.")[1]   # the sense needs the letter: left out


def test_senses_that_need_a_foreign_letter_are_left_out(words):
    assert not any("Arabic script" in s["definition"] for m in words["noon"]["meanings"] for s in m["senses"])
    assert any(s["definition"] == "Son of; equivalent to Hebrew ben." for m in words["bin"]["meanings"] for s in m["senses"])


def test_grammar_fixes(words):
    ex = lambda k, f: words[k]["nuance"]["examples"][f]  # noqa: E731
    assert "the activity of virtue" in ex("enjoyer", "analytical")
    assert "support support" not in ex("internationality", "professional")
    assert ex("think-nothing-of-it", "analytical").startswith("Her thanks were")
    assert "an ume dressing" in ex("ume", "professional")
    assert "could sensate" not in ex("sensate", "everyday") + ex("sensate", "professional")
    assert words["prefigure"]["nuance"]["core"]["pos"] == "verb"
    assert "prefigured the spring" in ex("prefigure", "everyday")
