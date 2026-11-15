"""Practice: answers (which set when a word comes back), quizzes, matching,
listening, flashcards and recordings."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import db, srs
from ..common import (BIBLE_TRACKS, EVERYDAY_DOMAINS, NAMES_ONLY_SQL, REFERENCE_SQL, blank_sentence, hints_word, mask_word,
                      bump_activity, compact, core_definition, examples_for, fetch_word, full, is_base_form, pool_ids, quiz_examples, quiz_synonyms,
                      weighted_sample)

router = APIRouter(prefix="/api")

def parse_filters(stars: str | None, list_id: int | None, domain: str | None) -> dict:
    """Practice filters shared by every game. Words marked known are left out."""
    star_list = [int(s) for s in stars.split(",") if s.strip().isdigit()] if stars else None
    return {"stars": star_list, "list_id": list_id or None, "domain": domain or None,
            "exclude_known": True}


# ------------------------------------------------------------------ to refresh

@router.get("/refresh")
def refresh():
    """How many practised words are due to come back today (Today, the nav
    badge): the "Words to refresh" choice in every practice screen."""
    with db.tx() as c:
        return {"count": len(pool_ids(c, domain="refresh", exclude_known=True))}


# ----------------------------------------------------------------- answers & log

class AnswerIn(BaseModel):
    word_id: int
    mode: str = Field(pattern=r"^(quiz|match|listen|spell|flash)$")
    correct: bool
    ms: int = 0


@router.post("/answer")
def record_answer(body: AnswerIn):
    """Every practice answer is logged, and schedules when the word comes back
    (srs.practice_answer: once per word per day). The log row that scheduled
    it carries the grade, which Progress reads (mastered, retention)."""
    with db.tx() as c:
        if not c.execute("SELECT 1 FROM words WHERE id=?", (body.word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        grade = srs.practice_answer(c, body.word_id, body.correct)
        c.execute("INSERT INTO review_log(word_id, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?)",
                  (body.word_id, body.mode, grade, int(body.correct), body.ms))
        bump_activity(c, reviews=1)   # the day's answers (Progress, the streak)
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
               n: int = Query(30, ge=1, le=500), shuffle: bool = True, brief: bool = False):
    """A deck. brief: only what the front of a card needs (the back is
    loaded per card from /api/words/{id}), so the first card shows at once."""
    with db.tx() as c:
        ids = pool_ids(c, **parse_filters(stars, list_id, domain))
        pool = len(ids)
        ids = weighted_sample(c, ids, n) if shuffle else ids[:n]
        card = compact if brief else full
        return {"cards": [card(fetch_word(c, i)) for i in ids], "pool": pool}


# ------------------------------------------------------------------------- quiz

QUIZ_TYPES = ("word_meaning", "meaning_word", "fill_blank", "synonym", "antonym", "name_kind", "pattern")
PREPOSITIONS = ("on", "in", "at", "of", "to", "for", "with", "about", "from", "by", "into", "against",
                "over", "toward", "onto", "upon", "after", "among", "between", "through", "under")
COMMON_PREPS = ("on", "in", "at", "of", "to", "for", "with", "about", "from", "by")


def pattern_question(word: str, patterns: list[str], pos: str = "verb") -> dict | None:
    """"insist ___ doing sth" → on: a preposition from one of the word's
    grammar patterns. Alternatives in the pattern ("with/at/about") all
    count, so none of them is offered as a wrong answer."""
    if pos.lower() not in ("verb", "adjective"):
        return None   # nouns often take several prepositions ("intuition about/for"): too easy to be unfair
    stem = word.lower()[:4]
    usable, listed = [], set()
    for p in patterns:
        for seg in p.split(" / "):   # "insist on sth / on doing sth": one frame at a time
            seg = re.sub(r"\[[^\]]*\]", " ", seg)
            if seg.count("(") != seg.count(")"):
                continue
            seg = re.sub(r"\((?=(?:at|on|in|of|to|for|with|about|from|by|into|against|over|toward)\b)([^)]*)\)", r"\1", seg)
            tokens = seg.split()
            listed |= {a.strip("()") for t in tokens for a in t.split("/")}
            if not any(t.lower().startswith(stem) for t in tokens):
                continue
            for i, t in enumerate(tokens):
                alts = [a.strip("()") for a in t.split("/")]
                if i and all(a in PREPOSITIONS for a in alts):
                    if not any(a in (x.strip("()") for x in tokens[i + 1:]) for a in alts):
                        usable.append((tokens, i, alts))
                    break
    if not usable:
        return None
    tokens, i, alts = random.choice(usable)
    # Wrong choices: never a preposition any of the word's patterns uses.
    # (and not "by" after a past participle: "disappointed by" is fine English).
    wrong = random.sample([x for x in COMMON_PREPS if x not in listed
                           and not (x == "by" and word.lower().endswith("ed"))], 3)
    frame = " ".join(tokens[:i] + ["/".join(alts)] + tokens[i + 1:])
    return {"prompt": " ".join(tokens[:i] + ["___"] + tokens[i + 1:]), "ask": "Which word completes the pattern?",
            "answer": alts[0], "options": wrong + [alts[0]],
            "explain": {x: f"The pattern to learn is “{frame}”." for x in wrong}}
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
    return mask_word(word, text)


def _option(word: str, definition: str) -> str:
    """A definition as a quiz option: masked, and without a leading "In
    statistics," that would mark the one subject word among everyday ones."""
    text = re.sub(r"^In (?!an? )[A-Za-z' -]{1,40}, ", "", _mask(word, definition))  # not "In a clear, careful way"
    return text[:1].upper() + text[1:]


