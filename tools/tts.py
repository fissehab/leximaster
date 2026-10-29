"""Natural synthesized pronunciations for the words without an American
recording, made with Kokoro (an open neural voice, Apache 2.0) on this
computer. Single words and phrases with a reviewed IPA are spoken from that
IPA, so rare words (Melchizedek, apophatic) are pronounced as the entry says;
sentences and entries without IPA are read as text.

    .venv/bin/python tools/tts.py generate        # words not yet done (resumable)
    .venv/bin/python tools/tts.py verify          # transcribe each with Whisper; flag doubtful ones
    .venv/bin/python tools/tts.py generate --only "word1,word2"
    .venv/bin/python tools/tts.py retry --only "word1,word2"   # other voices; keep the clearest

Files: data/tts/<slug>.<hash8>.m4a (the hash of the file's content, so
corrected audio gets a new URL), listed in data/cache/tts.json (key → file, the
phonemes spoken, how they were chosen, and the check's result). The model
files go in data/models/ (see MODEL_URL). build_dataset.assemble() attaches
`tts` to each entry; the app plays it when there is no human recording.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from build_dataset import CACHE, DATA, WORDS_JSON, slug  # noqa: E402

MODELS = DATA / "models"
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL, VOICES = MODELS / "kokoro-v1.0.onnx", MODELS / "voices-v1.0.bin"
VOICE = "af_heart"        # Kokoro's highest-rated American voice
SPEED = 0.92              # a touch slower than conversation, for learners
OUT_DIR = DATA / "tts"
MANIFEST = CACHE / "tts.json"
VOWELS = set("aeiouæɑɒɔəɛɜɚɪʊʌɐɨᵻᵊ")


# Little words a phrase doesn't stress ("Acts of the Apostles").
UNSTRESSED = {"a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "but", "with", "as",
              "from", "into", "than", "that", "your", "my", "his", "her", "its", "their", "our", "is", "was"}


def clean_ipa(ipa: str) -> str:
    """The entry's first transcription: the /phonemic/ one before any [narrow]
    one, and before a comma that starts a variant ("/fəˈnɑli, fɪ-/")."""
    s = ipa.strip()
    if s.startswith("/") and "/" in s[1:]:
        s = s[1:s.index("/", 1)]
    elif s.startswith("[") and "]" in s:
        s = s[1:s.index("]")]
    return s.split(",")[0].strip().strip("/[]").strip()


STRESSABLE = VOWELS | {"ː"}


def to_phonemes(ipa: str, vocab: dict, words: list[str] | None = None, flap: bool = True) -> str:
    """The entry's General American IPA in the notation Kokoro was trained on:
    stress marks just before the stressed vowel (not at the syllable start),
    ɹ for r, ɜɹ for ɝ, no syllable dots, brackets or diacritics, the American
    flap for t between vowels before an unstressed one, and a final "." so the
    word ends as a statement. flap=False keeps every t (NO_FLAP)."""
    s = clean_ipa(ipa)
    s = re.sub(r"\(([^)]*)\)", r"\1", s)             # "(ɹ)": the American r is said
    for a, b in (("ɝ", "ɜɹ"), ("r", "ɹ"), ("ɫ", "l"), ("g", "ɡ"), ("'", "ˈ"), ("ʉ", "u"), ("ʍ", "w"),
                 ("n̩", "ən"), ("l̩", "əl"), ("m̩", "əm"), ("‿", " "), ("-", " ")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).replace(".", "")
    s = s.replace("ɛəɹ", "ɛɹ").replace("ɛɚ", "ɛɹ").replace("oɹ", "ɔɹ").replace("oɪ", "ɔɪ")  # "tear" (rip) ɛɹ; "sport" oɹ, "loin" oɪ: Kokoro's ɔːɹ, ɔɪ
    # Syllables written apart ("ˈbɪb li əˌfaɪl") are one word when the
    # headword is: join them, or Kokoro says each as a word.
    if words and len(words) == 1 and len(s.split()) > 1:
        s = "".join(s.split())
    out, pending = [], ""
    for c in s:
        if c in "ˈˌ":
            pending = c
            continue
        if pending and c in VOWELS:
            out.append(pending)
            pending = ""
        out.append(c)
    s = "".join(out)
    # Long vowels carry a length mark in Kokoro's notation (espeak's): "yeast"
    # is jiːst, "call" kɔːl. Not before another vowel (diphthongs such as ɔɪ,
    # iə); word-final i is decided below, once stress is known.
    s = re.sub(r"i(?![ːaeiouæɑɒɔəɛɜɚɪʊʌ]|$|\s)", "iː", s)
    s = re.sub(r"u(?![ːaeiouæɑɒɔəɛɜɚɪʊʌ])", "uː", s)
    s = re.sub(r"ɑ(?![ːɪ])", "ɑː", s)
    s = re.sub(r"ɔ(?![ːɪ])", "ɔː", s)
    s = re.sub(r"ɜɹ(?=[aeiouæɑɒɔəɛɜɚɪʊʌ])", "ɜːɹ", s)   # "worry" wˈɜːɹi keeps its r
    s = s.replace("ɜɹ", "ɜː").replace("iːɹ", "ɪɹ")      # "here": Kokoro's hˈɪɹ
    # Every word needs a primary stress ("shelf" is ʃˈɛlf, not ʃɛlf): promote a
    # secondary one, or stress the first vowel; not the little words of a
    # phrase. A stressed schwa is the full vowel ʌ ("affront", əfɹˈʌnt).
    toks = "".join(c for c in s if c in vocab).split()
    names = [x.lower() for x in words] if words and len(words) == len(toks) else [""] * len(toks)
    out_words = []
    for tok, name in zip(toks, names):
        if name in UNSTRESSED and "ˈ" not in tok:
            # A little word stays weak unless the IPA stresses it, as in a
            # phrasal verb ("put on" /ˌpʊt ˈɑn/).
            out_words.append(tok.replace("ˌ", ""))
            continue
        # A stressed r-colored vowel is Kokoro's ɜː ("overt" oʊvˈɜːt).
        tok = re.sub(r"([ˈˌ])(?:ɚ|əɹ)(?![aeiouæɑɒɔəɛɜɚɪʊʌ])", r"\1ɜː", tok)
        tok = tok.replace("ˈə", "ˈʌ").replace("ˌə", "ˌʌ")
        if "ˈ" not in tok:
            if "ˌ" in tok:
                tok = tok.replace("ˌ", "ˈ", 1)
            else:
                m = re.search(f"[{''.join(VOWELS)}]", tok)
                tok = tok[:m.start()] + "ˈ" + tok[m.start():] if m else tok
        # A stressed final i is long (devotee dˌiːvoʊtˈiː, "sea" sˈiː); an
        # unstressed one stays short ("happy" hˈæpi).
        tok = re.sub(r"([ˈˌ])i$", r"\1iː", tok)
        # The American flap: t between vowels, before an unstressed one
        # (abnormality …mˈæləɾi, "party" pˈɑːɹɾi), never word-initial, not
        # before a syllabic n ("button", "heightened": a held t), and not
        # before aɪ aʊ ɔɪ, which keep their stress ("archetype", "satire").
        if flap:
            tok = re.sub(r"(?<=[aeiouæɑɒɔəɛɜɚɪʊʌᵻː])(ɹ?)t(?=[aeiouæɑɒɔəɛɜɚɪʊʌᵻ])(?![əɪ]n(?![aeiouæɑɒɔəɛɜɚɪʊʌᵻ]))(?!aɪ|aʊ|ɔɪ)",
                         r"\1ɾ", tok)
        out_words.append(tok)
    return (" ".join(out_words) + ".") if out_words else ""


# Words whose flap Kokoro says like an r ("Platonist" heard as "Player nest",
# "catechist" as "Karakist"): spoken with the t (or d) the entry shows. Chosen
# 2026-10-29 by hearing every flapped recording both ways with Whisper base.en
# and small.en (the plain t clearly better to both, or heard exactly by both
# while small.en missed the flap), then keeping the new recording only where
# both judges heard it better in two runs. Elsewhere the flap stays (2,298 of 2,347).
NO_FLAP = {
    "ad infinitum", "apocatastasis", "Artaxerxes", "auditability", "BTW", "catechist", "chronotope",
    "comforter", "coruscating", "dedicator", "disunity", "dubitable", "endogeneity", "Etam", "etiological",
    "ETL", "expropriator", "habitability", "ill at ease", "incorrigibility", "innatism", "involutory",
    "kittle", "lentitude", "meta", "mitigated", "mouthwatering", "nubility", "palatinate", "pertinence",
    "Platonist", "pseudonymity", "salutariness", "sanguinity", "saturninity", "seltzer water", "submittal",
    "substitutive", "tautologize", "tentativeness", "titillate", "tumidity", "turtledove", "unedited",
    "unwitting", "validator", "vomitus", "witting", "wittol"
}


COMMON = 3.0              # wordfreq Zipf: every word of the entry at least this common
NUMERALS = {"II": "two", "III": "three"}   # "type II error" is "type two error"


def strip_stress(ph: str) -> str:
    """Phonemes reduced for comparing Kokoro's guess with the entry's IPA:
    no stress, length or final stop; reduced vowels merged."""
    ph = re.sub(r"[ˈˌː.,!?]", "", ph)
    for a, b in (("ɐ", "ə"), ("ᵻ", "ə"), ("iəɹ", "ɪɹ"), ("ɪ", "ə"), ("ɔ", "ɑ"), ("ɾ", "t"), ("ʔ", "t"),
                 ("ɚ", "əɹ")):
        ph = ph.replace(a, b)
    return ph


def distance(a: str, b: str) -> float:
    """Normalized edit distance (0 same, 1 nothing in common)."""
    if not a and not b:
        return 0.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / max(len(a), len(b))


def differs(text_ph: str, ipa_ph: str, words: list[str]) -> bool:
    """Kokoro's reading of the text says something else than the IPA: a word
    more than about a quarter different ("wan" wˈæn vs wˈɑːn, "tear up"),
    after merging what doesn't change the word (reduced vowels, ɔ/ɑ, flaps);
    the little words of a phrase don't count."""
    a, b = strip_stress(text_ph).split(), strip_stress(ipa_ph).split()
    # A syllable dropped or added is always another word ("forex" as "forks").
    if syllables(" ".join(a)) != syllables(" ".join(b)):
        return True
    if len(a) == len(b):
        names = [x.lower() for x in words] if len(words) == len(a) else [""] * len(a)
        return max((distance(x, y) for x, y, n in zip(a, b, names) if n not in UNSTRESSED), default=0) > 0.25
    return distance(" ".join(a), " ".join(b)) > 0.25


