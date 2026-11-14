"""Daily review scope "My words": your lists, your ratings and your reviews."""
import re
from pathlib import Path

from app import db
from app.common import MINE_SQL, SCOPES, pool_ids

SERVER_JS = Path(__file__).resolve().parent.parent / "static" / "js" / "local" / "server.js"


def _ids(c):
    return [r["id"] for r in c.execute("SELECT id FROM words WHERE is_custom=0 ORDER BY id")]


def test_my_words_review_takes_new_words_only_from_lists_and_ratings(client):
    client.patch("/api/settings", json={"word_levels": "1,2,3,4,5"})
    with db.tx() as c:
        ids = _ids(c)
        listed, rated, known_rated, studied, other = ids[10], ids[20], ids[30], ids[40], ids[50]
        c.execute("INSERT INTO lists(name) VALUES ('mine')")
        lid = c.execute("SELECT id FROM lists WHERE name='mine'").fetchone()["id"]
        c.execute("INSERT INTO list_words(list_id, word_id) VALUES (?, ?)", (lid, listed))
        c.execute("INSERT INTO user_word(word_id, stars) VALUES (?, 4)", (rated,))
        c.execute("INSERT INTO user_word(word_id, stars, known) VALUES (?, 3, 1)", (known_rated,))
        c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) "
                  "VALUES (?, date('now', '-1 day'), 2, date('now', '-3 day'))", (studied,))
    q = client.get("/api/review/queue", params={"track": "mine", "extra": 30}).json()["queue"]
    got = {w["id"]: w["is_new"] for w in q}
    assert got == {listed: True, rated: True, studied: False}, got     # not the known word, nothing else
    assert other not in got
    count = client.get("/api/review/queue", params={"track": "mine", "count": 1, "extra": 30}).json()
    assert (count["new"], count["due"]) == (2, 1)
    # Practice tabs with the same scope drill the same words (known ones left out).
    with db.tx() as c:
        assert set(pool_ids(c, domain="mine", exclude_known=True)) == {listed, rated, studied}


def test_my_words_with_nothing_chosen_is_empty(client):
    q = client.get("/api/review/queue", params={"track": "mine", "extra": 30}).json()
    assert q["queue"] == []


def test_website_uses_the_same_my_words_rule():
    """static/js/local/server.js copies app/common.py's MINE_SQL."""
    js = SERVER_JS.read_text(encoding="utf-8")
    m = re.search(r'const MINE_SQL = ((?:"[^"]*"\s*\+?\s*)+);', js)
    assert m, "MINE_SQL not found in server.js"
    assert "".join(re.findall(r'"([^"]*)"', m.group(1))) == MINE_SQL
    assert "mine" in SCOPES and '"mine"]' in js