def _rights(data: dict, kind: str) -> list[str]:
    """Correct answers for a synonym or antonym question. "Compared with"
    words (nuance distinctions) are never a right synonym, even when a
    dictionary lists them: the entry explains how they differ."""
    nuance = data.get("nuance") or {}
    out = list(data.get("synonyms" if kind == "synonym" else "antonyms") or [])
    if kind == "antonym":
        out = list(nuance.get("antonyms") or []) + out
    for m in data.get("meanings") or []:
        out += m.get("synonyms" if kind == "synonym" else "antonyms") or []
    contrasted = {(d.get("vs") or "").lower() for d in nuance.get("distinctions") or []}
    return [r for r in dict.fromkeys(out) if r and not (kind == "synonym" and r.lower() in contrasted)]


def shares_word(a: str, b: str) -> bool:
    """Whether two phrases share a word of four letters or more, one inside
    the other ("judgment" / "misjudgment", "cart" / "shopping cart",
    "interception" / "reception"): such a synonym or antonym gives the answer
    away or isn't one. static/js/local/server.js sharesWord is the same."""
    al, bl = a.lower(), b.lower()
    return (any(t in bl for t in re.findall(r"[a-z]+", al) if len(t) >= 4)
            or any(t in al for t in re.findall(r"[a-z]+", bl) if len(t) >= 4))


