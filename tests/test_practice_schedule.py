"""Practice decides when a word comes back (app/srs.py practice_grade and
practice_answer): the shared cases in tests/fixtures/srs_vectors.json (the
website's static/js/local/srs.js passes them too, tests/js/srs.test.mjs), and
the same rules through the API."""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from app import db, srs
from app.common import pool_ids, weighted_sample

V = json.loads((Path(__file__).parent / "fixtures" / "srs_vectors.json").read_text())


def test_shared_practice_cases():
    for c in V["practice"]:
        assert srs.practice_grade(c["card"], c["correct"], c["today_grade"], V["day"]) == c["expect"], c["name"]


def test_shared_schedule_cases():
    y, m, d = map(int, V["day"].split("-"))

    class Day(date):
        @classmethod
        def today(cls):
            return date(y, m, d)
    with mock.patch.object(srs, "date", Day), mock.patch.object(srs.random, "randint", lambda a, b: 0):
        for c in V["schedule"]:
            assert srs.schedule(c["card"], c["grade"]) == c["expect"], c["name"]


def _card(c, wid):
    return dict(c.execute("SELECT * FROM srs WHERE word_id=?", (wid,)).fetchone())


def test_early_right_answers_only_log_and_a_late_miss_counts(client):
    wid = client.get("/api/words").json()["words"][0]["id"]
    today = date.today()
    with db.tx() as c:
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 6, 2, 0, ?, ?)", (wid, (today + timedelta(days=4)).isoformat(),
                                                     (today - timedelta(days=2)).isoformat()))
    client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": True})
    with db.tx() as c:
        assert _card(c, wid)["due_date"] == (today + timedelta(days=4)).isoformat()   # early: unchanged
        c.execute("UPDATE srs SET due_date=? WHERE word_id=?", (today.isoformat(), wid))
    client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": True})
    with db.tx() as c:
        assert _card(c, wid)["interval_days"] > 6                                   # due: grows
    client.post("/api/answer", json={"word_id": wid, "mode": "match", "correct": False})
    with db.tx() as c:
        card = _card(c, wid)
        grades = [r["grade"] for r in c.execute("SELECT grade FROM review_log WHERE word_id=? ORDER BY id", (wid,))]
    assert card["due_date"] == (today + timedelta(days=1)).isoformat() and card["lapses"] == 1   # missed later: Again
    assert grades == [None, 2, 0]


def test_old_star_ratings_no_longer_cap_the_schedule(client):
    wid = client.get("/api/words").json()["words"][0]["id"]
    with db.tx() as c:
        c.execute("INSERT INTO user_word(word_id, stars) VALUES (?, 1)", (wid,))
        c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                  "VALUES (?, 2.5, 20, 4, 0, date('now', 'localtime'), '2026-01-01')", (wid,))
    client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": True})
    with db.tx() as c:
        assert _card(c, wid)["interval_days"] > 7


def test_due_words_come_first_in_a_round_and_progress_counts_them(client):
    ids = [w["id"] for w in client.get("/api/words").json()["words"]][:100]
    with db.tx() as c:
        for i, wid in enumerate(ids[:3]):
            c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) VALUES "
                      "(?, date('now', 'localtime', ?), 2, '2026-01-01')", (wid, f"-{i + 1} day"))
        for _ in range(20):
            assert set(ids[:3]) <= set(weighted_sample(c, list(ids), 10))
        assert ids[2] in weighted_sample(c, list(ids), 2)                           # half the round: the most overdue
        refresh = pool_ids(c, domain="refresh", exclude_known=True)
        assert sorted(weighted_sample(c, list(refresh), 2)) == sorted(ids[1:3])     # all due: most overdue
    assert client.get("/api/stats").json()["words"]["due"] == client.get("/api/refresh").json()["count"] == 3
