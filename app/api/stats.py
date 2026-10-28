"""Progress statistics, settings, and JSON export/import of progress."""
from __future__ import annotations

import json
import re
from pathlib import Path
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import db
from ..common import parse_levels, today_iso

router = APIRouter(prefix="/api")

MASTERED_INTERVAL = 21  # days
MASTERED_SQL = ("SELECT COUNT(*) AS n {studied} AND s.interval_days >= ? AND s.word_id IN (SELECT word_id FROM (SELECT word_id, grade, julianday(ts) - LAG(julianday(ts)) OVER (PARTITION BY word_id ORDER BY ts, id) AS gap FROM review_log WHERE mode = 'review') WHERE grade >= 2 AND gap >= ?)")
# Reviews of words seen before (last 30 days): the share recalled, by the gap
# since the word's previous review. About 85-90% means the schedule is right.
RETENTION_SQL = ("SELECT CASE WHEN gap < 8 THEN 'days' WHEN gap <= 30 THEN 'weeks' ELSE 'months' END AS span, COUNT(*) AS n, SUM(CASE WHEN grade >= 1 THEN 1 ELSE 0 END) AS ok FROM (SELECT ts, grade, julianday(ts) - LAG(julianday(ts)) OVER (PARTITION BY word_id ORDER BY ts, id) AS gap FROM review_log WHERE mode = 'review') WHERE gap IS NOT NULL AND julianday('now') - julianday(ts) <= 30 GROUP BY span")


def streak(c) -> dict:
    # A day counts when you answered something, or studied for 5+ minutes.
    active = {r["date"] for r in c.execute(
        "SELECT date FROM daily_activity WHERE reviews > 0 OR seconds >= 300")}
    active |= {r["d"] for r in c.execute("SELECT DISTINCT date(ts) AS d FROM review_log")}
    day = date.today()
    if day.isoformat() not in active:
        day -= timedelta(days=1)  # today not done yet doesn't break the streak
    current = 0
    while day.isoformat() in active:
        current += 1
        day -= timedelta(days=1)
    best, run, prev = 0, 0, None
    for d in sorted(active):
        dd = date.fromisoformat(d)
        run = run + 1 if prev and dd - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = dd
    return {"current": current, "best": best, "today_done": date.today().isoformat() in active}


