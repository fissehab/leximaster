"""SM-2 spaced repetition, driven by practice answers (practice_answer).

Grades 0 Again, 1 Hard, 2 Good, 3 Easy map to SM-2 quality scores 1, 3, 4, 5;
practice gives Good for a right answer and Again for a wrong one.
static/js/local/srs.js is the same for the website; tests/fixtures/srs_vectors.json
checks both.
"""
from __future__ import annotations

import random
import sqlite3
from datetime import date, timedelta

QUALITY = {0: 1, 1: 3, 2: 4, 3: 5}
MIN_EASE = 1.3
LAPSE_EASE = 0.2                           # ease lost when a learned word is forgotten
LAPSE_KEEP = 0.2                           # share of the interval a forgotten word keeps
GOOD_PULL = 0.05                           # "Good" moves ease this share of the way back to 2.5


def today() -> date:
    return date.today()


def iso(d: date) -> str:
    return d.isoformat()


def get_card(c: sqlite3.Connection, word_id: int) -> dict | None:
    row = c.execute("SELECT * FROM srs WHERE word_id=?", (word_id,)).fetchone()
    return dict(row) if row else None


def ensure_card(c: sqlite3.Connection, word_id: int) -> dict:
    card = get_card(c, word_id)
    if card:
        return card
    c.execute("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date) "
              "VALUES (?, 2.5, 0, 0, 0, ?)", (word_id, iso(today())))
    return get_card(c, word_id)


def fuzz(interval: int) -> int:
    """±5% on intervals over 3 days, so words learned together don't stay due together."""
    if interval <= 3:
        return interval
    spread = max(1, round(interval * 0.05))
    return interval + random.randint(-spread, spread)


def schedule(card: dict, grade: int) -> dict:
    """SM-2 step; returns the updated card fields.

    Adjustments to plain SM-2: a lapse keeps a fifth of the old interval (the
    word comes back tomorrow, then grows from there instead of from zero);
    "Good" eases ease back toward 2.5, so it can recover after hard days; a
    word recalled late gets credit for the extra days it survived; intervals
    over 3 days get ±5% fuzz."""
    q = QUALITY[grade]
    ease, interval, reps, lapses = card["ease"], card["interval_days"], card["reps"], card["lapses"]
    if q < 3 and reps == 0 and lapses == 0 and not card.get("last_reviewed"):
        # A new word missed the first time it is seen isn't a lapse: it
        # comes back tomorrow without lowering its ease.
        return {"ease": ease, "interval_days": 1, "reps": 0, "lapses": 0,
                "due_date": iso(today() + timedelta(days=1)), "last_reviewed": iso(today())}
    if q < 3:
        lapses += 1
        ease = max(MIN_EASE, ease - LAPSE_EASE)   # SM-2's own formula takes 0.54 and soon pins ease at the floor
        if reps >= 2:
            interval, reps = max(1, round(interval * LAPSE_KEEP)), 2
        else:
            interval, reps = 1, 0
        # Back tomorrow whatever the kept interval: the next good review grows from it.
        return {"ease": round(ease, 3), "interval_days": interval, "reps": reps, "lapses": lapses,
                "due_date": iso(today() + timedelta(days=1)), "last_reviewed": iso(today())}
    if reps == 0:
        interval = 1 if grade == 1 else (4 if grade == 3 else 1)
    elif reps == 1:
        interval = 3 if grade == 1 else (6 if grade == 2 else 8)
    else:
        overdue = 0
        if card.get("due_date"):
            overdue = max(0, (today() - date.fromisoformat(card["due_date"])).days)
        base = interval + {1: 0, 2: overdue / 2, 3: overdue}[grade]
        factor = {1: 1.2, 2: ease, 3: ease * 1.3}[grade]
        interval = fuzz(max(interval + 1, round(base * factor)))
    reps += 1
    ease = max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    if grade == 2:
        ease += GOOD_PULL * (2.5 - ease)
    due = today() + timedelta(days=int(interval))
    return {"ease": round(ease, 3), "interval_days": interval, "reps": reps,
            "lapses": lapses, "due_date": iso(due), "last_reviewed": iso(today())}


def review(c: sqlite3.Connection, word_id: int, grade: int) -> dict:
    card = ensure_card(c, word_id)
    new = schedule(card, grade)
    c.execute("UPDATE srs SET ease=:ease, interval_days=:interval_days, reps=:reps, "
              "lapses=:lapses, due_date=:due_date, last_reviewed=:last_reviewed "
              "WHERE word_id=:word_id", {**new, "word_id": word_id})
    return new


def practice_grade(card: dict | None, correct: bool, today_grade: int | None, day: str) -> int | None:
    """What a practice answer does to a word's schedule: the grade to apply,
    or None to only log it.

    - Right, for a word not due yet (practised early): nothing. Otherwise
      drilling a list every day would push it years out.
    - Already scheduled today: nothing more, except a miss after a right
      answer, which turns that day's Good into Again (it comes back
      tomorrow). Several answers in one round never compound.
    - Otherwise right is Good, wrong is Again.
    `today_grade` is the grade already applied today, `day` today's date."""
    if card and card.get("last_reviewed") == day:
        return 0 if not correct and today_grade == 2 else None
    if correct and card and card.get("last_reviewed") and card["due_date"] > day:
        return None
    return 2 if correct else 0


def practice_answer(c: sqlite3.Connection, word_id: int, correct: bool) -> int | None:
    """Schedule a word after an answer in Practice (practice_grade). Returns
    the grade applied, or None when the answer is only logged."""
    card = get_card(c, word_id)
    row = c.execute("SELECT grade FROM review_log WHERE word_id=? AND grade IS NOT NULL "
                    "AND date(ts) = date('now', 'localtime') ORDER BY id DESC LIMIT 1", (word_id,)).fetchone()
    grade = practice_grade(card, correct, row["grade"] if row else None, iso(today()))
    if grade is not None:
        review(c, word_id, grade)
    return grade
