"""Named custom word lists."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from .. import db
from ..common import WORD_COLUMNS, WORD_FROM, compact

router = APIRouter(prefix="/api/lists")


class ListIn(BaseModel):
    name: str = Field(max_length=60)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Give the list a name.")
        return v


def name_taken(c, name: str, except_id: int | None = None) -> bool:
    """List names are unique regardless of case."""
    row = c.execute("SELECT id FROM lists WHERE lower(name) = lower(?)", (name,)).fetchone()
    return bool(row and row["id"] != except_id)


class ListWordIn(BaseModel):
    word_id: int
    note: str = ""


class NoteIn(BaseModel):
    note: str


@router.get("")
def all_lists():
    with db.tx() as c:
        rows = c.execute("SELECT l.id, l.name, l.created_at, COUNT(lw.word_id) AS count FROM lists l "
                         "LEFT JOIN list_words lw ON lw.list_id = l.id GROUP BY l.id ORDER BY l.name").fetchall()
    return {"lists": [dict(r) for r in rows]}


@router.post("")
def create_list(body: ListIn):
    with db.tx() as c:
        if name_taken(c, body.name):
            raise HTTPException(409, f"A list called “{body.name}” already exists.")
        cur = c.execute("INSERT INTO lists(name) VALUES (?)", (body.name,))
        return {"id": cur.lastrowid, "name": body.name, "count": 0}


@router.patch("/{list_id}")
def rename_list(list_id: int, body: ListIn):
    with db.tx() as c:
        if name_taken(c, body.name, except_id=list_id):
            raise HTTPException(409, f"A list called “{body.name}” already exists.")
        if c.execute("UPDATE lists SET name=? WHERE id=?", (body.name, list_id)).rowcount == 0:
            raise HTTPException(404, "List not found")
    return {"ok": True}


@router.delete("/{list_id}")
def delete_list(list_id: int):
    with db.tx() as c:
        c.execute("DELETE FROM lists WHERE id=?", (list_id,))
    return {"ok": True}


@router.get("/{list_id}")
def list_detail(list_id: int):
    with db.tx() as c:
        lst = c.execute("SELECT id, name, created_at FROM lists WHERE id=?", (list_id,)).fetchone()
        if not lst:
            raise HTTPException(404, "List not found")
        rows = c.execute(f"SELECT {WORD_COLUMNS}, lw.note AS list_note {WORD_FROM} "
                         "JOIN list_words lw ON lw.word_id = w.id AND lw.list_id = ? "
                         "ORDER BY w.word COLLATE NOCASE", (list_id,)).fetchall()
    words = []
    for r in rows:
        item = compact(r)
        item["list_note"] = r["list_note"]
        words.append(item)
    return {**dict(lst), "words": words}


@router.post("/{list_id}/words")
def add_to_list(list_id: int, body: ListWordIn):
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM lists WHERE id=?", (list_id,)).fetchone():
            raise HTTPException(404, "List not found")
        if not c.execute("SELECT 1 FROM words WHERE id=?", (body.word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        cur = c.execute("INSERT INTO list_words(list_id, word_id, note) VALUES (?, ?, ?) "
                        "ON CONFLICT(list_id, word_id) DO NOTHING", (list_id, body.word_id, body.note))
    return {"ok": True, "added": cur.rowcount > 0}


@router.patch("/{list_id}/words/{word_id}")
def set_list_note(list_id: int, word_id: int, body: NoteIn):
    with db.tx() as c:
        c.execute("UPDATE list_words SET note=? WHERE list_id=? AND word_id=?", (body.note, list_id, word_id))
    return {"ok": True}


@router.delete("/{list_id}/words/{word_id}")
def remove_from_list(list_id: int, word_id: int):
    with db.tx() as c:
        c.execute("DELETE FROM list_words WHERE list_id=? AND word_id=?", (list_id, word_id))
    return {"ok": True}
