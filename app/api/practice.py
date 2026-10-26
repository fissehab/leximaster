"""Daily review queue, quizzes, matching, listening, flashcards and recordings."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import db, srs
from ..common import (EVERYDAY_DOMAINS, WORD_COLUMNS, WORD_FROM, blank_sentence, bump_activity, compact,
                      track_clause,
                      core_definition, examples_for, fetch_word, full, pool_ids, today_iso,
                      weighted_sample)

router = APIRouter(prefix="/api")

NEW_CARD_SECONDS = 35      # first look at a word: read, listen, rate
DEFAULT_REVIEW_SECONDS = 14


def parse_filters(stars: str | None, list_id: int | None, domain: str | None) -> dict:
    """Practice filters shared by every game. Words marked known are left out."""
    star_list = [int(s) for s in stars.split(",") if s.strip().isdigit()] if stars else None
    return {"stars": star_list, "list_id": list_id or None, "domain": domain or None,
            "exclude_known": True}


# ------------------------------------------------------------------ daily review

def avg_review_seconds(c) -> float:
    row = c.execute("SELECT AVG(ms_taken) AS ms FROM (SELECT ms_taken FROM review_log "
                    "WHERE mode='review' AND ms_taken BETWEEN 1000 AND 120000 "
                    "ORDER BY id DESC LIMIT 200)").fetchone()
    return (row["ms"] / 1000.0 + 3) if row and row["ms"] else DEFAULT_REVIEW_SECONDS


def new_words(c, clause: str, n: int) -> list:
    """Unseen words for today's session: low-star words first (you flagged
    them as unfamiliar), then unrated words, most frequent first (everyday
    entries in a fixed mixed order).
    Words with notes or examples to study come before bare dictionary words."""
    if n <= 0:
        return []
    # Everyday entries are all common, so frequency would serve "is this"
    # and "like" first; a fixed shuffle mixes the situations instead.
    then = "(w.id * 7919) % 10007" if clause == track_clause("everyday") else "w.freq_rank"
    order = ("ORDER BY CASE WHEN COALESCE(u.stars,0) BETWEEN 1 AND 2 THEN 0 "
             f"WHEN COALESCE(u.stars,0) = 0 THEN 1 ELSE 2 END, {then} ASC LIMIT ?")
    base = f"SELECT {WORD_COLUMNS} {WORD_FROM} WHERE s.word_id IS NULL AND COALESCE(u.known, 0) = 0 AND {clause} "
    rows = c.execute(base + "AND (w.enriched = 1 OR w.is_custom = 1 "
                     "OR json_array_length(json_extract(w.data, '$.conversation')) > 0) " + order,
                     (n,)).fetchall()
    if not rows:  # nothing enriched yet: any word
        rows = c.execute(base + order, (n,)).fetchall()
    return rows


@router.get("/review/queue")
def review_queue(extra: int = 0, track: str = ""):
    """Today's session: due cards (most overdue, lowest stars first) plus new
    words, sized to the target session length. `extra` adds more new words
    after the day's queue is done. `track` limits the session to everyday
    English ("everyday") or the advanced and subject words ("core")."""
    tr = track_clause(track)
    with db.tx() as c:
        st = db.settings(c)
        budget = int(st["session_minutes"]) * 60
        per_review = avg_review_seconds(c)
        act = c.execute("SELECT reviews, new_words, seconds FROM daily_activity WHERE date=?",
                        (today_iso(),)).fetchone()
        done_reviews = act["reviews"] if act else 0
        done_new = act["new_words"] if act else 0
        due = c.execute(
            f"SELECT {WORD_COLUMNS} {WORD_FROM} WHERE s.due_date <= ? AND COALESCE(u.known, 0) = 0 AND {tr} "
            "ORDER BY s.due_date ASC, COALESCE(u.stars, 0) ASC, s.ease ASC", (today_iso(),)).fetchall()
        used = 0.0
        queue = []
        for r in due:
            if used + per_review > budget and queue:
                break
            # A card created by a quiz miss but never reviewed is still a new word.
            queue.append({**full(r), "is_new": r["reps"] == 0 and r["last_reviewed"] is None})
            used += per_review
        remaining = max(0.0, budget - used)
        new_cap = max(0, int(st["new_per_day"]) - done_new) + max(0, extra)
        n_new = min(new_cap, int(remaining // NEW_CARD_SECONDS) + max(0, extra))
        if n_new > 0:
            if track:
                new_rows = new_words(c, tr, n_new)
            else:
                # Both tracks: alternate, or the far more frequent everyday
                # words would crowd out the advanced ones.
                a = new_words(c, track_clause("everyday"), (n_new + 1) // 2)
                b = new_words(c, track_clause("core"), n_new)
                new_rows = [r for pair in zip(a, b) for r in pair] + a[len(b):] + b[len(a):]
                new_rows = new_rows[:n_new]
            queue += [{**full(r), "is_new": True} for r in new_rows]
        return {
            "queue": queue,
            "due_total": len(due),
            "done_today": {"reviews": done_reviews, "new": done_new,
                           "seconds": act["seconds"] if act else 0},
            "target_seconds": budget,
            "est_seconds": round(used + n_new * NEW_CARD_SECONDS) if queue else 0,
        }


class ReviewIn(BaseModel):
    grade: int = Field(ge=0, le=3)
    ms: int = 0
    is_new: bool = False
    repeat: bool = False   # a second pass after "Again" in the same session


@router.post("/review/{word_id}")
def submit_review(word_id: int, body: ReviewIn):
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM words WHERE id=?", (word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        if body.repeat:
            # The card was already rescheduled by its first grade today; a
            # re-pass is practice, so it's logged without touching the schedule.
            new = srs.get_card(c, word_id) or {}
        else:
            new = srs.review(c, word_id, body.grade)
        c.execute("INSERT INTO review_log(word_id, mode, grade, correct, ms_taken) VALUES (?, 'review', ?, ?, ?)",
                  (word_id, body.grade, int(body.grade >= 1), body.ms))
        bump_activity(c, reviews=1, new_words=int(body.is_new and not body.repeat))
    return new


# ----------------------------------------------------------------- answers & log

class AnswerIn(BaseModel):
    word_id: int
    mode: str = Field(pattern=r"^(quiz|match|listen|spell|flash)$")
    correct: bool
    ms: int = 0


@router.post("/answer")
def record_answer(body: AnswerIn):
    """Every practice answer is logged; misses go back into the review queue."""
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM words WHERE id=?", (body.word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        c.execute("INSERT INTO review_log(word_id, mode, correct, ms_taken) VALUES (?, ?, ?, ?)",
                  (body.word_id, body.mode, int(body.correct), body.ms))
        if not body.correct:
            misses_today = c.execute(
                "SELECT COUNT(*) AS n FROM review_log WHERE word_id=? AND correct=0 AND mode != 'review' "
                "AND date(ts) = date('now', 'localtime')", (body.word_id,)).fetchone()["n"]
            srs.penalise_miss(c, body.word_id, first_miss_today=misses_today <= 1)
    return {"ok": True}


class SessionIn(BaseModel):
    kind: str = Field(max_length=40)
    score: int
    total: int
    duration_s: int = 0


@router.post("/sessions")
def record_session(body: SessionIn):
    with db.tx() as c:
        c.execute("INSERT INTO test_session(kind, score, total, duration_s) VALUES (?, ?, ?, ?)",
                  (body.kind, body.score, body.total, body.duration_s))
    return {"ok": True}


class ActivityIn(BaseModel):
    seconds: int = Field(ge=0, le=600)


@router.post("/activity")
def add_activity(body: ActivityIn):
    with db.tx() as c:
        bump_activity(c, seconds=body.seconds)
    return {"ok": True}


# ------------------------------------------------------------------- flashcards

@router.get("/flashcards")
def flashcards(stars: str | None = None, list_id: int | None = None, domain: str | None = None,
               n: int = Query(30, ge=1, le=500), shuffle: bool = True):
    with db.tx() as c:
        ids = pool_ids(c, **parse_filters(stars, list_id, domain))
        if shuffle:
            ids = weighted_sample(c, ids, n)
        else:
            ids = ids[:n]
        return {"cards": [full(fetch_word(c, i)) for i in ids], "pool": len(pool_ids(c, **parse_filters(stars, list_id, domain)))}


# ------------------------------------------------------------------------- quiz

QUIZ_TYPES = ("word_meaning", "meaning_word", "fill_blank", "synonym", "antonym")
NAME_KINDS = {"person": "A person", "place": "A place", "people": "A people or nation"}


def _defs_by_id(c, ids: list[int]) -> dict[int, tuple[str, str, str]]:
    if not ids:
        return {}
    rows = c.execute(f"SELECT id, word, data FROM words WHERE id IN ({','.join('?' * len(ids))})", ids)
    out = {}
    for r in rows:
        pos, d = core_definition(json.loads(r["data"]))
        if d:
            out[r["id"]] = (r["word"], pos, d)
    return out


def _mask(word: str, text: str) -> str:
    """Hide the headword inside a definition so it doesn't give itself away."""
    return re.sub(re.escape(word), "…", text, flags=re.I)


