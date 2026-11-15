"""Word levels: which words practice draws from (setting "word_levels")."""
from __future__ import annotations

import json

from app import db
from app.common import level_clause, parse_levels, pool_ids
from build_dataset import word_level


def test_word_level_from_commonness():
    w = lambda word, zipf, domains=(): {"word": word, "zipf": zipf, "domains": list(domains)}
    assert word_level(w("believe", 5.4)) == 1
    assert word_level(w("schedule", 4.5)) == 2
    assert word_level(w("receipt", 4.0)) == 3
    assert word_level(w("avid", 3.0)) == 4
    assert word_level(w("loquacity", 1.2)) == 5
    assert word_level(w("abnegate", 0)) == 5

def test_a_phrase_ranks_by_its_frequency_in_books(monkeypatch):
    """A phrase found in American books (tools/phrase_freq.py) ranks by that,
    raised a little (PHRASE_BOOST); any other a step below its rarest word,
    with no extra level for idioms ("figure out" isn't Uncommon)."""
    import build_dataset as b
    w = lambda word, domains=(): {"word": word, "zipf": 0, "domains": list(domains)}
    monkeypatch.setattr(b, "phrase_freqs", lambda: {"figure out": 1.7e-5, "be that as it may": 6e-7})
    assert word_level(w("figure out", ["phrasal_verbs"])) == 1          # 4.2 + 0.8
    assert word_level(w("be that as it may", ["idioms"])) == 4          # 2.8 + 0.8
    monkeypatch.setattr(b, "phrase_freqs", lambda: {})
    assert word_level(w("go back on", ["phrasal_verbs"])) <= 2           # its words, a step lower


def test_parse_levels_and_clause():
    assert parse_levels("3,1") == [1, 3]
    assert parse_levels("") == parse_levels("0,6") == parse_levels("x") == [1, 2, 3, 4, 5]
    assert level_clause("1,2,3,4,5") == "1=1"
    assert "w.level IN (1,2)" in level_clause("2,1")


def _set_levels(c, by_id: dict[int, int]) -> None:
    c.executemany("UPDATE words SET level=? WHERE id=?", [(lv, i) for i, lv in by_id.items()])


def test_practice_follows_levels(client):
    with db.tx() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM words WHERE is_custom=0 ORDER BY id")]
        _set_levels(c, {i: 1 + n % 5 for n, i in enumerate(ids)})
    assert client.patch("/api/settings", json={"word_levels": "2,1"}).json()["word_levels"] == "1,2"
    with db.tx() as c:
        lv = {r["id"]: r["level"] for r in c.execute("SELECT id, level FROM words")}
        assert all(lv[i] in (1, 2) for i in pool_ids(c))
        five = next(i for i in ids if lv[i] == 5)
        assert five not in pool_ids(c)
        c.execute("INSERT INTO user_word(word_id, stars) VALUES (?, 2)", (five,))
        assert five in pool_ids(c)                                           # saved: chosen


def test_level_settings(client):
    with db.tx() as c:
        c.execute("UPDATE words SET level = 5")
        first = c.execute("SELECT id FROM words WHERE is_custom=0 ORDER BY id LIMIT 1").fetchone()["id"]
        c.execute("UPDATE words SET level = 1 WHERE id = ?", (first,))
    client.patch("/api/settings", json={"word_levels": "1"})
    for bad in ("", "0", "6", "1-3", "x"):
        assert client.patch("/api/settings", json={"word_levels": bad}).status_code == 400
    wotd = client.get("/api/wotd").json()
    assert wotd["level"] == 1 or wotd["is_custom"]


def test_levels_round_trip_export(client):
    client.patch("/api/settings", json={"word_levels": "3,4,5"})
    data = client.get("/api/export").json()
    assert data["settings"]["word_levels"] == "3,4,5"
    client.patch("/api/settings", json={"word_levels": "1,2,3,4,5"})
    data["settings"]["word_levels"] = "9"
    client.post("/api/import", files={"file": ("p.json", json.dumps(data), "application/json")})
    assert client.get("/api/settings").json()["word_levels"] == "1,2,3,4,5"       # invalid: dropped


def test_word_of_the_day_follows_the_study_focus(client):
    """Everyday English or the Bible as the focus: the word of the day comes from it."""
    every = client.get("/api/wotd").json()
    day = client.get("/api/wotd", params={"track": "everyday"}).json()
    from app.common import EVERYDAY_DOMAINS
    assert set(day["domains"]) & set(EVERYDAY_DOMAINS)
    assert client.get("/api/wotd", params={"track": "everyday"}).json()["id"] == day["id"]   # kept for the day
    assert every["id"] == client.get("/api/wotd", params={"track": "nonsense"}).json()["id"]


def test_default_levels_agree_everywhere():
    """A new learner's levels are written in five places; they must match."""
    import re
    from pathlib import Path
    from app.common import DEFAULT_LEVELS, levels_setting
    root = Path(__file__).resolve().parent.parent
    assert db.DEFAULT_SETTINGS["word_levels"] == DEFAULT_LEVELS == "2,3,4"
    js = {f: (root / "static/js" / f).read_text(encoding="utf-8") for f in ("state.js", "ui.js", "local/server.js")}
    assert f'word_levels: "{DEFAULT_LEVELS}"' in js["state.js"]
    assert f'settings.word_levels || "{DEFAULT_LEVELS}"' in js["ui.js"]
    assert f'word_levels: "{DEFAULT_LEVELS}"' in js["local/server.js"]
    assert f'const DEFAULT_LEVELS = "{DEFAULT_LEVELS}"' in js["local/server.js"]
    with db.tx() as c:
        c.execute("DELETE FROM settings WHERE key = 'word_levels'")
        assert levels_setting(c) == DEFAULT_LEVELS
    # The level picker's examples are at the level they illustrate.
    from wordfreq import zipf_frequency
    rows = re.findall(r'\[(\d), "[^"]+", "([^"]+)"\]', js["ui.js"])
    assert len(rows) == 5
    for n, words in rows:
        for x in words.split(", "):
            assert word_level({"word": x, "zipf": zipf_frequency(x, "en"), "domains": []}) == int(n), x


def test_old_default_levels_move_to_the_new_default(fresh_db):
    """Migration 4: the all-levels default stored before 2026-10-29 becomes
    2-4; any other choice is kept."""
    for stored, after in (("1,2,3,4,5", "2,3,4"), ("3,4,5", "3,4,5"), ("1,2", "1,2")):
        with db.tx() as c:
            c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('word_levels', ?)", (stored,))
            c.execute("PRAGMA user_version = 3")
            db.migrate(c)
            assert c.execute("SELECT value FROM settings WHERE key = 'word_levels'").fetchone()[0] == after
            assert db.schema_version(c) == db.SCHEMA_VERSION
