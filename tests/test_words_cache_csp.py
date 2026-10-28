"""GET /api/words served from the words_compact cache, the Content-Security-Policy
header and the website's CSP / sql.js checks (tools/build_site.py)."""
from __future__ import annotations

import base64
import hashlib
import json
import re
import shutil
import sqlite3
import time

from fastapi.testclient import TestClient

from app import common, db
from app.main import STATIC, app, content_security_policy, inline_script_hashes
from tests.test_import_export import seed_progress


def reference_list(c: sqlite3.Connection) -> list[dict]:
    """The word list as the endpoint built it before the cache: compact() on
    every row, with each word's lists."""
    rows = c.execute(f"SELECT {common.WORD_COLUMNS} {common.WORD_FROM} "
                     "ORDER BY w.word COLLATE NOCASE, w.id").fetchall()
    membership: dict[int, list[int]] = {}
    for r in c.execute("SELECT list_id, word_id FROM list_words"):
        membership.setdefault(r["word_id"], []).append(r["list_id"])
    return [{**common.compact(r), "lists": membership.get(r["id"], [])} for r in rows]


def words(client) -> list[dict]:
    r = client.get("/api/words")
    assert r.status_code == 200 and r.headers["content-type"] == "application/json"
    return r.json()["words"]


def test_word_list_matches_compact(client, word_keys):
    seed_progress(word_keys)
    client.post("/api/words", json={"word": "Zyzzyva test", "pos": "noun", "definition": "a weevil",
                                    "phonetic": "/ˈzɪzɪvə/", "notes": "ünïcode"})
    got = words(client)
    with db.tx() as c:
        want = reference_list(c)
    assert got == want
    assert any(w["stars"] for w in got) and any(w["known"] for w in got)
    assert any(w["due"] for w in got) and any(w["lists"] for w in got) and any(w["is_custom"] for w in got)


def test_body_is_what_jsonresponse_would_send(client, word_keys):
    seed_progress(word_keys)
    r = client.get("/api/words", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in r.headers
    with db.tx() as c:
        want = json.dumps({"words": reference_list(c)}, ensure_ascii=False, allow_nan=False,
                          separators=(",", ":")).encode()
    assert r.content == want
    gz = client.get("/api/words", headers={"Accept-Encoding": "gzip"})
    assert gz.headers["content-encoding"] == "gzip" and gz.content == want   # httpx decompresses


def test_cache_follows_word_changes(client, word_keys):
    words(client)
    with db.tx() as c:
        assert c.execute("SELECT COUNT(*) FROM words_compact").fetchone()[0] == 200
        wid = c.execute("SELECT id FROM words WHERE key=?", (word_keys[0],)).fetchone()["id"]
        data = json.loads(c.execute("SELECT data FROM words WHERE id=?", (wid,)).fetchone()["data"])
        data["phonetic"] = "/changed/"
        c.execute("UPDATE words SET data=? WHERE id=?", (json.dumps(data), wid))   # as a sync would
        assert c.execute("SELECT COUNT(*) FROM words_compact").fetchone()[0] == 199
    assert next(w for w in words(client) if w["id"] == wid)["phonetic"] == "/changed/"
    added = client.post("/api/words", json={"word": "fresh", "definition": "new"}).json()
    assert any(w["id"] == added["id"] for w in words(client))
    client.delete(f"/api/words/{added['id']}")
    assert not any(w["id"] == added["id"] for w in words(client))
    with db.tx() as c:
        assert c.execute("SELECT COUNT(*) FROM words_compact").fetchone()[0] == 200


def test_cached_list_does_not_parse_word_data(client, monkeypatch):
    first = words(client)

    def boom(*a, **k):
        raise AssertionError("compact_word called for a cached word")
    monkeypatch.setattr(common, "compact_word", boom)
    client.patch(f"/api/words/{first[0]['id']}/state", json={"stars": 4, "known": True})
    again = words(client)
    assert again[0]["stars"] == 4 and again[0]["known"] is True
    user = ("stars", "known", "due")
    assert [{k: v for k, v in w.items() if k not in user} for w in again] == \
           [{k: v for k, v in w.items() if k not in user} for w in first]


def test_changed_compact_code_empties_cache(client, monkeypatch):
    before = words(client)
    with db.tx() as c:
        c.execute("UPDATE words_compact SET body = '{\"stale\":1}'")
    monkeypatch.setattr(common, "_compact_code", "different")
    assert words(client) == before


def test_migration_from_version_1(fresh_db):
    conn = sqlite3.connect(fresh_db)
    for t in ("words_compact_ins", "words_compact_upd", "words_compact_del"):
        conn.execute(f"DROP TRIGGER {t}")
    conn.execute("DROP TABLE words_compact")
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    conn.close()
    with TestClient(app) as c:
        got = words(c)
    with db.tx() as c:
        assert db.schema_version(c) == db.SCHEMA_VERSION
        assert c.execute("SELECT COUNT(*) FROM words_compact").fetchone()[0] == 200   # backfilled at startup
        assert len(c.execute("SELECT name FROM sqlite_master WHERE type='trigger' "
                             "AND name LIKE 'words_compact_%'").fetchall()) == 3
        assert got == reference_list(c)


def test_word_list_is_quick(client):
    words(client)
    t = time.perf_counter()
    for _ in range(5):
        words(client)
    assert (time.perf_counter() - t) / 5 < 0.25   # 200 words; the real 16k list takes ~85 ms


# ------------------------------------------------------------------------ CSP
def sha(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode()).digest()).decode() + "'"


