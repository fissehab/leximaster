"""Progress export/import (app/api/stats.py)."""
from __future__ import annotations

import io
import json

import pytest

from app import db


def seed_progress(keys: list[str]) -> None:
    """Some progress of every kind, written straight into the tables."""
    with db.tx() as c:
        ids = {r["key"]: r["id"] for r in c.execute("SELECT id, key FROM words")}
        for i, k in enumerate(keys[:10]):
            c.execute("INSERT INTO user_word(word_id, stars, known, notes, updated_at) VALUES (?, ?, ?, ?, ?)",
                      (ids[k], i % 6, i % 2, f"note {i}", f"2026-10-{10 + i:02d} 08:00:00"))
            c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                      "VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (ids[k], 2.5 - i * 0.05, float(i), i, i // 3, f"2026-11-{1 + i:02d}",
                       None if i == 0 else f"2026-10-{10 + i:02d}"))
            c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?, ?)",
                      (ids[k], f"2026-10-{10 + i:02d} 09:30:00", "review" if i % 2 else "quiz",
                       i % 4 if i % 2 else None, i % 2, 1000 + i))
        c.execute("INSERT INTO lists(name, created_at) VALUES ('Favourites', '2026-10-01 10:00:00')")
        lid = c.execute("SELECT id FROM lists WHERE name='Favourites'").fetchone()["id"]
        for k in keys[10:15]:
            c.execute("INSERT INTO list_words(list_id, word_id, note, added_at) VALUES (?, ?, 'x', '2026-10-02 10:00:00')",
                      (lid, ids[k]))
        c.execute("INSERT INTO words(key, word, domains, data, is_custom) VALUES (?, ?, ?, ?, 1)",
                  ("custom:zorb", "zorb", '["custom"]', json.dumps({"meanings": [], "nuance": None})))
        c.execute("INSERT INTO test_session(ts, kind, score, total, duration_s) VALUES ('2026-10-05 12:00:00', 'quiz', 8, 10, 120)")
        c.execute("INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES ('2026-10-05', 600, 20, 5)")


def upload(client, payload, raw: bytes | None = None):
    body = raw if raw is not None else json.dumps(payload).encode()
    return client.post("/api/import", files={"file": ("p.json", io.BytesIO(body), "application/json")})


def canonical(export: dict) -> dict:
    out = {k: v for k, v in export.items() if k != "exported_at"}
    for k, v in out.items():
        if isinstance(v, list):
            out[k] = sorted(v, key=lambda r: json.dumps(r, sort_keys=True))
    return out


def wipe_progress() -> None:
    with db.tx() as c:
        for t in ("user_word", "srs", "review_log", "list_words", "lists", "test_session", "daily_activity"):
            c.execute(f"DELETE FROM {t}")
        c.execute("DELETE FROM words WHERE is_custom=1")


def test_round_trip_identical(client, word_keys):
    seed_progress(word_keys)
    first = client.get("/api/export").json()
    assert first["user_word"] and first["srs"] and first["review_log"] and first["list_words"]
    wipe_progress()
    r = upload(client, first)
    assert r.status_code == 200, r.text
    assert "skipped" not in r.json()["imported"]
    second = client.get("/api/export").json()
    assert canonical(first) == canonical(second)


def test_import_is_idempotent(client, word_keys):
    seed_progress(word_keys)
    export = client.get("/api/export").json()
    wipe_progress()
    one = upload(client, export).json()["imported"]
    assert one["list entries"] == 5 and one["answers"] == 10 and one["own words"] == 1
    after_one = canonical(client.get("/api/export").json())
    two = upload(client, export).json()["imported"]
    assert canonical(client.get("/api/export").json()) == after_one
    # Nothing new the second time; the list count reports only inserted rows.
    assert two["answers"] == 0 and two["list entries"] == 0
    assert two["word states"] == 0 and two["review cards"] == 0 and two["own words"] == 0


MALFORMED = [
    pytest.param({"app": "LexiMaster", "review_log": [{"key": "K", "mode": "quiz", "correct": 1}]}, id="missing-ts"),
    pytest.param({"app": "LexiMaster", "review_log": [{"key": "K", "ts": "yesterday", "mode": "quiz", "correct": 1}]},
                 id="bad-ts"),
    pytest.param({"app": "LexiMaster", "review_log": [{"key": "K", "ts": "2026-10-01 10:00:00", "mode": "quiz",
                                                       "correct": 1, "grade": 9}]}, id="grade-out-of-range"),
    pytest.param({"app": "LexiMaster", "srs": [{"key": "K", "due_date": "2026-13-45"}]}, id="bad-due-date"),
    pytest.param({"app": "LexiMaster", "srs": [{"key": "K", "due_date": "2026-10-01", "last_reviewed": ["2026-10-01"]}]},
                 id="list-last-reviewed"),
    pytest.param({"app": "LexiMaster", "srs": [{"key": "K", "due_date": "2026-10-01", "ease": "high"}]}, id="string-ease"),
    pytest.param({"app": "LexiMaster", "srs": [{"key": "K", "due_date": "2026-10-01", "interval_days": -3}]},
                 id="negative-interval"),
    pytest.param({"app": "LexiMaster", "user_word": [{"key": "K", "stars": 3, "updated_at": 12}]}, id="numeric-updated-at"),
    pytest.param({"app": "LexiMaster", "daily_activity": [{"date": {"y": 2026}}]}, id="dict-date"),
    pytest.param({"app": "LexiMaster", "test_session": [{"ts": None, "kind": "quiz"}]}, id="null-session-ts"),
]