@router.get("/quiz")
def make_quiz(types: str = "word_meaning,meaning_word,fill_blank,synonym,antonym,name_kind,pattern",
              n: int = Query(10, ge=1, le=50), stars: str | None = None,
              list_id: int | None = None, domain: str | None = None):
    wanted = [t for t in types.split(",") if t in QUIZ_TYPES] or list(QUIZ_TYPES)
    with db.tx() as c:
        filters = parse_filters(stars, list_id, domain)
        if wanted == ["name_kind"] and not list_id and domain not in BIBLE_TRACKS:
            filters["domain"] = "bible_names"   # only names can be asked "who or what?"
        pool = pool_ids(c, **filters)
        if not pool:   # wrong options come from all words, so even one word makes a quiz
            raise HTTPException(400, 'Not enough words here. Choose other words under "Words from".')
        all_ids = [r["id"] for r in c.execute(
            f"SELECT id FROM words w WHERE (enriched = 1 OR is_custom = 1) AND NOT {NAMES_ONLY_SQL} "
            f"AND NOT {REFERENCE_SQL}")]
        if len(all_ids) < 50:  # dataset not enriched yet: draw distractors from every word
            all_ids = [r["id"] for r in c.execute("SELECT id FROM words")]
        # Fewer question types fit fewer words: look at more of them.
        candidates = weighted_sample(c, list(pool), min(len(pool), n * (4 if len(wanted) > 2 else 10)))
        questions = []
        for wid in candidates:
            if len(questions) >= n:
                break
            row = fetch_word(c, wid)
            data = json.loads(row["data"])
            pos, definition = core_definition(data)
            word = row["word"]
            nuance = data.get("nuance") or {}
            name_kind = data.get("name_kind") or ""
            domains = json.loads(row["domains"] or "[]")
            everyday = [d for d in domains if d in EVERYDAY_DOMAINS]
            if name_kind:
                everyday = ["bible_names"]  # names are told apart from other names
            if everyday:
                # Everyday entries compete with their own kind: phrasal verbs
                # with phrasal verbs, restaurant phrases with restaurant phrases.
                distract_ids = [r["id"] for r in c.execute(
                    "SELECT id FROM words w WHERE id != ? AND EXISTS (SELECT 1 FROM json_each(w.domains) "
                    f"WHERE json_each.value IN ({','.join('?' * len(everyday))})) AND NOT {REFERENCE_SQL} ORDER BY random() LIMIT 30",
                    (wid, *everyday))]
            else:
                # Other words of the chosen scope ("Statistics", "Bible · Vocabulary"), else any word.
                source = pool if domain and len(pool) >= 30 else all_ids
                distract_ids = random.sample([i for i in source if i != wid], k=min(30, len(source) - 1))
            dmap = _defs_by_id(c, distract_ids)
            # Same shape first (number of words, then part of speech): a
            # sentence among single words would give the answer away.
            n_words = len(word.split())
            # The word, its synonyms and the words its notes compare it with.
            near = ({x.lower() for x in _rights(data, "synonym")} | {word.lower()}
                    | {(d.get("vs") or "").lower() for d in nuance.get("distinctions") or []})
            # A definition that names its own word would read "the …eans" once
            # masked; a word the entry names as near in meaning would be right too.
            others = sorted((v for v in dmap.values() if v[0].lower() not in near
                             and not re.search(rf"\b{re.escape(v[0])}\b", v[2], re.I)),
                            key=lambda v: (len(v[0].split()) != n_words, v[1] != pos))


            def build(qtype):
                if qtype == "pattern":
                    return pattern_question(word, nuance.get("patterns") or [], pos)
                if qtype == "name_kind":
                    return {"prompt": word, "ask": f"Who or what is {word}?", "answer": NAME_KINDS[name_kind],
                            "options": list(NAME_KINDS.values())}
                if qtype == "word_meaning" and definition and len(others) >= 3:
                    return {"prompt": word, "ask": f"Who or what is {word}?" if name_kind else "What does this word mean?",
                            "answer": _option(word, definition),
                            "options": [_option(o[0], o[2]) for o in others[:3]] + [_option(word, definition)],
                            # What a wrong pick was: the meaning of another word.
                            "explain": {_option(o[0], o[2]): f"That's the meaning of “{o[0]}”." for o in others[:3]}}
                if qtype == "meaning_word" and definition and len(others) >= 3:
                    return {"prompt": _mask(word, definition), "ask": "Which word fits this meaning?",
                            "answer": word, "options": [o[0] for o in others[:3]] + [word],
                            "explain": {o[0]: f"“{o[0]}” means: {o[2]}" for o in others[:3]}}
                if qtype == "fill_blank":
                    # Never a word the entry names as near in meaning ("go over":
                    # "run through"): it would fit the blank too.
                    fits = [o for o in others if o[0].lower() not in near]
                    examples = quiz_examples(data)
                    # Prefer sentences that use the word as the options show it,
                    # then those that don't show it in another form ("inspector").
                    usable = [e for e in examples if is_base_form(word, e)] or examples
                    sentences = [s for s in (blank_sentence(word, e) for e in usable) if s]
                    sentences = [s for s in sentences if not hints_word(word, s)] or sentences
                    if sentences and len(fits) >= 3:
                        return {"prompt": random.choice(sentences), "ask": "Fill in the blank.",
                                "answer": word, "options": [o[0] for o in fits[:3]] + [word],
                                "explain": {o[0]: f"“{o[0]}” means: {o[2]}" for o in fits[:3]}}
                if qtype in ("synonym", "antonym"):
                    rights = [r for r in _rights(data, qtype) if not shares_word(r, word)]
                    if not rights:
                        return None
                    right = random.choice(rights)
                    # Wrong options: other words' synonyms, so the answer isn't
                    # the one plain word among headwords; never one of this
                    # word's own synonyms, antonyms or compared-with words
                    # (determination: "tenacity"), and for antonyms never
                    # from its own subject ("glad": sorry, disappointed…).
                    own = near | {x.lower() for x in _rights(data, "antonym")}
                    lookup_only = {r["w"] for r in c.execute(f"SELECT lower(word) AS w FROM words w WHERE {REFERENCE_SQL}")}
                    src = random.sample(all_ids, k=min(80, len(all_ids)))
                    wrongs = []
                    for r in c.execute(f"SELECT id, domains, data FROM words WHERE id IN ({','.join('?' * len(src))})", src):
                        if qtype == "antonym" and set(json.loads(r["domains"] or "[]")) & set(domains):
                            continue
                        # Never a look-up-only word, or one that gives the right answer away.
                        wrongs += [s for s in quiz_synonyms(json.loads(r["data"]))
                                   if s.lower() not in own and s.lower() not in lookup_only and not shares_word(s, right)]
                    wrongs = list(dict.fromkeys(wrongs))
                    random.shuffle(wrongs)
                    wrongs.sort(key=lambda s: len(s.split()) != len(right.split()))
                    if len(wrongs) >= 3:
                        return {"prompt": word,
                                "ask": "Which is closest in meaning?" if qtype == "synonym" else "Which is opposite in meaning?",
                                "answer": right, "options": wrongs[:3] + [right]}
                return None

            # Only the chosen kinds of question. A Bible name is asked "who or
            # what?" or "person, place or people?"; people get the second less
            # often (two in five), or "A person" would be right two times in three.
            kinds = random.sample(wanted, len(wanted))
            if name_kind:
                kinds = [k for k in kinds if k in ("name_kind", "word_meaning")
                         and not (k == "name_kind" and name_kind == "person" and random.random() < 0.6)]
            else:
                kinds = [k for k in kinds if k != "name_kind"]
            q, qtype = None, None
            for qtype in kinds:
                q = build(qtype)
                if q:
                    break
            if not q:
                continue
            random.shuffle(q["options"])
            examples = [e for e in examples_for(data)  # a name's "everyday" line is about a namesake
                        if not (name_kind and e == (nuance.get("examples") or {}).get("everyday"))]
            q.update({"type": qtype, "word_id": wid, "word": word, "definition": definition,
                      "example": examples[0] if examples else "",
                      "phonetic": data.get("phonetic") or "", "audio_url": full(row)["audio_url"],
                      "tts_url": full(row)["tts_url"]})
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
                sentences = [s for s in (blank_sentence(row["word"], e) for e in quiz_examples(data)) if s]
                sentences = [s for s in sentences if not hints_word(row["word"], s)] or sentences
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
            raise HTTPException(400, 'Not enough words with this kind of content here. Choose other words under "Words from".')
        return {"pairs": pairs}


