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
    # Quoting the original in parentheses, Bible notes and etymologies are fine.
    assert not foreign_letters(entry(usage_note="A Russian word (юродивый) used in English."))
    assert not foreign_letters(entry(biblical_note="Hebrew 'adonai' אֲדֹנָי means 'my lord'.",
                                     etymology="From Old Church Slavonic dъska."))
    assert not foreign_letters({"word": "x", "nuance": {}, "meanings": [{"senses": [{"definition": "The letter ن."}]}]})


def test_grammar_fixes(words):
    ex = lambda k, f: words[k]["nuance"]["examples"][f]  # noqa: E731
    assert "the activity of virtue" in ex("enjoyer", "analytical")
    assert "support support" not in ex("internationality", "professional")
    assert ex("think-nothing-of-it", "analytical").startswith("Her thanks were")
    assert "an ume dressing" in ex("ume", "professional")
    assert "could sensate" not in ex("sensate", "everyday") + ex("sensate", "professional")
    assert words["prefigure"]["nuance"]["core"]["pos"] == "verb"
    assert "prefigured the spring" in ex("prefigure", "everyday")