@router.get("/stats")
def stats():
    with db.tx() as c:
        total = c.execute("SELECT COUNT(*) AS n FROM words").fetchone()["n"]
        enriched = c.execute("SELECT COUNT(*) AS n FROM words WHERE enriched=1").fetchone()["n"]
        with_audio = c.execute("SELECT COUNT(*) AS n FROM words WHERE has_audio=1").fetchone()["n"]
        # Words marked known are counted apart: one click isn't proof of mastery.
        studied = "FROM srs s LEFT JOIN user_word u ON u.word_id=s.word_id WHERE COALESCE(u.known,0)=0"
        # Mastered: recalled ("Good" or better) at a review three or more
        # weeks after the one before, and still scheduled weeks apart. A long
        # interval alone is only a plan, not proof.
        mastered = c.execute(MASTERED_SQL.format(studied=studied),
                             (MASTERED_INTERVAL, MASTERED_INTERVAL)).fetchone()["n"]
        learning = c.execute(f"SELECT COUNT(*) AS n {studied}").fetchone()["n"] - mastered
        # Due: reviewed before and due today (the review queue's "due").
        due = c.execute(f"SELECT COUNT(*) AS n {studied} AND s.due_date <= ? AND NOT (s.reps = 0 AND s.last_reviewed IS NULL)",
                        (today_iso(),)).fetchone()["n"]
        known = c.execute("SELECT COUNT(*) AS n FROM user_word WHERE known=1").fetchone()["n"]
        stars = {r["stars"]: r["n"] for r in c.execute(
            "SELECT stars, COUNT(*) AS n FROM user_word WHERE stars > 0 GROUP BY stars")}
        # Practice accuracy (quizzes and games) apart from review retention:
        # a self-graded review and a four-option guess aren't the same signal.
        overall = c.execute("SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS ok FROM review_log "
                            "WHERE mode NOT IN ('review', 'repeat')").fetchone()
        retention = {r["span"]: {"n": r["n"], "ok": r["ok"]} for r in c.execute(RETENTION_SQL)}

        # Accuracy by domain: each answer counts toward every domain of its word.
        by_domain: dict[str, list[int]] = {}
        for r in c.execute("SELECT w.domains, r.correct FROM review_log r JOIN words w ON w.id = r.word_id "
                           "WHERE r.mode != 'repeat'"):
            for d in json.loads(r["domains"]):
                agg = by_domain.setdefault(d, [0, 0])
                agg[0] += 1
                agg[1] += r["correct"]
        domain_rows = sorted(({"domain": d, "attempts": a, "correct": k, "accuracy": k / a}
                              for d, (a, k) in by_domain.items()), key=lambda x: x["accuracy"])

        weakest = [dict(r) for r in c.execute(
            "SELECT w.id, w.word, COUNT(*) AS attempts, SUM(r.correct) AS correct, "
            "ROUND(1.0 * SUM(r.correct) / COUNT(*), 3) AS accuracy, "
            "SUM(CASE WHEN r.correct = 0 THEN 1 ELSE 0 END) AS misses "
            "FROM review_log r JOIN words w ON w.id = r.word_id WHERE r.mode != 'repeat' GROUP BY w.id "
            "HAVING attempts >= 2 AND misses > 0 ORDER BY accuracy ASC, misses DESC, attempts DESC LIMIT 25")]

        days = []
        start = date.today() - timedelta(days=83)
        act = {r["date"]: dict(r) for r in c.execute(
            "SELECT * FROM daily_activity WHERE date >= ?", (start.isoformat(),))}
        for i in range(84):
            d = (start + timedelta(days=i)).isoformat()
            a = act.get(d, {})
            days.append({"date": d, "reviews": a.get("reviews", 0), "seconds": a.get("seconds", 0)})

        tests = [dict(r) for r in c.execute(
            "SELECT id, ts, kind, score, total, duration_s FROM test_session ORDER BY id DESC LIMIT 40")]
        forecast = [dict(r) for r in c.execute(
            "SELECT due_date AS date, COUNT(*) AS n FROM srs WHERE due_date > ? AND due_date <= ? "
            "GROUP BY due_date ORDER BY due_date",
            (today_iso(), (date.today() + timedelta(days=14)).isoformat()))]
        return {
            "words": {"total": total, "enriched": enriched, "with_audio": with_audio,
                      "mastered": mastered, "learning": learning, "due": due, "known": known, "stars": stars},
            "accuracy": {"attempts": overall["n"], "correct": overall["ok"]},
            "retention": retention,
            "streak": streak(c),
            "by_domain": domain_rows,
            "weakest": weakest,
            "days": days,
            "tests": tests,
            "forecast": forecast,
        }


# ---------------------------------------------------------------------- settings

class SettingsIn(BaseModel):
    session_minutes: int | None = None
    new_per_day: int | None = None
    autoplay: bool | None = None
    speech_rate: float | None = None
    word_levels: str | None = None     # "1,2,3": common.parse_levels


@router.get("/settings")
def get_settings():
    with db.tx() as c:
        return db.settings(c)


@router.patch("/settings")
def update_settings(body: SettingsIn):
    values = body.model_dump(exclude_none=True)
    if "session_minutes" in values and not 5 <= values["session_minutes"] <= 60:
        raise HTTPException(400, "Session length must be between 5 and 60 minutes.")
    if "new_per_day" in values and not 0 <= values["new_per_day"] <= 100:
        raise HTTPException(400, "New words per day must be between 0 and 100.")
    if "speech_rate" in values and not 0.5 <= values["speech_rate"] <= 2:
        raise HTTPException(400, "Voice speed must be between 0.5 and 2.")
    if "word_levels" in values:
        if not re.fullmatch(r"[1-5](,[1-5])*", values["word_levels"]):
            raise HTTPException(400, "Choose at least one word level (1 to 5).")
        values["word_levels"] = ",".join(map(str, parse_levels(values["word_levels"])))
    with db.tx() as c:
        save_settings(c, values)
        return db.settings(c)


