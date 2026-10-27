"""Shared helpers for turning word rows into API payloads."""
from __future__ import annotations

import json
import random
import re
import sqlite3
from datetime import date

WORD_COLUMNS = """
    w.id, w.key, w.word, w.freq_rank, w.zipf, w.domains, w.has_audio, w.enriched,
    w.data, w.is_custom,
    COALESCE(u.stars, 0) AS stars, COALESCE(u.known, 0) AS known,
    COALESCE(u.notes, '') AS notes,
    s.due_date, s.interval_days, s.reps, s.ease, s.lapses, s.last_reviewed
"""
WORD_FROM = """
    FROM words w
    LEFT JOIN user_word u ON u.word_id = w.id
    LEFT JOIN srs s ON s.word_id = w.id
"""


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


def compact(row: sqlite3.Row) -> dict:
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
        "has_audio": bool(row["has_audio"]),
        "audio_url": audio_url(data),
        "tts_url": None if row["has_audio"] else tts_url(data),
        "enriched": bool(row["enriched"]),
        "is_custom": bool(row["is_custom"]),
        "stars": row["stars"],
        "known": bool(row["known"]),
        "due": row["due_date"],
    }


def full(row: sqlite3.Row) -> dict:
    data = json.loads(row["data"])
    out = compact(row)
    out.update({
        "audio_accent": (data.get("audio") or {}).get("accent", ""),
        "meanings": data.get("meanings") or [],
        "nuance": data.get("nuance"),
        "synonyms": data.get("synonyms") or [],
        "antonyms": data.get("antonyms") or [],
        "etymology": data.get("etymology") or "",
        "variant_of": data.get("variant_of") or "",
        "also": data.get("also") or [],
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
BIBLE_TRACKS = ("bible", "bible_vocab", "bible_names")
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
