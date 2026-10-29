"""Shared helpers for turning word rows into API payloads."""
from __future__ import annotations

import hashlib
import inspect
import json
import random
import re
import sqlite3
from datetime import date

WORD_COLUMNS = """
    w.id, w.key, w.word, w.freq_rank, w.zipf, w.domains, w.has_audio, w.enriched,
    w.data, w.is_custom, w.level,
    COALESCE(u.stars, 0) AS stars, COALESCE(u.known, 0) AS known,
    COALESCE(u.notes, '') AS notes,
    s.due_date, s.interval_days, s.reps, s.ease, s.lapses, s.last_reviewed
"""
WORD_FROM = """
    FROM words w
    LEFT JOIN user_word u ON u.word_id = w.id
    LEFT JOIN srs s ON s.word_id = w.id
"""


# The glossary (data/glossary.json, tools/glossary.py): short definitions for
# related words that have no entry. Its key for a term, and the shard of the
# published copy (docs/data/gloss/NN.json) that holds it; static/js/local/server.js
# computes both the same way.
GLOSS_SHARDS = 16


def gloss_key(term: str) -> str:
    """Lowercase, straight quotes, no trailing "(noun)" label, single spaces."""
    t = term.replace("\u2019", "'").replace("\u2018", "'").strip()
    t = re.sub(r"\s*\([^()]*\)\s*$", "", t)
    return re.sub(r"\s+", " ", t).lower()


def gloss_shard(key: str) -> int:
    """FNV-1a (32-bit) of the key's UTF-8 bytes, modulo the shard count."""
    h = 0x811C9DC5
    for b in key.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h % GLOSS_SHARDS

# Inflection-only senses ("simple past of bemuse") say nothing about meaning.
FORM_OF = re.compile(
    r"^(simple past|past participle|present participle|plural|third-person|"
    r"alternative (form|spelling)|obsolete (form|spelling)|archaic (form|spelling)|"
    r"comparative|superlative|misspelling|nonstandard (form|spelling))\b[^.;]*\bof\b", re.I)


def audio_url(data: dict) -> str | None:
    a = data.get("audio")
    return f"/media/{a['file']}" if a and a.get("file") else None


def tts_url(data: dict) -> str | None:
    """A natural synthesized recording (tools/tts.py), for words without one."""
    t = data.get("tts")
    return f"/media/{t['file']}" if t and t.get("file") else None


def core_definition(data: dict) -> tuple[str, str]:
    """(pos, definition) for the most useful sense: the enrichment's learner
    definition when present, otherwise the first dictionary sense."""
    nuance = data.get("nuance") if isinstance(data.get("nuance"), dict) else {}
    core = nuance.get("core") if isinstance(nuance.get("core"), dict) else {}
    if core.get("definition"):
        return core.get("pos", ""), core["definition"]
    first = None
    meanings = data.get("meanings") if isinstance(data.get("meanings"), list) else []
    for m in (m for m in meanings if isinstance(m, dict)):
        senses = m.get("senses") if isinstance(m.get("senses"), list) else []
        for s in (s for s in senses if isinstance(s, dict)):
            d = s.get("definition")
            if not d:
                continue
            if not FORM_OF.match(d):
                return m.get("pos", ""), d
            first = first or (m.get("pos", ""), d)
    return first or ("", "")


def compact_word(row: sqlite3.Row, data: dict | None = None) -> dict:
    """The fields of compact() that come from the word itself (not from the
    learner's progress), in the order the API sends them. GET /api/words
    caches these (app/api/words.py)."""
    if data is None:
        data = json.loads(row["data"])
    pos, definition = core_definition(data)
    return {
        "id": row["id"],
        "word": row["word"],
        "phonetic": data.get("phonetic") or "",
        "pos": [m["pos"] for m in data.get("meanings") or [] if m.get("pos")],
        "core_pos": pos,
        "def": definition,
        "domains": json.loads(row["domains"]),
        "name_kind": data.get("name_kind") or "",
        "freq_rank": row["freq_rank"],
        "level": row["level"],
        "has_audio": bool(row["has_audio"]),
        "audio_url": audio_url(data),
        "tts_url": None if row["has_audio"] else tts_url(data),
        "enriched": bool(row["enriched"]),
        "is_custom": bool(row["is_custom"]),
    }


