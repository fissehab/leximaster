#!/usr/bin/env python3
"""Build the LexiMaster vocabulary dataset.

Stages (run in order; every stage is resumable):

  collect  merge seed lists in seeds/ into a tagged candidate set
  expand   ask Claude Haiku for more candidates per category, up to quota
  filter   drop basic words by wordfreq Zipf score, cap at --target (15,000)
  fetch    look up each word (Free Dictionary API, Wiktionary fallback)
  audio    download American English recordings to data/audio/
  extras   synonyms, antonyms and a one-line etymology from Wiktionary
  enrich   generate the `nuance` section with Claude Haiku in batches

Progress is cached under data/cache/ (append-only JSONL), and data/words.json
is reassembled from the caches after each stage and periodically during long
stages. Interrupt at any time with Ctrl-C and rerun the same command.

Examples:
  python build_dataset.py                 # full build
  python build_dataset.py --limit 20      # quick end-to-end test on 20 words
  python build_dataset.py --status        # show progress only
  python build_dataset.py --stages enrich --retry-failed
"""
from __future__ import annotations

import argparse
import asyncio
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

import httpx
import truststore
from wordfreq import zipf_frequency

def load_dotenv(path: Path) -> None:
    """Minimal .env reader: KEY=value lines; real environment variables win and
    empty values are skipped (an empty ANTHROPIC_API_KEY would shadow other
    credential sources)."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (x.strip() for x in line.split("=", 1))
        value = value.strip("'\"")
        if value and not os.environ.get(key):
            os.environ[key] = value


load_dotenv(Path(__file__).resolve().parent / ".env")

# Use the OS certificate store so HTTPS works behind TLS-inspecting proxies
# (corporate networks), for both httpx and the Anthropic SDK.
truststore.inject_into_ssl()

ROOT = Path(__file__).resolve().parent
SEEDS = ROOT / "seeds"
DATA = ROOT / "data"
CACHE = DATA / "cache"
AUDIO = DATA / "audio"
WORDS_JSON = DATA / "words.json"
STATE_JSON = DATA / "build_state.json"
CANDIDATES = CACHE / "candidates.json"
DICT_CACHE = CACHE / "dict.jsonl"
AUDIO_CACHE = CACHE / "audio.jsonl"
ENRICH_CACHE = CACHE / "enrich.jsonl"
EXTRAS_CACHE = CACHE / "extras.jsonl"
EXAMPLES = SEEDS / "examples"  # hand-written conversation examples, one file per domain
MEANINGS = SEEDS / "meanings"  # meanings for everyday entries no dictionary lists
BIBLE_NAMES = SEEDS / "names" / "bible.txt"  # name | person, place or people | everyday meaning
SENSES = SEEDS / "senses"  # <domain>.txt: a domain sense shown before the dictionary's
CMUDICT = CACHE / "cmudict.dict"
CMUDICT_URL = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict"
SELECTED = CACHE / "selected.json"

STAGES = ["collect", "expand", "filter", "fetch", "audio", "extras", "enrich"]
# Wikimedia rejects some User-Agents; set LEXIMASTER_CONTACT (a URL or email)
# to identify yourself as their policy recommends.
_CONTACT = os.environ.get("LEXIMASTER_CONTACT", "").strip()
# All pronunciations (recordings and IPA) are American English.
ACCENT = "us"

USER_AGENT = (f"LexiMaster/1.0 (personal vocabulary study tool{'; ' + _CONTACT if _CONTACT else ''}) "
              f"python-httpx/{httpx.__version__}")

# Seed file stem -> tag. Domain files are named domain_<tag>.txt.
SOURCE_TAGS = {"gre": "advanced", "sat": "advanced", "advanced": "advanced",
               "awl": "academic", "academic": "academic",
               "literary": "literary", "professional": "professional"}
SUBJECT_DOMAINS = ["mathematics", "statistics", "data_science", "philosophy",
                   "theology", "christian_anthropology", "orthodox_mysticism", "logic",
                   "software_engineering", "artificial_intelligence", "bible", "professional"]
# Everyday American English: common words, phrasal verbs and expressions for
# conversation. They skip the frequency filter that keeps basic words out of
# the advanced lexicon.
EVERYDAY_DOMAINS = ["dining", "food", "shopping", "outdoors", "small_talk", "phrasal_verbs",
                    "idioms", "feelings", "home_health", "getting_around", "sports_culture",
                    "meetings", "phone_calls"]
ALL_TAGS = ["advanced", "academic", "literary"] + SUBJECT_DOMAINS + EVERYDAY_DOMAINS

# Candidate quota per tag for the expand stage (before filtering/dedup).
EXPAND_QUOTA = {
    "advanced": 6000, "academic": 1000, "professional": 2200, "literary": 1500,
    "mathematics": 900, "statistics": 900, "data_science": 900,
    "philosophy": 1000, "theology": 1000, "christian_anthropology": 600, "logic": 600,
    "orthodox_mysticism": 600, "software_engineering": 900, "artificial_intelligence": 900, "bible": 900,
}
EXPAND_DESCRIPTIONS = {
    "advanced": "advanced vocabulary of the GRE and SAT verbal sections: precise, "
                "sophisticated words used in academic reading and serious writing",
    "academic": "Academic Word List style vocabulary used across university disciplines",
    "professional": "precise words a senior professional uses in analytical writing, "
                    "strategy documents, and executive communication",
    "mathematics": "mathematics vocabulary (pure and applied), including general words "
                   "used with a precise mathematical sense",
    "statistics": "statistics and probability theory (distributions, inference, stochastic "
                  "processes, Bayesian methods), econometrics and causal inference vocabulary",
    "data_science": "data science, machine learning and data engineering vocabulary",
    "philosophy": "philosophy vocabulary: epistemology, metaphysics, ethics, philosophy of mind",
    "theology": "Christian theology, biblical studies, church history and religious studies vocabulary",
    "christian_anthropology": "Christian (theological) anthropology: the doctrine of the human "
                              "person, image of God, soul and body, sin and grace, free will, "
                              "virtue, personhood, embodiment and human destiny, across patristic, "
                              "Catholic, Orthodox and Protestant traditions",
    "logic": "formal and informal logic, argumentation and rhetoric vocabulary",
    "orthodox_mysticism": "Eastern Orthodox Christian mysticism and spirituality: hesychasm, "
                          "the Philokalia, the desert fathers, theosis, apophatic theology, "
                          "ascetic and liturgical vocabulary, including Greek and Slavonic terms "
                          "used in English writing",
    "software_engineering": "software engineering and architecture vocabulary used by senior "
                            "engineers: design, reliability, distributed systems, testing, "
                            "code quality and delivery practices",
    "bible": "the vocabulary of the Bible (Revised Standard Version) and biblical studies: canon and "
             "versions, names of God, covenant and salvation, worship and offices, Hebrew and Greek "
             "terms, and English expressions that come from the Bible; no archaic King James English",
    "artificial_intelligence": "artificial intelligence vocabulary used by AI researchers and "
                               "practitioners: machine learning, deep learning, large language "
                               "models, agents, evaluation, safety, alignment, interpretability "
                               "and AI governance",
    "literary": "literary, rhetorical and critical vocabulary found in serious essays, "
                "literature and journalism (precise adjectives, verbs and abstract nouns)",
}

# USD per 1M input / output tokens (prompts up to 100K tokens).
PRICES = {"haiku": (0.10, 0.50), "sonnet": (2.0, 10.0), "opus": (8.0, 40.0)}


def prices(model: str) -> tuple[float, float]:
    return next((v for k, v in PRICES.items() if k in model), PRICES["haiku"])


# --------------------------------------------------------------------------- utils

def log(msg: str) -> None:
    print(msg, flush=True)


def atomic_write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f"{path.suffix}.{os.getpid()}.tmp")  # one per process: concurrent stages can't collide
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def read_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> dict[str, dict]:
    """Last record per key wins, so retries simply append a newer line."""
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue  # a torn final line from an interrupted write
            out[rec["key"]] = rec
    return out


def norm_key(word: str) -> str:
    w = re.sub(r"[?!,…]", "", word).strip()
    # A sentence's final period: "Hang in there." = "hang in there", "Speaking."
    # = "speaking". Abbreviations with inner periods (i.i.d.) keep theirs.
    if " " in w or (w.endswith(".") and "." not in w[:-1]):
        w = w.rstrip(". ")
    return re.sub(r"[\s_]+", "-", w.lower())


def display_form(word: str) -> str:
    """Seed files write phrases with hyphens (a-priori); genuine hyphenated
    compounds are resolved during fetch, which tries both spellings."""
    return word.strip()


def slug(word: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", word.lower()).strip("_")


def zipf(word: str) -> float:
    return zipf_frequency(word.replace("-", " "), "en")


def strip_html(s: str) -> str:
    s = re.sub(r"<(style|script)\b.*?</\1>", "", s or "", flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


class Progress:
    def __init__(self, label: str, total: int):
        self.label, self.total, self.done = label, total, 0
        self.start = time.time()
        self.last_print = 0.0

    def tick(self, n: int = 1, extra: str = "", force: bool = False) -> None:
        self.done += n
        now = time.time()
        if not force and now - self.last_print < 1.0 and self.done < self.total:
            return
        self.last_print = now
        pct = 100.0 * self.done / max(self.total, 1)
        rate = self.done / max(now - self.start, 1e-6)
        eta = (self.total - self.done) / rate if rate > 0 else 0
        log(f"[{self.label}] {self.done}/{self.total} ({pct:.1f}%) · "
            f"ETA {fmt_secs(eta)}{' · ' + extra if extra else ''}")


def fmt_secs(s: float) -> str:
    s = int(s)
    if s >= 3600:
        return f"{s // 3600}h{(s % 3600) // 60:02d}m"
    if s >= 60:
        return f"{s // 60}m{s % 60:02d}s"
    return f"{s}s"


# ------------------------------------------------------------------ stage: collect

def load_examples() -> dict[str, list[dict]]:
    """Conversation examples from seeds/examples/*.txt, by key. Format:

        pick up
        - [collect someone] I'll pick you up at seven.
        - [buy on the way] Can you pick up some milk?

    The bracketed sense is optional. An entry may appear in several files;
    its examples are merged, deduplicated and grouped by meaning."""
    out: dict[str, list[dict]] = {}
    # The phrasal-verb and idiom files cover each entry's meanings
    # systematically, so they come first when an entry is merged.
    first = {"phrasal_verbs.txt": 0, "idioms.txt": 1}
    paths = sorted(EXAMPLES.glob("*.txt"), key=lambda p: (first.get(p.name, 2), p.name)) \
        if EXAMPLES.exists() else []
    for path in paths:
        key = None
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = re.match(r"\s*-\s*(?:\[([^\]]+)\]\s*)?(.+)$", line)
            if m and key:
                ex = {"sense": (m.group(1) or "").strip(), "text": m.group(2).strip()}
                if all(e["text"] != ex["text"] for e in out[key]):
                    out[key].append(ex)
            elif not m:
                key = norm_key(line.strip())
                out.setdefault(key, [])
    # An entry in several domains collects examples from each file. Keep
    # nine at most, chosen round-robin across meanings (one example of each
    # meaning before a second of any), then show them grouped by meaning.
    for key, exs in out.items():
        if len(exs) <= 9:
            continue
        groups: dict[str, list[dict]] = {}
        for e in exs:
            groups.setdefault(e["sense"].lower(), []).append(e)
        keep: set[int] = set()
        for rnd in range(max(map(len, groups.values()))):
            for g in groups.values():
                if rnd < len(g) and len(keep) < 9:
                    keep.add(id(g[rnd]))
        out[key] = [e for g in groups.values() for e in g if id(e) in keep]
    return out


def load_seed_file(path: Path) -> list[tuple[str, str]]:
    """(word, gloss) pairs. A line "expression | meaning" carries its own
    meaning, for everyday expressions that no dictionary lists."""
    words = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            word, _, gloss = line.partition("|")
            words.append((word.strip(), gloss.strip()))
    return words


def stage_collect(args) -> None:
    cands: dict[str, dict] = read_json(CANDIDATES, {})
    # Seed-derived tags are recomputed each run; expanded tags are kept.
    for c in cands.values():
        c["tags"] = sorted(set(c.get("expanded_tags", [])))
        c["seeded"] = False
    # Glosses are recomputed from the seed files too.
    seen_gloss = {norm_key(w): True for path in SEEDS.glob("*.txt")
                  for w, g in load_seed_file(path) if g}
    for c in cands.values():
        if c.get("gloss") and not seen_gloss.get(norm_key(c["word"])):
            c.pop("gloss")
    for path in sorted(SEEDS.glob("*.txt")):
        stem = path.stem
        # domain_<tag>.txt, or <source>[_anything].txt, e.g. gre_extra.txt -> gre
        if stem.startswith("domain_"):
            tag = stem[len("domain_"):]
        else:
            tag = SOURCE_TAGS.get(stem) or SOURCE_TAGS.get(stem.split("_", 1)[0], stem)
        for w, gloss in load_seed_file(path):
            k = norm_key(w)
            c = cands.setdefault(k, {"word": display_form(w), "tags": [], "expanded_tags": []})
            c["seeded"] = True
            if gloss:
                # The expression form names the entry: "Go ahead." over "go-ahead".
                c["gloss"], c["word"] = gloss, w
            elif " " in w and c["word"] == w.replace(" ", "-"):
                c["word"] = w  # older lists wrote phrases with hyphens: "beam search", not "beam-search"
            if tag not in c["tags"]:
                c["tags"].append(tag)
                c["tags"].sort()
    atomic_write_json(CANDIDATES, cands)
    seeded = sum(1 for c in cands.values() if c["seeded"])
    log(f"[collect] {seeded} seed candidates, {len(cands)} total candidates")


# ------------------------------------------------------------------- stage: expand

def use_bedrock() -> bool:
    """Claude through Amazon Bedrock (an AWS SSO profile) when there is no
    Anthropic API key but LEXIMASTER_AWS_PROFILE is set."""
    return not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")) \
        and bool(os.environ.get("LEXIMASTER_AWS_PROFILE"))


def anthropic_client():
    try:
        import anthropic
    except ImportError:
        sys.exit("The anthropic package is missing. Run ./setup.sh first.")
    if use_bedrock():
        return anthropic, anthropic.AsyncAnthropicBedrockMantle(
            aws_profile=os.environ["LEXIMASTER_AWS_PROFILE"],
            aws_region=os.environ.get("LEXIMASTER_AWS_REGION", "us-east-1"),
            max_retries=6, timeout=300)
    return anthropic, anthropic.AsyncAnthropic(max_retries=6, timeout=300)


def model_id(model: str) -> str:
    """Bedrock names models with an "anthropic." prefix."""
    return f"anthropic.{model}" if use_bedrock() and not model.startswith("anthropic.") else model


def have_credentials() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
                or os.environ.get("LEXIMASTER_AWS_PROFILE"))


async def preflight(anthropic, client, model: str) -> str | None:
    """One tiny request before a long run, so a bad credential, an expired
    SSO session or a model the account can't use stops the run with one
    clear message. Returns the problem, or None."""
    try:
        await client.messages.create(model=model_id(model), max_tokens=16,
                                     messages=[{"role": "user", "content": "Reply with OK."}])
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
        return f"{type(e).__name__}: {auth_hint()} ({getattr(e, 'message', e)})"
    except anthropic.NotFoundError as e:
        return f"model {model_id(model)} not found here; try --model claude-haiku-4-5 ({e.message})"
    except anthropic.APIStatusError as e:
        return f"API error {e.status_code}: {e.message}"
    except anthropic.APIConnectionError as e:
        return f"cannot reach the API: {e}"
    except Exception as e:  # botocore: expired SSO token, missing profile
        return f"{type(e).__name__}: {e}. {auth_hint()}"
    return None


def auth_hint() -> str:
    if use_bedrock():
        return (f"run `aws sso login --profile {os.environ['LEXIMASTER_AWS_PROFILE']}` "
                "and check that the role may call Bedrock")
    return "check ANTHROPIC_API_KEY"


EXPAND_SCHEMA = {
    "type": "object",
    "properties": {"words": {"type": "array", "items": {"type": "string"}}},
    "required": ["words"],
    "additionalProperties": False,
}


async def expand_once(anthropic, client, args, tag: str, existing: list[str], n: int) -> list[str]:
    prompt = (
        f"List {n} English words for this category: {EXPAND_DESCRIPTIONS[tag]}.\n\n"
        "Requirements:\n"
        "- Advanced vocabulary for a highly educated adult professional. Exclude basic "
        "everyday words any beginner or child knows (e.g. boy, house, run, big, data).\n"
        "- Prefer precise, high-value words that sharpen analytical writing and speech.\n"
        "- Use the dictionary headword (lemma) form, lowercase unless a proper adjective. "
        "Multi-word terms are allowed only when they are standard terms (e.g. a priori).\n"
        "- Do not repeat any word from the exclusion list below.\n\n"
        f"Exclusion list ({len(existing)} words):\n" + ", ".join(existing)
    )
    resp = await client.messages.create(
        model=model_id(args.model),
        max_tokens=8000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": EXPAND_SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    if resp.stop_reason == "refusal":
        return []
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        return [w.strip() for w in json.loads(text)["words"] if w and w.strip()]
    except (json.JSONDecodeError, KeyError):
        return []  # truncated at max_tokens; the next round asks again


async def stage_expand(args) -> None:
    if not have_credentials():
        log("[expand] skipped: no Claude credentials (ANTHROPIC_API_KEY or "
            "LEXIMASTER_AWS_PROFILE); seed lists only.")
        return
    anthropic, client = anthropic_client()
    problem = await preflight(anthropic, client, args.model)
    if problem:
        sys.exit(f"[expand] {problem}")
    cands: dict[str, dict] = read_json(CANDIDATES, {})
    for tag, quota in EXPAND_QUOTA.items():
        stalls = 0
        while True:
            have = [c["word"] for c in cands.values() if tag in c["tags"]]
            if len(have) >= quota or stalls >= 2:
                break
            n = min(150, quota - len(have) + 20)
            try:
                words = await expand_once(anthropic, client, args, tag, sorted(have), n)
            except anthropic.AuthenticationError:
                sys.exit(f"[expand] authentication failed: {auth_hint()}.")
            except anthropic.APIError as e:
                log(f"[expand] {tag}: API error ({e}); will retry next run")
                break
            added = 0
            for w in words:
                if len(w) > 40 or not re.fullmatch(r"[A-Za-z][A-Za-z' \-]*", w):
                    continue
                k = norm_key(w)
                c = cands.setdefault(k, {"word": w.replace(" ", "-") if " " in w else w,
                                         "tags": [], "expanded_tags": [], "seeded": False})
                if tag not in c["tags"]:
                    c["tags"].append(tag)
                    c["tags"].sort()
                    c.setdefault("expanded_tags", []).append(tag)
                    added += 1
            atomic_write_json(CANDIDATES, cands)
            stalls = stalls + 1 if added < 10 else 0
            log(f"[expand] {tag}: +{added} → {len(have) + added}/{quota} "
                f"(total candidates {len(cands)})")
    log(f"[expand] done: {len(cands)} candidates")


# ------------------------------------------------------------------- stage: filter

def stage_filter(args) -> None:
    cands: dict[str, dict] = read_json(CANDIDATES, {})
    kept, dropped = [], []
    for k, c in cands.items():
        z = zipf(c["word"])
        c["zipf"] = round(z, 2)
        tags = set(c["tags"])
        if not tags:
            continue  # removed from every seed list
        if tags & (set(EVERYDAY_DOMAINS) | {"bible"}):
            # Common on purpose: conversation vocabulary, and Bible words such
            # as "church", "sin" or "cross".
            kept.append(k)
            continue
        specialist = bool(tags & (set(SUBJECT_DOMAINS) - {"professional"}))
        if specialist and re.search(r"[- ]", c["word"]):
            kept.append(k)  # technical terms; phrase Zipf scores are unreliable
            continue
        # General word lists (GRE, AWL, SAT, literary, professional) contain
        # many everyday words, so they must be rarer than domain vocabulary,
        # whose common-looking words (grace, recall, rank) carry technical senses.
        limit = args.max_zipf if specialist else args.max_zipf - args.general_margin
        (dropped if z > limit else kept).append(k)
    # Over target: prefer words tagged by more sources, then rarer words
    # among equally tagged ones, keeping domain-tagged words first.
    def priority(k):
        c = cands[k]
        subject = any(t in SUBJECT_DOMAINS or t in EVERYDAY_DOMAINS for t in c["tags"])
        return (-int(subject), -len(c["tags"]), -int(c.get("seeded", False)), c["zipf"])
    kept.sort(key=priority)
    if args.target and len(kept) > args.target:
        kept = kept[: args.target]
    selected = sorted(kept, key=lambda k: cands[k]["word"].lower())
    atomic_write_json(SELECTED, {"max_zipf": args.max_zipf, "words": selected})
    atomic_write_json(CANDIDATES, cands)
    examples = ", ".join(sorted(dropped, key=lambda k: -cands[k]["zipf"])[:12])
    log(f"[filter] kept {len(selected)}, dropped {len(dropped)} as too basic "
        f"(Zipf > {args.max_zipf}; e.g. {examples})")


def selected_words(limit: int | None = None) -> list[str]:
    sel = read_json(SELECTED, None)
    if sel is None:
        sys.exit("No selection yet: run the collect and filter stages first.")
    words = sel["words"]
    return words[:limit] if limit else words


# -------------------------------------------------------------------- stage: fetch

class DictionarySources:
    """Free Dictionary API first; Wiktionary for misses, missing audio/IPA, or
    when the Free Dictionary API is blocked (it sits behind Cloudflare)."""

    FREEDICT = "https://api.dictionaryapi.dev/api/v2/entries/en/{}"
    WIKT_DEF = "https://en.wiktionary.org/api/rest_v1/page/definition/{}"
    WIKT_PARSE = "https://en.wiktionary.org/w/api.php"
    COMMONS_FILE = "https://commons.wikimedia.org/wiki/Special:FilePath/{}"

    def __init__(self, client: httpx.AsyncClient, accent: str):
        self.client = client
        self.accent = accent
        self.freedict_blocked = False
        self.freedict_errors = 0
        self.network_failures: set[str] = set()
        self.freedict_lock = asyncio.Semaphore(3)
        self.wikt_lock = asyncio.Semaphore(4)

    async def get(self, url, lock, attempts: int = 5, **kw) -> httpx.Response | None:
        for attempt in range(attempts):
            async with lock:
                try:
                    r = await self.client.get(url, **kw)
                except httpx.HTTPError:
                    r = None
            if r is not None and r.status_code == 403 and "robot policy" in r.text:
                raise WikimediaBlocked()
            if r is not None and r.status_code != 429 and r.status_code < 500:
                return r
            if attempt + 1 < attempts:
                await asyncio.sleep(2 ** attempt + 0.5)
        return None

    async def freedict(self, word: str) -> dict | None:
        if self.freedict_blocked:
            return None
        r = await self.get(self.FREEDICT.format(quote(word)), self.freedict_lock, attempts=2)
        if r is None or (r.status_code != 404 and "text/html" in r.headers.get("content-type", "")):
            # Cloudflare challenge (403) or origin errors (5xx/530): after a few,
            # stop asking and use Wiktionary for the rest of the run.
            self.freedict_errors += 1
            if self.freedict_errors >= 3 and not self.freedict_blocked:
                self.freedict_blocked = True
                log("[fetch] Free Dictionary API is unavailable from this network "
                    f"(HTTP {r.status_code if r is not None else 'error'}); "
                    "using Wiktionary for the rest of this run.")
            return None
        self.freedict_errors = 0
        if r.status_code != 200:
            return None
        try:
            data = r.json()
        except ValueError:
            return None
        if not isinstance(data, list) or not data:
            return None
        meanings: dict[str, dict] = {}
        phonetics, phonetic = [], ""
        for entry in data:
            phonetic = phonetic or entry.get("phonetic", "")
            for p in entry.get("phonetics", []):
                audio = p.get("audio") or ""
                accent = ""
                m = re.search(r"-(us|uk|au|ca)\.mp3$", audio)
                if m:
                    accent = m.group(1)
                phonetics.append({"text": p.get("text", ""), "audio": audio, "accent": accent})
            for m in entry.get("meanings", []):
                pos = m.get("partOfSpeech", "")
                slot = meanings.setdefault(pos, {"pos": pos, "senses": [], "synonyms": [], "antonyms": []})
                for d in m.get("definitions", []):
                    slot["senses"].append({
                        "definition": d.get("definition", ""),
                        "example": d.get("example", ""),
                        "synonyms": d.get("synonyms", []),
                        "antonyms": d.get("antonyms", []),
                    })
                slot["synonyms"] += [s for s in m.get("synonyms", []) if s not in slot["synonyms"]]
                slot["antonyms"] += [s for s in m.get("antonyms", []) if s not in slot["antonyms"]]
        return {"word": data[0].get("word", word), "phonetic": phonetic,
                "phonetics": phonetics, "meanings": list(meanings.values()),
                "source": "freedictionary"}

    async def wiktionary_defs(self, word: str) -> list[dict]:
        r = await self.get(self.WIKT_DEF.format(quote(word.replace(" ", "_"))), self.wikt_lock)
        if r is None or r.status_code not in (200, 404):
            self.network_failures.add(word)
            return []
        if r.status_code == 404:
            return []
        try:
            data = r.json().get("en", [])
        except ValueError:
            return []
        meanings: dict[str, dict] = {}
        for block in data:
            pos = (block.get("partOfSpeech") or "").lower()
            if pos == "proper noun":
                continue
            slot = meanings.setdefault(pos, {"pos": pos, "senses": [], "synonyms": [], "antonyms": []})
            for d in block.get("definitions", []):
                definition = strip_html(d.get("definition", ""))
                if not definition or re.match(r"\((obsolete|nonstandard|rare, obsolete)\b", definition, re.I):
                    continue
                examples = [strip_html(e) for e in d.get("examples", []) if strip_html(e)]
                slot["senses"].append({"definition": definition,
                                       "example": examples[0] if examples else "",
                                       "synonyms": [], "antonyms": []})
        return [m for m in meanings.values() if m["senses"]]

    async def wiktionary_pron(self, word: str) -> dict:
        params = {"action": "parse", "page": word.replace(" ", "_"), "prop": "wikitext",
                  "format": "json", "formatversion": "2", "redirects": "1"}
        r = await self.get(self.WIKT_PARSE, self.wikt_lock, params=params)
        out = {"ipa": [], "audio": []}
        if r is None or r.status_code != 200:
            return out
        try:
            text = r.json().get("parse", {}).get("wikitext", "")
        except ValueError:
            return out
        i = text.find("==English==")
        if i < 0:
            return out
        section = text[i + len("==English=="):]
        nxt = re.search(r"\n==[^=]", section)
        section = section[: nxt.start()] if nxt else section
        for m in re.finditer(r"\{\{IPA\|en\|([^}]*)\}\}", section):
            parts = m.group(1).split("|")
            prons = [p for p in parts if p.startswith(("/", "["))]
            labels = " ".join(p for p in parts if p.startswith("a="))
            # A label we don't recognise (a=India, a=CA) is still not US.
            acc = accent_of(labels) or ("other" if labels else "")
            for p in prons:
                out["ipa"].append({"text": p, "accent": acc})
        for m in re.finditer(r"\{\{audio\|en\|([^|}]+)([^}]*)\}\}", section):
            fname = m.group(1).strip()
            out["audio"].append({"file": fname,
                                 "url": self.COMMONS_FILE.format(quote(fname.replace(" ", "_"))),
                                 "accent": accent_of(m.group(2) + " " + fname)})
        return out

    async def lookup(self, word: str) -> dict | None:
        variants = [word]
        if "-" in word:
            variants.append(word.replace("-", " "))
        if word != word.lower():
            variants.append(word.lower())
        result = None
        for v in variants:
            result = await self.freedict(v)
            if result:
                break
        if result is None:
            for v in variants:
                meanings = await self.wiktionary_defs(v)
                if meanings:
                    result = {"word": v, "phonetic": "", "phonetics": [],
                              "meanings": meanings, "source": "wiktionary"}
                    break
        if result is None:
            if any(v in self.network_failures for v in variants):
                self.network_failures.difference_update(variants)
                raise LookupFailed(word)
            return None
        # Always collect Wiktionary pronunciations too: they add IPA where the
        # Free Dictionary has none and backup audio if its media host fails.
        pron = await self.wiktionary_pron(result["word"])
        known = {p["audio"] for p in result["phonetics"] if p["audio"]}
        for p in pron["ipa"]:
            result["phonetics"].append({"text": p["text"], "audio": "", "accent": p["accent"]})
        for a in pron["audio"]:
            if a["url"] not in known:
                result["phonetics"].append({"text": "", "audio": a["url"], "accent": a["accent"]})
        result["phonetic"] = pick_phonetic(result["phonetics"], self.accent) or result["phonetic"]
        result["audio_candidates"] = rank_audio(result["phonetics"], self.accent)
        first = result["audio_candidates"][0] if result["audio_candidates"] else {}
        result["audio_url"], result["audio_accent"] = first.get("url", ""), first.get("accent", "")
        return result


class WikimediaBlocked(Exception):
    """Wikimedia's robot policy rejected our User-Agent (needs contact info)."""


class LookupFailed(Exception):
    """Network/HTTP failure: leave the word uncached so a rerun retries it."""


def accent_of(label: str) -> str:
    s = label.lower()
    if re.search(r"\b(us|ga|general american|american|-us-)\b", s) or "(usa)" in s:
        return "us"
    if re.search(r"\b(uk|rp|received pronunciation|british|southern england|england)\b", s):
        return "uk"
    if "australia" in s or re.search(r"\bau\b", s):
        return "au"
    return ""


# Marks of a British (non-rhotic) or South Asian transcription.
NON_US_IPA = re.compile(r"[ɖʈɳɽɭ]|[ɑɔɜ]ː|eə|ɛə|ɜ(?![ɹr])")


def us_style(text: str) -> str:
    """American transcription conventions: no length marks, and the LOT and
    GOAT vowels as ɑ and oʊ (Wiktionary often shares one RP-style IPA
    between UK and US)."""
    text = re.sub(r"<[^>]*>|<.*$", "", text).strip()
    text = re.sub(r"\s+(?=/$)|(?<=^/)\s+", "", text)
    return text.replace("ː", "").replace("əʊ", "oʊ").replace("ɒ", "ɑ")


def us_ipa(text: str) -> str:
    """An unlabelled transcription as US IPA, or "" when it is plainly
    another accent: non-rhotic (ɜː, ɪə, ɑː…) or retroflex (Indian English)."""
    if NON_US_IPA.search(re.sub(r"(?<=[iu])ː", "", text)):
        return ""
    return us_style(text)


def pick_phonetic(phonetics: list[dict], accent: str) -> str:
    """IPA in the chosen accent; unlabelled IPA only as a fallback, and only
    when it reads as American. IPA labelled with another accent is never used."""
    texts = [p for p in phonetics if p.get("text")]
    for p in texts:
        if p["accent"] == accent:
            return us_style(p["text"])
    for p in texts:
        if p["accent"] == "":
            ipa = us_ipa(p["text"])
            if ipa:
                return ipa
    return ""


def rank_audio(phonetics: list[dict], accent: str) -> list[dict]:
    """Recordings in the chosen accent only. Words without one fall back to
    the browser's speech synthesis in that accent, never to another accent."""
    seen, out = set(), []
    for p in phonetics:
        if p.get("audio") and p["audio"] not in seen and p["accent"] == accent:
            seen.add(p["audio"])
            out.append({"url": p["audio"], "accent": p["accent"]})
    return out


async def stage_fetch(args) -> None:
    words = selected_words(args.limit)
    cands = read_json(CANDIDATES, {})
    done = read_jsonl(DICT_CACHE)
    todo = [k for k in words if not cands.get(k, {}).get("gloss") and (
            k not in done or (args.retry_failed and done[k].get("status") != "ok"))]
    log(f"[fetch] {len(words) - len(todo)} cached or self-defined, {len(todo)} to look up")
    if not todo:
        return
    prog = Progress("fetch", len(todo))
    stats = {"ok": 0, "not_found": 0, "audio": 0, "errors": 0}
    blocked: list[str] = []
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30,
                                 follow_redirects=True) as http:
        src = DictionarySources(http, args.accent)

        async def one(k: str):
            if blocked:
                return
            try:
                entry = await src.lookup(cands[k]["word"])
            except WikimediaBlocked:
                blocked.append(k)
                return
            except LookupFailed:
                stats["errors"] += 1
                prog.tick(extra=f"network errors {stats['errors']} (retried next run)")
                return
            if entry:
                append_jsonl(DICT_CACHE, {"key": k, "status": "ok", "entry": entry})
                stats["ok"] += 1
                stats["audio"] += bool(entry["audio_url"])
            else:
                append_jsonl(DICT_CACHE, {"key": k, "status": "not_found"})
                stats["not_found"] += 1
            prog.tick(extra=f"found {stats['ok']} · audio {stats['audio']} · "
                            f"not found {stats['not_found']} · errors {stats['errors']}")

        await run_bounded(todo, one, 8, every=200, on_checkpoint=lambda: assemble(quiet=True))
    if blocked:
        sys.exit("[fetch] Wikimedia blocked the request under its robot policy "
                 "(https://w.wiki/4wJS). Set LEXIMASTER_CONTACT to a URL or email that "
                 "identifies you, e.g.\n  export LEXIMASTER_CONTACT=you@example.com\n"
                 "then rerun; finished lookups are kept.")
    log(f"[fetch] done: {stats['ok']} found ({stats['audio']} with recorded audio), "
        f"{stats['not_found']} not found, {stats['errors']} network errors (rerun to retry)")


async def run_bounded(items, fn, concurrency: int, every: int = 0, on_checkpoint=None):
    sem = asyncio.Semaphore(concurrency)
    counter = {"n": 0}

    async def wrapped(item):
        async with sem:
            await fn(item)
        counter["n"] += 1
        if every and on_checkpoint and counter["n"] % every == 0:
            on_checkpoint()

    await asyncio.gather(*(wrapped(i) for i in items))


# -------------------------------------------------------------------- stage: audio

def convert_audio(src: Path) -> Path:
    """Normalise WAV/OGG/FLAC (common on Wikimedia) to small AAC .m4a files
    that every browser plays. MP3 files are kept as-is."""
    if src.suffix.lower() in (".mp3", ".m4a"):
        return src
    dst = src.with_suffix(".m4a")
    cmds = []
    if shutil.which("ffmpeg"):
        cmds.append(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
                     "-ac", "1", "-c:a", "aac", "-b:a", "64k", str(dst)])
    if shutil.which("afconvert") and src.suffix.lower() in (".wav", ".flac"):
        cmds.append(["afconvert", "-f", "m4af", "-d", "aac", "-c", "1", str(src), str(dst)])
    for cmd in cmds:
        if subprocess.run(cmd, capture_output=True).returncode == 0 and dst.exists():
            src.unlink(missing_ok=True)
            return dst
    return src  # unconverted, still playable in Chrome/Firefox


async def stage_audio(args) -> None:
    words = selected_words(args.limit)
    dict_cache = read_jsonl(DICT_CACHE)
    done = read_jsonl(AUDIO_CACHE)
    todo = []
    removed = 0
    for k in words:
        rec = dict_cache.get(k)
        if not rec or rec["status"] != "ok":
            continue
        candidates = rank_audio(rec["entry"]["phonetics"], args.accent)
        prev = done.get(k)
        if prev and prev["status"] == "ok" and prev.get("accent") != args.accent:
            # Downloaded under the old "preferred accent" rule: remove it.
            (AUDIO / prev["file"]).unlink(missing_ok=True)
            append_jsonl(AUDIO_CACHE, {"key": k, "status": "removed", "reason": "accent",
                                       "accent": prev.get("accent", "")})
            removed += 1
            prev = None
        if not candidates:
            continue
        if prev and prev["status"] == "ok" and (AUDIO / prev["file"]).exists():
            continue
        if prev and prev["status"] == "failed" and not args.retry_failed:
            continue
        rec["entry"]["audio_candidates"] = candidates
        todo.append(k)
    if removed:
        log(f"[audio] removed {removed} recordings not in accent '{args.accent}'")
    log(f"[audio] {len(todo)} files to download")
    if not todo:
        return
    AUDIO.mkdir(parents=True, exist_ok=True)
    prog = Progress("audio", len(todo))
    failures = {"n": 0}
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=60,
                                 follow_redirects=True) as http:
        async def download(url: str) -> bytes | None:
            for attempt in range(6):
                try:
                    r = await http.get(url)
                except httpx.HTTPError:
                    r = None
                if r is not None:
                    if r.status_code == 200 and len(r.content) > 500 \
                            and "text/html" not in r.headers.get("content-type", ""):
                        return r.content
                    if r.status_code != 429 and r.status_code < 500:
                        return None
                    if r.status_code >= 500 and "dictionaryapi.dev" in url:
                        return None  # Cloudflare-fronted host: move to the next source
                    wait = r.headers.get("retry-after", "")
                    delay = min(float(wait), 30.0) if wait.isdigit() else 2 ** attempt
                else:
                    delay = 2 ** attempt
                await asyncio.sleep(delay)
            return None

        async def one(k: str):
            candidates = dict_cache[k]["entry"]["audio_candidates"]
            ok = None
            for cand in candidates:
                url = cand["url"]
                content = await download(url)
                if content:
                    ext = Path(url.split("?")[0]).suffix.lower()
                    if ext not in (".mp3", ".ogg", ".oga", ".wav", ".flac", ".m4a", ".opus"):
                        ext = ".mp3"
                    dest = AUDIO / f"{slug(k)}{ext}"
                    dest.write_bytes(content)
                    final = await asyncio.to_thread(convert_audio, dest)
                    ok = {"key": k, "status": "ok", "file": final.name, "source_url": url,
                          "accent": cand["accent"]}
                    break
            if ok:
                append_jsonl(AUDIO_CACHE, ok)
            else:
                failures["n"] += 1
                append_jsonl(AUDIO_CACHE, {"key": k, "status": "failed",
                                           "source_url": candidates[0]["url"]})
            prog.tick(extra=f"failed {failures['n']}")

        await run_bounded(todo, one, 3)
    log(f"[audio] done ({failures['n']} failed; those words fall back to speech synthesis)")


# ------------------------------------------------------------------- stage: extras

LANGS = {
    "la": "Latin", "la-lat": "Late Latin", "la-med": "Medieval Latin", "la-ecc": "Ecclesiastical Latin",
    "la-new": "New Latin", "la-vul": "Vulgar Latin", "la-cla": "Classical Latin", "grc": "Ancient Greek",
    "grc-koi": "Koine Greek", "el": "Greek", "gkm": "Byzantine Greek", "fr": "French", "frm": "Middle French",
    "fro": "Old French", "xno": "Anglo-Norman", "enm": "Middle English", "ang": "Old English",
    "en": "English", "it": "Italian", "es": "Spanish", "pt": "Portuguese", "de": "German",
    "gmh": "Middle High German", "goh": "Old High German", "nl": "Dutch", "dum": "Middle Dutch",
    "non": "Old Norse", "gem-pro": "Proto-Germanic", "ine-pro": "Proto-Indo-European",
    "itc-pro": "Proto-Italic", "ar": "Arabic", "he": "Hebrew", "hbo": "Biblical Hebrew",
    "arc": "Aramaic", "syc": "Classical Syriac", "sa": "Sanskrit", "fa": "Persian", "tr": "Turkish",
    "ru": "Russian", "cu": "Old Church Slavonic", "orv": "Old East Slavic", "yi": "Yiddish",
    "ga": "Irish", "cy": "Welsh", "sco": "Scots", "ja": "Japanese", "zh": "Chinese",
    "pro": "Old Occitan", "oc": "Occitan", "ca": "Catalan", "sv": "Swedish", "da": "Danish",
}
DERIV_TEMPLATES = {"inh", "inh+", "der", "der+", "bor", "bor+", "lbor", "uder", "slbor", "obor",
                   "calque", "cal", "learned borrowing", "borrowed", "inherited", "derived", "bf"}
MENTION_TEMPLATES = {"m", "l", "mention", "link", "m+", "ll"}
AFFIX_TEMPLATES = {"af", "affix", "confix", "surf", "compound", "com", "prefix", "pre", "suffix",
                   "suf", "blend", "univerbation"}


def _args(body: str) -> tuple[str, list[str], dict]:
    parts = body.split("|")
    pos, named = [], {}
    for x in parts[1:]:
        if re.match(r"^[a-z0-9]+=", x):
            k, v = x.split("=", 1)
            named[k] = v
        else:
            pos.append(x)
    return parts[0].strip(), pos, named


def _term(term: str, gloss: str) -> str:
    term = term.split("#")[0].strip()
    if term in ("", "-"):
        return ""
    out = f"*{term}*" if term else ""
    if gloss.strip():
        out += f" (“{gloss.strip()}”)"
    return out


def render_template(body: str) -> str:
    """Render the common Wiktionary etymology templates as plain text; drop
    everything else (references, roots, boxes)."""
    name, pos, named = _args(body)
    gloss = named.get("t") or named.get("gloss") or ""
    if name in DERIV_TEMPLATES and len(pos) >= 2:
        term = pos[2] if len(pos) > 2 else ""
        gloss = gloss or (pos[4] if len(pos) > 4 else "")
        return (LANGS.get(pos[1], "") + " " + _term(term, gloss)).strip()
    if name in MENTION_TEMPLATES and pos:
        term = pos[1] if len(pos) > 1 else ""
        gloss = gloss or (pos[3] if len(pos) > 3 else "")
        return _term(term, gloss)
    if name in AFFIX_TEMPLATES and len(pos) >= 2:
        return " + ".join(f"*{x.split('#')[0]}*" for x in pos[1:] if x.split("#")[0])
    if name in ("glossary", "w", "lang", "q", "qualifier", "i", "gloss"):
        return pos[-1] if pos else ""
    if name == "etyl" and pos:
        return LANGS.get(pos[0], "")
    return ""


def render_etymology(raw: str) -> str:
    """First line of the etymology that has real content once templates are
    rendered; lines holding only structural templates (roots, boxes) are skipped."""
    for line in raw.split("\n"):
        if re.match(r"\s*(\[\[(File|Image):|\||\{\||<gallery|thumb\|)", line, re.I):
            continue
        out = _render_etymology_line(line)
        if out:
            return out
    return ""


def _render_etymology_line(text: str) -> str:
    text = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # Wiki links first: inside a template their "|" would split its arguments.
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = re.sub(r"(?<=\w)#[A-Z][a-z]+\b", "", text)  # "fit#Verb" -> "fit"
    for _ in range(4):  # innermost templates first
        text = re.sub(r"\{\{([^{}]*)\}\}", lambda m: render_template(m.group(1)), text)
    if "{{" in text or "}}" in text:
        return ""
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)  # [[link|label]] -> label
    text = re.sub(r"'{2,3}", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+([,.;])", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" ,;")
    text = re.sub(r",\s*(?=[,.])", "", text)
    # Parentheses left without a cited form, e.g. "(compare modern )".
    text = re.sub(r"\s*\((?:[^()*“]*)\)", lambda m: m.group(0) if re.search(r"\d", m.group(0)) else "", text)
    # A preposition followed by nothing means a template we can't render was
    # dropped mid-sentence ("Alteration of after French"); skip the line.
    if re.search(r"\b(of|from|and|by|with|to|via)\s+(?=(of|from|after|and|by|with|to|via)\b|[,.;]|$)", text):
        return ""
    text = re.sub(r"\b(from|in turn from|ultimately from)\s*(?=[,.]|$)", "", text, flags=re.I).strip(" ,;")
    if len(text) < 8 or "*" not in text and len(text) < 20:
        return ""
    out = re.split(r"(?<=\.)\s+", text)[0]
    if len(out) > 260:
        out = out[:257].rsplit(" ", 1)[0] + "…"
    return out


def parse_word_list(section: str, template: str, heading: str) -> list[str]:
    words: list[str] = []
    section = re.sub(r"<!--.*?-->", "", section, flags=re.S)
    for m in re.finditer(r"\{\{" + template + r"\|en\|([^}]*)\}\}", section):
        for x in m.group(1).split("|"):
            x = x.split("#")[0].strip()
            if x and "=" not in x and not x.startswith(("Thesaurus:", "Wikisaurus:")) \
                    and re.match(r"^[A-Za-z]", x):
                words.append(x)
    for m in re.finditer(r"=====?" + heading + r"=====?\n(.*?)(?:\n\n|\n=)", section, re.S):
        for t in re.finditer(r"\{\{l\|en\|([^|}]+)", m.group(1)):
            x = t.group(1).split("#")[0].strip()
            if x and not x.startswith("Thesaurus:"):
                words.append(x)
    seen, out = set(), []
    for w in words:
        if w.lower() not in seen and len(w) < 40:
            seen.add(w.lower())
            out.append(w)
    return out[:12]


def sense_key(text: str) -> str:
    """First six words, letters only: matches a sense in the page markup to
    the same sense in the definitions API, whose text has the labels removed."""
    return " ".join(re.sub(r"[^a-z ]+", " ", text.lower()).split()[:6])


def plain_definition(line: str) -> str:
    line = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<!--.*?-->", "", line, flags=re.S)
    line = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", line)
    for _ in range(3):
        line = re.sub(r"\{\{[^{}]*\}\}", "", line)
    return re.sub(r"<[^>]+>|'{2,3}", "", line).strip()


def parse_sense_labels(section: str) -> list[list]:
    """[[sense_key, [labels]], ...] for definition lines with usage labels."""
    out = []
    for line in section.splitlines():
        m = re.match(r"^#+ (.*)$", line)
        if not m:
            continue
        labels = []
        for t in re.finditer(r"\{\{(?:lb|lbl|label)\|en\|([^}]*)\}\}", m.group(1)):
            labels += [x.strip().lower() for x in t.group(1).split("|")
                       if x.strip() and "=" not in x and x.strip() not in ("_", "and", "or")]
        key = sense_key(plain_definition(m.group(1)))
        if labels and key:
            out.append([key, labels])
    return out


LEMMA_RE = re.compile(r"\bof\s+([^.;,()]+?)\s*(?:[.;,(]|$)")


async def fetch_extras(src: "DictionarySources", word: str, meanings: list[dict] | None = None) -> dict:
    params = {"action": "parse", "page": word.replace(" ", "_"), "prop": "wikitext",
              "format": "json", "formatversion": "2", "redirects": "1"}
    r = await src.get(src.WIKT_PARSE, src.wikt_lock, params=params)
    if r is None or r.status_code not in (200, 404):
        raise LookupFailed(word)
    try:
        text = r.json().get("parse", {}).get("wikitext", "") if r.status_code == 200 else ""
    except ValueError:
        raise LookupFailed(word)
    i = text.find("==English==")
    out = {"synonyms": [], "antonyms": [], "etymology": "", "sense_labels": []}
    if i >= 0:
        section = text[i + len("==English=="):]
        nxt = re.search(r"\n==[^=]", section)
        section = section[: nxt.start()] if nxt else section
        ety = re.search(r"===Etymology[^=]*===\n(.*?)(?:\n\n|\n=)", section, re.S)
        out.update({
            "synonyms": parse_word_list(section, "syn", "Synonyms"),
            "antonyms": parse_word_list(section, "ant", "Antonyms"),
            "etymology": render_etymology(ety.group(1)) if ety else "",
            "sense_labels": parse_sense_labels(section),
        })
    # A headword that is only an inflection or variant ("plural of
    # blandishment"): record the main form and its definitions.
    senses = [s_["definition"] for m in meanings or [] for s_ in m["senses"]]
    if senses and all(FORM_OF_RE.match(d) for d in senses):
        lm = LEMMA_RE.search(senses[0])
        if lm:
            lemma = lm.group(1).strip()
            out["lemma"] = lemma
            if lemma != word:
                out["lemma_meanings"] = await src.wiktionary_defs(lemma)
                if lemma.lower() == word.lower():  # "hesychasm" -> "Hesychasm"
                    out["lemma_ipa"] = (await src.wiktionary_pron(lemma))["ipa"]
    return out


async def ensure_cmudict() -> None:
    """The CMU Pronouncing Dictionary (American English) supplies IPA for
    words whose Wiktionary entry has no US transcription."""
    if CMUDICT.exists():
        return
    log("[extras] downloading the CMU Pronouncing Dictionary (US English)")
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
            r = await http.get(CMUDICT_URL)
        r.raise_for_status()
    except httpx.HTTPError as exc:
        log(f"[extras] CMU dictionary unavailable ({exc}); rerun to retry")
        return
    tmp = CMUDICT.with_suffix(".tmp")
    tmp.write_bytes(r.content)
    tmp.replace(CMUDICT)


async def stage_extras(args) -> None:
    await ensure_cmudict()
    words = selected_words(args.limit)
    dict_cache = read_jsonl(DICT_CACHE)
    done = read_jsonl(EXTRAS_CACHE)
    todo = [k for k in words if dict_cache.get(k, {}).get("status") == "ok" and k not in done]
    log(f"[extras] {len(todo)} words to look up")
    if not todo:
        return
    prog = Progress("extras", len(todo))
    stats = {"syn": 0, "ety": 0, "errors": 0}
    blocked: list[str] = []
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, timeout=30,
                                 follow_redirects=True) as http:
        src = DictionarySources(http, args.accent)

        async def one(k: str):
            if blocked:
                return
            try:
                entry = dict_cache[k]["entry"]
                ex = await fetch_extras(src, entry["word"], entry["meanings"])
            except WikimediaBlocked:
                blocked.append(k)
                return
            except LookupFailed:
                stats["errors"] += 1
                prog.tick()
                return
            append_jsonl(EXTRAS_CACHE, {"key": k, **ex})
            stats["syn"] += bool(ex["synonyms"] or ex["antonyms"])
            stats["ety"] += bool(ex["etymology"])
            prog.tick(extra=f"with synonyms/antonyms {stats['syn']} · etymology {stats['ety']} · "
                            f"errors {stats['errors']}")

        await run_bounded(todo, one, 6, every=500, on_checkpoint=lambda: assemble(quiet=True))
    if blocked:
        sys.exit("[extras] Wikimedia blocked the request; set LEXIMASTER_CONTACT and rerun.")
    log(f"[extras] done: {stats['syn']} with synonyms/antonyms, {stats['ety']} with etymology, "
        f"{stats['errors']} network errors (rerun to retry)")


# ------------------------------------------------------------------- stage: enrich

ENRICH_SYSTEM = """You are an expert American lexicographer and ESL teacher writing the definitive study entry for each word or phrase in a vocabulary app. The learner is a non-native English speaker: a principal data scientist and theologian who lives in the United States. Their goals: (1) pronounce every word correctly in General American English, (2) command precise, professional and academic vocabulary, and (3) speak naturally in everyday American life (restaurants, stores, small talk, phone calls, meetings).

AMERICAN ENGLISH ONLY. Use American spelling everywhere (color, center, behavior, neighborhood, analyze, organization, judgment, traveling, gray, program). Describe American pronunciation (rhotic r; flapped t in "water", "butter", "matter"; the cot-caught merger common in the US; American vowels), American usage and American culture. If a word is mainly British, say so in usage_note and give the American equivalent.

Each input item gives the headword, its subject domains, its dictionary senses (the first is the one the app shows first) and sometimes the meanings its example sentences cover. Use these as reference; correct them if they are wrong.

Write one entry per item with these fields:

- core.pos and core.definition: part of speech and a clear learner's definition (at most 25 words) of the sense this learner most needs. For a subject-domain word (theology, statistics, artificial intelligence...), define it in that domain. For an everyday word or phrase, use its everyday American meaning. Never lead with a rare, archaic or anatomical sense.
- pronunciation.ipa: the General American IPA for the headword in the sense you define, between slashes, with ˈ (primary) and ˌ (secondary) stress marks. The item's IPA comes from Wiktionary or the CMU dictionary and is usually right: if it is, copy it exactly. If it is wrong (wrong stress, a rare or British variant, or letters spelled out for an acronym Americans say as a word, like ACID), give the correct one.
- pronunciation.respelling: plain stress respelling of exactly that IPA: the same syllables, with only the primary-stressed syllable of each word in capitals: "par-suh-MOH-nee-us", /əˌmɛɹɪˈkɑnoʊ/ → "uh-mair-ih-KAH-noh", "uh BIT MUCH". Respell each word of a phrase. The pronunciation tip and common_mistakes must agree with this IPA.
- pronunciation.tip: one or two sentences on where the stress falls in American speech and what a non-native speaker typically gets wrong: silent letters, reduced vowels, the flap t, stress shifts between related forms (ANalyze / aNALysis), linking in phrases ("pick it up" sounds like "pi-ki-DUP").
- us_usage: how the word, in the sense you define, is used in the United States: "common" (everyday or widely used American English), "formal or literary" (American, but mainly in formal, literary, academic or technical use), or "mainly British" (Americans normally use a different word; name that word in usage_note).
- register: the registers it belongs to.
- connotation: positive, negative or neutral, with a short explanation; say when it shifts with context.
- usage_note: two to four sentences on how Americans actually use it: who says it and when, how formal, polite or casual it is (could it sound rude, dated, stiff or too casual?), typical situations, regional or cultural notes, and the American alternative if the word is mainly British. For phrases and expressions, explain when to say it and what a natural reply is.
- word_family: related forms with their part of speech, e.g. ["analysis (noun)", "analytical (adjective)", "analyst (noun)"]; empty if none.
- distinctions: 2-4 near-synonyms or commonly confused words, each with one precise sentence on how it differs in meaning, strength, register or usage.
- antonyms: up to 5 (empty if none are natural).
- collocations: 4-8 natural collocations exactly as Americans write or say them.
- examples.everyday, examples.professional, examples.analytical: one natural sentence each in the sense defined above. Everyday: casual American conversation. Professional: an American workplace (meetings, email, data science, engineering, business). Analytical: academic, philosophical, theological or argumentative prose. For everyday expressions, make all three natural spoken situations (e.g. a restaurant, a call with a colleague, a conversation with a neighbor) rather than forcing academic prose. Each example must be a sentence a thoughtful American would really say or write in that situation, using the word naturally and in the sense defined; never force a word into a situation where it sounds odd (no "Assuredly, it always does" in casual talk: if a word is formal, make the everyday example a formal moment such as a toast, a letter or a sermon). For Bible and theology words: everyday is a natural conversation (a Bible study, church, a friend asking about faith), professional is teaching, preaching or academic writing, and analytical is theological or exegetical prose. Every example must sound like something a native American speaker would actually say or write.
- analogy: a short image or comparison that makes the meaning stick; empty string if nothing adds value.
- etymology: one line, origin and root meaning (empty string if unknown; never invent).
- common_mistakes: 1-3 specific errors non-native speakers make: wrong preposition, wrong sense, false friends, countability, word order in phrasal verbs, mispronunciation.
- biblical_note: for a word in the Bible domain, or any word with real biblical significance: its meaning in Scripture, the Hebrew or Greek word behind it (transliterated, with its meaning), and two or three key passages (book chapter:verse) with a plain-English explanation of what each passage says about the word. Use the Revised Standard Version (RSV) as the reference Bible: follow its book names, numbering and terminology. Do NOT quote verses at length: describe them in your own words, and quote at most a short, famous phrase (under eight words) only when you are certain of the exact RSV wording. Do not explain King James or other archaic English. Cite only passages you are certain of; never invent references. Empty string for words with no biblical significance.
- traditions: fill this ONLY when Eastern Orthodox, Roman Catholic and Protestant Christians define, count, interpret or practice the term differently (e.g. canon, apocrypha, Scripture and Tradition, justification, faith and works, grace, baptism, Eucharist or Lord's Supper, priest, elder, bishop, saint, Theotokos, icon, original or ancestral sin, purgatory, predestination, rapture, millennium). Then give all three traditions, each in one to three sentences, stated accurately and fairly in that tradition's own terms, without taking sides; for Protestants, note major internal differences (Lutheran, Reformed, Anglican, Baptist, Pentecostal) where they matter. Leave it empty when the traditions agree or the word is not religious.
- domains: subject areas where the word is notably used, from the allowed list; empty for general vocabulary.

Be precise and factually correct; for technical terms, be exact as a domain expert would be. Do not copy the dictionary text. Return the entries in the same order as the input, with each `word` field exactly as given."""

REGISTERS = ["formal", "informal", "neutral", "technical", "literary", "archaic", "academic"]

ENTRY_SCHEMA = {
    "type": "object",
    "properties": {
        "word": {"type": "string"},
        "core": {
            "type": "object",
            "properties": {"pos": {"type": "string"}, "definition": {"type": "string"}},
            "required": ["pos", "definition"],
            "additionalProperties": False,
        },
        "pronunciation": {
            "type": "object",
            "properties": {"ipa": {"type": "string"}, "respelling": {"type": "string"}, "tip": {"type": "string"}},
            "required": ["ipa", "respelling", "tip"],
            "additionalProperties": False,
        },
        "us_usage": {"type": "string", "enum": ["common", "formal or literary", "mainly British"]},
        "register": {"type": "array", "items": {"type": "string", "enum": REGISTERS}},
        "connotation": {"type": "string"},
        "usage_note": {"type": "string"},
        "word_family": {"type": "array", "items": {"type": "string"}},
        "distinctions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"vs": {"type": "string"}, "note": {"type": "string"}},
                "required": ["vs", "note"],
                "additionalProperties": False,
            },
        },
        "antonyms": {"type": "array", "items": {"type": "string"}},
        "collocations": {"type": "array", "items": {"type": "string"}},
        "examples": {
            "type": "object",
            "properties": {"everyday": {"type": "string"}, "professional": {"type": "string"},
                           "analytical": {"type": "string"}},
            "required": ["everyday", "professional", "analytical"],
            "additionalProperties": False,
        },
        "analogy": {"type": "string"},
        "etymology": {"type": "string"},
        "common_mistakes": {"type": "array", "items": {"type": "string"}},
        "biblical_note": {"type": "string"},
        "traditions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"tradition": {"type": "string",
                                             "enum": ["Eastern Orthodox", "Roman Catholic", "Protestant"]},
                               "view": {"type": "string"}},
                "required": ["tradition", "view"],
                "additionalProperties": False,
            },
        },
        "domains": {"type": "array", "items": {"type": "string",
                                               "enum": SUBJECT_DOMAINS + EVERYDAY_DOMAINS}},
    },
    "required": ["word", "core", "pronunciation", "us_usage", "register", "connotation", "usage_note", "word_family",
                 "distinctions", "antonyms", "collocations", "examples", "analogy", "etymology",
                 "common_mistakes", "biblical_note", "traditions", "domains"],
    "additionalProperties": False,
}
BATCH_SCHEMA = {
    "type": "object",
    "properties": {"entries": {"type": "array", "items": ENTRY_SCHEMA}},
    "required": ["entries"],
    "additionalProperties": False,
}


def word_brief(entry: dict) -> str:
    """The input for one word: headword, domains, the senses as the app
    ranks them, and the meanings its hand-written examples cover."""
    lines = [f"## {entry['word']}"]
    if entry.get("undefined"):
        lines.append("(no dictionary entry: write the definition from your knowledge of the Bible; "
                     "for a person or place, say who or what it is, its role and where it appears)")
    if entry.get("phonetic"):
        lines.append(f"IPA (General American): {entry['phonetic']}")
    if entry.get("domains"):
        lines.append("domains: " + ", ".join(entry["domains"]))
    for m in entry.get("meanings", [])[:4]:
        defs = "; ".join(s["definition"] for s in m["senses"][:3])
        lines.append(f"- {m['pos']}: {defs[:400]}")
    labels = list(dict.fromkeys(e["sense"] for e in entry.get("conversation") or [] if e.get("sense")))
    if labels:
        lines.append("example meanings: " + "; ".join(labels[:8]))
    return "\n".join(lines)


_IPA_VOWELS = set("aeiouyæɑɒɔəɛɜɝɚɪʊʌɐɨʉøœɤɯ")


def _ipa_stress_index(ipa: str) -> int | None:
    """Syllable number (0-based) carrying primary stress in a one-word IPA
    transcription: the vowel groups (a diphthong is one) before the ˈ mark."""
    body = ipa.strip("/[] ")
    if " " in body:
        return None
    if "ˈ" not in body:
        return 0
    before = body.split("ˈ", 1)[0]
    groups, prev = 0, False
    for ch in before:
        is_v = ch in _IPA_VOWELS or ch == "\u0329"   # syllabic consonant mark
        if is_v and not prev:
            groups += 1
        prev = is_v
    return groups


def respelling_matches_ipa(respelling: str, ipa: str) -> bool | None:
    """Whether a stress respelling ("uh-mair-ih-KAH-noh") puts the stress on
    the same syllable as the IPA. None when it can't be judged (phrases,
    no IPA, no capitalized syllable)."""
    if not respelling or not ipa or " " in respelling.strip():
        return None
    want = _ipa_stress_index(ipa)
    parts = [p for p in respelling.split("-") if p]
    caps = [i for i, p in enumerate(parts) if any(c.isalpha() for c in p) and p.upper() == p]
    if want is None or not caps or len(caps) == len(parts) and len(parts) > 1:
        return None
    return caps[0] == want


class Usage:
    def __init__(self, model: str = "haiku"):
        self.price_in, self.price_out = prices(model)
        self.inp = self.out = self.cache_read = self.cache_write = 0

    def add(self, u) -> None:
        self.inp += u.input_tokens or 0
        self.out += u.output_tokens or 0
        self.cache_read += getattr(u, "cache_read_input_tokens", 0) or 0
        self.cache_write += getattr(u, "cache_creation_input_tokens", 0) or 0

    def cost(self) -> float:
        return ((self.inp + 1.25 * self.cache_write + 0.1 * self.cache_read) * self.price_in
                + self.out * self.price_out) / 1e6


def check_stress() -> int:
    """Mark enriched entries whose respelling stresses a different syllable
    than the word's IPA as failed, so `--retry-failed` redoes them."""
    entries = {w["key"]: w for w in read_json(WORDS_JSON, {"words": []})["words"]}
    bad = 0
    for k, rec in read_jsonl(ENRICH_CACHE).items():
        if rec["status"] != "ok" or k not in entries:
            continue
        resp = ((rec["nuance"] or {}).get("pronunciation") or {}).get("respelling", "")
        if respelling_matches_ipa(resp, entries[k].get("phonetic", "")) is False:
            append_jsonl(ENRICH_CACHE, {"key": k, "status": "failed", "reason": "stress differs from IPA"})
            bad += 1
    log(f"[enrich] stress check: {bad} respellings disagree with the IPA; rerun enrich with --retry-failed")
    return bad


async def stage_enrich(args) -> None:
    if not have_credentials():
        log("[enrich] skipped: no Claude credentials. Set ANTHROPIC_API_KEY or "
            "LEXIMASTER_AWS_PROFILE in .env and rerun `python build_dataset.py --stages enrich`.")
        return
    anthropic, client = anthropic_client()
    words = selected_words(args.limit)
    # Enrich from the assembled lexicon, so self-defined expressions and
    # subject senses ("In AI: ...") are included and the ranking is final.
    assemble(quiet=True)
    lexicon = {w["key"]: w for w in read_json(WORDS_JSON, {"words": []})["words"]}
    # Bible names and terms that no dictionary lists: Claude writes the
    # definition itself, and assemble() builds the entry from it.
    cands = read_json(CANDIDATES, {})
    for k in words:
        c = cands.get(k, {})
        if k not in lexicon and "bible" in c.get("tags", []):
            lexicon[k] = {"key": k, "word": c["word"], "domains": c["tags"], "meanings": [],
                          "phonetic": "", "conversation": [], "undefined": True}
    if args.only:  # e.g. --only "americano,acid": redo just these words
        words = [norm_key(x) for x in args.only.split(",") if x.strip()]
        args.retry_failed = True
        for k in words:
            append_jsonl(ENRICH_CACHE, {"key": k, "status": "failed", "reason": "requested again"})
    done = read_jsonl(ENRICH_CACHE)
    todo = [k for k in words
            if k in lexicon
            and (k not in done or (args.retry_failed and done[k]["status"] != "ok"))]
    log(f"[enrich] {len(todo)} words to enrich with {model_id(args.model)}"
        f"{' on Amazon Bedrock' if use_bedrock() else ''} "
        f"(batch {args.batch_size}, concurrency {args.concurrency})")
    if not todo:
        return
    problem = await preflight(anthropic, client, args.model)
    if problem:
        sys.exit(f"[enrich] {problem}")
    batches = [todo[i:i + args.batch_size] for i in range(0, len(todo), args.batch_size)]
    prog = Progress("enrich", len(todo))
    usage = Usage(args.model)
    failed = {"n": 0}
    fatal: list[str] = []

    async def call(keys: list[str]):
        brief = "\n\n".join(word_brief(lexicon[k]) for k in keys)
        async with client.messages.stream(
            model=model_id(args.model),
            max_tokens=32000,
            # Explicit breakpoint: works on Bedrock as well as the Claude API.
            system=[{"type": "text", "text": ENRICH_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            output_config={"effort": args.effort,
                           "format": {"type": "json_schema", "schema": BATCH_SCHEMA}},
            messages=[{"role": "user", "content": f"Write entries for these {len(keys)} words:\n\n{brief}"}],
        ) as stream:
            return await stream.get_final_message()

    async def process(keys: list[str]):
        if fatal:
            return
        if args.budget and usage.cost() >= args.budget:
            fatal.append(f"budget of ${args.budget:.2f} reached; rerun to continue where it stopped")
            return
        try:
            msg = await call(keys)
        except anthropic.AuthenticationError:
            fatal.append(f"authentication failed: {auth_hint()}")
            return
        except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
            log(f"[enrich] transient error after retries ({type(e).__name__}); "
                f"{len(keys)} words left for the next run")
            return
        except anthropic.APIStatusError as e:
            log(f"[enrich] API error {e.status_code}: {e.message}")
            return
        usage.add(msg.usage)
        if msg.stop_reason == "max_tokens" and len(keys) > 1:
            half = len(keys) // 2
            await process(keys[:half])
            await process(keys[half:])
            return
        entries = []
        if msg.stop_reason != "refusal":
            text = next((b.text for b in msg.content if b.type == "text"), "")
            try:
                entries = json.loads(text)["entries"]
            except (json.JSONDecodeError, KeyError):
                entries = []
        by_word = {norm_key(e["word"]): e for e in entries}
        for k in keys:
            e = by_word.get(k) or by_word.get(norm_key(lexicon[k]["word"]))
            if e:
                e.pop("word", None)
                append_jsonl(ENRICH_CACHE, {"key": k, "status": "ok", "nuance": e})
            else:
                failed["n"] += 1
                append_jsonl(ENRICH_CACHE, {"key": k, "status": "failed",
                                            "reason": msg.stop_reason})
        prog.tick(len(keys), extra=f"failed {failed['n']} · tokens in {usage.inp + usage.cache_read:,} "
                                   f"out {usage.out:,} · ~${usage.cost():.2f}")

    await run_bounded(batches, process, args.concurrency, every=10,
                      on_checkpoint=lambda: assemble(quiet=True))
    if fatal:
        sys.exit(f"[enrich] {fatal[0]}")
    log(f"[enrich] done: {failed['n']} failed (rerun with --retry-failed) · "
        f"estimated cost ${usage.cost():.2f}")


# ---------------------------------------------------------------- sense ranking

# Usage labels that mark a sense as belonging to one of our domains.
DOMAIN_LABELS = {
    "mathematics": ["mathematics", "algebra", "geometry", "topology", "calculus", "analysis",
                    "set theory", "number theory", "arithmetic", "graph theory", "linear algebra",
                    "category theory", "trigonometry", "combinatorics"],
    "statistics": ["statistics", "probability", "econometrics"],
    "data_science": ["computing", "machine learning", "artificial intelligence", "statistics",
                     "data", "databases"],
    "software_engineering": ["computing", "programming", "software", "computer science",
                             "software engineering", "databases"],
    "bible": ["biblical", "bible", "christianity", "judaism", "theology", "religion", "ecclesiastical",
              "christian"],
    "artificial_intelligence": ["artificial intelligence", "machine learning", "neural networks",
                                "natural language processing", "computing", "computer science",
                                "statistics", "robotics"],
    "philosophy": ["philosophy", "metaphysics", "ethics", "epistemology", "ontology", "logic"],
    "logic": ["logic", "philosophy", "rhetoric"],
    "theology": ["theology", "christianity", "religion", "christian", "catholicism", "ecclesiastical",
                 "biblical", "eastern orthodoxy", "protestantism", "liturgy", "judaism"],
    "christian_anthropology": ["theology", "christianity", "religion", "philosophy"],
    "orthodox_mysticism": ["eastern orthodoxy", "orthodoxy", "christianity", "theology",
                           "religion", "mysticism"],
}
# Labels that make a sense a poor first choice for a general learner.
MARGINAL_LABELS = ["obsolete", "archaic", "rare", "dated", "dialectal", "dialect", "historical",
                   "nonstandard", "uncommon", "regional", "poetic", "eye dialect"]
NARROW_FIELDS = ["anatomy", "medicine", "pathology", "botany", "zoology", "chemistry", "physics",
                 "nautical", "heraldry", "music", "geology", "mineralogy", "biology", "law",
                 "military", "sports", "cricket", "baseball", "printing", "architecture", "physiology",
                 "astronomy", "entomology", "ornithology", "pharmacology", "dentistry", "chess"]
FORM_OF_RE = re.compile(
    r"^(simple past|past participle|present participle|plural|third-person|"
    r"alternative (letter-case )?(form|spelling)|"
    r"obsolete (form|spelling)|archaic (form|spelling)|comparative|superlative|misspelling|"
    r"nonstandard (form|spelling))\b[^.;]*\bof\b", re.I)


def leading_labels(definition: str) -> str:
    m = re.match(r"^\(([^)]{1,80})\)", definition)
    return m.group(1).lower() if m else ""


def sense_score(definition: str, tags: set[str], label_map: dict | None = None) -> int:
    labels = " ".join(filter(None, [leading_labels(definition),
                                    " ".join((label_map or {}).get(sense_key(definition), []))]))
    score = 0
    if FORM_OF_RE.match(definition):
        score += 8
    regional = re.search(r"\b(us|american|north america)\b", labels) and \
        re.search(r"\b(uk|british|britain|outside)\b", labels)  # "obsolete in the UK"
    if not regional and any(re.search(rf"\b{re.escape(l)}\b", labels) for l in MARGINAL_LABELS):
        score += 5
    domain_words = [w for t in tags for w in DOMAIN_LABELS.get(t, [])]
    if labels and any(w in labels for w in domain_words):
        score -= 10
    elif labels and any(re.search(rf"\b{f}\b", labels) for f in NARROW_FIELDS):
        score += 3
    return score


def rank_senses(meanings: list[dict], tags: set[str], label_map: dict | None = None) -> list[dict]:
    """Order senses (and parts of speech) so the one a learner most needs
    comes first: domain senses for domain words, then everyday senses, with
    archaic, narrow-field and inflection-only senses last. Nothing is removed."""
    ranked = []
    for idx, m in enumerate(meanings):
        senses = sorted(enumerate(m["senses"]),
                        key=lambda x: (sense_score(x[1]["definition"], tags, label_map), x[0]))
        best = sense_score(senses[0][1]["definition"], tags, label_map) if senses else 99
        ranked.append((best, idx, {**m, "senses": [s for _, s in senses]}))
    ranked.sort(key=lambda x: (x[0], x[1]))
    return [m for _, _, m in ranked]


# ------------------------------------------------------------ CMU dictionary IPA

ARPABET = {
    "AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "EY": "eɪ", "IH": "ɪ",
    "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ",
    "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "ɹ", "S": "s",
    "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}
# Consonant clusters that can begin an English syllable, for placing stress marks.
ONSETS = {tuple(o.split()) for o in """
P|T|K|B|D|G|F|V|TH|DH|S|Z|SH|ZH|HH|CH|JH|M|N|L|R|W|Y
P R|P L|P Y|T R|T W|T Y|K R|K L|K W|K Y|B R|B L|B Y|D R|D W|D Y|G R|G L|G W|G Y
F R|F L|F Y|TH R|TH W|SH R|S P|S T|S K|S M|N Y|S N|S L|S W|S F|V Y|M Y|HH Y|HH W|L Y
S P R|S P L|S P Y|S T R|S T Y|S K R|S K L|S K W|S K Y""".replace("|", "\n").split("\n") if o.strip()}
_cmu: dict[str, list[str]] | None = None


def cmu_lookup(word: str) -> list[str] | None:
    global _cmu
    if _cmu is None:
        _cmu = {}
        if CMUDICT.exists():
            for line in CMUDICT.read_text(encoding="utf-8").splitlines():
                line = line.split("#")[0].strip()
                if line and "(" not in line.split()[0]:  # first pronunciation only
                    w, *ph = line.split()
                    _cmu[w] = ph
    return _cmu.get(word.lower())


def arpabet_ipa(phones: list[str]) -> str:
    """ARPAbet to IPA with stress marks at the start of the stressed syllable
    (maximal onset)."""
    out: list[str] = []
    cluster: list[str] = []  # consonants since the last vowel
    for ph in phones:
        base, stress = ph.rstrip("012"), ph[len(ph.rstrip("012")):]
        if not stress:
            cluster.append(base)
            continue
        split = len(cluster) if out else 0
        for i in range(len(cluster) + 1):
            if not cluster[i:] or tuple(cluster[i:]) in ONSETS:
                split = i if out else 0
                break
        out += [ARPABET[c] for c in cluster[:split]]
        out.append({"1": "ˈ", "2": "ˌ"}.get(stress, ""))
        out += [ARPABET[c] for c in cluster[split:]]
        cluster = []
        if base == "AH":
            out.append("ʌ" if stress == "1" else "ə")
        elif base == "ER":
            out.append("ɝ" if stress in "12" else "ɚ")
        else:
            out.append(ARPABET[base])
    out += [ARPABET[c] for c in cluster]
    return "".join(out)


# Stress-neutral suffixes: the stem keeps its pronunciation.
SUFFIX_IPA = [("ically", "li", "ic"), ("ally", "əli", ""), ("ly", "li", ""),
              ("iness", "nəs", "y"), ("ness", "nəs", ""), ("lessness", "ləsnəs", ""),
              ("less", "ləs", ""), ("fulness", "fəlnəs", ""), ("ful", "fəl", ""),
              ("ment", "mənt", ""), ("ism", "ɪzəm", ""), ("ists", "ɪsts", ""), ("ist", "ɪst", ""),
              ("s", "z", "")]


SPELLED_OUT = {"ai", "agi", "xai", "api", "gpu", "tpu", "cpu", "ui", "ux", "ok"}


def letters_ipa(part: str) -> str:
    """An acronym said letter by letter (TSA, PTO), stress on the last letter."""
    names = [["EY1"] if ch == "a" else cmu_lookup(ch) for ch in part]  # "a" the letter, not the article
    if not all(names):
        return ""
    ipas = [arpabet_ipa(n).replace("ˈ", "") for n in names]
    ipas[-1] = "ˈ" + ipas[-1]
    return ".".join(ipas[:-1]) + ("." if len(ipas) > 1 else "") + ipas[-1]


def compound_ipa(part: str) -> str:
    """A closed compound of two dictionary words (showerhead, riptide):
    stress on the first part, as in most English compounds."""
    for i in range(3, len(part) - 2):
        a, b = cmu_lookup(part[:i]), cmu_lookup(part[i:])
        if a and b:
            return arpabet_ipa(a) + arpabet_ipa(b).replace("ˈ", "ˌ")
    return ""


def cmu_ipa(key: str, known: dict[str, str], word: str = "") -> str:
    """US IPA for a word or phrase from the CMU dictionary, or from a stem
    plus a stress-neutral suffix ("acquiescently" = acquiescent + ly).
    `known` maps keys to IPA already chosen from Wiktionary."""
    parts = [p for p in (re.sub(r"[^a-z']", "", x) for x in re.split(r"[-\s]+", key.lower())) if p]
    shown = [re.sub(r"[^A-Za-z']", "", x) for x in re.split(r"[-\s]+", word)] if word else []
    out = []
    for n, part in enumerate(parts):
        # Letter-by-letter only when it isn't a word: TSA, GPU, NLP. ACID, RAG
        # and LoRA are said as words; "AI" is in CMU but always spelled out.
        is_acronym = (n < len(shown) and len(shown[n]) > 1 and shown[n].isupper()
                      and (not cmu_lookup(part) or part in SPELLED_OUT)) \
            or (len(part) <= 4 and not re.search(r"[aeiouy]", part))
        if is_acronym:
            ipa = letters_ipa(part)
            if not ipa:
                return ""
            out.append(ipa)
            continue
        ph = cmu_lookup(part)
        if ph:
            out.append(arpabet_ipa(ph))
            continue
        ipa = ""
        for suffix, sound, stem_end in SUFFIX_IPA:
            if part.endswith(suffix) and len(part) - len(suffix) >= 3:
                stem = part[: -len(suffix)] + stem_end
                if stem in known:
                    ipa = known[stem].strip("/") + sound
                elif cmu_lookup(stem):
                    ipa = arpabet_ipa(cmu_lookup(stem)) + sound
                if ipa and suffix == "s":  # plural: /s/ after voiceless, /ɪz/ after sibilants
                    stem_ipa = ipa[:-1]
                    ipa = stem_ipa + ("ɪz" if stem_ipa[-1:] in "szʃʒ" or stem_ipa.endswith(("tʃ", "dʒ"))
                                      else "s" if stem_ipa[-1:] in "ptkfθ" else "z")
                if ipa:
                    break
        if not ipa:
            ipa = compound_ipa(part)
        if not ipa:
            return ""
        out.append(ipa)
    return "/" + " ".join(phrase_stress(parts, out)) + "/"


# Words that are normally unstressed inside a phrase.
FUNCTION_WORDS = set("""a an the to of in on at for with by from up as and or but if so than that
this these those is are was were be been am do does did can could will would shall should may might
must have has had i me my you your he him his she her it its we us our they them their
not no just""".split())


def phrase_stress(words: list[str], ipas: list[str]) -> list[str]:
    """Phrase stress in American English: the main stress on the last
    content word ("split the CHECK", "pick UP"), secondary stress on the
    other content words, none on function words."""
    if len(ipas) < 2:
        return ipas
    content = [i for i, w in enumerate(words) if w not in FUNCTION_WORDS]
    last = content[-1] if content else len(ipas) - 1
    # Phrasal verbs end in a particle that carries the main stress.
    if words[-1] in ("up", "down", "out", "off", "on", "in", "over", "back", "away", "around", "through"):
        last = len(ipas) - 1
    out = []
    for i, ipa in enumerate(ipas):
        if i == last:
            out.append(ipa if "ˈ" in ipa else ipa.replace("ˌ", "ˈ", 1))
        elif i in content:
            out.append(ipa.replace("ˈ", "ˌ"))
        else:
            out.append(ipa.replace("ˈ", "").replace("ˌ", ""))
    return out


# ----------------------------------------------------------------- assemble/status

_STOP = set("""the a an to of in on at for with by from and or but be is are was were it its
this that someone something somebody your you their about into over out up down off""".split())


def _stems(text: str) -> set[str]:
    return {w[:5] for w in re.findall(r"[a-z]+", text.lower()) if len(w) > 3 and w not in _STOP}


# Display rules, applied once here so every screen and both backends show the
# same entry. Dictionary senses that only restate the learner definition are
# flagged (kept in the data: Wiktionary is the credited source), not deleted.
_CIRCULAR = re.compile(r"^(the )?(state|quality|condition) of being\b|^in an? [\w ,-]+? manner\.?$|"
                       r"^ellipsis of\b|\(in any sense\)", re.I)
_POS_WORDS = ("noun", "verb", "adjective", "adverb", "interjection", "numeral", "preposition", "pronoun",
              "conjunction", "determiner", "abbreviation")


def canonical_pos(pos: str) -> str:
    """One part-of-speech label: "noun, verb" -> "noun", "verb (phrasal)" ->
    "phrasal verb", "idiomatic expression (adjective phrase)" -> "idiom"."""
    p = pos.lower().strip()
    if "phrasal" in p:
        return "phrasal verb"
    if "proper noun" in p or p == "noun (proper)":
        return "proper noun"
    if p.startswith("idiom"):
        return "idiom"
    for label in ("proverb", "expression"):
        if label in p:
            return label
    if "phrase" in p:
        first = p.split()[0]
        return f"{first} phrase" if first in ("noun", "verb", "adjective", "adverb", "prepositional") else "phrase"
    first = re.split(r"[\s,;(]+", p)[0] if p else ""
    return first if first in _POS_WORDS else p


def _pos_family(pos: str) -> str:
    p = canonical_pos(pos)
    if "noun" in p:
        return "noun"
    if "verb" in p and "adverb" not in p:
        return "verb"
    if p.startswith("adjective"):
        return "adjective"
    if p.startswith("adverb"):
        return "adverb"
    if p in ("expression", "phrase", "idiom", "proverb", "prepositional phrase"):
        return "expression"
    return p


def _flat(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def sense_dup(definition: str, pos: str, core: str, core_pos: str) -> str:
    """Why a dictionary sense adds nothing beside the learner definition:
    "paraphrase", "circular", "form_of", or "" when it should be shown."""
    if FORM_OF_RE.match(definition):
        return "form_of"
    if _CIRCULAR.search(definition):
        return "circular"
    stems = _stems(definition)
    if core and stems and _pos_family(pos) == _pos_family(core_pos) \
            and len(stems & _stems(core)) * 2 >= len(stems):
        return "paraphrase"
    return ""


def _similar(a: str, b: str) -> bool:
    x, y = set(_flat(a).split()), set(_flat(b).split())
    return bool(x and y) and len(x & y) / len(x | y) >= 0.45


def normalize_display(w: dict) -> None:
    n = w.get("nuance") or {}
    core = n.get("core") or {}
    if core.get("pos"):
        core["pos"] = canonical_pos(core["pos"])
    core_def, core_pos = core.get("definition", ""), core.get("pos", "")
    meanings = []
    for m in w["meanings"]:
        senses = []
        for sn in m["senses"]:
            if core_def and _flat(sn["definition"]) == _flat(core_def):
                continue  # the learner definition itself, copied in by the build
            dup = "" if m.get("pos") == "everyday English" else \
                sense_dup(sn["definition"], m.get("pos", ""), core_def, core_pos)
            if dup:
                sn = {**sn, "dup": dup, "synonyms": [], "antonyms": []}
            senses.append(sn)
        if senses:
            meanings.append({**m, "senses": senses})
    w["meanings"] = meanings
    if w.get("name_kind"):
        w["synonyms"], w["antonyms"] = [], []  # "Abraham" -> "slopshop" is someone else
    word = w["word"].lower()
    if n.get("word_family"):
        n["word_family"] = [x for x in n["word_family"] if x.split(" (")[0].strip().lower() != word]
    reg = n.get("register") or []
    if "neutral" in reg and len(reg) > 1:
        n["register"] = [r for r in reg if r != "neutral"]
    kept: list[dict] = []
    for e in w.get("conversation") or []:
        if not any(_similar(e["text"], k["text"]) for k in kept):
            kept.append(e)
    w["conversation"] = kept


def load_bible_names() -> tuple[dict[str, tuple[str, str]], set[str]]:
    """The Bible names, {key: (kind, everyday meaning)}, and the keys of the
    rest of the Bible list (its vocabulary). A name with an everyday meaning
    ("Goliath", "Judas") is vocabulary too."""
    names = {}
    if BIBLE_NAMES.exists():
        for line in BIBLE_NAMES.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#"):
                parts = [p.strip() for p in line.split("|")] + ["", ""]
                if parts[1] in ("person", "place", "people"):
                    names[norm_key(parts[0])] = (parts[1], parts[2])
    vocab, in_names = set(), False
    for line in (SEEDS / "domain_bible.txt").read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            if line.startswith("# People and places"):
                in_names = True
            elif not line.startswith("# ("):
                in_names = False
            continue
        word = line.split("#", 1)[0].split("|")[0].strip()
        if word and not in_names:
            vocab.add(norm_key(word))
    return names, vocab


def load_domain_senses() -> dict[str, dict[str, tuple[str, str]]]:
    """seeds/senses/<domain>.txt lines "entry | pos | meaning", as
    {domain: {key: (pos, meaning)}}."""
    out: dict[str, dict[str, tuple[str, str]]] = {}
    for path in sorted(SENSES.glob("*.txt")) if SENSES.exists() else []:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.split("#", 1)[0].strip() if not line.lstrip().startswith("#") else ""
            parts = [x.strip() for x in line.split("|")]
            if len(parts) == 3 and all(parts):
                out.setdefault(path.stem, {})[norm_key(parts[0])] = (parts[1], parts[2])
    return out


DOMAIN_SENSE_PREFIX = {"artificial_intelligence": "In AI: ", "bible": "In the Bible: "}


def add_domain_senses(meanings: list[dict], key: str, tags: set[str],
                      domain_senses: dict[str, dict[str, tuple[str, str]]]) -> list[dict]:
    """Show a subject's own sense first ("In AI: a confident but false
    statement…") when the dictionary leads with another meaning. A word in
    two subjects gets both, the Bible's first ("Adam")."""
    for domain in sorted(domain_senses, key=lambda d: d == "bible"):
        senses = domain_senses[domain]
        if domain in tags and key in senses:
            pos, meaning = senses[key]
            sense = {"definition": DOMAIN_SENSE_PREFIX.get(domain, "") + meaning, "example": "",
                     "synonyms": [], "antonyms": []}
            same = next((m for m in meanings if m.get("pos") == pos), None)
            if same:
                rest = [m for m in meanings if m is not same]
                meanings = [{**same, "senses": [sense] + same["senses"]}] + rest
            else:
                meanings = [{"pos": pos, "senses": [sense]}] + meanings
    return meanings


def rank_by_examples(meanings: list[dict], examples: list[dict]) -> list[dict]:
    """Put first the dictionary senses that the hand-written examples teach.
    The examples' sense labels ("[exhausted from work]") name the everyday
    meanings; a dictionary sense sharing words with them moves up, so
    "burn out" leads with exhaustion, not "to destroy by fire"."""
    labels = [e["sense"] for e in examples if e.get("sense")]
    if not labels:
        return meanings
    wanted = [_stems(lbl) for lbl in labels]

    def score(definition: str) -> int:
        d = _stems(definition)
        # Earlier labels are the main meanings: weight them higher.
        return sum((len(wanted) - i) * len(d & w) for i, w in enumerate(wanted))

    ranked = []
    for idx, m in enumerate(meanings):
        senses = sorted(enumerate(m["senses"]), key=lambda x: (-score(x[1]["definition"]), x[0]))
        best = score(senses[0][1]["definition"]) if senses else 0
        ranked.append((-best, idx, {**m, "senses": [sn for _, sn in senses]}))
    ranked.sort(key=lambda x: (x[0], x[1]))
    return [m for _, _, m in ranked]


# British spellings in dictionary text, shown in American spelling to match
# the American pronunciations. Whole words only; quotations are left alone.
US_SPELLING = {
    "colour": "color", "colours": "colors", "coloured": "colored", "favour": "favor",
    "favourable": "favorable", "favourite": "favorite", "behaviour": "behavior",
    "behaviours": "behaviors", "behavioural": "behavioral", "honour": "honor",
    "honours": "honors", "honourable": "honorable", "labour": "labor", "humour": "humor",
    "colourful": "colorful", "colouring": "coloring", "multicoloured": "multicolored",
    "rumour": "rumor", "traveller": "traveler", "travellers": "travelers",
    "neighbourhood": "neighborhood", "neighbourhoods": "neighborhoods", "neighbours": "neighbors",
    "organisation": "organization", "organisations": "organizations", "recognisable": "recognizable",
    "dialling": "dialing", "dialled": "dialed", "judgement": "judgment", "judgements": "judgments",
    "behaviours": "behaviors", "colours": "colors", "favourites": "favorites", "flavour": "flavor",
    "flavours": "flavors", "flavourful": "flavorful", "centred": "centered", "practise": "practice",
    "modelled": "modeled", "signalling": "signaling", "fuelled": "fueled", "optimise": "optimize",
    "optimised": "optimized", "optimisation": "optimization", "normalise": "normalize",
    "utilise": "utilize", "prioritise": "prioritize", "apologised": "apologized",
    "cancelling": "canceling", "anonymise": "anonymize", "anonymised": "anonymized",
    "anonymising": "anonymizing", "appetising": "appetizing", "unappetising": "unappetizing", "vigour": "vigor", "rigour": "rigor", "fervour": "fervor",
    "ardour": "ardor", "candour": "candor", "splendour": "splendor", "valour": "valor",
    "neighbour": "neighbor", "neighbouring": "neighboring", "harbour": "harbor",
    "endeavour": "endeavor", "glamour": "glamor", "odour": "odor", "savour": "savor",
    "clamour": "clamor", "tumour": "tumor", "centre": "center", "centres": "centers",
    "centred": "centered", "theatre": "theater", "metre": "meter", "metres": "meters",
    "litre": "liter", "fibre": "fiber", "calibre": "caliber", "spectre": "specter",
    "sombre": "somber", "lustre": "luster", "defence": "defense", "offence": "offense",
    "pretence": "pretense", "licence": "license", "analyse": "analyze", "analysed": "analyzed",
    "analysing": "analyzing", "catalogue": "catalog",
    "grey": "gray", "jewellery": "jewelry", "travelling": "traveling", "travelled": "traveled",
    "modelling": "modeling", "labelled": "labeled", "labelling": "labeling",
    "cancelled": "canceled", "fulfil": "fulfill", "skilful": "skillful", "wilful": "willful",
    "enrol": "enroll", "instil": "instill", "plough": "plow", "sceptic": "skeptic",
    "sceptical": "skeptical", "scepticism": "skepticism", "aluminium": "aluminum",
    "programme": "program", "programmes": "programs", "mould": "mold", "manoeuvre": "maneuver",
    "oestrogen": "estrogen", "foetus": "fetus", "anaemia": "anemia", "paediatric": "pediatric",
    "organise": "organize", "organised": "organized", "organisation": "organization",
    "recognise": "recognize", "recognised": "recognized", "realise": "realize",
    "realised": "realized", "emphasise": "emphasize", "characterise": "characterize",
    "characterised": "characterized", "summarise": "summarize", "criticise": "criticize",
    "apologise": "apologize", "minimise": "minimize", "maximise": "maximize",
    "civilisation": "civilization", "generalisation": "generalization",
}
_US_RE = re.compile(r"\b(" + "|".join(sorted(US_SPELLING, key=len, reverse=True)) + r")\b", re.I)


# British spelling patterns, applied only when the American CMU dictionary
# lacks the British form and has the American one ("centre" -> "center").
_BRIT_RULES = [(re.compile(r"our(s|ed|ing|able|ably|ful|fully|ite|ites|less|er|ers)?$"), r"or\1"),
               (re.compile(r"isation(s|al)?$"), r"ization\1"), (re.compile(r"ise(s|d|r|rs)?$"), r"ize\1"),
               (re.compile(r"ising$"), "izing"), (re.compile(r"yse(s|d|r|rs)?$"), r"yze\1"),
               (re.compile(r"ysing$"), "yzing"), (re.compile(r"([ea])ll(ed|ing|er|ers)$"), r"\1l\2"),
               (re.compile(r"tre(s|d)?$"), r"ter\1")]
_BRIT_WORDS = {"grey": "gray", "greyish": "grayish", "greying": "graying", "greyed": "grayed", "aeon": "eon",
               "aeons": "eons", "anaemic": "anemic", "faeces": "feces", "oesophagus": "esophagus",
               "oestrus": "estrus", "oestrogen": "estrogen", "foetus": "fetus", "foetal": "fetal",
               "mediaeval": "medieval", "moveable": "movable", "litres": "liters", "chimaera": "chimera",
               "manoeuvres": "maneuvers", "manoeuvring": "maneuvering", "tyre": "tire", "tyres": "tires",
               "plough": "plow", "ploughed": "plowed", "ploughing": "plowing", "ploughs": "plows",
               "kerb": "curb", "cheque": "check", "cheques": "checks", "storey": "story", "storeys": "stories",
               "aluminium": "aluminum", "jewellery": "jewelry", "sceptical": "skeptical", "sceptic": "skeptic"}
_KEEP = {"daemon", "daemons", "daemonize", "onomatopoeia", "advertise", "advise", "arise", "chastise", "comprise",
         "compromise", "despise", "devise", "disguise", "enterprise", "excise", "exercise", "franchise",
         "improvise", "merchandise", "premise", "revise", "supervise", "surmise", "surprise", "televise",
         "expertise", "otherwise", "likewise", "concise", "precise", "paradise", "treatise", "promise"}
_brit_cache: dict[str, str] = {}


def _us_word(t: str) -> str:
    low = t.lower()
    if low in _brit_cache:
        us = _brit_cache[low]
    else:
        us = _BRIT_WORDS.get(low, "")
        if not us and low not in _KEEP and len(low) > 4 and cmu_lookup("a") is not None and _cmu \
                and low not in _cmu:
            for pat, rep in _BRIT_RULES:
                cand = pat.sub(rep, low)
                if cand != low and cand in _cmu:
                    us = cand
                    break
        _brit_cache[low] = us
    if not us:
        return t
    return us.upper() if t.isupper() else us.capitalize() if t[0].isupper() else us


def us_spelling(text: str) -> str:
    """American spelling: the fixed list, then the CMU-checked patterns."""
    if not text:
        return text
    def sub(m: re.Match) -> str:
        w = m.group(0)
        us = US_SPELLING[w.lower()]
        return us.capitalize() if w[0].isupper() else us
    text = _US_RE.sub(sub, text)
    return re.sub(r"[A-Za-z]{4,}", lambda m: _us_word(m.group(0)), text)


def tidy_text(t: str) -> str:
    """Normalize spacing and stray punctuation left by markup removal."""
    t = html.unescape(t or "").replace("\xa0", " ")
    t = re.sub(r"\(\s*\)", "", t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"([.;,])(\s*[.;,])+", r"\1", t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t.lstrip(",;: ").strip()


def clean_etymology(e: str) -> str:
    e = tidy_text(e)
    e = re.sub(r"\s*[–-]\s*(?=[,.;]|$)", "", e).strip()
    if len(e) < 15 or re.fullmatch(r"(compare|see|cf)\b.{0,20}", e, re.I) or \
            re.search(r"\b(from|of|with|compare|and)\s*[.,;]?$", e, re.I):
        return ""
    return e


_QUALIFIER = re.compile(r"<[^>]*>|\{\{.*")
_BAD_QUAL = re.compile(r"archaic|obsolete|dated|dialect|uk|british|rare|nonstandard|slang|vulgar|offensive", re.I)


def clean_word_list(items: list[str], headword: str) -> list[str]:
    """Synonyms or antonyms without Wiktionary qualifiers ("<qq:UK>"); items
    marked archaic, British-only, slang and so on are left out."""
    out = []
    for it in items:
        qual = " ".join(re.findall(r"<([^>]*)>", it))
        word = _QUALIFIER.sub("", it).strip(" ,;")
        if not word or (qual and _BAD_QUAL.search(qual)):
            continue
        if not re.fullmatch(r"[A-Za-z][A-Za-z '\-.]*", word) or word.lower() == headword.lower():
            continue
        if word.lower() not in (o.lower() for o in out):
            out.append(word)
    return out


PLACEHOLDER_RE = re.compile(r"rfdef|please add a definition|add a definition, then remove", re.I)


# A sentence about British spelling ("Using the British spelling amortise")
# must keep the British form it cites.
SPELLING_TALK = re.compile(r"\b(British|Britain|UK|U\.K\.|Commonwealth|spelled|spelling|spellings|spells?)\b")
_SENTENCES = re.compile(r"[^.!?;]*(?:[.!?;]+['\"’”)]*\s*|$)")


def us_spelling_prose(text: str) -> str:
    """us_spelling() for study-note prose, sentence by sentence, leaving
    sentences that discuss British spelling as written."""
    if not text or not SPELLING_TALK.search(text):
        return us_spelling(text)
    return "".join(s if SPELLING_TALK.search(s) else us_spelling(s) for s in _SENTENCES.findall(text))


def us_spelling_deep(value):
    """American spelling throughout a nested structure of strings. A
    distinction with a British spelling ("calibre", "the British spelling")
    keeps its "vs" word."""
    if isinstance(value, str):
        return us_spelling_prose(value)
    if isinstance(value, list):
        return [us_spelling_deep(v) for v in value]
    if isinstance(value, dict):
        keep = {"etymology"}
        if "vs" in value and SPELLING_TALK.search(str(value.get("note", ""))):
            keep.add("vs")
        return {k: (v if k in keep else us_spelling_deep(v)) for k, v in value.items()}
    return value


def mainly_british(nuance: dict) -> bool:
    """The study notes say Americans normally use another word: the us_usage
    rating, or (older notes) the usage note saying so."""
    if nuance.get("us_usage"):
        return nuance["us_usage"] == "mainly British"
    note = nuance.get("usage_note", "")
    first = re.split(r"(?<=[.!?])\s", note, maxsplit=1)[0]
    # The first sentence must say the word itself is British: "Advert is
    # mainly British", "This word is British" (not a comparison with British usage).
    return bool(re.match(r"^\W*[\w' -]{1,40}?\W* is (mainly |chiefly |mostly |largely |primarily )?British\b", first))


def clean_meanings(meanings: list[dict]) -> list[dict]:
    """Drop Wiktionary placeholder senses ("Please add a definition…") and
    repeated subsense text, and write definitions and examples in American
    spelling."""
    out = []
    for m in meanings:
        senses, seen = [], set()
        defs = [sn["definition"] for sn in m["senses"]]
        for i, sn in enumerate(m["senses"]):
            d = sn["definition"]
            if PLACEHOLDER_RE.search(d):
                continue
            # A parent sense arrives with its subsenses' text appended; those
            # subsenses follow as their own entries, so keep only the parent's.
            for o in sorted({o for j, o in enumerate(defs) if j != i and len(o) > 15}, key=len, reverse=True):
                if o in d and len(d) > len(o):
                    d = d.replace(o, " ")
            d = tidy_text(d)
            if d.startswith("↑") or re.search(r"\b(adj|n|v)\. and (n|adj|v)\.”", d):
                continue  # a dictionary citation pasted into the definition
            d = re.sub(r"[;,:]?\s*\b(thus|namely|specifically|including|as follows):?$", ".", d)
            if d and d[0].islower() and not re.match(r"^[a-z]+[A-Z0-9]", d):
                d = d[0].upper() + d[1:]
            if d and d[-1].isalnum():
                d += "."
            if len(d) < 3 or d.lower() in seen:
                continue
            seen.add(d.lower())
            senses.append({**sn, "definition": us_spelling(d), "example": us_spelling(sn.get("example", ""))})
        if senses:
            out.append({**m, "senses": senses})
    return out


# Senses a learner of current American English should not be shown: dead or
# dialect forms, spelling variants, and meanings used only outside the US.
NOT_SHOWN_LABELS = re.compile(
    r"\b(obsolete|archaic|dialectal|dialect|eye dialect|nonstandard|non-standard|scotland|scottish|scots|"
    r"ireland|irish|northern england|northern english|geordie|cockney|glasgow|yorkshire|wales|welsh|"
    r"australia|australian|new zealand|india|indian english|south africa|singapore|philippines|nigeria|"
    r"jamaica|caribbean|hong kong|malaysia)\b")
BRITISH_ONLY = re.compile(r"\b(uk|british|britain|commonwealth|england|english)\b")
NOT_SHOWN_TEXT = re.compile(
    r"^(pronunciation spelling of|eye dialect|misspelling of|obsolete (form|spelling|typography) of|"
    r"archaic (form|spelling) of|nonstandard (form|spelling) of|dated (form|spelling) of)\b", re.I)


def prune_senses(meanings: list[dict], label_map: dict) -> list[dict]:
    """Remove senses not worth showing: inflection-only ("simple past of
    win"), spelling variants, and senses labeled obsolete, archaic, dialectal
    or limited to other countries (UK-only unless the US is listed too).
    Returns [] when nothing is left worth showing."""
    def drop(definition: str) -> bool:
        if FORM_OF_RE.match(definition) or NOT_SHOWN_TEXT.match(definition):
            return True
        labels = " ".join(filter(None, [leading_labels(definition),
                                        " ".join(label_map.get(sense_key(definition), []))])).lower()
        if not labels:
            return False
        if re.search(r"\b(us|american|north america)\b", labels) and \
                re.search(r"\b(uk|british|britain|in the uk|outside)\b", labels):
            return False  # "north america, obsolete in the UK": current American use
        if NOT_SHOWN_LABELS.search(labels):
            return True
        return bool(BRITISH_ONLY.search(labels)) and not re.search(r"\b(us|american|north america)\b", labels)

    out = []
    for m in meanings:
        senses = [sn for sn in m["senses"] if not drop(sn["definition"])]
        if senses:
            out.append({**m, "senses": senses})
    return out


def rank_zipf(w: dict) -> float:
    """Frequency for the study order. wordfreq scores a phrase by its common
    words ("one-to-one" almost as high as "one"), which put hundreds of easy
    phrases first; a phrase ranks by its rarest word, a step lower. Used only
    for the order, never to choose which words are in the dataset."""
    tokens = [x for x in re.split(r"[\s-]+", w["word"]) if x]
    if len(tokens) < 2:
        return w["zipf"]
    return min(zipf_frequency(x, "en") for x in tokens) - 1.0


# ------------------------------------------------------------ display polish
# Mechanical clean-ups of the assembled entries (October 2026 content review).

POLISH_STATS: dict = {}
RELATED_MIN_ZIPF = 2.0   # synonyms/antonyms rarer than this are left out ("roolie", "pacate")
RELATED_MAX = 8
_INFL_SUFFIXES = ("s", "es", "ed", "d", "ing", "er", "est", "ly", "ness")


def _phrase_zipf(text: str) -> float:
    toks = [t for t in re.split(r"[\s-]+", text.lower()) if t]
    return min((zipf_frequency(t, "en") for t in toks), default=0.0)


def _is_form_of(a: str, b: str) -> bool:
    """a is b or an inflection/derivative of it ("peacefully" of "peaceful")."""
    if a == b:
        return True
    for base in {b, b[:-1] if b.endswith("e") else b, b[:-1] + "i" if b.endswith("y") else b}:
        if a.startswith(base) and a[len(base):] in _INFL_SUFFIXES:
            return True
    return len(b) > 3 and a.startswith(b) and len(a) - len(b) <= 3 and b[-1] == a[len(b)] and \
        a[len(b) + 1:] in _INFL_SUFFIXES  # doubled consonant: "stop" -> "stopped"


def clean_related(items: list[str], headword: str, by_frequency: bool = True,
                  min_zipf: float = RELATED_MIN_ZIPF) -> list[str]:
    """Synonyms or antonyms worth showing a learner: common words only (each
    word of a phrase at Zipf >= 2), not the headword or its inflections, not a
    phrase built on the headword ("axis deer", another sense), no duplicates;
    single words first, then phrases, each most frequent first; at most
    RELATED_MAX."""
    head = headword.lower()
    out, seen = [], set()
    for it in items:
        low = re.sub(r"[\s-]+", " ", it.lower().strip())  # "check-in" = "check in"
        if not low or low in seen or low.startswith("-") or low.endswith("-") or \
                low in ("uk", "us", "idiomatic", "figuratively", "informal", "slang"):
            continue  # an affix ("over-") or a usage label that leaked into the list
        seen.add(low)
        toks = [t for t in re.split(r"[\s-]+", low) if t]
        if _is_form_of(low, head) or _is_form_of(head, low):
            continue
        if len(toks) > 1 and any(_is_form_of(t, head) for t in toks):
            continue
        if re.fullmatch(r"[A-Z][a-z]+ [a-z]+", it):
            continue  # a binomial or a name ("Axis axis")
        z = _phrase_zipf(low)
        if z < min_zipf:
            continue
        out.append(((len(toks) > 1, -z), it))
    if by_frequency:
        out.sort(key=lambda x: x[0])
    return [it for _, it in out[:RELATED_MAX]]


# Senses kept but marked for the learner: "(archaic) To cause a rowdy disturbance."
SHOWN_MARGINAL = ["obsolete", "archaic", "dated", "rare", "poetic", "historical", "uncommon"]


def label_marginal(meanings: list[dict], label_map: dict) -> list[dict]:
    """Senses the dictionary marks archaic, obsolete, rare, dated, poetic or
    historical get the label in front of the definition and in `label`, unless
    the label is about another region ("obsolete in the UK")."""
    out = []
    for m in meanings:
        senses = []
        for sn in m["senses"]:
            d = sn["definition"]
            labels = [x.lower() for x in label_map.get(sense_key(d), [])]
            lead = leading_labels(d)
            joined = " ".join(labels) + " " + lead
            regional = any(re.search(r"\b(uk|british|britain|us|american|north america|outside)\b", x)
                           for x in labels)
            marks = [x for x in SHOWN_MARGINAL if re.search(rf"\b{x}\b", joined)]
            if marks and not regional:
                label = ", ".join(marks[:2])
                if not lead:
                    d = f"({label}) {d}"
                sn = {**sn, "definition": d, "label": label}
            senses.append(sn)
        out.append({**m, "senses": senses})
    return out


# Pronunciation tips: sentences about the pipeline's own transcription ("The
# provided IPA … is incorrect") mean nothing to the learner.
TIP_META = re.compile(
    r"\b(provided|given|supplied|listed|dictionary(?:'s)?|app's|shown|above|original|source|your|item's)\s+"
    r"(?:\w+\s+){0,2}(IPA|transcription|pronunciation)\b|"
    r"\bIPA\b[^.]*\b(incorrect|wrong|corrected|error|mistaken|typo|not standard|does not match|doesn't match)\b|"
    r"\b(in|from) the (supplied|given|provided|listed|dictionary) (IPA|transcription)|"
    r"\bthe IPA (here|given|shown|above)\b", re.I)
_TIP_SENTENCE = re.compile(r"[^.!?]+(?:[.!?]+['\"’”]?|$)")
_ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"]


def clean_tip(tip: str, respelling: str) -> str:
    """Drop meta sentences; "the only syllable" in a word of several syllables
    becomes the stressed syllable's ordinal, read from the respelling."""
    if not tip:
        return tip
    kept = [s for s in _TIP_SENTENCE.findall(tip) if not TIP_META.search(s)]
    tip = re.sub(r"\s{2,}", " ", "".join(kept)).strip()
    parts = [p for p in re.split(r"[-\s]+", respelling or "") if p]
    stressed = next((i for i, p in enumerate(parts) if p.isupper() and len(p) > 1), None)
    if len(parts) > 1 and stressed is not None and stressed < len(_ORDINALS) and \
            re.search(r"only syllable(?! with)", tip):
        ordinal = _ORDINALS[stressed]
        tip = re.sub(r"\bthe only syllable( that matters| after the first)?", f"the {ordinal} syllable", tip)
        tip = re.sub(r"\bits only syllable\b", f"its {ordinal} syllable", tip)
        tip = re.sub(r",? which is the (first|second|third)( syllable of the word)?(?=[.;])", "", tip)
    return tip


# Displayed IPA: General American, broad transcription.
NON_GA_PHONETIC = re.compile(
    r"\([ɹr]\)|[̝̞̯̠̈]|ɛə|eə|ʊə(?!ɹ)|ɐ|ʌi|æʊ|ɘ|ɵ|ʉ|[ɑɔɜ]ː|əʊ")


def normalize_ipa(ipa: str) -> str:
    """r -> ɹ, no tie bars or non-syllabic marks, first variant only."""
    if not ipa:
        return ipa
    ipa = ipa.split(",")[0].strip()
    if ipa.startswith("/") and not ipa.endswith("/"):
        ipa += "/"
    if ipa.startswith("[") and not ipa.endswith("]"):
        ipa += "]"
    ipa = re.sub(r"\(([ɹr])\)", "ɹ", ipa)
    ipa = ipa.replace("͡", "").replace("͜", "").replace("̯", "").replace("r", "ɹ")
    return re.sub(r"\s+(?=[/\]]$)", "", ipa)


def _syllables(ipa: str) -> int:
    n, prev = 0, False
    for ch in re.sub(r"[ˈˌ./\[\] ]", "", ipa):
        v = ch in _IPA_VOWELS or ch in "ɚɝ"
        n += v and not prev
        prev = v
    return n + len(re.findall(r"[lmn]̩", ipa))


def phonetic_needs_study_ipa(w: dict) -> bool:
    p = w["phonetic"]
    if not p:
        return True
    word = w["word"].lower()
    if re.search(r"(er|ar|or|our|ure|ere|ore|ire|ear|eer|air)$", word) and re.search(r"[əʊɪɛ][/\]]$", p):
        return True  # non-rhotic ending: "amber" /ˈæm.bə/
    if NON_GA_PHONETIC.search(p):
        return True
    return "ˈ" not in p and " " not in p.strip("/[]") and _syllables(p) > 1


def polish_ipa(w: dict) -> str:
    """The displayed IPA, replaced by the study notes' General American IPA
    when ours is empty, non-rhotic, narrow or regional, or has no stress mark
    (and the notes' respelling agrees with it, as in assemble's own check);
    returns what was done ("study", "normalized" or "")."""
    pron = (w.get("nuance") or {}).get("pronunciation") or {}
    study = normalize_ipa(pron.get("ipa", "").strip())
    before = w["phonetic"]
    if phonetic_needs_study_ipa(w) and study.startswith("/") and study != normalize_ipa(before) and \
            respelling_matches_ipa(pron.get("respelling", ""), study) is not False:
        tmp = {**w, "phonetic": study}
        if not NON_GA_PHONETIC.search(study) and not phonetic_needs_study_ipa(tmp):
            w["phonetic"], w["phonetic_source"] = us_style(study), "reviewed"
            return "study"
    w["phonetic"] = normalize_ipa(before)
    return "normalized" if w["phonetic"] != before else ""


_NEG = re.compile(r"^(un|in|im|il|ir|en|em|dis|non|mis|anti|counter|over|under|re|de|pre)")


def _common_run(a: str, b: str) -> int:
    """Length of the longest stretch of letters a and b share."""
    best = 0
    for i in range(len(a)):
        for j in range(i + best + 1, len(a) + 1):
            if a[i:j] in b:
                best = j - i
            else:
                break
    return best


def _stem_pair(x: str, y: str, strict: bool) -> bool:
    if len(y) <= 3 or len(x) <= 3:
        short, long_ = sorted((x, y), key=len)
        return not strict and len(short) >= 2 and (long_.startswith(short) or long_.endswith(short))
    if x in y or y in x or (not strict and _common_run(x, y) >= 6):
        return True
    for a in {x, _NEG.sub("", x)}:
        for b in {y, _NEG.sub("", y)}:
            n = 0
            while n < min(len(a), len(b)) and a[n] == b[n]:
                n += 1
            if n >= 4 or (n >= 3 and not strict and n >= min(len(a), len(b)) - 2):
                return True
    return False


def shares_stem(member: str, headword: str) -> bool:
    """A word-family member must share a stem with the headword (or one word
    of a phrase): one containing the other, a common beginning of 4+ letters
    ("receive", "reception"), or the same after a prefix ("inability",
    "ability"). A capitalized member of a lowercase word needs a real stem
    ("dan" is not "Danish")."""
    base = member.split(" (")[0].strip()
    strict = base[:1].isupper() and not headword[:1].isupper()
    xs = [t for t in re.split(r"[\s-]+", base.lower()) if len(t) >= 2]
    ys = [t for t in re.split(r"[\s-]+", headword.lower()) if len(t) >= 2 and t not in _STOP] or \
        [headword.lower()]
    return any(_stem_pair(x, y, strict) for x in xs for y in ys)


_ARTICLE = re.compile(r"(?:(?<=^)|(?<=[.!?:;]\s)|(?<=[\"'“]))A (?=[aeio])|(?<![\w'’-])a (?=(?:[aeio]|un(?!i|an|ary))[\w-])")


def fix_articles(text: str) -> str:
    """"a idea" -> "an idea" (not "a one-time", "a user", "a European", nor
    the letter a, nor a note that is itself about the article)."""
    if not text or re.search(r"\b(say|use|write) an\b|vowel sound", text):
        return text

    def sub(m: re.Match) -> str:
        nxt = re.match(r"[\w'-]+", text[m.end():]).group(0).lower()
        if re.match(r"(as|in|of|is|and|at|or|are|into|also|instead|it|an|if|on|ok|ai|api|auc|url)$", nxt) or \
                re.match(r"(eu|one|once|ewe|uni|use|usu|uti|ura|uri|ure|ut|ub)", nxt) or \
                text[m.end() + len(nxt):m.end() + len(nxt) + 1] in "'’\"" or \
                text[max(0, m.start() - 1):m.start()] in "'’\"":
            return m.group(0)
        return m.group(0)[0] + "n "
    return _ARTICLE.sub(sub, text)


def _map_strings(value, fn, skip=("etymology",)):
    if isinstance(value, str):
        return fn(value)
    if isinstance(value, list):
        return [_map_strings(v, fn, skip) for v in value]
    if isinstance(value, dict):
        return {k: (v if k in skip else _map_strings(v, fn, skip)) for k, v in value.items()}
    return value


def polish_entry(w: dict, stats: dict) -> None:
    """Display clean-ups: synonyms, IPA, tips, distinctions, word family,
    connotation and article errors (see the functions above)."""
    def count(name: str, changed: bool) -> None:
        if changed:
            stats[name] = stats.get(name, 0) + 1
    word = w["word"]
    for field in ("synonyms", "antonyms"):
        new = clean_related(w.get(field) or [], word)
        count(field, new != w.get(field))
        w[field] = new
        for m in w["meanings"]:
            if m.get(field):
                new = clean_related(m[field], word)
                count(f"meaning {field}", new != m[field])
                m[field] = new
            for sn in m["senses"]:
                if sn.get(field):
                    sn[field] = clean_related(sn[field], word)
    count(f"ipa {polish_ipa(w)}", True)
    n = w.get("nuance")
    if not n:
        return
    if n.get("antonyms"):
        # The study notes' own antonyms were chosen by hand: same checks, but
        # rare words stay ("decorous", "heteroscedasticity") and so does the order.
        new = clean_related(n["antonyms"], word, by_frequency=False, min_zipf=0)
        count("note antonyms", new != n["antonyms"])
        n["antonyms"] = new
    pron = n.get("pronunciation") or {}
    if pron.get("tip"):
        new = clean_tip(pron["tip"], pron.get("respelling", ""))
        count("tip", new != pron["tip"])
        pron["tip"] = new
    if n.get("distinctions"):
        heads = {word.lower(), w["key"].replace("-", " ")}
        new = [d for d in n["distinctions"] if (d.get("vs") or "").strip().lower() not in heads]
        count("distinctions vs headword", len(new) != len(n["distinctions"]))
        n["distinctions"] = new
    if n.get("word_family"):
        new = [x for x in n["word_family"] if shares_stem(x, word)]
        stats["word family members dropped"] = stats.get("word family members dropped", 0) + \
            len(n["word_family"]) - len(new)
        n["word_family"] = new
    c = n.get("connotation") or ""
    if c[:1].islower():
        n["connotation"] = c[0].upper() + c[1:]
        count("connotation capitalized", True)
    new = _map_strings(n, fix_articles)
    count("article fixes (notes)", new != n)
    w["nuance"] = n = new
    conv = [{**e, "text": fix_articles(e["text"])} for e in w.get("conversation") or []]
    count("article fixes (conversation)", conv != (w.get("conversation") or []))
    w["conversation"] = conv


def apply_fixes(words: list[dict]) -> None:
    """Hand corrections from seeds/fixes/*.txt (see its README.txt). A
    corrected entry is normalized again, so its senses are compared with the
    corrected definition."""
    by_key = {w["key"]: w for w in words}
    fixed = set()
    for path in sorted((SEEDS / "fixes").glob("*.txt")):
        if path.name == "README.txt":
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip() or line.startswith("#"):
                continue
            key, field, value = (x.strip() for x in line.split(" | ", 2))
            where = f"{path.relative_to(ROOT)}:{n}"
            if key not in by_key:
                sys.exit(f"{where}: no word with key {key!r}")
            parts = field.split(".")
            node = by_key[key]
            for part in parts[:-1]:
                node = node[int(part)] if isinstance(node, list) else node.get(part)
                if node is None:
                    sys.exit(f"{where}: {key} has no {field}")
            last = int(parts[-1]) if isinstance(node, list) else parts[-1]
            if isinstance(node, dict) and last not in node:
                sys.exit(f"{where}: {key} has no {field}")
            node[last] = json.loads(value) if value[:1] in "[{" else value
            fixed.add(key)
    for key in fixed:
        normalize_display(by_key[key])


def assemble(quiet: bool = False) -> dict:
    sel = read_json(SELECTED, None)
    if sel is None:
        return {}
    cands = read_json(CANDIDATES, {})
    dict_cache = read_jsonl(DICT_CACHE)
    audio_cache = read_jsonl(AUDIO_CACHE)
    enrich_cache = read_jsonl(ENRICH_CACHE)
    extras_cache = read_jsonl(EXTRAS_CACHE)
    words = []
    selected_set = set(sel["words"])
    conversation = load_examples()
    fallback_meanings = {norm_key(w): g for path in sorted(MEANINGS.glob("*.txt")) if MEANINGS.exists()
                         for w, g in load_seed_file(path) if g}
    domain_senses = load_domain_senses()
    bible_names, bible_vocab = load_bible_names()
    for k in sel["words"]:
        d = dict_cache.get(k)
        c = cands.get(k, {"tags": [], "zipf": 0})
        if not c.get("gloss") and (not d or d["status"] != "ok") and k in fallback_meanings:
            c = {**c, "gloss": fallback_meanings[k]}
        if c.get("gloss"):
            # An everyday expression defined in the seed file.
            d = {"status": "ok", "entry": {
                "word": c["word"], "phonetics": [], "source": "leximaster",
                "meanings": [{"pos": "expression", "senses": [
                    {"definition": c["gloss"], "example": "", "synonyms": [], "antonyms": []}]}]}}
        if d and d["status"] == "ok" and "bible" in c.get("tags", []) and c["word"][:1].isupper() \
                and not c.get("gloss") and (d["entry"]["word"][:1].islower() or not any(
                    m.get("pos") == "proper noun" for m in d["entry"]["meanings"])):
            # A Bible name needs its proper-noun sense. Without it the lookup
            # found a different word ("aaron", thieves' slang; "jordan", a
            # chamber pot), so the definition comes from the study notes.
            d = None
        if (not d or d["status"] != "ok") and "bible" in c.get("tags", []):
            n_ = enrich_cache.get(k)
            core = ((n_ or {}).get("nuance") or {}).get("core") or {}
            if n_ and n_["status"] == "ok" and core.get("definition"):
                d = {"status": "ok", "entry": {
                    "word": c["word"], "phonetics": [], "source": "leximaster",
                    "meanings": [{"pos": core.get("pos") or ("proper noun" if c["word"][:1].isupper() else ""),
                                  "senses": [{"definition": core["definition"], "example": "",
                                              "synonyms": [], "antonyms": []}]}]}}
        if not d or d["status"] != "ok":
            continue  # not yet fetched, or not in any dictionary
        e = d["entry"]
        x = extras_cache.get(k, {})
        meanings = e["meanings"]
        variant_of = ""
        word = e["word"]
        phonetics = e.get("phonetics", [])
        if x.get("lemma"):
            lemma_key = norm_key(x["lemma"])
            # "blandishments" goes when "blandishment" is in the lexicon; an
            # everyday entry with its own examples ("wiped out") stays.
            if lemma_key != k and lemma_key in selected_set and not conversation.get(k) and \
                    dict_cache.get(lemma_key, {}).get("status") == "ok":
                continue
            if x.get("lemma_meanings"):
                meanings = x["lemma_meanings"]
                if lemma_key == k:  # only the capital differs: show "Hesychasm"
                    word = x["lemma"]
                    phonetics = phonetics + [{"text": p["text"], "audio": "", "accent": p["accent"]}
                                             for p in x.get("lemma_ipa", [])]
                else:
                    variant_of = x["lemma"]
        meanings = clean_meanings(meanings)
        if not meanings:
            continue
        # Proper nouns and symbol entries ("ISO 639-3 code") aren't vocabulary.
        skip_pos = {"proper noun", "symbol", "letter", "numeral", "character", "romanization"}
        if "bible" in c["tags"]:
            # Bible names keep their proper-noun sense, first: "Christ" is not
            # the exclamation, "Jordan" is the river.
            skip_pos.discard("proper noun")
            if c["word"][:1].isupper():
                meanings = sorted(meanings, key=lambda m: m.get("pos") != "proper noun")
        meanings = [m for m in meanings if m.get("pos") not in skip_pos] or meanings
        label_map = dict(map(tuple, x.get("sense_labels", [])))
        pruned = prune_senses(meanings, label_map)
        if not pruned and not (conversation.get(k) or c.get("gloss")):
            all_defs = [sn["definition"] for m in meanings for sn in m["senses"]]
            if k in fallback_meanings:
                pruned = [{"pos": "", "senses": [{"definition": fallback_meanings[k], "example": "",
                                                  "synonyms": [], "antonyms": []}]}]
            elif "bible" in c["tags"] or all(FORM_OF_RE.match(d_) or NOT_SHOWN_TEXT.match(d_) for d_ in all_defs):
                continue  # only spelling variants, or (Bible) only archaic senses: not shown
            # A word chosen on purpose (GRE, literary) stays whole even if the
            # dictionary calls it archaic or British: "condign", "bumptious".
        meanings = pruned or meanings
        if not variant_of:
            senses_ = [sn["definition"] for m in meanings for sn in m["senses"]]
            if senses_ and all(FORM_OF_RE.match(d_) for d_ in senses_):
                # Only "plural of ..." / "alternative form of ...": show the main
                # word's meanings, or leave the entry out.
                lm = LEMMA_RE.search(senses_[0])
                lemma_key = norm_key(lm.group(1)) if lm else ""
                main = dict_cache.get(lemma_key, {})
                if k in fallback_meanings:
                    pass  # a written meaning ("intrigued") is used below
                elif lemma_key and lemma_key != k and main.get("status") == "ok":
                    if lemma_key in selected_set:
                        continue  # the main form is its own entry
                    meanings = clean_meanings(main["entry"]["meanings"])
                    variant_of = lm.group(1).strip()
                else:
                    continue
        meanings = rank_senses(meanings, set(c["tags"]), label_map)
        meanings = label_marginal(meanings, label_map)
        if all(FORM_OF_RE.match(sn["definition"]) for m in meanings for sn in m["senses"]):
            if k not in fallback_meanings:
                continue  # nothing but "alternative spelling of ...": not an entry worth showing
            meanings = [{"pos": "", "senses": [{"definition": fallback_meanings[k], "example": "",
                                                "synonyms": [], "antonyms": []}]}]
        meanings = rank_by_examples(meanings, conversation.get(k, []))
        if e.get("source") != "leximaster" or k in domain_senses.get("bible", {}):
            meanings = add_domain_senses(meanings, k, set(c["tags"]), domain_senses)
        a = audio_cache.get(k)
        n = enrich_cache.get(k)
        nuance = us_spelling_deep(n["nuance"]) if n and n["status"] == "ok" else None
        if nuance and mainly_british(nuance) and not ({"advanced", "academic"} & set(c["tags"])) \
                and not c.get("gloss"):
            continue  # Americans say something else; the app teaches American English
        domains = sorted(set(c["tags"]) | set(nuance["domains"] if nuance else []))
        # Bible names (people, places, peoples) and Bible vocabulary are studied
        # apart: "bible_names" and "bible_vocab" sub-domains, both under "bible".
        name_kind = ""
        if "bible" in domains and k in bible_names:
            kind, everyday = bible_names[k]
            if word[:1].isupper():
                name_kind = kind
                proper = [m for m in meanings if m.get("pos") == "proper noun"]
                core = (nuance or {}).get("core") or {}
                if any(k in v for d_, v in domain_senses.items() if d_ != "bible"):
                    pass  # also another subject's term ("Adam", an AI optimizer): keep every sense
                elif kind != "people" and proper:
                    meanings = proper  # "Cain" the man, not "cain" (rent paid in kind)
                elif kind != "people" and core.get("definition"):
                    meanings = [{"pos": "proper noun", "senses": [{"definition": core["definition"], "example": "",
                                                                    "synonyms": [], "antonyms": []}]}]
                said = [_stems(sn["definition"]) for m in meanings for sn in m["senses"]]
                if everyday and not any(len(_stems(everyday) & st) * 2 >= len(_stems(everyday)) for st in said):
                    # The everyday meaning first, unless the dictionary already gives it.
                    meanings = [{"pos": "everyday English", "senses": [{"definition": everyday[0].upper() + everyday[1:] + ".",
                                                        "example": "", "synonyms": [], "antonyms": []}]}] + meanings
            elif k not in bible_vocab:
                domains.remove("bible")  # the name isn't this word ("Job" is not "job")
        if "bible" in domains:
            if name_kind:
                domains.append("bible_names")
            if not name_kind or bible_names[k][1] or k in bible_vocab:
                domains.append("bible_vocab")
            domains = sorted(set(domains))
        has_audio = bool(a and a["status"] == "ok" and a.get("accent") == ACCENT
                         and (AUDIO / a["file"]).exists())
        words.append({
            "word": word,
            "key": k,
            "zipf": c.get("zipf", 0),
            "domains": domains,
            "phonetic": pick_phonetic(phonetics, ACCENT),
            "audio": ({"file": f"audio/{a['file']}", "source_url": a["source_url"],
                       "accent": ACCENT} if has_audio else None),
            "has_audio": has_audio,
            "meanings": meanings,
            "synonyms": [us_spelling(w_) for w_ in clean_word_list(x.get("synonyms", []), word)],
            "antonyms": [us_spelling(w_) for w_ in clean_word_list(x.get("antonyms", []), word)],
            "etymology": clean_etymology(x.get("etymology", "")),
            "variant_of": variant_of,
            "conversation": [{**e_, "text": us_spelling(e_["text"])} for e_ in conversation.get(k, [])],
            "nuance": nuance,
            "source": e.get("source", ""),
            "name_kind": name_kind,
            "status": {"fetched": True, "audio": has_audio, "enriched": nuance is not None},
        })
    for w in words:
        normalize_display(w)
    # Words with no US transcription on Wiktionary: the CMU Pronouncing
    # Dictionary, then hand-written IPA (seeds/ipa/*.txt).
    known = {w["key"]: w["phonetic"] for w in words if w["phonetic"] and " " not in w["phonetic"]}
    manual = {norm_key(x): g for path in sorted((SEEDS / "ipa").glob("*.txt"))
              for x, g in load_seed_file(path) if g}
    for w in words:
        if w["phonetic"]:
            w["phonetic_source"] = "wiktionary"
            continue
        w["phonetic"] = cmu_ipa(w["key"], known, w["word"])
        w["phonetic_source"] = "cmu" if w["phonetic"] else ""
        if not w["phonetic"] and w["key"] in manual:
            w["phonetic"], w["phonetic_source"] = manual[w["key"]], "manual"
    # The enrichment returns its own General American IPA. It replaces ours
    # only when ours disagrees with the model's respelling and the model's
    # IPA agrees with it, so one slip can't override a good transcription.
    for w in words:
        pron = (w.get("nuance") or {}).get("pronunciation") or {}
        ipa, resp = pron.get("ipa", "").strip(), pron.get("respelling", "")
        if not ipa.startswith("/") or ipa == w["phonetic"]:
            continue
        ours = respelling_matches_ipa(resp, w["phonetic"]) if w["phonetic"] else False
        theirs = respelling_matches_ipa(resp, ipa)
        if ours is not True and theirs is not False and (not w["phonetic"] or ours is False):
            w["phonetic"], w["phonetic_source"] = us_style(ipa), "reviewed"
    # Narrow transcriptions in brackets ([ˈɛn.əkˌdɐʉt]) are often not
    # American: the enrichment's General American IPA replaces them.
    for w in words:
        ipa = ((w.get("nuance") or {}).get("pronunciation") or {}).get("ipa", "").strip()
        if w["phonetic"].startswith("[") and ipa.startswith("/"):
            w["phonetic"], w["phonetic_source"] = us_style(ipa), "reviewed"
    # Natural synthesized recordings (tools/tts.py) for words without a human one.
    tts = read_json(CACHE / "tts.json", {})
    for w in words:
        t = tts.get(w["key"])
        if not w["has_audio"] and t and (DATA / t["file"]).exists():
            w["tts"] = {"file": t["file"], "voice": t["voice"]}
    global POLISH_STATS
    POLISH_STATS = {}
    for w in words:
        polish_entry(w, POLISH_STATS)
    # seeds/drop: "key" leaves an entry out; "key | kept-key" also records the
    # dropped spelling on the kept entry ("also": ["naivety"]) with its domains.
    drops = [(norm_key(x), norm_key(g) if g else "") for path in sorted((SEEDS / "drop").glob("*.txt"))
             for x, g in load_seed_file(path)]
    dropped = {x for x, _ in drops}
    by_key = {w["key"]: w for w in words}
    for x, kept in drops:
        if kept and x in by_key and kept in by_key:
            k_ = by_key[kept]
            k_.setdefault("also", []).append(by_key[x]["word"])
            k_["domains"] = sorted(set(k_["domains"]) | set(by_key[x]["domains"]))
    words = [w for w in words if w["key"] not in dropped]
    apply_fixes(words)
    for w in words:  # a hand-fixed "(archaic) …" definition gets its label too
        for m in w["meanings"]:
            for sn in m["senses"]:
                lead = leading_labels(sn["definition"])
                if lead and "label" not in sn and any(re.search(rf"\b{x}\b", lead) for x in SHOWN_MARGINAL):
                    sn["label"] = lead
    # Frequency rank within the dataset (1 = most common), the order new
    # words are studied in.
    for rank, w in enumerate(sorted(words, key=lambda w: -rank_zipf(w)), start=1):
        w["freq_rank"] = rank
    words.sort(key=lambda w: w["word"].lower())
    atomic_write_json(WORDS_JSON, {"version": 1, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                   "count": len(words), "words": words})
    summary = {
        "selected": len(sel["words"]),
        "fetched": len(words),
        "not_found": sum(1 for k in sel["words"] if dict_cache.get(k, {}).get("status") == "not_found"),
        "with_audio": sum(w["has_audio"] for w in words),
        "speech_fallback": sum(not w["has_audio"] for w in words),
        "enriched": sum(w["nuance"] is not None for w in words),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    atomic_write_json(STATE_JSON, summary)
    if not quiet:
        log(f"[assemble] words.json: {summary['fetched']} words · {summary['with_audio']} with "
            f"recorded audio · {summary['enriched']} enriched")
    return summary


def show_status() -> None:
    cands = read_json(CANDIDATES, {})
    sel = read_json(SELECTED, {"words": []})
    s = assemble(quiet=True) or {}
    log(f"candidates       {len(cands)}")
    log(f"selected         {len(sel['words'])}")
    for k in ("fetched", "not_found", "with_audio", "speech_fallback", "enriched"):
        log(f"{k:<16} {s.get(k, 0)}")


# ---------------------------------------------------------------------------- main

def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--stages", default=",".join(STAGES),
                   help=f"comma-separated subset of: {','.join(STAGES)}")
    p.add_argument("--limit", type=int, help="only fetch/download/enrich the first N selected words (testing)")
    p.add_argument("--target", type=int, default=0, help="maximum number of words to keep (default 0: no limit)")
    p.add_argument("--max-zipf", type=float, default=4.6,
                   help="drop words more common than this Zipf frequency (default 4.6)")
    p.add_argument("--general-margin", type=float, default=0.5,
                   help="how much rarer general-vocabulary words must be than domain terms (default 0.5)")
    p.add_argument("--model", default="claude-haiku-5-5")
    p.add_argument("--only", default="", help="enrich only these comma-separated words (redoes them)")
    p.add_argument("--budget", type=float, default=0,
                   help="stop enrichment once the estimated cost reaches this many US dollars")
    p.add_argument("--effort", default="medium", choices=["low", "medium", "high"],
                   help="Claude effort level for enrichment (default medium)")
    p.add_argument("--batch-size", type=int, default=10)
    p.add_argument("--concurrency", type=int, default=8, help="parallel enrichment requests")
    p.add_argument("--retry-failed", action="store_true", help="retry words that failed before")
    p.add_argument("--status", action="store_true", help="print progress and exit")
    return p.parse_args()


async def main() -> None:
    args = parse_args()
    args.accent = ACCENT
    for d in (DATA, CACHE, AUDIO):
        d.mkdir(parents=True, exist_ok=True)
    if args.status:
        show_status()
        return
    stages = [s.strip() for s in args.stages.split(",") if s.strip()]
    unknown = set(stages) - set(STAGES)
    if unknown:
        sys.exit(f"Unknown stage(s): {', '.join(sorted(unknown))}")
    t0 = time.time()
    for stage in STAGES:
        if stage not in stages:
            continue
        log(f"\n=== {stage} ===")
        fn = globals()[f"stage_{stage}"]
        if asyncio.iscoroutinefunction(fn):
            await fn(args)
        else:
            fn(args)
        if stage in ("fetch", "audio", "extras", "enrich", "filter"):
            assemble()
    log(f"\nFinished in {fmt_secs(time.time() - t0)}. Run with --status to see totals.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        try:
            assemble(quiet=True)
        finally:
            print("\nInterrupted. Progress is saved; rerun the same command to resume.")
