"""The scheduler (app/srs.py) and the practice answers built on it: lapses,
ease recovery, overdue credit, and words coming back to refresh."""
from __future__ import annotations

from datetime import date, timedelta

from app import srs


def card(**kw):
    base = {"ease": 2.5, "interval_days": 0, "reps": 0, "lapses": 0, "due_date": date.today().isoformat(), "last_reviewed": None}
    return {**base, **kw}


def test_new_word_ladder():
    first = srs.schedule(card(), 2)
    assert (first["interval_days"], first["reps"]) == (1, 1)
    second = srs.schedule({**first, "due_date": date.today().isoformat()}, 2)
    assert (second["interval_days"], second["reps"]) == (6, 2)


def test_first_miss_of_a_new_word_is_not_a_lapse():
    out = srs.schedule(card(), 0)
    assert out["lapses"] == 0 and out["ease"] == 2.5 and out["interval_days"] == 1


def test_lapse_keeps_a_fifth_and_comes_back_tomorrow():
    out = srs.schedule(card(interval_days=60, reps=5, last_reviewed="2026-01-01"), 0)
    assert out["interval_days"] == 12 and out["reps"] == 2 and out["lapses"] == 1
    assert out["due_date"] == (date.today() + timedelta(days=1)).isoformat()
    assert out["ease"] == 2.3
    # The next good review grows from the kept interval, not from zero.
    again = srs.schedule({**out, "due_date": date.today().isoformat()}, 2)
    assert again["interval_days"] >= 25


def test_good_pulls_ease_back_toward_normal():
    out = srs.schedule(card(ease=1.5, interval_days=10, reps=3, last_reviewed="x"), 2)
    assert out["ease"] > 1.5
    high = srs.schedule(card(ease=2.5, interval_days=10, reps=3, last_reviewed="x"), 2)
    assert high["ease"] == 2.5


def test_ease_never_below_floor():
    out = srs.schedule(card(ease=1.3, interval_days=10, reps=3, last_reviewed="x"), 0)
    assert out["ease"] == srs.MIN_EASE


def test_overdue_recall_earns_credit():
    on_time = srs.schedule(card(interval_days=20, reps=4, last_reviewed="x"), 2)
    late = srs.schedule(card(interval_days=20, reps=4, last_reviewed="x",
                             due_date=(date.today() - timedelta(days=20)).isoformat()), 2)
    assert late["interval_days"] > on_time["interval_days"] * 1.3


def test_fuzz_stays_within_five_percent():
    for _ in range(200):
        assert 95 <= srs.fuzz(100) <= 105
    assert srs.fuzz(3) == 3


def _word_id(client):
    return client.get("/api/words").json()["words"][0]["id"]


def test_practice_answers_schedule_the_word_once_a_day(client):
    """With no daily review, practice decides when a word comes back: right is
    Good, wrong is Again, once per word per day (srs.practice_answer)."""
    from app import db
    words = client.get("/api/words").json()["words"]
    right, wrong, known = words[0]["id"], words[1]["id"], words[2]["id"]
    today = date.today()
    client.post("/api/answer", json={"word_id": right, "mode": "quiz", "correct": True})
    client.post("/api/answer", json={"word_id": right, "mode": "quiz", "correct": True})    # same day: no change
    with db.tx() as c:
        card = dict(c.execute("SELECT * FROM srs WHERE word_id=?", (right,)).fetchone())
        logs = [dict(r) for r in c.execute("SELECT grade, correct FROM review_log WHERE word_id=? ORDER BY id", (right,))]
    assert card["reps"] == 1 and card["due_date"] == (today + timedelta(days=1)).isoformat()
    assert logs == [{"grade": 2, "correct": 1}, {"grade": None, "correct": 1}]
    # A word you've learned well and then miss comes back tomorrow, keeping part of its interval.
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 40, 4, 0, '2030-01-01', '2026-01-01')", (wrong,))
    client.post("/api/answer", json={"word_id": wrong, "mode": "match", "correct": False})
    with db.tx() as c:
        card = dict(c.execute("SELECT * FROM srs WHERE word_id=?", (wrong,)).fetchone())
    assert card["lapses"] == 1 and card["due_date"] == (today + timedelta(days=1)).isoformat() and 1 < card["interval_days"] < 40
    # Words to refresh: practised words due today, not words marked known.
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) VALUES (?, date('now', 'localtime', '-1 day'), 2, '2026-01-01')", (known,))
        c.execute("UPDATE srs SET due_date = date('now', 'localtime') WHERE word_id = ?", (right,))
    assert client.get("/api/refresh").json()["count"] == 2
    client.patch(f"/api/words/{known}/state", json={"known": True})
    assert client.get("/api/refresh").json()["count"] == 1
    cards = client.get("/api/flashcards", params={"domain": "refresh"}).json()["cards"]
    assert [w["id"] for w in cards] == [right]


def test_stats_mastered_needs_a_survived_gap(client):
    from app import db
    wid = _word_id(client)
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 30, 4, 0, '2030-01-01', '2026-01-01')", (wid,))
        c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct) VALUES (?, '2026-01-01 10:00:00', 'review', 2, 1)", (wid,))
    assert client.get("/api/stats").json()["words"]["mastered"] == 0   # a long interval alone isn't mastery
    with db.tx() as c:
        c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct) VALUES (?, '2026-02-01 10:00:00', 'review', 2, 1)", (wid,))
    s = client.get("/api/stats").json()
    assert s["words"]["mastered"] == 1 and "retention" in s