def compact_json(v) -> str:
    """JSON as FastAPI's JSONResponse writes it."""
    return json.dumps(v, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _code_stamp() -> str | None:
    """A hash of the code behind compact_word, so a change to it rebuilds the cache."""
    try:
        src = "".join(inspect.getsource(f) for f in (compact_word, core_definition, audio_url, tts_url))
    except (OSError, TypeError):
        return None   # no source (a frozen build): the cache is still dropped per word on change
    return hashlib.sha256((src + FORM_OF.pattern).encode()).hexdigest()[:16]


def compact_heads(c: sqlite3.Connection) -> list[tuple[int, str]]:
    """(id, JSON of compact_word) for every word, sorted as GET /api/words
    sends them. Read from the words_compact cache (app/db.py); words missing
    from it (new, changed, or after the migration) are built and stored. The
    cache is emptied when the code that builds it changes."""
    if _compact_code is not None:
        row = c.execute("SELECT value FROM meta WHERE key='compact_code'").fetchone()
        if not row or row["value"] != _compact_code:
            c.execute("DELETE FROM words_compact")
            c.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('compact_code', ?)", (_compact_code,))
    rows = c.execute("""SELECT w.id, wc.body FROM words w LEFT JOIN words_compact wc ON wc.word_id = w.id
                        ORDER BY w.word COLLATE NOCASE, w.id""").fetchall()
    missing = [r["id"] for r in rows if r["body"] is None]
    if not missing:
        return [(r["id"], r["body"]) for r in rows]
    built = {}
    for i in range(0, len(missing), 500):
        chunk = missing[i:i + 500]
        for r in c.execute("SELECT id, word, freq_rank, domains, has_audio, enriched, data, is_custom, level "
                           f"FROM words WHERE id IN ({','.join('?' * len(chunk))})", chunk):
            built[r["id"]] = compact_json(compact_word(r))
    c.executemany("INSERT OR REPLACE INTO words_compact(word_id, body) VALUES (?, ?)", built.items())
    return [(r["id"], r["body"] if r["body"] is not None else built[r["id"]]) for r in rows]


_compact_code = _code_stamp()


def compact(row: sqlite3.Row, data: dict | None = None) -> dict:
    out = compact_word(row, data)
    out.update({"stars": row["stars"], "known": bool(row["known"]), "due": row["due_date"]})
    return out


def full(row: sqlite3.Row) -> dict:
    data = json.loads(row["data"])
    out = compact(row, data)
    out.update({
        "audio_accent": (data.get("audio") or {}).get("accent", ""),
        "meanings": data.get("meanings") or [],
        "nuance": data.get("nuance"),
        "synonyms": data.get("synonyms") or [],
        "antonyms": data.get("antonyms") or [],
        "etymology": data.get("etymology") or "",
        "variant_of": data.get("variant_of") or "",
        "also": data.get("also") or [],
        "forms": data.get("forms"),
        "conversation": data.get("conversation") or [],
        "source": data.get("source", ""),
        "notes": row["notes"],
        "srs": None if row["due_date"] is None else {
            "due": row["due_date"], "interval": row["interval_days"], "reps": row["reps"],
            "ease": row["ease"], "lapses": row["lapses"],
        },
    })
    return out


def fetch_word(c: sqlite3.Connection, word_id: int) -> sqlite3.Row | None:
    return c.execute(f"SELECT {WORD_COLUMNS} {WORD_FROM} WHERE w.id=?", (word_id,)).fetchone()


def examples_for(data: dict) -> list[str]:
    """All example sentences: hand-written conversation examples, then
    enrichment, then dictionary examples."""
    out = [e["text"] for e in data.get("conversation") or []]
    ex = (data.get("nuance") or {}).get("examples") or {}
    for k in ("everyday", "professional", "analytical"):
        if ex.get(k):
            out.append(ex[k])
    for m in data.get("meanings") or []:
        for s in m.get("senses") or []:
            if s.get("example"):
                out.append(s["example"])
    return out


# Endings an inflected form may add (after a final e or y is dropped):
# abate → abated, abates, abating; carry → carries, carried. Only real
# endings, so "patriarch" doesn't match "patriarchal".
SUFFIX = r"(?:e|es|ed|ing|er|ers|est|s|d|ly|y|ies|ied|ier|iest|ily)?"


def word_pattern(word: str) -> re.Pattern:
    """Matches the word and its inflections (abate, abated, abates, abating)."""
    parts = re.split(r"[\s-]+", word.strip())
    stem = parts[-1]
    if len(stem) > 4 and stem.endswith("e"):
        stem = stem[:-1]
    if len(stem) > 4 and stem.endswith("y"):
        stem = stem[:-1]
    head = r"[\s-]+".join(re.escape(p) for p in parts[:-1])
    body = (head + r"[\s-]+" if head else "") + re.escape(stem) + SUFFIX
    return re.compile(r"\b" + body + r"\b", re.I)


def blank_sentence(word: str, sentence: str) -> str | None:
    """The sentence with every use of the word blanked, and "a"/"an" before a
    blank written "a(n)" so the article doesn't give the answer away."""
    out, n = word_pattern(word).subn("_____", sentence)
    if not n:
        return None
    return re.sub(r"\b([Aa])n? (?=_____)", r"\1(n) ", out)


def is_base_form(word: str, sentence: str) -> bool:
    """Whether the sentence uses the word exactly as the options show it."""
    m = word_pattern(word).search(sentence)
    return bool(m) and re.sub(r"[\s-]+", " ", m.group(0)).lower() == re.sub(r"[\s-]+", " ", word.strip()).lower()


def quiz_synonyms(data: dict) -> list[str]:
    """A few of a word's dictionary synonyms: wrong options for other words'
    synonym and antonym questions (tools/build_site.py puts the same list in
    the website's index)."""
    out = list(data.get("synonyms") or [])
    for m in data.get("meanings") or []:
        out += m.get("synonyms") or []
    return [s for s in dict.fromkeys(out) if s][:3]


# Synonyms, antonyms, "Compared with" and related words without an entry of
# their own, so a search finds the entries that list them. Kinds: s synonym,
# a antonym, c compared with, f related (word family, related forms).
MENTION_PARENTS = 4


def mentions(words, heads: set[str]) -> list[list]:
    """[[term, [[kind, headword], ...]], ...] for every related term whose
    lookup key (gloss_key) isn't in `heads`. `words` gives (headword, data)
    pairs, most common first, so each term keeps its commonest few parents.
    GET /api/mentions sends it; tools/build_site.py publishes it."""
    out: dict[str, list] = {}
    for word, data in words:
        n = data.get("nuance") or {}
        ms = data.get("meanings") or []
        groups = (("s", [*(data.get("synonyms") or []), *(t for m in ms for t in m.get("synonyms") or [])]),
                  ("a", [*(n.get("antonyms") or []), *(data.get("antonyms") or []),
                         *(t for m in ms for t in m.get("antonyms") or [])]),
                  ("c", [(d or {}).get("vs", "") for d in n.get("distinctions") or []]),
                  ("f", [*(n.get("word_family") or []), *((data.get("forms") or {}).get("related") or [])]))
        for kind, terms in groups:
            for t in terms:
                key = gloss_key(t) if isinstance(t, str) else ""
                if not key or key in heads or len(key) > 40:
                    continue
                rec = out.setdefault(key, [re.sub(r"\s*\([^()]*\)\s*$", "", t.replace("\u2019", "'")).strip(), []])
                if len(rec[1]) < MENTION_PARENTS and all(p != word for _, p in rec[1]):
                    rec[1].append([kind, word])
    return list(out.values())


def today_iso() -> str:
    return date.today().isoformat()


def bump_activity(c: sqlite3.Connection, seconds: int = 0, reviews: int = 0, new_words: int = 0) -> None:
    c.execute(
        """INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET seconds=seconds+excluded.seconds,
             reviews=reviews+excluded.reviews, new_words=new_words+excluded.new_words""",
        (today_iso(), seconds, reviews, new_words))


# Everyday American English domains (see build_dataset.EVERYDAY_DOMAINS).
EVERYDAY_DOMAINS = ("dining", "food", "shopping", "outdoors", "small_talk", "phrasal_verbs", "idioms",
                    "feelings", "home_health", "getting_around", "sports_culture", "meetings",
                    "phone_calls")
_EVERYDAY_SQL = ("EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value IN ("
                 + ",".join(f"'{d}'" for d in EVERYDAY_DOMAINS) + "))")


# Bible names that aren't also vocabulary: studied only when chosen.
NAMES_ONLY_SQL = ("(EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'bible_names') "
                  "AND NOT EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'bible_vocab'))")
# Related words that other entries link to (seeds/reference.txt) and that are
# very rare or very common (outside build_dataset.LINKED_ZIPF; the others are
# "linked" and studied after the rest): there to look up, so they're studied
# only when you choose them: in a list of yours, starred, or with that filter.
REFERENCE_SQL = "EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'reference')"
LINKED_SQL = "EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'linked')"
CHOSEN_SQL = (f"(NOT {REFERENCE_SQL} OR COALESCE(u.stars, 0) > 0 "
              "OR EXISTS (SELECT 1 FROM list_words lw2 WHERE lw2.word_id = w.id))")   # needs `u` (user_word)
BIBLE_TRACKS = ("bible", "bible_vocab", "bible_names")
# Word levels (build_dataset.word_level; 1 most common .. 5 rare): the ones
# new words come from, setting "word_levels" = "1,2,3". They narrow only these
# broad scopes; a Bible track or one subject is a choice of its own.
LEVELED = ("", "everyday", "core")
# A new learner's levels: past the most common words, short of the rare ones.
# Kept equal to db.DEFAULT_SETTINGS and the JS twins (tests/test_levels.py).
DEFAULT_LEVELS = "2,3,4"
_LEVELS = re.compile(r"[1-5](,[1-5])*")


def parse_levels(value: str | None) -> list[int]:
    """The levels in "1,3,4", sorted; anything else is all of them."""
    if value and _LEVELS.fullmatch(value):
        return sorted({int(x) for x in value.split(",")})
    return [1, 2, 3, 4, 5]


def level_clause(value: str | None) -> str:
    """SQL on `w` and `u` (user_word): the word is at a chosen level, has no
    level (your own words), or you chose it (starred or in a list of yours)."""
    levels = parse_levels(value)
    if len(levels) == 5:
        return "1=1"
    return (f"(w.level IS NULL OR w.level IN ({','.join(map(str, levels))}) OR COALESCE(u.stars, 0) > 0 "
            "OR EXISTS (SELECT 1 FROM list_words lw3 WHERE lw3.word_id = w.id))")


def levels_setting(c: sqlite3.Connection) -> str:
    row = c.execute("SELECT value FROM settings WHERE key = 'word_levels'").fetchone()
    return row["value"] if row else DEFAULT_LEVELS
SCOPES = ("everyday", "core", *BIBLE_TRACKS)  # study tracks, usable wherever a domain filter is


def track_clause(track: str | None) -> str:
    """SQL condition on `w` for a study track: everyday English, the core
    (advanced and subject) vocabulary, the Bible (vocabulary, names or both),
    or everything. Bible names come up only on a Bible track."""
    if track == "everyday":
        return _EVERYDAY_SQL
    if track == "core":
        return f"NOT {_EVERYDAY_SQL} AND NOT {NAMES_ONLY_SQL}"
    if track in BIBLE_TRACKS:
        return f"EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = '{track}')"
    return "1=1"


def pool_ids(c: sqlite3.Connection, *, stars: list[int] | None = None, list_id: int | None = None,
             domain: str | None = None, need_audio: bool = False, need_enriched: bool = False,
             exclude_known: bool = False) -> list[int]:
    """Word ids matching the practice filters shared by every game."""
    where, args = ["1=1"], []
    joins = "LEFT JOIN user_word u ON u.word_id = w.id"
    if stars:
        where.append(f"COALESCE(u.stars, 0) IN ({','.join('?' * len(stars))})")
        args += stars
    if list_id:
        joins += " JOIN list_words lw ON lw.word_id = w.id AND lw.list_id = ?"
        args.insert(0, list_id)
    if domain in SCOPES:
        where.append(track_clause(domain))
    elif domain:
        where.append("EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = ?)")
        args.append(domain)
    elif not list_id:
        where.append(f"NOT {NAMES_ONLY_SQL}")  # Bible names only when chosen (or in your own list)
    if domain != "reference" and not list_id:
        where.append(CHOSEN_SQL)
    if (domain or "") in LEVELED and not list_id:
        where.append(level_clause(levels_setting(c)))
    if need_audio:
        where.append("w.has_audio = 1")
    if need_enriched:
        where.append("w.enriched = 1")
    if exclude_known:
        where.append("COALESCE(u.known, 0) = 0")
    sql = f"SELECT w.id FROM words w {joins} WHERE {' AND '.join(where)}"
    return [r["id"] for r in c.execute(sql, args)]


def weighted_sample(c: sqlite3.Connection, ids: list[int], n: int) -> list[int]:
    """Prefer weaker words: low stars and recent misses are drawn more often.
    A miss counts fully for a month, then fades; re-passes in a review don't
    count again."""
    if len(ids) <= n:
        random.shuffle(ids)
        return ids
    weights = {}
    rows = c.execute(
        f"""SELECT w.id, COALESCE(u.stars, 0) AS stars,
                   (SELECT COALESCE(SUM(CASE WHEN julianday('now') - julianday(r.ts) <= 30 THEN 1.0
                                             WHEN julianday('now') - julianday(r.ts) <= 90 THEN 0.4 ELSE 0.1 END), 0)
                    FROM review_log r WHERE r.word_id = w.id AND r.correct = 0 AND r.mode != 'repeat') AS misses
            FROM words w LEFT JOIN user_word u ON u.word_id = w.id
            WHERE w.id IN ({','.join('?' * len(ids))})""", ids).fetchall() if len(ids) <= 30000 else []
    for r in rows:
        star_w = {0: 1.0, 1: 2.5, 2: 2.0, 3: 1.2, 4: 0.7, 5: 0.4}.get(r["stars"], 1.0)
        weights[r["id"]] = star_w * (1 + min(r["misses"], 5) * 0.5)
    chosen: list[int] = []
    pool = list(ids)
    w = [weights.get(i, 1.0) for i in pool]
    while pool and len(chosen) < n:
        i = random.choices(range(len(pool)), weights=w, k=1)[0]
        chosen.append(pool.pop(i))
        w.pop(i)
    return chosen