@router.get("/quiz")
def make_quiz(types: str = "word_meaning,meaning_word,fill_blank,synonym,antonym",
              n: int = Query(10, ge=1, le=50), stars: str | None = None,
              list_id: int | None = None, domain: str | None = None):
    wanted = [t for t in types.split(",") if t in QUIZ_TYPES] or list(QUIZ_TYPES)
    with db.tx() as c:
        pool = pool_ids(c, **parse_filters(stars, list_id, domain))
        if len(pool) < 4:
            raise HTTPException(400, "Not enough words match these filters. Choose a wider set.")
        all_ids = [r["id"] for r in c.execute("SELECT id FROM words WHERE enriched = 1 OR is_custom = 1")]
        if len(all_ids) < 50:  # dataset not enriched yet: draw distractors from every word
            all_ids = [r["id"] for r in c.execute("SELECT id FROM words")]
        candidates = weighted_sample(c, list(pool), min(len(pool), n * 4))
        questions = []
        for wid in candidates:
            if len(questions) >= n:
                break
            row = fetch_word(c, wid)
            data = json.loads(row["data"])
            pos, definition = core_definition(data)
            word = row["word"]
            nuance = data.get("nuance") or {}
            qtype = random.choice(wanted)
            name_kind = data.get("name_kind") or ""
            if name_kind:
                # A Bible name: "Who or what is it?", then person, place or people.
                qtype = random.choice(["name_kind", "word_meaning"])
            everyday = [d for d in json.loads(row["domains"] or "[]") if d in EVERYDAY_DOMAINS]
            if name_kind:
                everyday = ["bible_names"]  # names are told apart from other names
            if everyday:
                # Everyday entries compete with their own kind: phrasal verbs
                # with phrasal verbs, restaurant phrases with restaurant phrases.
                distract_ids = [r["id"] for r in c.execute(
                    "SELECT id FROM words w WHERE id != ? AND EXISTS (SELECT 1 FROM json_each(w.domains) "
                    f"WHERE json_each.value IN ({','.join('?' * len(everyday))})) ORDER BY random() LIMIT 30",
                    (wid, *everyday))]
            else:
                distract_ids = random.sample([i for i in all_ids if i != wid], k=min(30, len(all_ids) - 1))
            dmap = _defs_by_id(c, distract_ids)
            # Same shape first (number of words, then part of speech): a
            # sentence among single words would give the answer away.
            n_words = len(word.split())
            others = sorted((v for v in dmap.values() if v[0].lower() != word.lower()),
                            key=lambda v: (len(v[0].split()) != n_words, v[1] != pos))
            q = None
            if qtype == "name_kind":
                q = {"prompt": word, "ask": f"Who or what is {word}?", "answer": NAME_KINDS[name_kind],
                     "options": list(NAME_KINDS.values())}
            elif qtype == "word_meaning" and name_kind and definition and len(others) >= 3:
                opts = [_mask(o[0], o[2]) for o in others[:3]] + [_mask(word, definition)]
                q = {"prompt": word, "ask": f"Who or what is {word}?", "answer": _mask(word, definition),
                     "options": opts}
            elif qtype == "word_meaning" and definition and len(others) >= 3:
                opts = [_mask(o[0], o[2]) for o in others[:3]] + [_mask(word, definition)]
                q = {"prompt": word, "ask": "What does this word mean?", "answer": _mask(word, definition),
                     "options": opts}
            elif qtype == "meaning_word" and definition and len(others) >= 3:
                opts = [o[0] for o in others[:3]] + [word]
                q = {"prompt": _mask(word, definition), "ask": "Which word fits this meaning?",
                     "answer": word, "options": opts}
            elif qtype == "fill_blank":
                sentences = [s for s in (blank_sentence(word, e) for e in examples_for(data)) if s]
                if sentences and len(others) >= 3:
                    opts = [o[0] for o in others[:3]] + [word]
                    q = {"prompt": random.choice(sentences), "ask": "Fill in the blank.",
                         "answer": word, "options": opts}
            elif qtype in ("synonym", "antonym"):
                if qtype == "synonym":
                    rights = [d["vs"] for d in nuance.get("distinctions") or [] if d.get("vs")]
                    rights += data.get("synonyms") or []
                    for m in data.get("meanings") or []:
                        rights += m.get("synonyms") or []
                else:
                    rights = list(nuance.get("antonyms") or []) + list(data.get("antonyms") or [])
                    for m in data.get("meanings") or []:
                        rights += m.get("antonyms") or []
                rights = [r for r in dict.fromkeys(rights) if r and r.lower() != word.lower()]
                wrongs = [o[0] for o in others if o[0] not in rights]
                if rights and len(wrongs) >= 3:
                    right = random.choice(rights)
                    q = {"prompt": word,
                         "ask": f"Which is closest in meaning to “{word}”?" if qtype == "synonym"
                         else f"Which is opposite in meaning to “{word}”?",
                         "answer": right, "options": wrongs[:3] + [right]}
            if q is None:  # fall back to the simplest question this word supports
                if not definition or len(others) < 3:
                    continue
                qtype = "word_meaning"
                opts = [_mask(o[0], o[2]) for o in others[:3]] + [_mask(word, definition)]
                q = {"prompt": word, "ask": "What does this word mean?", "answer": _mask(word, definition),
                     "options": opts}
            random.shuffle(q["options"])
            q.update({"type": qtype, "word_id": wid, "word": word, "definition": definition,
                      "phonetic": data.get("phonetic") or "", "audio_url": full(row)["audio_url"]})
            questions.append(q)
        return {"questions": questions}


