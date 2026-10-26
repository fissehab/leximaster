"""SM-2 spaced repetition, adjusted by star ratings and quiz misses.

Grades come from the review buttons: 0 Again, 1 Hard, 2 Good, 3 Easy, mapped to
SM-2 quality scores 1, 3, 4, 5. Star ratings (familiarity, 1-5) shape the
schedule: low-star words have their interval capped so they come back often,
and the starting ease reflects how well the word is already known.
"""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

QUALITY = {0: 1, 1: 3, 2: 4, 3: 5}
MIN_EASE = 1.3
STAR_INTERVAL_CAP = {1: 4, 2: 7}          # days
STAR_START_EASE = {0: 2.5, 1: 2.2, 2: 2.35, 3: 2.5, 4: 2.65, 5: 2.8}


def today() -> date:
    return date.today()


def iso(d: date) -> str:
    return d.isoformat()


def get_card(c: sqlite3.Connection, word_id: int) -> dict | None:
    row = c.execute("SELECT * FROM srs WHERE word_id=?", (word_id,)).fetchone()
    return dict(row) if row else None


def stars_of(c: sqlite3.Connection, word_id: int) -> int:
    row = c.execute("SELECT stars FROM user_word WHERE word_id=?", (word_id,)).fetchone()
    return row["stars"] if row else 0


def ensure_card(c: sqlite3.Connection, word_id: int) -> dict:
    card = get_card(c, word_id)
    if card:
        return card
    ease = STAR_START_EASE.get(stars_of(c, word_id), 2.5)
    c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date) "
              "VALUES (?, ?, 0, 0, 0, ?)", (word_id, ease, iso(today())))
    return get_card(c, word_id)


def schedule(card: dict, grade: int, stars: int) -> dict:
    """Pure SM-2 step; returns the updated card fields."""
    q = QUALITY[grade]
    ease, interval, reps, lapses = card["ease"], card["interval_days"], card["reps"], card["lapses"]
    if q < 3 and reps == 0 and lapses == 0 and not card.get("last_reviewed"):
        # A new word missed the first time it is seen isn't a lapse: it
        # comes back tomorrow without lowering its ease.
        return {"ease": ease, "interval_days": 1, "reps": 0, "lapses": 0,
                "due_date": iso(today() + timedelta(days=1)), "last_reviewed": iso(today())}
    if q < 3:
        reps = 0
        lapses += 1
        interval = 1
    else:
        if reps == 0:
            interval = 1 if grade == 1 else (4 if grade == 3 else 1)
        elif reps == 1:
            interval = 3 if grade == 1 else (6 if grade == 2 else 8)
        else:
            factor = {1: 1.2, 2: ease, 3: ease * 1.3}[grade]
            interval = max(interval + 1, round(interval * factor))
        reps += 1
    ease = max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    cap = STAR_INTERVAL_CAP.get(stars)
    if cap:
        interval = min(interval, cap)
    due = today() + timedelta(days=int(interval))
    return {"ease": round(ease, 3), "interval_days": interval, "reps": reps,
            "lapses": lapses, "due_date": iso(due), "last_reviewed": iso(today())}


def review(c: sqlite3.Connection, word_id: int, grade: int) -> dict:
    card = ensure_card(c, word_id)
    new = schedule(card, grade, stars_of(c, word_id))
    c.execute("UPDATE srs SET ease=:ease, interval_days=:interval_days, reps=:reps, "
              "lapses=:lapses, due_date=:due_date, last_reviewed=:last_reviewed "
              "WHERE word_id=:word_id", {**new, "word_id": word_id})
    return new


def penalise_miss(c: sqlite3.Connection, word_id: int, first_miss_today: bool) -> None:
    """A wrong answer in a quiz or game: the word is due today. Ease drops
    once per word per day, so several misclicks in one round don't compound.
    A word never studied before gets a fresh card and arrives as a new word."""
    card = ensure_card(c, word_id)
    ease = max(MIN_EASE, card["ease"] - 0.2) if first_miss_today and card["reps"] else card["ease"]
    c.execute("UPDATE srs SET due_date=?, ease=?, interval_days=MIN(interval_days, 1) WHERE word_id=?",
              (iso(today()), ease, word_id))


def on_stars_changed(c: sqlite3.Connection, word_id: int, stars: int) -> None:
    """Pull a scheduled card forward if its new star rating caps the interval."""
    card = get_card(c, word_id)
    cap = STAR_INTERVAL_CAP.get(stars)
    if not card or not cap:
        return
    latest = today() + timedelta(days=cap)
    if card["due_date"] > iso(latest):
        c.execute("UPDATE srs SET due_date=?, interval_days=? WHERE word_id=?",
                  (iso(latest), min(card["interval_days"], cap), word_id))
