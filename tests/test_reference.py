"""Reference entries (related words other entries link to) are studied only when chosen."""
from __future__ import annotations

import json

from app import db
from app.api.practice import new_words
from app.common import pool_ids, track_clause


def _make_reference(c, n=3) -> list[int]:
    ids = [r["id"] for r in c.execute("SELECT id FROM words WHERE is_custom=0 AND enriched=1 ORDER BY freq_rank LIMIT ?", (n,))]
    for i in ids:
        doms = json.loads(c.execute("SELECT domains FROM words WHERE id=?", (i,)).fetchone()["domains"])
        c.execute("UPDATE words SET domains=? WHERE id=?", (json.dumps(sorted(set(doms) | {"reference"})), i))
    return ids


def test_reference_words_wait_until_chosen(client):
    with db.tx() as c:
        ref = _make_reference(c)
        shown = {r["id"] for r in new_words(c, track_clause(""), 50)}
        assert not shown & set(ref)                       # the most frequent words, yet not offered
        assert not set(pool_ids(c)) & set(ref)
        assert set(ref) <= set(pool_ids(c, domain="reference"))
        c.execute("INSERT INTO user_word(word_id, stars) VALUES (?, 2)", (ref[0],))
        assert ref[0] in {r["id"] for r in new_words(c, track_clause(""), 50)}   # starred: chosen
        assert ref[0] in pool_ids(c)


def test_linked_words_are_studied(client):
    # Related words of ordinary commonness ("linked", Zipf 1.0-5.5) are
    # studied like any other word; build_dataset ranks them after the rest.
    with db.tx() as c:
        ids = [r["id"] for r in c.execute("SELECT id FROM words WHERE is_custom=0 AND enriched=1 ORDER BY freq_rank LIMIT 3")]
        for i in ids:
            c.execute("UPDATE words SET domains=? WHERE id=?", (json.dumps(["linked"]), i))
        assert set(ids) <= {r["id"] for r in new_words(c, track_clause("core"), 500)}   # last, but offered
        assert set(ids) <= set(pool_ids(c))