# ---------------------------------------------------------------------- listening

def sound_key(ipa: str) -> str:
    """IPA without slashes, stress, length, syllable dots or diacritics."""
    import unicodedata
    s = unicodedata.normalize("NFD", ipa.split(",")[0])
    return "".join(ch for ch in s if not unicodedata.combining(ch) and ch not in "/[]ˈˌː.‿ -()'")


_same_sound: tuple[tuple, dict] | None = None


def same_sound(c) -> dict[str, set[str]]:
    """Sound key -> the single words said that way, every way each is said
    (in-browser backend: sameSound in static/js/local/server.js). Kept while
    the words are unchanged."""
    global _same_sound
    stamp = tuple(c.execute("SELECT COUNT(*), MAX(id), SUM(LENGTH(data)) FROM words").fetchone())
    if _same_sound and _same_sound[0] == stamp:
        return _same_sound[1]
    out: dict[str, set[str]] = {}
    for r in c.execute("SELECT word, json_extract(data, '$.phonetic') AS ph, json_extract(data, '$.prons') AS prons "
                       "FROM words WHERE word NOT LIKE '% %' AND word NOT LIKE '%-%'"):
        ipas = [r["ph"]] + [p["ipa"] for p in json.loads(r["prons"] or "[]")[1:]]
        for ipa in ipas:
            if ipa and (k := sound_key(ipa)):
                out.setdefault(k, set()).add(r["word"])
    _same_sound = (stamp, out)
    return out


