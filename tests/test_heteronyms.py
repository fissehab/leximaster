"""Words said more than one way (seeds/heteronyms.txt, tools/heteronyms.py)."""
from tools.heteronyms import assign, lead_first, load, which


def test_seed_parses_and_every_word_has_two_sounds():
    table = load()
    assert len(table) > 100
    assert all(len(v) >= 2 for v in table.values())
    assert {p["respell"] for p in table["record"]} == {"REK-erd", "rih-KAWRD"}


def test_meaning_picks_the_sound():
    tear = load()["tear"]
    say = lambda pos, d: tear[which(tear, pos, d)]["respell"]
    assert say("noun", "A drop of clear, salty liquid produced from the eyes by crying.") == "teer"
    assert say("noun", "A hole or break caused by tearing.") == "tair"
    assert say("verb", "To produce tears.") == "teer"
    assert say("verb", "To rend (a solid material) by pulling apart.") == "tair"


def test_part_of_speech_picks_the_sound():
    record = load()["record"]
    w = {"meanings": [{"pos": "noun", "senses": [{"definition": "A written account."}]},
                      {"pos": "verb", "senses": [{"definition": "To write down."}]}]}
    got = {pos: record[k]["respell"] for pos, _, _, k in assign(w, record)}
    assert got == {"noun": "REK-erd", "verb": "rih-KAWRD"}


def test_entry_leads_with_its_main_meanings_sound():
    record = load()["record"]
    w = {"nuance": {"core": {"pos": "verb"}},
         "meanings": [{"pos": "noun", "senses": [{"definition": "A written account."}]},
                      {"pos": "verb", "senses": [{"definition": "To write down."}]}]}
    assert lead_first(w, record)[0]["respell"] == "rih-KAWRD"
    w["nuance"]["core"]["pos"] = "noun"
    assert lead_first(w, record)[0]["respell"] == "REK-erd"
