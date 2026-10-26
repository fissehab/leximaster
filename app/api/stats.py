"""Progress statistics, settings, and JSON export/import of progress."""
from __future__ import annotations

import json
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .. import db
from ..common import today_iso

router = APIRouter(prefix="/api")

MASTERED_INTERVAL = 21  # days


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
        mastered = c.execute(
            "SELECT COUNT(*) AS n FROM words w LEFT JOIN srs s ON s.word_id=w.id "
            "LEFT JOIN user_word u ON u.word_id=w.id "
            "WHERE s.interval_days >= ? OR COALESCE(u.known,0)=1", (MASTERED_INTERVAL,)).fetchone()["n"]
        learning = c.execute("SELECT COUNT(*) AS n FROM srs WHERE interval_days < ?",
                             (MASTERED_INTERVAL,)).fetchone()["n"]
        due = c.execute("SELECT COUNT(*) AS n FROM srs WHERE due_date <= ?", (today_iso(),)).fetchone()["n"]
        stars = {r["stars"]: r["n"] for r in c.execute(
            "SELECT stars, COUNT(*) AS n FROM user_word WHERE stars > 0 GROUP BY stars")}
        overall = c.execute("SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS ok FROM review_log").fetchone()

        # Accuracy by domain: each answer counts toward every domain of its word.
        by_domain: dict[str, list[int]] = {}
        for r in c.execute("SELECT w.domains, r.correct FROM review_log r JOIN words w ON w.id = r.word_id"):
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
            "FROM review_log r JOIN words w ON w.id = r.word_id GROUP BY w.id "
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
                      "mastered": mastered, "learning": learning, "due": due, "stars": stars},
            "accuracy": {"attempts": overall["n"], "correct": overall["ok"]},
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
    with db.tx() as c:
        save_settings(c, values)
        return db.settings(c)


def save_settings(c, values: dict) -> None:
    for k, v in values.items():
        v = "1" if v is True else "0" if v is False else f"{v:g}" if isinstance(v, float) else str(v)
        c.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (k, v))


# ------------------------------------------------------------------ export/import

PROGRESS_TABLES = {
    "user_word": "SELECT w.key, u.stars, u.known, u.notes, u.updated_at FROM user_word u JOIN words w ON w.id=u.word_id",
    "srs": "SELECT w.key, s.ease, s.interval_days, s.reps, s.lapses, s.due_date, s.last_reviewed "
           "FROM srs s JOIN words w ON w.id=s.word_id",
    "review_log": "SELECT w.key, r.ts, r.mode, r.grade, r.correct, r.ms_taken FROM review_log r JOIN words w ON w.id=r.word_id",
    "list_words": "SELECT l.name AS list, w.key, lw.note, lw.added_at FROM list_words lw "
                  "JOIN lists l ON l.id=lw.list_id JOIN words w ON w.id=lw.word_id",
}


@router.get("/export")
def export_progress():
    """Progress keyed by word key (not row id), so it imports into any build."""
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
    return JSONResponse(out, headers={
        "Content-Disposition": f'attachment; filename="leximaster-progress-{today_iso()}.json"'})


def _clamp(v, lo, hi, default):
    try:
        return min(hi, max(lo, type(default)(v)))
    except (TypeError, ValueError):
        return default


