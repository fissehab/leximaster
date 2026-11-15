"""Grammar-pattern quiz questions (app/api/practice.py pattern_question)."""
from __future__ import annotations

import random

from app.api.practice import pattern_question


def test_blank_is_the_preposition_and_alternatives_are_never_wrong_choices():
    random.seed(0)
    for _ in range(30):
        q = pattern_question("disappointed", ["disappointed in sb", "disappointed with/at/about sth"], "adjective")
        assert q["prompt"] in ("disappointed ___ sb", "disappointed ___ sth")
        wrong = set(q["options"]) - {q["answer"]}
        assert len(wrong) == 2 and not wrong & {"in", "with", "at", "about", "by"}


def test_never_a_wrong_choice_that_is_good_english():
    """A preposition common with the word in American books (also_preps), or
    used after it in its own examples, isn't offered as wrong."""
    random.seed(2)
    for _ in range(30):
        q = pattern_question("impatient", ["impatient with sb"], "adjective", also=["of", "for"],
                             examples=["She grew impatient at the delay."])
        assert not (set(q["options"]) - {q["answer"]}) & {"of", "for", "at"}


def test_one_frame_at_a_time_and_no_giveaway():
    random.seed(1)
    q = pattern_question("insist", ["insist on sth / on doing sth"])
    assert q["prompt"] == "insist ___ sth" and q["answer"] == "on"


def test_no_question_without_a_preposition():
    assert pattern_question("reluctance", ["reluctance to do sth"], "noun") is None
    assert pattern_question("aware", ["aware (that) …"]) is None


def test_optional_preposition_and_labels_are_cleaned():
    q = pattern_question("chortle", ["chortle (at sth)"])
    assert q["prompt"] == "chortle ___ sth" and q["answer"] == "at"