@pytest.mark.parametrize("payload", MALFORMED)
def test_malformed_rows_are_skipped(client, word_keys, payload):
    payload = json.loads(json.dumps(payload).replace('"K"', json.dumps(word_keys[0])))
    r = upload(client, payload)
    assert r.status_code == 200, r.text
    assert r.json()["imported"]["skipped"] == 1
    assert client.get("/api/stats").status_code == 200
    exported = client.get("/api/export").json()
    assert not exported["srs"] and not exported["review_log"] and not exported["user_word"]


@pytest.mark.parametrize("payload,raw", [
    ({"app": "SomethingElse"}, None),
    (["app", "LexiMaster"], None),
    (None, b"{not json"),
    (None, b"\xff\xfe\x00"),
])
def test_bad_files_are_400(client, payload, raw):
    r = upload(client, payload, raw)
    assert r.status_code == 400, r.text
    assert client.get("/api/stats").status_code == 200


def test_oversized_upload_is_refused(client, monkeypatch):
    from app.api import stats
    monkeypatch.setattr(stats, "MAX_IMPORT_BYTES", 100)
    r = upload(client, {"app": "LexiMaster", "padding": "x" * 200})
    assert r.status_code == 413


def test_long_notes_are_truncated(client, word_keys):
    from app.api import stats
    r = upload(client, {"app": "LexiMaster", "user_word": [
        {"key": word_keys[0], "stars": 2, "known": 0, "notes": "n" * 10_000, "updated_at": "2026-10-01 10:00:00"}]})
    assert r.status_code == 200
    notes = client.get("/api/export").json()["user_word"][0]["notes"]
    assert len(notes) == stats.MAX_NOTE_CHARS


def test_keep_newer_on_conflict(client, word_keys):
    k = word_keys[0]
    base = {"app": "LexiMaster"}
    upload(client, {**base,
                    "user_word": [{"key": k, "stars": 4, "known": 0, "notes": "new", "updated_at": "2026-10-20 10:00:00"}],
                    "srs": [{"key": k, "ease": 2.6, "interval_days": 10, "reps": 3, "lapses": 0,
                             "due_date": "2026-10-30", "last_reviewed": "2026-10-20"}]})
    # An older file must not undo newer progress.
    r = upload(client, {**base,
                        "user_word": [{"key": k, "stars": 1, "known": 0, "notes": "old",
                                       "updated_at": "2026-10-01T10:00:00Z"}],
                        "srs": [{"key": k, "ease": 2.0, "interval_days": 1, "reps": 9, "lapses": 2,
                                 "due_date": "2026-10-02", "last_reviewed": "2026-10-01"}]}).json()["imported"]
    assert r["word states"] == 0 and r["review cards"] == 0
    e = client.get("/api/export").json()
    assert e["user_word"][0]["notes"] == "new" and e["srs"][0]["reps"] == 3
    # Same review day: more reps wins.
    r = upload(client, {**base, "srs": [{"key": k, "ease": 2.7, "interval_days": 20, "reps": 4, "lapses": 0,
                                         "due_date": "2026-11-09", "last_reviewed": "2026-10-20"}]}).json()["imported"]
    assert r["review cards"] == 1
    # A newer file wins; an offset time is compared in UTC (updated_at is UTC).
    r = upload(client, {**base, "user_word": [{"key": k, "stars": 5, "known": 1, "notes": "newer",
                                               "updated_at": "2026-10-20T12:30:00+02:00"}]}).json()["imported"]
    assert r["word states"] == 1
    e = client.get("/api/export").json()
    assert e["user_word"][0] == {"key": k, "stars": 5, "known": 1, "notes": "newer",
                                 "updated_at": "2026-10-20 10:30:00"}
    assert e["srs"][0]["reps"] == 4


def test_repeat_mode_is_accepted(client, word_keys):
    r = upload(client, {"app": "LexiMaster", "review_log": [
        {"key": word_keys[0], "ts": "2026-10-01 10:00:00", "mode": "repeat", "grade": 2, "correct": 1, "ms_taken": 900}]})
    assert r.json()["imported"]["answers"] == 1


def test_recordings_round_trip(client, tmp_path, monkeypatch):
    """Your own recordings travel in an export when asked for, and an import
    adds them only where there's none (never replacing yours)."""
    import io
    import json
    from app import db
    monkeypatch.setattr(db, "RECORDINGS", tmp_path / "rec")
    wid = client.get("/api/words").json()["words"][0]["id"]
    r = client.post(f"/api/recordings/{wid}", files={"file": ("r", io.BytesIO(b"OggS-fake-audio"), "audio/ogg")})
    assert r.status_code == 200
    plain = client.get("/api/export").json()
    assert "recordings" not in plain
    full = client.get("/api/export?recordings=1").json()
    assert len(full["recordings"]) == 1 and full["recordings"][0]["type"] == "audio/ogg"
    with db.tx() as c:
        c.execute("DELETE FROM recordings")
    for f in (tmp_path / "rec").iterdir():
        f.unlink()
    res = client.post("/api/import", files={"file": ("x.json", io.BytesIO(json.dumps(full).encode()), "application/json")})
    assert res.json()["imported"]["recordings"] == 1
    assert client.get(f"/api/recordings/{wid}").content == b"OggS-fake-audio"
    again = client.post("/api/import", files={"file": ("x.json", io.BytesIO(json.dumps(full).encode()), "application/json")})
    assert again.json()["imported"]["recordings"] == 0
