"""Word forms: inflections and related forms (tools/forms.py)."""
from __future__ import annotations

from build_dataset import shares_stem
from tools.forms import forms_for


def inflections(word, poses):
    return dict((pos, dict(rows)) for pos, rows in forms_for(word, poses, [], shares_stem).get("inflections", []))


def test_verb_tenses():
    f = inflections("abide", ["verb"])["verb"]
    assert f == {"he/she/it": "abides", "past": "abided, abode", "past participle": "abided, abode",
                 "-ing form": "abiding"}
    assert inflections("stop", ["verb"])["verb"]["past participle"] == "stopped"
    assert inflections("give up", ["verb"])["verb"]["past"] == "gave up"


def test_plural_and_comparative():
    assert inflections("criterion", ["noun"])["noun"] == {"plural": "criteria"}
    assert inflections("grace", ["noun"])["noun"] == {"plural": "graces"}
    assert "noun" not in inflections("information", ["noun"])       # no "informations"
    assert inflections("water", ["noun"])["noun"] == {"plural": "waters"}
    assert inflections("quick", ["adjective", "adverb"]) == {
        "adjective, adverb": {"comparative": "quicker", "superlative": "quickest"}}


def test_related_forms():
    f = forms_for("abide", ["verb"], ["abiding (adjective)"], shares_stem)
    assert f["related"][0] == "abiding (adjective)"                # an -ing form used as its own word
    f = forms_for("criterion", ["noun"], ["criteria (plural noun)"], shares_stem)
    assert "criteria (plural noun)" not in f.get("related", [])    # already shown as the plural
    assert "analysis (noun)" in forms_for("analyze", ["verb"], [], shares_stem)["related"]   # from WordNet