# --------------------------------------------------------------------- matching

@router.get("/matching")
def matching(kind: str = "meaning", n: int = Query(6, ge=3, le=10), stars: str | None = None,
             list_id: int | None = None, domain: str | None = None):
    with db.tx() as c:
        pool = pool_ids(c, **parse_filters(stars, list_id, domain))
        pairs = []
        for wid in weighted_sample(c, list(pool), min(len(pool), n * 5)):
            if len(pairs) >= n:
                break
            row = fetch_word(c, wid)
            data = json.loads(row["data"])
            if kind == "example":
                sentences = [s for s in (blank_sentence(row["word"], e) for e in examples_for(data)) if s]
                if not sentences:
                    continue
                right = random.choice(sentences)
            else:
                _, right = core_definition(data)
                if not right:
                    continue
                right = _mask(row["word"], right)
            pairs.append({"word_id": wid, "word": row["word"], "match": right})
        if len(pairs) < 3:
            raise HTTPException(400, "Not enough words with this kind of content. Try another filter.")
        return {"pairs": pairs}


# ---------------------------------------------------------------------- listening

@router.get("/listen")
def listen(n: int = Query(10, ge=1, le=50), stars: str | None = None,
           list_id: int | None = None, domain: str | None = None, audio_only: bool = False):
    with db.tx() as c:
        pool = pool_ids(c, need_audio=audio_only, **parse_filters(stars, list_id, domain))
        fallback = False
        if audio_only and len(pool) < 4:
            # Too few recordings for these filters: include synthesized voice.
            pool = pool_ids(c, **parse_filters(stars, list_id, domain))
            fallback = True
        if len(pool) < 4:
            raise HTTPException(400, "Not enough words match these filters.")
        chosen = weighted_sample(c, list(pool), n)
        all_ids = [r["id"] for r in c.execute("SELECT id FROM words")]
        items = []
        for wid in chosen:
            item = full(fetch_word(c, wid))
            # Distractors that look alike are the useful ones: same first letter
            # or similar length.
            w = item["word"]
            # Same number of words: a sentence among single words is a giveaway.
            words = [r["word"] for r in c.execute(
                "SELECT word FROM words WHERE length(word) - length(replace(word, ' ', '')) = ? "
                "AND lower(word) != lower(?) ORDER BY random() LIMIT 200", (w.count(" "), w))]
            if len(words) < 3:
                sample = random.sample(all_ids, k=min(200, len(all_ids)))
                words += [r["word"] for r in c.execute(
                    f"SELECT word FROM words WHERE id IN ({','.join('?' * len(sample))})", sample)
                    if r["word"].lower() != w.lower()]
            words.sort(key=lambda x: (x[0].lower() != w[0].lower(), abs(len(x) - len(w))))
            opts = words[:3] + [w]
            random.shuffle(opts)
            item["options"] = opts
            items.append(item)
        return {"items": items, "fallback": fallback}