def save_settings(c, values: dict) -> None:
    for k, v in values.items():
        v = "1" if v is True else "0" if v is False else f"{v:g}" if isinstance(v, float) else str(v)
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (k, v))


# ------------------------------------------------------------------ export/import

import sqlite3  # noqa: E402  (import/export section)
from datetime import datetime as _dt, timezone as _tz  # noqa: E402

PROGRESS_TABLES = {
    "user_word": "SELECT w.key, u.stars, u.known, u.notes, u.updated_at FROM user_word u JOIN words w ON w.id=u.word_id",
    "srs": "SELECT w.key, s.ease, s.interval_days, s.reps, s.lapses, s.due_date, s.last_reviewed "
           "FROM srs s JOIN words w ON w.id=s.word_id",
    "review_log": "SELECT w.key, r.ts, r.mode, r.grade, r.correct, r.ms_taken FROM review_log r JOIN words w ON w.id=r.word_id",
    "list_words": "SELECT l.name AS list, w.key, lw.note, lw.added_at FROM list_words lw "
                  "JOIN lists l ON l.id=lw.list_id JOIN words w ON w.id=lw.word_id",
}


# Your own pronunciation recordings, in an export when asked for (they make
# the file much larger): base64, keyed by word, like everything else.
RECORDING_TYPES = {".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav"}
MAX_RECORDING_BYTES = 5_000_000


def _export_recordings(c) -> list[dict]:
    import base64
    out = []
    for r in c.execute("SELECT w.key, r.path, r.created_at FROM recordings r JOIN words w ON w.id = r.word_id"):
        p = db.RECORDINGS / Path(r["path"]).name
        if p.exists() and p.suffix in RECORDING_TYPES:
            out.append({"key": r["key"], "type": RECORDING_TYPES[p.suffix], "created_at": r["created_at"],
                        "data": base64.b64encode(p.read_bytes()).decode("ascii")})
    return out


def _import_recordings(c, items) -> int:
    """Add recordings for words that have none here (never replaces yours)."""
    import base64
    ext = {v: k for k, v in RECORDING_TYPES.items()}
    n = 0
    for r in items if isinstance(items, list) else []:
        if not isinstance(r, dict) or r.get("type") not in ext or not isinstance(r.get("data"), str):
            continue
        row = c.execute("SELECT id FROM words WHERE key=?", (r.get("key"),)).fetchone()
        if not row or c.execute("SELECT 1 FROM recordings WHERE word_id=?", (row["id"],)).fetchone():
            continue
        try:
            blob = base64.b64decode(r["data"], validate=True)
        except ValueError:
            continue
        if not blob or len(blob) > MAX_RECORDING_BYTES:
            continue
        db.RECORDINGS.mkdir(parents=True, exist_ok=True)
        path = db.RECORDINGS / f"{row['id']}{ext[r['type']]}"
        path.write_bytes(blob)
        c.execute("INSERT INTO recordings(word_id, path, created_at) VALUES (?, ?, datetime('now','localtime'))",
                  (row["id"], path.name))
        n += 1
    return n


@router.get("/export")
def export_progress(recordings: bool = False):
    """Progress keyed by word key (not row id), so it imports into any build.
    recordings=1 adds your own pronunciation recordings."""
    with db.tx() as c:
        out = {"app": "LexiMaster", "version": 1, "exported_at": today_iso()}
        for name, sql in PROGRESS_TABLES.items():
            out[name] = [dict(r) for r in c.execute(sql)]
        out["lists"] = [dict(r) for r in c.execute("SELECT name, created_at FROM lists")]
        out["custom_words"] = [dict(r) for r in c.execute(
            "SELECT key, word, domains, data FROM words WHERE is_custom=1")]
        out["test_session"] = [dict(r) for r in c.execute("SELECT ts, kind, score, total, duration_s FROM test_session")]
        out["daily_activity"] = [dict(r) for r in c.execute("SELECT * FROM daily_activity")]
        out["settings"] = db.settings(c)
        if recordings:
            out["recordings"] = _export_recordings(c)
    return JSONResponse(out, headers={
        "Content-Disposition": f'attachment; filename="leximaster-progress-{today_iso()}.json"'})


