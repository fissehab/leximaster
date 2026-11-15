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


def test_a_miss_after_a_right_answer_replaces_it(client):
    """Right then wrong the same day is the same as wrong alone: the miss is
    graded from the card as it was that morning (srs.prev), not on top of the
    right answer."""
    words = client.get("/api/words").json()["words"]
    mature, fresh, alone = words[0]["id"], words[1]["id"], words[2]["id"]
    with db.tx() as c:
        for wid in (mature, alone):
            c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                      "VALUES (?, 2.5, 30, 5, 0, date('now', 'localtime'), '2026-01-01')", (wid,))
    for wid, answers in ((mature, (True, False)), (alone, (False,)), (fresh, (True, False))):
        for ok in answers:
            client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": ok})
    with db.tx() as c:
        a, b, f = _card(c, mature), _card(c, alone), _card(c, fresh)
    keys = ("ease", "interval_days", "reps", "lapses", "due_date")
    assert {k: a[k] for k in keys} == {k: b[k] for k in keys} and a["interval_days"] == 6
    assert (f["ease"], f["lapses"], f["reps"]) == (2.5, 0, 0)            # a new word missed: not a lapse


def test_the_morning_card_survives_export_and_import(client):
    wid = client.get("/api/words").json()["words"][0]["id"]
    client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": True})
    data = client.get("/api/export").json()
    row = next(s for s in data["srs"] if s["prev"])
    assert json.loads(row["prev"])["reps"] == 0
    with db.tx() as c:
        c.execute("DELETE FROM srs")
    client.post("/api/import", files={"file": ("p.json", json.dumps(data), "application/json")})
    client.post("/api/answer", json={"word_id": wid, "mode": "quiz", "correct": False})
    with db.tx() as c:
        assert _card(c, wid)["lapses"] == 0                                # replaced, from the imported morning card


def test_new_words_come_easiest_first(client):
    """New words are drawn from the most common words not yet practiced."""
    with db.tx() as c:
        rows = [(r["id"], r["freq_rank"]) for r in c.execute(
            "SELECT id, freq_rank FROM words WHERE freq_rank IS NOT NULL ORDER BY freq_rank")]
        ids = [i for i, _ in rows]
        if len(ids) < 120:
            return
        easiest = set(ids[:50])
        for _ in range(10):
            assert set(weighted_sample(c, list(reversed(ids)), 5)) <= easiest
        c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) "
                  "SELECT id, date('now', 'localtime', '+5 day'), 2, '2026-01-01' FROM words WHERE id IN (%s)"
                  % ",".join(map(str, ids[:50])))
        picked = weighted_sample(c, list(ids), 5)
        assert any(i in set(ids[50:100]) for i in picked)        # practiced words step aside for the next easiest


def test_progress_counts_learning_seen_and_overdue(client):
    """Learning: remembered on a later day; seen: practiced but not yet; overdue: due before today."""
    words = client.get("/api/words").json()["words"]
    once, twice, late = words[0]["id"], words[1]["id"], words[2]["id"]
    with db.tx() as c:
        for wid in (once, twice, late):
            c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) VALUES (?, date('now', 'localtime', '+3 day'), 1, date('now', 'localtime'))", (wid,))
            c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct) VALUES (?, datetime('now', 'localtime', '-2 day'), 'quiz', 2, 1)", (wid,))
        c.execute("INSERT INTO review_log(word_id, mode, grade, correct) VALUES (?, 'quiz', 2, 1)", (twice,))
        c.execute("UPDATE srs SET due_date = date('now', 'localtime', '-2 day') WHERE word_id = ?", (late,))
    w = client.get("/api/stats").json()["words"]
    assert (w["learning"], w["seen"], w["overdue"]) == (1, 2, 1)