def test_index_has_csp_header(client):
    r = client.get("/")
    csp = r.headers["content-security-policy"]
    page = (STATIC / "index.html").read_text(encoding="utf-8")
    scripts = re.findall(r"<script>(.*?)</script>", page, re.S)
    assert scripts and all(sha(s) in csp for s in scripts)
    for d in ("default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
              "media-src 'self' blob: data:"):
        assert d in csp
    assert "unsafe-eval" not in csp and "'unsafe-inline'" not in csp.split("style-src")[0]
    assert "content-security-policy" not in client.get("/api/health").headers


def test_inline_script_hashes():
    page = '<script>a()</script><script type="module" src="x.js"></script><script nonce="n">\n b() </script>'
    assert inline_script_hashes(page) == [sha("a()"), sha("\n b() ")]
    meta = content_security_policy([sha("a()")], header=False, wasm=True)
    assert "frame-ancestors" not in meta and "'wasm-unsafe-eval'" in meta and sha("a()") in meta


def test_sqljs_integrity_check(tmp_path):
    from tools import build_site
    assert build_site.check_sqljs() == []
    for name in build_site.SQLJS["sha256"]:
        shutil.copy(STATIC / "vendor" / name, tmp_path / name)
    (tmp_path / "sql-wasm.js").write_bytes(b"// tampered\n" + (tmp_path / "sql-wasm.js").read_bytes())
    problems = build_site.check_sqljs(tmp_path)
    assert len(problems) == 1 and "sql-wasm.js" in problems[0] and build_site.SQLJS["version"] in problems[0]


def test_credits_csp_allows_only_its_inline_code():
    from tools import build_site
    page = "<script>x()</script><style>p{}</style>"
    csp = build_site.credits_csp(page)
    assert sha("x()") in csp and sha("p{}") in csp and "unsafe-inline" not in csp


def test_migration_adds_word_levels(fresh_db):
    conn = sqlite3.connect(fresh_db)
    conn.execute("DROP TRIGGER words_compact_upd")
    conn.execute("ALTER TABLE words DROP COLUMN level")
    conn.execute("PRAGMA user_version = 2")
    conn.commit()
    conn.close()
    with TestClient(app) as c:
        words(c)
    with db.tx() as c:
        assert db.schema_version(c) == db.SCHEMA_VERSION
        assert "level" in {r[1] for r in c.execute("PRAGMA table_info(words)")}
        trigger = c.execute("SELECT sql FROM sqlite_master WHERE name='words_compact_upd'").fetchone()[0]
        assert "OLD.level" in trigger
