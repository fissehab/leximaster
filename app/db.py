"""SQLite persistence: schema, connection helper, and loading words.json."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
# LEXIMASTER_DB points the app at another database (e.g. a copy for testing).
DB_PATH = Path(os.environ.get("LEXIMASTER_DB") or DATA / "leximaster.db")
# LEXIMASTER_WORDS points at another word list (the tests use a small sample).
WORDS_JSON = Path(os.environ.get("LEXIMASTER_WORDS") or DATA / "words.json")
RECORDINGS = DATA / "recordings"

# words_compact caches, per word, the JSON of the word-derived fields that
# GET /api/words sends (common.compact_word), so that request needn't parse
# every word's data. Triggers drop a word's row whenever the word is added,
# changed or removed by any code path (sync, custom words, an import); a
# missing row is rebuilt on the next request (common.compact_heads). The
# learner's stars, known flag and due date are not cached.
WORDS_COMPACT = [
    """CREATE TABLE IF NOT EXISTS words_compact (
        word_id INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
        body    TEXT NOT NULL                 -- JSON object: common.compact_word(row)
    )""",
    """CREATE TRIGGER IF NOT EXISTS words_compact_ins AFTER INSERT ON words
       BEGIN DELETE FROM words_compact WHERE word_id = NEW.id; END""",
    """CREATE TRIGGER IF NOT EXISTS words_compact_upd AFTER UPDATE ON words
       WHEN OLD.id IS NOT NEW.id OR OLD.word IS NOT NEW.word OR OLD.data IS NOT NEW.data
         OR OLD.domains IS NOT NEW.domains OR OLD.freq_rank IS NOT NEW.freq_rank
         OR OLD.has_audio IS NOT NEW.has_audio OR OLD.enriched IS NOT NEW.enriched
         OR OLD.is_custom IS NOT NEW.is_custom OR OLD.level IS NOT NEW.level
       BEGIN DELETE FROM words_compact WHERE word_id IN (OLD.id, NEW.id); END""",
    """CREATE TRIGGER IF NOT EXISTS words_compact_del AFTER DELETE ON words
       BEGIN DELETE FROM words_compact WHERE word_id = OLD.id; END""",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE IF NOT EXISTS words (
    id         INTEGER PRIMARY KEY,
    key        TEXT UNIQUE NOT NULL,
    word       TEXT NOT NULL,
    freq_rank  INTEGER,
    zipf       REAL,
    domains    TEXT NOT NULL DEFAULT '[]',   -- JSON array
    has_audio  INTEGER NOT NULL DEFAULT 0,
    enriched   INTEGER NOT NULL DEFAULT 0,
    data       TEXT NOT NULL,                -- JSON: phonetic, audio, meanings, nuance
    is_custom  INTEGER NOT NULL DEFAULT 0,
    level      INTEGER,                      -- 1 most common .. 5 rare; NULL for your own words
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_word (
    word_id    INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
    stars      INTEGER NOT NULL DEFAULT 0,   -- 0 = unrated, 1-5 familiarity
    known      INTEGER NOT NULL DEFAULT 0,
    notes      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS srs (
    word_id       INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
    ease          REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    reps          INTEGER NOT NULL DEFAULT 0,
    lapses        INTEGER NOT NULL DEFAULT 0,
    due_date      TEXT NOT NULL,             -- YYYY-MM-DD (local date)
    last_reviewed TEXT
);
CREATE INDEX IF NOT EXISTS srs_due ON srs(due_date);
CREATE TABLE IF NOT EXISTS review_log (
    id       INTEGER PRIMARY KEY,
    word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    ts       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    mode     TEXT NOT NULL,                  -- review, quiz, match, listen, spell, flash
    grade    INTEGER,                        -- 0-3 for review (again..easy)
    correct  INTEGER NOT NULL,
    ms_taken INTEGER
);
CREATE INDEX IF NOT EXISTS review_log_word ON review_log(word_id);
CREATE INDEX IF NOT EXISTS review_log_ts ON review_log(ts);
CREATE TABLE IF NOT EXISTS test_session (
    id         INTEGER PRIMARY KEY,
    ts         TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    kind       TEXT NOT NULL,
    score      INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    duration_s INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daily_activity (
    date      TEXT PRIMARY KEY,              -- YYYY-MM-DD local
    seconds   INTEGER NOT NULL DEFAULT 0,
    reviews   INTEGER NOT NULL DEFAULT 0,
    new_words INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lists (
    id         INTEGER PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS list_words (
    list_id  INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    word_id  INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    note     TEXT NOT NULL DEFAULT '',
    added_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (list_id, word_id)
);
CREATE TABLE IF NOT EXISTS recordings (
    word_id    INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
""" + "".join(f"{t};\n" for t in WORDS_COMPACT)