def syllables(ph: str) -> int:
    """Vowel nuclei (a diphthong is one), syllabic consonants included."""
    return len(re.findall(r"aɪ|aʊ|ɔɪ|eɪ|oʊ|[aeiouæɑɒɔəɛɜɚɪʊʌᵻᵊ]|\u0329", unicodedata.normalize("NFD", ph)))


ODD_IPA = re.compile(r"e(?![ɪə])|æɪ|ɑe|ej|ɪj|ʌɪ|a(?![ɪʊ])|o(?![ʊɹɪ])|ʰ|eɪŋ|\[")


def bad_ipa(word: str, ipa: str) -> bool:
    """IPA that would mislead Kokoro: vowels General American doesn't have,
    from a British or narrow transcription ("SLA" /es el æɪ̯/, "parody"
    /ˈpaɹədɪj/, a raised "fang" /ˈfeɪ̯ŋ/, [brackets] inside), or a name written as its letters ("Achish"
    /ˈeɪˈsiˈeɪtʃˌɪʃ/). Such entries are read as text."""
    s = unicodedata.normalize("NFD", clean_ipa(ipa))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return bool(ODD_IPA.search(s)) or any(t.count("ˈ") >= 3 for t in s.split())


def plan(w: dict, tokenizer) -> tuple[str, str]:
    """(phonemes, source). Kokoro reads common words and everyday phrases well
    (and phrases with natural rhythm), so they are read as text; a rare or
    subject word is spoken from the entry's reviewed IPA, where Kokoro's guess
    goes wrong (Melchizedek, hypostasis). A common word is spoken from its IPA
    too when Kokoro's reading of it says something else (diocese, wan, shalom).
    Sentences are always read as text."""
    from wordfreq import zipf_frequency
    ipa = w.get("phonetic") or ""
    if ipa and bad_ipa(w["word"], ipa):
        ipa = ""
    tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
    rare = min((zipf_frequency(x, "en") for x in tokens), default=0) < COMMON
    rare = rare or bool(w.get("name_kind")) or w["word"][:1].isupper()   # names: "Ira" isn't the IRA
    sentence = bool(re.search(r"[?!.,]", w["word"]))
    flap = w["word"] not in NO_FLAP
    ipa_ph = to_phonemes(ipa, tokenizer.vocab, tokens, flap) if ipa and not sentence and len(tokens) <= 4 else ""
    if ipa_ph and rare:
        return ipa_ph, "ipa"
    text = " ".join(NUMERALS.get(x, x) for x in w["word"].split())
    ph = tokenizer.phonemize(text)
    # Only when the IPA is clearly the same words (one IPA word per word, and
    # no numeral read differently): "feel up to" /ˈʌp tə/ is just a part.
    whole = len(tokens) == 1 or len(clean_ipa(ipa).replace("‿", " ").replace("-", " ").split()) == len(tokens)
    acronym = any(len(x) > 1 and x.isupper() for x in tokens)   # "meeting ID" is said as letters
    if ipa_ph and len(tokens) <= 3 and whole and text == w["word"] and not acronym and differs(ph, ipa_ph, tokens):
        return ipa_ph, "ipa"
    if not flap:   # Kokoro's own flap: the letter the word is spelled with
        ph = ph.replace("ɾ", "d" if "d" in w["word"].lower() and "t" not in w["word"].lower() else "t")
    if ph and ph[-1] not in ".!?":
        ph += "."
    return ph, "text"


