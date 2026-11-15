"""The "Words from" choices "My words" (your lists and saved words) and
"Words to refresh" (practised words due today), on both backends."""
import re
from pathlib import Path

from app import db
from app.common import MINE_SQL, REFRESH_SQL, SCOPES, pool_ids

SERVER_JS = Path(__file__).resolve().parent.parent / "static" / "js" / "local" / "server.js"


def _ids(c):
    return [r["id"] for r in c.execute("SELECT id FROM words WHERE is_custom=0 ORDER BY id")]


def test_my_words_are_your_lists_and_saved_words(client):
    with db.tx() as c:
        ids = _ids(c)
        listed, saved, known_saved, practised = ids[10], ids[20], ids[30], ids[40]
        c.execute("INSERT INTO lists(name) VALUES ('mine')")
        lid = c.execute("SELECT id FROM lists WHERE name='mine'").fetchone()["id"]
        c.execute("INSERT INTO list_words(list_id, word_id) VALUES (?, ?)", (lid, listed))
        c.execute("INSERT INTO user_word(word_id, stars) VALUES (?, 4)", (saved,))
        c.execute("INSERT INTO user_word(word_id, stars, known) VALUES (?, 3, 1)", (known_saved,))
        c.execute("INSERT INTO srs(word_id, due_date, reps, last_reviewed) "
                  "VALUES (?, date('now', 'localtime', '-1 day'), 2, date('now', 'localtime', '-3 day'))", (practised,))
        assert set(pool_ids(c, domain="mine", exclude_known=True)) == {listed, saved}
        assert set(pool_ids(c, domain="refresh", exclude_known=True)) == {practised}
    cards = client.get("/api/flashcards", params={"domain": "mine"}).json()["cards"]
    assert {w["id"] for w in cards} == {listed, saved}


def test_my_words_with_nothing_chosen_is_empty(client):
    with db.tx() as c:
        assert pool_ids(c, domain="mine") == []
    assert client.get("/api/refresh").json() == {"count": 0}


def _js_const(js: str, name: str) -> str:
    m = re.search(rf'const {name} = ((?:"[^"]*"\s*\+?\s*)+);', js)
    assert m, f"{name} not found in server.js"
    return "".join(re.findall(r'"([^"]*)"', m.group(1)))


def test_website_uses_the_same_rules():
    """static/js/local/server.js copies app/common.py's MINE_SQL and REFRESH_SQL."""
    js = SERVER_JS.read_text(encoding="utf-8")
    assert _js_const(js, "MINE_SQL") == MINE_SQL
    assert _js_const(js, "REFRESH_SQL") == REFRESH_SQL
    assert "mine" in SCOPES and "refresh" in SCOPES and '"mine", "refresh"]' in js