DEFAULT_SETTINGS = {
    "session_minutes": "15",
    "new_per_day": "12",
    "accent": "us",
    "autoplay": "1",
    "speech_rate": "0.9",
    "word_levels": "1,2,3,4,5",   # the levels new words come from (common.parse_levels)
}

_lock = threading.Lock()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def tx():
    """One connection per request; commits on success. Writes are serialised
    with a process lock so concurrent requests never hit SQLITE_BUSY."""
    conn = connect()
    try:
        with _lock:
            yield conn
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ------------------------------------------------------------------ migrations
# The schema's version lives in PRAGMA user_version. SCHEMA above always
# describes the newest layout for a fresh database (CREATE ... IF NOT EXISTS);
# an older database is brought forward by the steps below, one version at a
# time. To change the schema: update SCHEMA, bump SCHEMA_VERSION, and add a
# step that turns version N-1 into N, e.g.
#     2: ["ALTER TABLE srs ADD COLUMN stability REAL"],
# Steps run inside the startup transaction, so a failed step changes nothing.
SCHEMA_VERSION = 3
MIGRATIONS: dict[int, list] = {   # SQL strings, or functions of the connection
    1: [],  # the baseline: the schema as first released (created by SCHEMA)
    2: WORDS_COMPACT,  # filled by init() and on demand (common.compact_heads)
    # Word levels: the column, the cache trigger that watches it, and a sync
    # (words.json is unchanged, so its stamp would skip one) to fill it.
    3: [lambda c: "level" in {r[1] for r in c.execute("PRAGMA table_info(words)")}
        or c.execute("ALTER TABLE words ADD COLUMN level INTEGER"),   # a new database has it
        "DROP TRIGGER IF EXISTS words_compact_upd", WORDS_COMPACT[2],
        "DELETE FROM meta WHERE key = 'words_stamp'"],
}


def schema_version(c: sqlite3.Connection) -> int:
    return c.execute("PRAGMA user_version").fetchone()[0]


def migrate(c: sqlite3.Connection) -> int:
    """Run the steps between the database's version and SCHEMA_VERSION."""
    current = schema_version(c)
    if current > SCHEMA_VERSION:
        raise RuntimeError(f"{DB_PATH} was written by a newer LexiMaster (schema {current}, "
                           f"this app knows {SCHEMA_VERSION}); update the app.")
    for version in range(current + 1, SCHEMA_VERSION + 1):
        for statement in MIGRATIONS[version]:
            statement(c) if callable(statement) else c.execute(statement)
        c.execute(f"PRAGMA user_version = {int(version)}")
    return SCHEMA_VERSION


def init() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    with tx() as c:
        c.executescript(SCHEMA)
        migrate(c)
        for k, v in DEFAULT_SETTINGS.items():
            c.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
    sync_words()
    from .common import compact_heads   # common doesn't import db; here to keep db.py standalone
    with tx() as c:
        compact_heads(c)   # so the first GET /api/words after a sync or migration is fast