def _clean_custom_word(cw: dict) -> tuple | None:
    """(key, word, domains, data) for an imported custom word, with anything
    malformed made empty rather than breaking every page that lists words
    (static/js/local/server.js cleanCustomWord). None when unusable."""
    key, word = cw.get("key"), cw.get("word")
    if not (isinstance(key, str) and key.startswith("custom:") and isinstance(word, str) and word.strip()):
        return None
    try:
        data = json.loads(cw["data"]) if isinstance(cw.get("data"), str) else cw.get("data")
    except json.JSONDecodeError:
        data = None
    if not isinstance(data, dict):
        return None
    data["meanings"] = [m for m in data.get("meanings") or [] if isinstance(m, dict)] \
        if isinstance(data.get("meanings"), list) else []
    for m in data["meanings"]:
        m["senses"] = [s for s in m.get("senses") or [] if isinstance(s, dict)] if isinstance(m.get("senses"), list) else []
    if not isinstance(data.get("nuance"), (dict, type(None))):
        data["nuance"] = None
    try:
        domains = json.loads(cw.get("domains") or "")
    except (json.JSONDecodeError, TypeError):
        domains = None
    if not (isinstance(domains, list) and all(isinstance(d, str) for d in domains)):
        domains = ["custom"]
    return key, word.strip()[:80], json.dumps(domains), json.dumps(data, ensure_ascii=False)


def _clamp(v, lo, hi, default):
    try:
        return min(hi, max(lo, type(default)(v)))
    except (TypeError, ValueError):
        return default


# Import validation. A row that fails these checks is skipped and counted in
# the response's "skipped"; static/js/local/server.js mirrors these rules.
MAX_IMPORT_BYTES = 200 * 1024 * 1024   # room for an export with recordings
MAX_NOTE_CHARS = 5000
LOG_MODES = ("review", "repeat", "quiz", "match", "listen", "spell", "flash")
MAX_MS_TAKEN = 24 * 3600 * 1000


def _iso_date(v) -> str | None:
    """'YYYY-MM-DD' for a valid ISO date string, else None."""
    if not isinstance(v, str) or len(v) != 10:
        return None
    try:
        return date.fromisoformat(v).isoformat()
    except ValueError:
        return None


def _iso_datetime(v, utc: bool = False) -> str | None:
    """'YYYY-MM-DD HH:MM:SS' for an ISO datetime string ('T' or space, optional
    fraction and offset), else None. review_log/test_session times are local
    and user_word.updated_at is UTC (see db.py): a time with an offset is
    converted to UTC when utc, else to local time; one without is kept as is."""
    if not isinstance(v, str) or not 16 <= len(v) <= 40:
        return None
    try:
        d = _dt.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is not None:
        d = d.astimezone(_tz.utc if utc else None).replace(tzinfo=None)
    return d.strftime("%Y-%m-%d %H:%M:%S")