def encode(audio, sr: int, dst: Path) -> None:
    import numpy as np
    import soundfile as sf
    lead = np.zeros(int(sr * 0.08), dtype=audio.dtype)   # a breath of silence, so no browser clips the start
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        sf.write(tmp.name, np.concatenate([lead, audio, lead]), sr)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-ac", "1", "-c:a", "aac",
                        "-b:a", "48k", "-map_metadata", "-1", "-movflags", "+faststart", str(dst)], check=True)


def write_hashed(audio, sr: int, stem: str) -> Path:
    """Encode to data/tts/<stem>.<hash8>.m4a, the hash being of the file's
    content: corrected audio gets a new name, so no cache serves the old one."""
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp) / "out.m4a"
        encode(audio, sr, t)
        data = t.read_bytes()
    dst = OUT_DIR / f"{stem}.{hashlib.sha256(data).hexdigest()[:8]}.m4a"
    dst.write_bytes(data)
    return dst


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}


def save_manifest(m: dict) -> None:
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=0), encoding="utf-8")


def targets(only: set[str] | None = None) -> list[dict]:
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    return [w for w in words if not w.get("has_audio") and (not only or w["key"] in only)]


def generate(only: set[str] | None = None, force: bool = False) -> int:
    if not MODEL.exists() or not VOICES.exists():
        sys.exit(f"Download {MODEL.name} and {VOICES.name} from {MODEL_URL} into {MODELS.relative_to(ROOT)}/.")
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(str(MODEL), str(VOICES))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    m = load_manifest()
    todo = []
    for w in targets(only):
        ph, source = plan(w, kokoro.tokenizer)
        done = m.get(w["key"])
        if (force or not done or done.get("phonemes") != ph or not (DATA / done["file"]).exists()
                or not re.search(r"\.[0-9a-f]{8}\.m4a$", done["file"])):     # from before names had hashes
            todo.append((w, ph, source))
    print(f"{len(todo):,} to generate", flush=True)
    t0 = time.time()
    for n, (w, ph, source) in enumerate(todo, start=1):
        # A voice an earlier retry chose (it says this word's sounds most clearly) is kept.
        old = m.get(w["key"]) or {}
        voice, speed = (old.get("voice", VOICE), old.get("speed", SPEED)) if old.get("retried") else (VOICE, SPEED)
        audio, sr = kokoro.create(ph, voice=voice, speed=speed, is_phonemes=True)
        dst = write_hashed(audio, sr, slug(w["key"]))
        if old and old.get("file") != f"tts/{dst.name}":
            (DATA / old["file"]).unlink(missing_ok=True)      # the replaced recording
        m[w["key"]] = {"file": f"tts/{dst.name}", "phonemes": ph, "source": source, "voice": voice,
                       "seconds": round(len(audio) / sr, 2)}
        if voice != VOICE or speed != SPEED:
            m[w["key"]]["speed"] = speed
        if n % 200 == 0 or n == len(todo):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(todo):,} · {rate:.1f}/s · about {(len(todo) - n) / rate / 60:.0f} min left", flush=True)
    save_manifest(m)
    # Files no entry names any more (replaced, or from before names had hashes).
    keep = {Path(v["file"]).name for v in m.values()}
    stale = [f for f in OUT_DIR.glob("*.m4a") if f.name not in keep]
    for f in stale:
        f.unlink()
    if stale:
        print(f"removed {len(stale):,} old files", flush=True)
    return 0


