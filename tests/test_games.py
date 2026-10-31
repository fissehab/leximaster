"""What Word Shooter, Word Rush and Type It (static/js/tabs/shooter.js, rush.js, typeit.js) rely
on from the API: word-shaped options from /api/quiz, the "too few words"
error, test history for their sessions, and `match` answers in the log."""
from __future__ import annotations

import pytest

from app import db


@pytest.mark.parametrize("qtype", ["meaning_word", "fill_blank", "synonym"])
def test_shooter_clues_have_four_short_options(client, qtype):
    res = client.get("/api/quiz", params={"types": qtype, "n": 15})
    assert res.status_code == 200
    questions = res.json()["questions"]
    assert questions
    # Options are headwords (some everyday ones are whole phrases, "Do you
    # need a parking pass?") or short synonyms: never a definition.
    headwords = {w["word"] for w in client.get("/api/words").json()["words"]}
    for q in questions:
        assert q["type"] == qtype
        assert len(q["options"]) == 4 and q["answer"] in q["options"]
        if qtype == "synonym":
            assert all(len(o.split()) <= 5 for o in q["options"]), q["options"]
        else:
            assert set(q["options"]) <= headwords, q["options"]
        assert q["word_id"]
        if qtype == "meaning_word":
            assert q["word"].lower() not in q["prompt"].lower()


def test_rush_cards_show_a_word_and_four_meanings(client):
    questions = client.get("/api/quiz", params={"types": "word_meaning", "n": 40}).json()["questions"]
    assert questions
    for q in questions:
        assert q["prompt"] == q["word"]
        assert q["answer"] in q["options"]
        assert len(set(q["options"])) == 4


def test_too_few_words_says_choose_a_wider_set(client):
    ids = [w["id"] for w in client.get("/api/words").json()["words"][:2]]
    lid = client.post("/api/lists", json={"name": "Two words"}).json()["id"]
    for wid in ids:
        client.post(f"/api/lists/{lid}/words", json={"word_id": wid})
    res = client.get("/api/quiz", params={"types": "meaning_word", "n": 15, "list_id": lid})
    assert res.status_code == 400
    assert "Choose a wider set" in res.json()["detail"]


def test_game_sessions_show_in_test_history(client):
    for kind, score, total in [("word-shooter", 11, 15), ("word-rush", 18, 22)]:
        assert client.post("/api/sessions", json={"kind": kind, "score": score, "total": total, "duration_s": 90}).status_code == 200
    tests = {t["kind"]: t for t in client.get("/api/stats").json()["tests"]}
    assert (tests["word-shooter"]["score"], tests["word-shooter"]["total"]) == (11, 15)
    assert (tests["word-rush"]["score"], tests["word-rush"]["total"]) == (18, 22)


def test_a_game_miss_is_logged_as_match(client):
    wid = client.get("/api/words").json()["words"][0]["id"]
    with db.tx() as c:
        assert not c.execute("SELECT 1 FROM srs WHERE word_id=?", (wid,)).fetchone()
    res = client.post("/api/answer", json={"word_id": wid, "mode": "match", "correct": False, "ms": 2400})
    assert res.status_code == 200
    with db.tx() as c:
        row = c.execute("SELECT mode, correct, ms_taken FROM review_log WHERE word_id=? ORDER BY id DESC", (wid,)).fetchone()
    assert (row["mode"], row["correct"], row["ms_taken"]) == ("match", 0, 2400)


def test_hear_mode_items_carry_a_word_its_sound_alikes_and_a_meaning(client):
    """Word Shooter and Type It "Hear it" (games.js fromListen) use /api/listen."""
    items = client.get("/api/listen", params={"n": 15}).json()["items"]
    assert items
    for it in items:
        assert it["id"] and it["word"]
        assert len(it["options"]) == 4 and it["word"] in it["options"]
        assert it.get("audio_url") or it.get("tts_url") or it["word"]   # something to play (or the device voice)
        assert (it.get("nuance") or {}).get("core", {}).get("definition") or it.get("def") or it["meanings"]


def test_type_it_meanings_give_the_word_as_the_answer(client):
    for q in client.get("/api/quiz", params={"types": "meaning_word", "n": 15}).json()["questions"]:
        assert q["answer"] == q["word"] and q["prompt"]


@pytest.mark.parametrize("mode", ["listen", "spell"])
def test_heard_game_answers_are_logged_as_listening_or_spelling(client, mode):
    wid = client.get("/api/words").json()["words"][1]["id"]
    assert client.post("/api/answer", json={"word_id": wid, "mode": mode, "correct": True, "ms": 1800}).status_code == 200
    with db.tx() as c:
        assert c.execute("SELECT mode FROM review_log WHERE word_id=? ORDER BY id DESC", (wid,)).fetchone()["mode"] == mode
