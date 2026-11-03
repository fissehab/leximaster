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


def test_run_together_examples_are_not_blanked():
    from app.common import blank_sentence
    assert blank_sentence("upon", "A vase stood upon the table. — It hangs upon the wall. — All is upon him.") is None
    assert blank_sentence("sundown", "We fast from sunup to sundown, and eat at sundown.") == \
        "We fast from sunup to _____, and eat at _____."


def test_sentences_that_show_another_form_are_flagged():
    from app.common import hints_word
    assert hints_word("inspect", "The inspector came out to _____ the roof.")
    assert not hints_word("cynic", "My brother is such a(n) _____ that he expects the worst.")
    assert not hints_word("run", "I _____ every morning before work.")   # short words: no stem to look for


def test_masking_hides_whole_words_only():
    from app.common import mask_word
    assert mask_word("advert", "An advertisement, a public message.") == "An …, a public message."
    assert mask_word("henge", "A circle such as Stonehenge.") == "A circle such as …."
    assert mask_word("proton", "The number of protons in an atom.") == "The number of … in an atom."
    # Short words: never the letters inside other words.
    assert mask_word("H", "The eighth letter of the alphabet.") == "The eighth letter of the alphabet."
    assert mask_word("a", "Any word, a word.") == "Any word, … word."
