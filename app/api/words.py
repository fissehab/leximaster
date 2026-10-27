"""Word list, detail, user state (stars/known/notes), custom words, word of the day."""
from __future__ import annotations

import gzip
import hashlib
import json
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import db, srs
from ..common import compact_heads, compact_json, fetch_word, full, gloss_key, track_clause

router = APIRouter(prefix="/api")


# The gzipped list, kept while it is unchanged (body, gzip of body).
_gzip_memo: tuple[bytes, bytes] | None = None


def _gzipped(body: bytes) -> bytes:
    """The gzip of the body, reused while the body is unchanged."""
    global _gzip_memo
    memo = _gzip_memo
    if memo is not None and memo[0] == body:
        return memo[1]
    gz = gzip.compress(body, compresslevel=1, mtime=0)   # 40 ms for 7 MB; the app is served on this computer
    _gzip_memo = (body, gz)
    return gz


@router.get("/words")
def list_words(request: Request):
    """Every word in compact form; the client searches and sorts locally."""
    db.sync_words()
    with db.tx() as c:
        entries = compact_heads(c)   # word-derived fields, cached in the database
        user = {r["word_id"]: (r["stars"], r["known"]) for r in c.execute("SELECT word_id, stars, known FROM user_word")}
        due = {r["word_id"]: r["due_date"] for r in c.execute("SELECT word_id, due_date FROM srs")}
        lists = c.execute("SELECT list_id, word_id FROM list_words").fetchall()
    membership: dict[int, list[int]] = {}
    for r in lists:
        membership.setdefault(r["word_id"], []).append(r["list_id"])
    parts = []
    for wid, head in entries:
        stars, known = user.get(wid, (0, 0))
        d = due.get(wid)
        ls = membership.get(wid)
        parts.append(f'{head[:-1]},"stars":{compact_json(stars)},"known":{"true" if known else "false"},'
                     f'"due":{"null" if d is None else compact_json(d)},'
                     f'"lists":[{",".join(map(str, ls)) if ls else ""}]}}')
    body = ('{"words":[' + ",".join(parts) + "]}").encode("utf-8")
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        # Compressed here (and kept while unchanged) rather than by GZipMiddleware,
        # which passes a response that already has a Content-Encoding through.
        return Response(_gzipped(body), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(body, media_type="application/json")


@router.get("/words/{word_id}")
def word_detail(word_id: int):
    with db.tx() as c:
        row = fetch_word(c, word_id)
        if not row:
            raise HTTPException(404, "Word not found")
        out = full(row)
        stats = c.execute("SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM review_log "
                          "WHERE word_id=? AND mode NOT IN ('review', 'repeat')", (word_id,)).fetchone()
        out["accuracy"] = {"attempts": stats["n"], "correct": stats["ok"]}
        out["lists"] = [dict(r) for r in c.execute(
            "SELECT l.id, l.name, lw.note FROM list_words lw JOIN lists l ON l.id = lw.list_id "
            "WHERE lw.word_id=? ORDER BY l.name", (word_id,))]
        rec = c.execute("SELECT path FROM recordings WHERE word_id=?", (word_id,)).fetchone()
        out["recording_url"] = f"/api/recordings/{word_id}" if rec else None
    return out


# data/glossary.json (tools/glossary.py), read on first use and kept.
_glossary: tuple[float, dict] | None = None


@router.get("/gloss")
def gloss(w: str):
    """A short definition of a related word without its own entry: WordNet
    senses, or {"see": headword} for a form of a headword. Senses are empty
    when the glossary doesn't have the term."""
    global _glossary
    path = db.DATA / "glossary.json"
    mtime = path.stat().st_mtime if path.exists() else 0.0
    if _glossary is None or _glossary[0] != mtime:
        _glossary = (mtime, json.loads(path.read_text(encoding="utf-8")) if mtime else {})
    key = gloss_key(w)[:200]
    return _glossary[1].get(key) or {"w": key, "senses": [], "syn": []}

class StateIn(BaseModel):
    stars: int | None = Field(None, ge=0, le=5)
    known: bool | None = None
    notes: str | None = None


@router.patch("/words/{word_id}/state")
def set_state(word_id: int, body: StateIn):
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM words WHERE id=?", (word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        c.execute("INSERT OR IGNORE INTO user_word(word_id) VALUES (?)", (word_id,))
        if body.stars is not None:
            c.execute("UPDATE user_word SET stars=?, updated_at=datetime('now') WHERE word_id=?",
                      (body.stars, word_id))
            srs.on_stars_changed(c, word_id, body.stars)
        if body.known is not None:
            c.execute("UPDATE user_word SET known=?, updated_at=datetime('now') WHERE word_id=?",
                      (int(body.known), word_id))
        if body.notes is not None:
            c.execute("UPDATE user_word SET notes=?, updated_at=datetime('now') WHERE word_id=?",
                      (body.notes, word_id))
        row = c.execute("SELECT stars, known, notes FROM user_word WHERE word_id=?", (word_id,)).fetchone()
    return {"stars": row["stars"], "known": bool(row["known"]), "notes": row["notes"]}


class CustomWordIn(BaseModel):
    word: str = Field(min_length=1, max_length=80)
    pos: str = ""
    definition: str = Field(min_length=1)
    example: str = ""
    phonetic: str = ""
    notes: str = ""
    list_id: int | None = None


@router.post("/words")
def add_custom_word(body: CustomWordIn):
    key = "custom:" + body.word.strip().lower().replace(" ", "-")
    data = {
        "phonetic": body.phonetic.strip(),
        "audio": None,
        "meanings": [{"pos": body.pos.strip() or "word", "senses": [
            {"definition": body.definition.strip(), "example": body.example.strip(),
             "synonyms": [], "antonyms": []}], "synonyms": [], "antonyms": []}],
        "nuance": None,
        "source": "custom",
    }
    with db.tx() as c:
        if c.execute("SELECT 1 FROM words WHERE key=?", (key,)).fetchone():
            raise HTTPException(409, f"You already added “{body.word}”.")
        cur = c.execute("INSERT INTO words(key, word, domains, has_audio, enriched, data, is_custom) "
                        "VALUES (?, ?, '[\"custom\"]', 0, 0, ?, 1)",
                        (key, body.word.strip(), json.dumps(data, ensure_ascii=False)))
        word_id = cur.lastrowid
        if body.notes:
            c.execute("INSERT INTO user_word(word_id, notes) VALUES (?, ?)", (word_id, body.notes))
        if body.list_id:
            if not c.execute("SELECT 1 FROM lists WHERE id=?", (body.list_id,)).fetchone():
                raise HTTPException(404, "That list no longer exists.")
            c.execute("INSERT OR IGNORE INTO list_words(list_id, word_id) VALUES (?, ?)",
                      (body.list_id, word_id))
        return full(fetch_word(c, word_id))


@router.delete("/words/{word_id}")
def delete_custom_word(word_id: int):
    with db.tx() as c:
        row = c.execute("SELECT is_custom FROM words WHERE id=?", (word_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Word not found")
        if not row["is_custom"]:
            raise HTTPException(400, "Only words you added yourself can be deleted.")
        rec = c.execute("SELECT path FROM recordings WHERE word_id=?", (word_id,)).fetchone()
        c.execute("DELETE FROM words WHERE id=?", (word_id,))
    if rec:
        (db.RECORDINGS / Path(rec["path"]).name).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/wotd")
def word_of_the_day():
    """One word per day, saved so it stays put while the dataset changes.
    Chosen among words not yet known or in review, favouring rarer words from
    the GRE, literary and subject lists, and enriched words once they exist."""
    today_key = f"wotd:{date.today().isoformat()}"
    with db.tx() as c:
        saved = c.execute("SELECT value FROM meta WHERE key=?", (today_key,)).fetchone()
        if saved and c.execute("SELECT 1 FROM words WHERE id=?", (int(saved["value"]),)).fetchone():
            return full(fetch_word(c, int(saved["value"])))
        base = ("SELECT w.id FROM words w LEFT JOIN user_word u ON u.word_id = w.id "
                "LEFT JOIN srs s ON s.word_id = w.id WHERE COALESCE(u.known, 0) = 0 AND s.word_id IS NULL "
                "AND w.is_custom = 0 AND " + track_clause("core") + " ")
        ids = []
        for extra in ("AND w.enriched = 1 AND w.zipf < 3.5",
                      "AND w.zipf < 3.3 AND w.domains NOT IN ('[\"academic\"]', '[\"professional\"]')",
                      ""):
            ids = [r["id"] for r in c.execute(base + extra + " ORDER BY w.id")]
            if ids:
                break
        if not ids:
            ids = [r["id"] for r in c.execute("SELECT id FROM words ORDER BY id")]
        if not ids:
            raise HTTPException(404, "No words yet. Build the dataset first.")
        h = int(hashlib.sha256(date.today().isoformat().encode()).hexdigest(), 16)
        word_id = ids[h % len(ids)]
        c.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (today_key, str(word_id)))
        return full(fetch_word(c, word_id))