def audio16k(path: Path):
    """Mono 16 kHz samples for Whisper, decoded with ffmpeg."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def resample16k(audio, sr: int):
    """Synthesized samples at 16 kHz for Whisper, resampled with ffmpeg."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-",
                          "-f", "f32le", "-ar", "16000", "-"],
                         input=np.asarray(audio, dtype=np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " \
       "seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
ORDINAL = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth",
           "twelve": "twelfth"}


def number_words(n: int, ordinal: bool = False) -> str:
    """12 → twelve, 48 → forty-eight (ordinal: forty-eighth), up to 9,999."""
    if n < 20:
        out = ONES[n]
    elif n < 100:
        out = TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    elif n < 1000:
        out = ONES[n // 100] + " hundred" + (" " + number_words(n % 100) if n % 100 else "")
    else:
        out = number_words(n // 1000) + " thousand" + (" " + number_words(n % 1000) if n % 1000 else "")
    if ordinal:
        head, _, last = out.rpartition(" ")
        pre, dash, unit = last.rpartition("-")
        unit = ORDINAL.get(unit) or (unit[:-1] + "ieth" if unit.endswith("y") else unit + "th")
        out = (head + " " if head else "") + pre + dash + unit
    return out


def spell_numbers(s: str) -> str:
    """Whisper writes numbers as digits ("48th", "2"); the words spell them out."""
    def one(m):
        n = int(m.group(1).replace(",", ""))
        return number_words(n, bool(m.group(2))) if n < 10000 else m.group(0)
    return re.sub(r"\b(\d[\d,]*)(st|nd|rd|th)?\b", one, s)


def similar(a: str, b: str) -> float:
    """Similarity of what Whisper heard to the word (letters only, 0–1),
    numbers spelled out on both sides."""
    from difflib import SequenceMatcher
    norm = lambda s: re.sub(r"[^a-z]", "", spell_numbers(s).lower())
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def verify(only: set[str] | None = None) -> int:
    """Transcribe every recording. A low match on a common word means the
    recording is wrong (or garbled); rare words and names are often heard as
    something else even when right, so they are reported, not failed."""
    from faster_whisper import WhisperModel
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    m = load_manifest()
    words = {w["key"]: w for w in targets(only)}
    keys = [k for k in m if k in words and "heard" not in m[k]]
    print(f"{len(keys):,} to check", flush=True)
    t0 = time.time()
    for n, k in enumerate(keys, start=1):
        # No initial prompt: it nudged Whisper toward hearing a word even when
        # the audio said something else.
        segs, _ = model.transcribe(audio16k(DATA / m[k]["file"]), language="en", beam_size=1)
        heard = " ".join(s.text for s in segs).strip()
        m[k]["heard"] = heard
        m[k]["match"] = round(similar(heard, words[k]["word"]), 2)
        if n % 200 == 0 or n == len(keys):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(keys):,} · {rate:.1f}/s", flush=True)
    save_manifest(m)
    return 0


# Tried in turn when Whisper can't make out a recording: Kokoro's next
# best-rated American voices, and the first voice a little slower.
RETRY = [("af_bella", SPEED), ("am_michael", SPEED), (VOICE, 0.8)]


def retry(only: set[str]) -> int:
    """Speak each word again in other voices, check each with Whisper, and
    keep the take it hears best (the current one unless another does
    better). For recordings the check flagged: the phonemes are right but
    the voice blurred a sound."""
    from faster_whisper import WhisperModel
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(str(MODEL), str(VOICES))
    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    m = load_manifest()
    words = {w["key"]: w for w in targets(only)}
    keys = [k for k in m if k in words and "match" in m[k] and "retried" not in m[k]]
    print(f"{len(keys):,} to retry", flush=True)
    t0, better = time.time(), 0
    for n, k in enumerate(keys, start=1):
        best = m[k]
        for voice, speed in RETRY:
            audio, sr = kokoro.create(best["phonemes"], voice=voice, speed=speed, is_phonemes=True)
            segs, _ = model.transcribe(resample16k(audio, sr), language="en", beam_size=1)
            heard = " ".join(s.text for s in segs).strip()
            match = round(similar(heard, words[k]["word"]), 2)
            if match > best["match"]:
                best = {**best, "voice": voice, "speed": speed, "heard": heard, "match": match, "audio": (audio, sr)}
        if "audio" in best:
            better += 1
            audio, sr = best.pop("audio")
            dst = write_hashed(audio, sr, slug(k))
            if m[k]["file"] != f"tts/{dst.name}":
                (DATA / m[k]["file"]).unlink(missing_ok=True)
            best["file"], best["seconds"] = f"tts/{dst.name}", round(len(audio) / sr, 2)
        m[k] = {**best, "retried": True}
        if n % 50 == 0 or n == len(keys):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(keys):,} · {better:,} improved · {rate:.2f}/s", flush=True)
    save_manifest(m)
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    if cmd == "generate":
        return generate(only, force="--force" in sys.argv)
    if cmd == "verify":
        return verify(only)
    if cmd == "retry" and only:
        return retry(only)
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main())
