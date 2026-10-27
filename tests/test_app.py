"""Origin middleware, schema version, daily backups, and a minimal SRS check."""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app import db
from app.main import app


def test_foreign_origin_is_refused(client):
    for origin in ("http://evil.example", "http://localhost:3000", "https://testserver", "null"):
        r = client.patch("/api/settings", json={"autoplay": True}, headers={"Origin": origin})
        assert r.status_code == 403, origin


def test_same_origin_is_accepted(client):
    assert client.patch("/api/settings", json={"autoplay": True},
                        headers={"Origin": "http://testserver"}).status_code == 200
    assert client.patch("/api/settings", json={"autoplay": True}).status_code == 200   # no Origin: curl, scripts


def test_origin_must_match_the_port(fresh_db):
    with TestClient(app, base_url="http://localhost:8765") as c:
        ok = c.patch("/api/settings", json={"autoplay": True}, headers={"Origin": "http://localhost:8765"})
        other = c.patch("/api/settings", json={"autoplay": True}, headers={"Origin": "http://localhost:8766"})
        cross = c.patch("/api/settings", json={"autoplay": True}, headers={"Origin": "http://127.0.0.1:8765"})
    assert ok.status_code == 200 and other.status_code == 403 and cross.status_code == 403


def test_unknown_host_is_refused(client):
    assert client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400


def test_schema_version_is_set(client):
    with db.tx() as c:
        assert db.schema_version(c) == db.SCHEMA_VERSION >= 1


def test_newer_schema_is_refused(fresh_db):
    conn = sqlite3.connect(fresh_db)
    conn.execute(f"PRAGMA user_version = {db.SCHEMA_VERSION + 1}")
    conn.commit()
    conn.close()
    with db.tx() as c:
        try:
            db.migrate(c)
        except RuntimeError:
            return
    raise AssertionError("a newer schema should be refused")


def test_daily_backup(fresh_db):
    folder = fresh_db.parent / "backups"
    folder.mkdir()
    for i in range(10):
        (folder / f"2020-01-{i + 1:02d}.db").write_bytes(b"old")
    made = db.backup_daily(keep=7)
    assert made == folder / f"{date.today().isoformat()}.db"
    conn = sqlite3.connect(made)
    assert conn.execute("SELECT COUNT(*) FROM words").fetchone()[0] == 200
    conn.close()
    kept = sorted(p.name for p in folder.glob("*.db"))
    assert len(kept) == 7 and kept[-1] == made.name
    assert db.backup_daily(keep=7) is None   # once a day


def test_backup_skips_missing_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "none.db")
    assert db.backup_daily() is None


def test_srs_again_on_new_card_is_due_soon(client):
    # TODO: app/srs.py scheduling is being reworked; extend once it settles.
    from app import srs
    with db.tx() as c:
        wid = c.execute("SELECT id FROM words LIMIT 1").fetchone()["id"]
        new = srs.review(c, wid, 0)
    assert new["due_date"] in (date.today().isoformat(), (date.today() + timedelta(days=1)).isoformat())