def _int(v, lo: int, hi: int) -> int | None:
    """An integer (or integral float) within [lo, hi]; bools and strings aren't."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if isinstance(v, float) and not v.is_integer():
        return None
    return int(v) if lo <= v <= hi else None


def _flag(v) -> int | None:
    """0/1 from 0, 1, false, true."""
    return int(v) if isinstance(v, bool) else _int(v, 0, 1)


def _valid_user_word(u: dict) -> tuple | None:
    stars, known = _int(u.get("stars", 0), 0, 5), _flag(u.get("known", 0))
    notes = u.get("notes") or ""
    updated = _iso_datetime(u.get("updated_at"), utc=True)
    if stars is None or known is None or not isinstance(notes, str) or updated is None:
        return None
    return stars, known, notes[:MAX_NOTE_CHARS], updated


def _valid_srs(s: dict) -> tuple | None:
    ease = s.get("ease", 2.5)
    if isinstance(ease, bool) or not isinstance(ease, (int, float)) or ease != ease:
        return None
    interval = s.get("interval_days", 0)  # a REAL column: whole days today, fractions allowed
    if isinstance(interval, bool) or not isinstance(interval, (int, float)) or not 0 <= interval <= 10**9:
        interval = None
    reps, lapses = _int(s.get("reps", 0), 0, 10**9), _int(s.get("lapses", 0), 0, 10**9)
    due = _iso_date(s.get("due_date"))
    last = s.get("last_reviewed")
    last_ok = last is None or _iso_date(last) is not None
    if None in (interval, reps, lapses, due) or not last_ok:
        return None
    return (min(5.0, max(1.3, float(ease))), float(min(interval, 36500)), min(reps, 10000),
            min(lapses, 10000), due, _iso_date(last) if last is not None else None)


def _valid_review(r: dict) -> tuple | None:
    ts = _iso_datetime(r.get("ts"))
    grade = r.get("grade")
    grade_ok = grade is None or _int(grade, 0, 3) is not None
    ms = r.get("ms_taken")
    ms_ok = ms is None or _int(ms, 0, MAX_MS_TAKEN) is not None
    correct = _flag(r.get("correct"))
    if ts is None or r.get("mode") not in LOG_MODES or not grade_ok or not ms_ok or correct is None:
        return None
    return (ts, r["mode"], None if grade is None else int(grade), correct, None if ms is None else int(ms))


def _norm_utc(v) -> str:
    """A stored updated_at made comparable ('' sorts before every time)."""
    return _iso_datetime(v, utc=True) or ""


@router.post("/import")
async def import_progress(file: UploadFile = File(...)):
    """Merge an export into the current database. Rows with wrong types are
    skipped and counted. Per-word state keeps whichever side is newer (srs: the
    later last_reviewed, then more reps; user_word: the later updated_at), so
    an old file can't undo newer progress. Answers, sessions and activity are
    added, skipping rows already in the database, so importing the same file
    twice is harmless."""
    raw_bytes = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise HTTPException(413, f"That file is too large (over {MAX_IMPORT_BYTES // (1024 * 1024)} MB).")
    try:
        data = json.loads(raw_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(400, "That file isn't valid JSON.")
    if not isinstance(data, dict) or data.get("app") != "LexiMaster":
        raise HTTPException(400, "That file isn't a LexiMaster progress export.")

    def rows(name):
        v = data.get(name, [])
        return [r for r in v if isinstance(r, dict)] if isinstance(v, list) else []

    counts = {}
    try:
        with db.tx() as c:
            skipped = 0
            bad = 0
            for raw in rows("custom_words"):
                cw = _clean_custom_word(raw)
                if cw is None:
                    skipped += 1
                    continue
                c.execute("INSERT OR IGNORE INTO words(key, word, domains, data, is_custom) VALUES (?, ?, ?, ?, 1)", cw)
            if skipped:
                counts["damaged custom words skipped"] = skipped
            ids = {r["key"]: r["id"] for r in c.execute("SELECT id, key FROM words")}

            n = 0
            have = {r["word_id"]: _norm_utc(r["updated_at"])
                    for r in c.execute("SELECT word_id, updated_at FROM user_word")}
            for u in rows("user_word"):
                if u.get("key") not in ids:
                    continue
                v = _valid_user_word(u)
                if v is None:
                    bad += 1
                    continue
                wid = ids[u["key"]]
                if wid in have and have[wid] >= v[3]:
                    continue  # ours is as new or newer
                c.execute("INSERT OR REPLACE INTO user_word(word_id, stars, known, notes, updated_at) "
                          "VALUES (?, ?, ?, ?, ?)", (wid, *v))
                have[wid] = v[3]
                n += 1
            counts["word states"] = n

            n = 0
            have = {r["word_id"]: (r["last_reviewed"] or "", r["reps"])
                    for r in c.execute("SELECT word_id, last_reviewed, reps FROM srs")}
            for s_ in rows("srs"):
                if s_.get("key") not in ids:
                    continue
                v = _valid_srs(s_)
                if v is None:
                    bad += 1
                    continue
                wid = ids[s_["key"]]
                rank = (v[5] or "", v[2])
                if wid in have and have[wid] >= rank:
                    continue
                c.execute("INSERT OR REPLACE INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                          "VALUES (?, ?, ?, ?, ?, ?, ?)", (wid, *v))
                have[wid] = rank
                n += 1
            counts["review cards"] = n

            existing = {tuple(r) for r in c.execute(
                "SELECT word_id, ts, mode, grade, correct, ms_taken FROM review_log")}
            n = 0
            for r in rows("review_log"):
                if r.get("key") not in ids:
                    continue
                v = _valid_review(r)
                if v is None:
                    bad += 1
                    continue
                row = (ids[r["key"]], *v)
                if row not in existing:
                    c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?, ?)", row)
                    existing.add(row)
                    n += 1
            counts["answers"] = n

            for lst in rows("lists"):
                name = " ".join(str(lst.get("name") or "").split())[:60]
                if name and not c.execute("SELECT 1 FROM lists WHERE lower(name)=lower(?)", (name,)).fetchone():
                    c.execute("INSERT INTO lists(name, created_at) VALUES (?, ?)", (name, str(lst.get("created_at") or "")))
            list_ids = {r["name"].lower(): r["id"] for r in c.execute("SELECT id, name FROM lists")}
            n = 0
            for lw in rows("list_words"):
                lid = list_ids.get(" ".join(str(lw.get("list") or "").split()).lower())
                if lw.get("key") in ids and lid:
                    note = lw.get("note") or ""
                    if not isinstance(note, str):
                        bad += 1
                        continue
                    cur = c.execute("INSERT OR IGNORE INTO list_words(list_id, word_id, note, added_at) VALUES (?, ?, ?, ?)",
                                    (lid, ids[lw["key"]], note[:MAX_NOTE_CHARS], str(lw.get("added_at") or "")))
                    n += cur.rowcount
            counts["list entries"] = n

            existing = {tuple(r) for r in c.execute("SELECT ts, kind, score, total, duration_s FROM test_session")}
            for t in rows("test_session"):
                ts = _iso_datetime(t.get("ts"))
                if ts is None or not isinstance(t.get("kind"), str):
                    bad += 1
                    continue
                row = (ts, t["kind"][:40], _clamp(t.get("score"), 0, 10**6, 0),
                       _clamp(t.get("total"), 0, 10**6, 0), _clamp(t.get("duration_s"), 0, 10**7, 0))
                if row not in existing:
                    c.execute("INSERT INTO test_session(ts, kind, score, total, duration_s) VALUES (?, ?, ?, ?, ?)", row)
                    existing.add(row)

            for a in rows("daily_activity"):
                day = _iso_date(a.get("date"))
                if day is None:
                    bad += 1
                    continue
                c.execute("INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES (?, ?, ?, ?) "
                          "ON CONFLICT(date) DO UPDATE SET seconds=MAX(seconds, excluded.seconds), "
                          "reviews=MAX(reviews, excluded.reviews), new_words=MAX(new_words, excluded.new_words)",
                          (day, _clamp(a.get("seconds"), 0, 86400, 0),
                           _clamp(a.get("reviews"), 0, 100000, 0), _clamp(a.get("new_words"), 0, 100000, 0)))

            st = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            clean = {}
            if "session_minutes" in st:
                clean["session_minutes"] = _clamp(st["session_minutes"], 5, 60, 15)
            if "new_per_day" in st:
                clean["new_per_day"] = _clamp(st["new_per_day"], 0, 100, 12)
            if "speech_rate" in st:
                clean["speech_rate"] = _clamp(st["speech_rate"], 0.5, 2.0, 0.9)
            if "autoplay" in st:
                clean["autoplay"] = str(st["autoplay"]) in ("1", "True", "true")
            if re.fullmatch(r"[1-5](,[1-5])*", str(st.get("word_levels", ""))):
                clean["word_levels"] = ",".join(map(str, parse_levels(st["word_levels"])))
            save_settings(c, clean)
            if "recordings" in data:
                counts["recordings"] = _import_recordings(c, data.get("recordings"))
            if bad:
                counts["skipped"] = bad
    except sqlite3.Error as e:
        raise HTTPException(400, f"That export file couldn't be imported; nothing was changed ({e}).")
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError) as e:
        raise HTTPException(400, f"That export file is damaged; nothing was changed ({e}).")
    return {"imported": counts}