@router.post("/import")
async def import_progress(file: UploadFile = File(...)):
    """Merge an export into the current database. Per-word state is replaced
    by the imported values; answers, sessions and activity are added, skipping
    rows that were already in the database before this import, so importing
    the same file twice is harmless. Values are validated and clamped."""
    try:
        data = json.loads(await file.read())
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
            for cw in rows("custom_words"):
                if cw.get("key", "").startswith("custom:") and cw.get("word") and cw.get("data"):
                    c.execute("INSERT OR IGNORE INTO words(key, word, domains, data, is_custom) VALUES (?, ?, ?, ?, 1)",
                              (cw["key"], cw["word"], cw.get("domains") or '["custom"]', cw["data"]))
            ids = {r["key"]: r["id"] for r in c.execute("SELECT id, key FROM words")}
            n = 0
            for u in rows("user_word"):
                if u.get("key") in ids:
                    c.execute("INSERT OR REPLACE INTO user_word(word_id, stars, known, notes, updated_at) "
                              "VALUES (?, ?, ?, ?, ?)",
                              (ids[u["key"]], _clamp(u.get("stars"), 0, 5, 0), _clamp(u.get("known"), 0, 1, 0),
                               str(u.get("notes") or ""), str(u.get("updated_at") or "")))
                    n += 1
            counts["word states"] = n
            n = 0
            for s_ in rows("srs"):
                if s_.get("key") in ids and s_.get("due_date"):
                    c.execute("INSERT OR REPLACE INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) "
                              "VALUES (?, ?, ?, ?, ?, ?, ?)",
                              (ids[s_["key"]], _clamp(s_.get("ease"), 1.3, 5.0, 2.5),
                               _clamp(s_.get("interval_days"), 0.0, 36500.0, 0.0), _clamp(s_.get("reps"), 0, 10000, 0),
                               _clamp(s_.get("lapses"), 0, 10000, 0), str(s_["due_date"])[:10], s_.get("last_reviewed")))
                    n += 1
            counts["review cards"] = n
            existing = {tuple(r) for r in c.execute(
                "SELECT word_id, ts, mode, grade, correct, ms_taken FROM review_log")}
            n = 0
            for r in rows("review_log"):
                if r.get("key") not in ids or r.get("mode") not in ("review", "quiz", "match", "listen", "spell", "flash"):
                    continue
                row = (ids[r["key"]], str(r.get("ts")), r["mode"], r.get("grade"),
                       _clamp(r.get("correct"), 0, 1, 0), r.get("ms_taken"))
                if row not in existing:
                    c.execute("INSERT INTO review_log(word_id, ts, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?, ?)", row)
                    n += 1
            counts["answers"] = n
            for lst in rows("lists"):
                name = " ".join(str(lst.get("name") or "").split())[:60]
                if name and not c.execute("SELECT 1 FROM lists WHERE lower(name)=lower(?)", (name,)).fetchone():
                    c.execute("INSERT INTO lists(name, created_at) VALUES (?, ?)", (name, lst.get("created_at") or ""))
            list_ids = {r["name"].lower(): r["id"] for r in c.execute("SELECT id, name FROM lists")}
            n = 0
            for lw in rows("list_words"):
                lid = list_ids.get(" ".join(str(lw.get("list") or "").split()).lower())
                if lw.get("key") in ids and lid:
                    c.execute("INSERT OR IGNORE INTO list_words(list_id, word_id, note, added_at) VALUES (?, ?, ?, ?)",
                              (lid, ids[lw["key"]], str(lw.get("note") or ""), lw.get("added_at") or ""))
                    n += 1
            counts["list entries"] = n
            existing = {tuple(r) for r in c.execute("SELECT ts, kind, score, total, duration_s FROM test_session")}
            for t in rows("test_session"):
                row = (str(t.get("ts")), str(t.get("kind"))[:40], _clamp(t.get("score"), 0, 10**6, 0),
                       _clamp(t.get("total"), 0, 10**6, 0), _clamp(t.get("duration_s"), 0, 10**7, 0))
                if row not in existing:
                    c.execute("INSERT INTO test_session(ts, kind, score, total, duration_s) VALUES (?, ?, ?, ?, ?)", row)
            for a in rows("daily_activity"):
                if a.get("date"):
                    c.execute("INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES (?, ?, ?, ?) "
                              "ON CONFLICT(date) DO UPDATE SET seconds=MAX(seconds, excluded.seconds), "
                              "reviews=MAX(reviews, excluded.reviews), new_words=MAX(new_words, excluded.new_words)",
                              (str(a["date"])[:10], _clamp(a.get("seconds"), 0, 86400, 0),
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
            save_settings(c, clean)
    except (KeyError, TypeError, ValueError) as e:
        raise HTTPException(400, f"That export file is damaged ({e}).")
    return {"imported": counts}
