"""Fill-in-the-blank: sentences for the meaning the learner studies, whole
sentences only."""
from app.common import quiz_examples


def test_rare_senses_and_fragments_are_not_quizzed():
    data = {"nuance": {"examples": {"everyday": "My neighbor is a cynic about politics.", "professional": "",
                                    "analytical": "The cynic doubts every motive he sees."}},
            "meanings": [{"pos": "noun", "senses": [{"definition": "A scornfully negative person.",
                                                     "example": "My brother is such a cynic that he expects the worst."}]},
                         {"pos": "adjective", "senses": [{"definition": "Relating to the Dog Star.",
                                                          "example": "the cynic, or Sothic, year; cynic cycle"}]}]}
    assert quiz_examples(data) == ["My neighbor is a cynic about politics.", "The cynic doubts every motive he sees.",
                                   "My brother is such a cynic that he expects the worst."]


def test_a_second_senses_example_is_not_quizzed():
    data = {"meanings": [{"pos": "noun", "senses": [{"definition": "A building.", "example": ""},
                                                    {"definition": "Rare: a ship.", "example": "The house sailed at dawn today."}]}]}
    assert quiz_examples(data) == []