def sound_distance(a: str, b: str) -> float:
    """Edit distance between two sound keys, 0 (same) to 1."""
    if not a or not b:
        return 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / max(len(a), len(b))


@router.get("/listen")
def listen(n: int = Query(10, ge=1, le=50), stars: str | None = None,
           list_id: int | None = None, domain: str | None = None, audio_only: bool = False):
    with db.tx() as c:
        pool = pool_ids(c, need_audio=audio_only, **parse_filters(stars, list_id, domain))
        fallback = False
        if audio_only and not pool:
            # No recordings for these words: include synthesized voice.
            pool = pool_ids(c, **parse_filters(stars, list_id, domain))
            fallback = True
        if not pool:   # the choices come from all words, so even one word can be practised
            raise HTTPException(400, 'Not enough words here. Choose other words under "Words from".')
        chosen = weighted_sample(c, list(pool), n)
        same = same_sound(c)
        all_ids = [r["id"] for r in c.execute(f"SELECT id FROM words w WHERE NOT {REFERENCE_SQL}")]
        items = []
        for wid in chosen:
            item = full(fetch_word(c, wid))
            # Distractors that sound alike are the useful ones (affect,
            # effect), but never a homophone, which would be unfair; then
            # look-alikes (same first letter, similar length).
            w = item["word"]
            me = sound_key(item.get("phonetic") or "")
            # Every word said like one of this word's sounds: never a choice,
            # and a right answer when typed (Type It: "brake" for "break").
            mine = [sound_key(x) for x in [item.get("phonetic"), *(p["ipa"] for p in item.get("prons") or [])] if x]
            alike = {x for k in mine for x in same.get(k, ())} - {w}
            item["same_sound"] = sorted(alike)
            # Same number of words: a sentence among single words is a giveaway.
            # Never a look-up-only word (vulgar, slurs, very rare) as a choice.
            cands = [(r["word"], r["ph"] or "") for r in c.execute(
                "SELECT word, json_extract(data, '$.phonetic') AS ph FROM words w "
                "WHERE length(word) - length(replace(word, ' ', '')) = ? "
                f"AND lower(word) != lower(?) AND NOT {REFERENCE_SQL} ORDER BY random() LIMIT 400", (w.count(" "), w))]
            if len(cands) < 3:
                sample = random.sample(all_ids, k=min(200, len(all_ids)))
                cands += [(r["word"], "") for r in c.execute(
                    f"SELECT word FROM words WHERE id IN ({','.join('?' * len(sample))})", sample)
                    if r["word"].lower() != w.lower()]
            scored = []
            for x, ph in cands:
                d = sound_distance(me, sound_key(ph)) if me and ph else 1.0
                if d == 0 or x in alike:
                    continue   # sounds the same: no fair way to tell them apart by ear
                scored.append((d, x[0].lower() != w[0].lower(), abs(len(x) - len(w)), x))
            scored.sort()
            opts = [s[3] for s in scored[:3]] + [w]
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
        db.RECORDINGS.mkdir(parents=True, exist_ok=True)
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