# -------------------------------------------------------------------- recordings

@router.post("/recordings/{word_id}")
async def save_recording(word_id: int, file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(413, "Recording is too long; keep it under a minute.")
    ext = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
           "audio/mpeg": ".mp3", "audio/wav": ".wav"}.get((file.content_type or "").split(";")[0], ".webm")
    path = db.RECORDINGS / f"{word_id}{ext}"
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM words WHERE id=?", (word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        old = c.execute("SELECT path FROM recordings WHERE word_id=?", (word_id,)).fetchone()
        if old and Path(old["path"]).name != path.name:
            (db.RECORDINGS / Path(old["path"]).name).unlink(missing_ok=True)
        path.write_bytes(content)
        c.execute("INSERT OR REPLACE INTO recordings(word_id, path, created_at) VALUES (?, ?, datetime('now','localtime'))",
                  (word_id, path.name))
    return {"url": f"/api/recordings/{word_id}"}


@router.get("/recordings/{word_id}")
def get_recording(word_id: int):
    with db.tx() as c:
        row = c.execute("SELECT path FROM recordings WHERE word_id=?", (word_id,)).fetchone()
    if not row:
        raise HTTPException(404, "No recording yet")
    p = db.RECORDINGS / Path(row["path"]).name
    if not p.exists():
        raise HTTPException(404, "Recording file is missing")
    return FileResponse(p, headers={"Cache-Control": "no-store"})


@router.get("/practice/words")
def practice_words(stars: str | None = None, list_id: int | None = None, domain: str | None = None,
                   n: int = Query(40, ge=1, le=500)):
    """Word picker for pronunciation practice: weakest first."""
    with db.tx() as c:
        ids = weighted_sample(c, pool_ids(c, **parse_filters(stars, list_id, domain)), n)
        return {"words": [compact(fetch_word(c, i)) for i in ids]}
