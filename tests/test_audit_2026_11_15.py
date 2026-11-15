"""Fixes from the second five-reviewer audit (2026-11-15): look-up-only words
(vulgar, slurs, nonstandard), quiz answers that give themselves away, and
everyday meanings first."""
import json

import pytest

import build_dataset as b
from app.api.practice import shares_word


@pytest.fixture(scope="module")
def words():
    if not b.WORDS_JSON.exists():
        pytest.skip("no data/words.json")
    return {w["key"]: w for w in json.loads(b.WORDS_JSON.read_text(encoding="utf-8"))["words"]}


def test_listed_words_are_look_up_only(words):
    keys = b.lookup_only_keys()
    assert {"fuck-off", "asshole", "n-word", "irregardless"} <= keys
    for k in keys:
        assert b.REFERENCE in words[k]["domains"] and b.LINKED not in words[k]["domains"], k


def test_basic_words_lead_with_their_everyday_meaning(words):
    assert words["library"]["meanings"][0]["senses"][0]["definition"].startswith("An institution which holds books")
    assert "books" in words["library"]["nuance"]["core"]["definition"]
    assert words["server"]["meanings"][0]["senses"][0]["definition"] == "A waitress or waiter."
    assert "restaurant" in words["server"]["nuance"]["core"]["definition"]


@pytest.mark.parametrize("a,b_,same", [
    ("judgment", "misjudgment", True), ("cart", "shopping cart", True),
    ("with an eye to", "with an eye toward", True), ("half-century", "half a century", True),
    ("happy", "glad", False), ("big", "large", False), ("run", "sprint", False),
])
def test_an_answer_sharing_a_word_with_the_question_is_left_out(a, b_, same):
    assert shares_word(a, b_) is same
