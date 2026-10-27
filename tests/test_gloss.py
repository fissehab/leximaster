"""Short definitions of related words without an entry (/api/gloss)."""
from __future__ import annotations

import json

from app import db
from app.api import words
from app.common import gloss_key, gloss_shard
from tools.glossary import base_forms


def test_gloss_key_matches_what_the_app_shows():
    assert gloss_key("Posterior (adjective)") == "posterior"
    assert gloss_key("job (noun, everyday work)") == "job"
    assert gloss_key("  It’s   fine ") == "it's fine"
    # The website (static/js/local/server.js glossShard) uses the same FNV-1a.
    assert [gloss_shard(k) for k in ("posterior", "hold a grudge", "naïve", "it's fine")] == [6, 5, 11, 14]


def test_base_forms():
    assert "bubble" in base_forms("bubbles")
    assert "stop" in base_forms("stopped")
    assert "run away" in base_forms("running away")
    assert base_forms("to abide")[0] == "abide"


def test_gloss_endpoint(client, tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DATA", tmp_path)
    monkeypatch.setattr(words, "_glossary", None)
    # No glossary file: an empty answer, not an error.
    r = client.get("/api/gloss", params={"w": "normal"})
    assert r.status_code == 200 and r.json()["senses"] == []
    (tmp_path / "glossary.json").write_text(json.dumps({
        "normal": {"w": "normal", "senses": [["adjective", "conforming with a norm", ""]], "syn": []},
        "kings": {"see": "king"},
    }))
    assert client.get("/api/gloss", params={"w": "Normal"}).json()["senses"][0][0] == "adjective"
    assert client.get("/api/gloss", params={"w": "kings (noun)"}).json() == {"see": "king"}
    assert client.get("/api/gloss", params={"w": "zzz"}).json() == {"w": "zzz", "senses": [], "syn": []}
