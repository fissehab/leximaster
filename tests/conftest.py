"""Test fixtures: each test gets its own copy of a small database built from
tests/fixtures/words_sample.json (200 entries) by the app's own sync code.
Never touches data/leximaster.db."""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = Path(__file__).resolve().parent / "fixtures" / "words_sample.json"
_TMP = Path(tempfile.mkdtemp(prefix="leximaster-tests-"))

# Before the app is imported: db.py reads these at import time.
os.environ["LEXIMASTER_TESTING"] = "1"
os.environ["LEXIMASTER_DB"] = str(_TMP / "template.db")
os.environ["LEXIMASTER_WORDS"] = str(SAMPLE)
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402

assert db.DB_PATH != ROOT / "data" / "leximaster.db"


@pytest.fixture(scope="session")
def template_db() -> Path:
    db.init()
    with db.tx() as c:
        c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return db.DB_PATH


@pytest.fixture
def fresh_db(template_db, tmp_path, monkeypatch) -> Path:
    path = tmp_path / "leximaster.db"
    shutil.copy(template_db, path)
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


@pytest.fixture
def client(fresh_db):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def word_keys(client) -> list[str]:
    with db.tx() as c:
        return [r["key"] for r in c.execute("SELECT key FROM words WHERE is_custom=0 ORDER BY id")]


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP, ignore_errors=True)