# --------------------------------------------------------------------- backups
BACKUPS_KEPT = 7


def backup_daily(keep: int = BACKUPS_KEPT) -> Path | None:
    """Snapshot the database once a day into backups/ next to it
    (backups/YYYY-MM-DD.db, a consistent copy made with VACUUM INTO) and keep
    the newest `keep`. Runs at startup, before any migration. Returns the new
    snapshot, or None when there was nothing to do."""
    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        return None
    folder = DB_PATH.parent / "backups"
    target = folder / f"{date.today().isoformat()}.db"
    made = None
    if not target.exists():
        folder.mkdir(parents=True, exist_ok=True)
        partial = target.with_suffix(".db.partial")
        partial.unlink(missing_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        try:
            conn.execute("VACUUM INTO ?", (str(partial),))
        finally:
            conn.close()
        partial.replace(target)
        made = target
    snapshots = sorted(p for p in folder.glob("????-??-??.db") if p.is_file())
    for old in snapshots[:-keep] if keep > 0 else []:
        old.unlink(missing_ok=True)
    return made


def sync_words(force: bool = False) -> int:
    """Upsert words.json into the words table when the file has changed.
    Word ids stay stable (keyed by `key`), so progress survives rebuilds."""
    if not WORDS_JSON.exists():
        return 0
    stamp = f"{WORDS_JSON.stat().st_mtime_ns}:{WORDS_JSON.stat().st_size}"
    with tx() as c:
        row = c.execute("SELECT value FROM meta WHERE key='words_stamp'").fetchone()
        if row and row["value"] == stamp and not force:
            return 0
    with open(WORDS_JSON, encoding="utf-8") as f:
        payload = json.load(f)
    rows = []
    for w in payload.get("words", []):
        data = {k: w.get(k) for k in ("phonetic", "audio", "meanings", "nuance", "source",
                                      "synonyms", "antonyms", "etymology", "variant_of",
                                      "conversation", "name_kind", "tts", "also", "forms")}
        rows.append((w["key"], w["word"], w.get("freq_rank"), w.get("zipf"),
                     json.dumps(w.get("domains", [])), int(bool(w.get("has_audio"))),
                     int(w.get("nuance") is not None), json.dumps(data, ensure_ascii=False), w.get("level")))
    with tx() as c:
        c.executemany(
            """INSERT INTO words(key, word, freq_rank, zipf, domains, has_audio, enriched, data, level)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET
                 word=excluded.word, freq_rank=excluded.freq_rank, zipf=excluded.zipf,
                 domains=excluded.domains, has_audio=excluded.has_audio,
                 enriched=excluded.enriched, data=excluded.data, level=excluded.level
               WHERE words.is_custom = 0""",
            rows,
        )
        # Words a rebuild dropped (duplicates, placeholders) go too, unless
        # they carry the learner's progress.
        if rows:
            c.execute("CREATE TEMP TABLE IF NOT EXISTS sync_keys(key TEXT PRIMARY KEY)")
            c.execute("DELETE FROM sync_keys")
            c.executemany("INSERT OR IGNORE INTO sync_keys(key) VALUES (?)", [(r[0],) for r in rows])
            c.execute(
                """DELETE FROM words WHERE is_custom = 0
                     AND key NOT IN (SELECT key FROM sync_keys)
                     AND id NOT IN (SELECT word_id FROM user_word)
                     AND id NOT IN (SELECT word_id FROM srs)
                     AND id NOT IN (SELECT word_id FROM list_words)
                     AND id NOT IN (SELECT word_id FROM review_log)
                     AND id NOT IN (SELECT word_id FROM recordings)""")
        c.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('words_stamp', ?)", (stamp,))
        c.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('words_synced_at', ?)",
                  (time.strftime("%Y-%m-%d %H:%M:%S"),))
    return len(rows)


def settings(c: sqlite3.Connection) -> dict[str, str]:
    return {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM settings")}
