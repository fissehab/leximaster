"""The scheduler (app/srs.py) and the review routes built on it: lapses,
ease recovery, overdue credit, practice misses, repeat passes and undo."""
from __future__ import annotations

from datetime import date, timedelta

from app import srs


def card(**kw):
    base = {"ease": 2.5, "interval_days": 0, "reps": 0, "lapses": 0, "due_date": date.today().isoformat(), "last_reviewed": None}
    return {**base, **kw}


def test_new_word_ladder():
    first = srs.schedule(card(), 2, 0)
    assert (first["interval_days"], first["reps"]) == (1, 1)
    second = srs.schedule({**first, "due_date": date.today().isoformat()}, 2, 0)
    assert (second["interval_days"], second["reps"]) == (6, 2)


def test_first_miss_of_a_new_word_is_not_a_lapse():
    out = srs.schedule(card(), 0, 0)
    assert out["lapses"] == 0 and out["ease"] == 2.5 and out["interval_days"] == 1


def test_lapse_keeps_a_fifth_and_comes_back_tomorrow():
    out = srs.schedule(card(interval_days=60, reps=5, last_reviewed="2026-01-01"), 0, 0)
    assert out["interval_days"] == 12 and out["reps"] == 2 and out["lapses"] == 1
    assert out["due_date"] == (date.today() + timedelta(days=1)).isoformat()
    assert out["ease"] == 2.3
    # The next good review grows from the kept interval, not from zero.
    again = srs.schedule({**out, "due_date": date.today().isoformat()}, 2, 0)
    assert again["interval_days"] >= 25


def test_good_pulls_ease_back_toward_normal():
    out = srs.schedule(card(ease=1.5, interval_days=10, reps=3, last_reviewed="x"), 2, 0)
    assert out["ease"] > 1.5
    high = srs.schedule(card(ease=2.5, interval_days=10, reps=3, last_reviewed="x"), 2, 0)
    assert high["ease"] == 2.5


def test_ease_never_below_floor():
    out = srs.schedule(card(ease=1.3, interval_days=10, reps=3, last_reviewed="x"), 0, 0)
    assert out["ease"] == srs.MIN_EASE


def test_overdue_recall_earns_credit():
    on_time = srs.schedule(card(interval_days=20, reps=4, last_reviewed="x"), 2, 0)
    late = srs.schedule(card(interval_days=20, reps=4, last_reviewed="x",
                             due_date=(date.today() - timedelta(days=20)).isoformat()), 2, 0)
    assert late["interval_days"] > on_time["interval_days"] * 1.3


def test_fuzz_stays_within_five_percent():
    for _ in range(200):
        assert 95 <= srs.fuzz(100) <= 105
    assert srs.fuzz(3) == 3


def test_star_cap():
    out = srs.schedule(card(interval_days=30, reps=4, last_reviewed="x"), 3, 1)
    assert out["interval_days"] == srs.STAR_INTERVAL_CAP[1]


def _word_id(client):
    return client.get("/api/words").json()["words"][0]["id"]


def test_practice_miss_keeps_the_interval(client):
    from app import db
    wid = _word_id(client)
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 40, 4, 0, '2030-01-01', '2026-01-01')", (wid,))
    assert client.post("/api/answer", json={"word_id": wid, "mode": "match", "correct": False}).status_code == 200
    with db.tx() as c:
        row = dict(c.execute("SELECT * FROM srs WHERE word_id=?", (wid,)).fetchone())
    assert row["interval_days"] == 40 and row["ease"] == 2.5 and row["due_date"] == date.today().isoformat()
    # A quiz miss (the first miss of the day for that word) halves the interval.
    other = client.get("/api/words").json()["words"][1]["id"]
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 40, 4, 0, '2030-01-01', '2026-01-01')", (other,))
    client.post("/api/answer", json={"word_id": other, "mode": "quiz", "correct": False})
    with db.tx() as c:
        row = dict(c.execute("SELECT * FROM srs WHERE word_id=?", (other,)).fetchone())
    assert row["interval_days"] == 20 and row["ease"] == 2.3


def test_repeat_pass_is_logged_apart_and_undo_restores(client):
    from app import db
    wid = _word_id(client)
    first = client.post(f"/api/review/{wid}", json={"grade": 2, "is_new": True}).json()
    assert first["previous"] is None and first["reps"] == 1
    client.post(f"/api/review/{wid}", json={"grade": 0, "repeat": True})
    with db.tx() as c:
        modes = [r["mode"] for r in c.execute("SELECT mode FROM review_log WHERE word_id=? ORDER BY id", (wid,))]
    assert modes == ["review", "repeat"]
    # Undo the repeat, then the first grade: the word is unseen again.
    assert client.post(f"/api/review/{wid}/undo", json={"repeat": True}).status_code == 200
    assert client.post(f"/api/review/{wid}/undo", json={"previous": None, "is_new": True}).status_code == 200
    with db.tx() as c:
        assert c.execute("SELECT COUNT(*) AS n FROM review_log WHERE word_id=?", (wid,)).fetchone()["n"] == 0
        assert c.execute("SELECT 1 FROM srs WHERE word_id=?", (wid,)).fetchone() is None
    assert client.post(f"/api/review/{wid}/undo", json={}).status_code == 409


def test_queue_spreads_new_words_through_reviews():
    from app.api.practice import interleave
    q = [("d1", False), ("d2", False), ("d3", False), ("d4", False), ("n1", True), ("n2", True)]
    assert [x for x, _ in interleave(q)] == ["d1", "d2", "d3", "n1", "d4", "n2"]


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
