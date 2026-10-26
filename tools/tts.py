"""Natural synthesized pronunciations for the words without an American
recording, made with Kokoro (an open neural voice, Apache 2.0) on this
computer. Single words and phrases with a reviewed IPA are spoken from that
IPA, so rare words (Melchizedek, apophatic) are pronounced as the entry says;
sentences and entries without IPA are read as text.

    .venv/bin/python tools/tts.py generate        # words not yet done (resumable)
    .venv/bin/python tools/tts.py verify          # transcribe each with Whisper; flag doubtful ones
    .venv/bin/python tools/tts.py generate --only "word1,word2"

Files: data/tts/<slug>.m4a, listed in data/cache/tts.json (key → file, the
phonemes spoken, how they were chosen, and the check's result). The model
files go in data/models/ (see MODEL_URL). build_dataset.assemble() attaches
`tts` to each entry; the app plays it when there is no human recording.
"""
from __future__ import annotations

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
              "from", "into", "than", "that"}


def to_phonemes(ipa: str, vocab: dict, words: list[str] | None = None) -> str:
    """The entry's General American IPA in the notation Kokoro was trained on:
    stress marks just before the stressed vowel (not at the syllable start),
    ɹ for r, ɜɹ for ɝ, no syllable dots, brackets or diacritics."""
    s = ipa.strip().strip("/[]")
    s = re.sub(r"\(([^)]*)\)", r"\1", s)             # "(ɹ)": the American r is said
    for a, b in (("ɝ", "ɜɹ"), ("r", "ɹ"), ("ɫ", "l"), ("g", "ɡ"), ("'", "ˈ"), ("ʉ", "u"), ("ʍ", "w"),
                 ("n̩", "ən"), ("l̩", "əl"), ("m̩", "əm"), ("‿", " "), ("-", " ")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).replace(".", "")
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
    # iə) and not word-final i ("happy", hæpi).
    s = re.sub(r"i(?![ːaeiouæɑɒɔəɛɜɚɪʊʌ]|$|\s)", "iː", s)
    s = re.sub(r"u(?![ːaeiouæɑɒɔəɛɜɚɪʊʌ])", "uː", s)
    s = re.sub(r"ɑ(?![ːɪ])", "ɑː", s)
    s = re.sub(r"ɔ(?![ːɪ])", "ɔː", s)
    s = s.replace("ɜɹ", "ɜː")
    # Every word needs a primary stress ("shelf" is ʃˈɛlf, not ʃɛlf): promote a
    # secondary one, or stress the first vowel; not the little words of a
    # phrase. A stressed schwa is the full vowel ʌ ("affront", əfɹˈʌnt).
    toks = "".join(c for c in s if c in vocab).split()
    names = [x.lower() for x in words] if words and len(words) == len(toks) else [""] * len(toks)
    out_words = []
    for tok, name in zip(toks, names):
        if name in UNSTRESSED:
            out_words.append(tok.replace("ˈ", "").replace("ˌ", ""))
            continue
        tok = tok.replace("ˈə", "ˈʌ").replace("ˌə", "ˌʌ")
        if "ˈ" not in tok:
            if "ˌ" in tok:
                tok = tok.replace("ˌ", "ˈ", 1)
            else:
                m = re.search(f"[{''.join(VOWELS)}]", tok)
                tok = tok[:m.start()] + "ˈ" + tok[m.start():] if m else tok
        out_words.append(tok)
    return " ".join(out_words)


COMMON = 3.0              # wordfreq Zipf: every word of the entry at least this common


def plan(w: dict, tokenizer) -> tuple[str, str]:
    """(phonemes, source). Kokoro reads common words and everyday phrases well
    (and phrases with natural rhythm), so they are read as text; a rare or
    subject word is spoken from the entry's reviewed IPA, where Kokoro's guess
    goes wrong (Melchizedek, hypostasis). Sentences are always read as text."""
    from wordfreq import zipf_frequency
    ipa = w.get("phonetic") or ""
    tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
    rare = min((zipf_frequency(x, "en") for x in tokens), default=0) < COMMON
    rare = rare or bool(w.get("name_kind")) or w["word"][:1].isupper()   # names: "Ira" isn't the IRA
    if ipa and rare and not re.search(r"[?!.,]", w["word"]) and len(tokens) <= 4:
        ph = to_phonemes(ipa, tokenizer.vocab, tokens)
        if ph:
            return ph, "ipa"
    return tokenizer.phonemize(w["word"]), "text"


def encode(audio, sr: int, dst: Path) -> None:
    import numpy as np
    import soundfile as sf
    lead = np.zeros(int(sr * 0.08), dtype=audio.dtype)   # a breath of silence, so no browser clips the start
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        sf.write(tmp.name, np.concatenate([lead, audio, lead]), sr)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-ac", "1", "-c:a", "aac",
                        "-b:a", "48k", str(dst)], check=True)


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
        if force or not done or done.get("phonemes") != ph or not (DATA / done["file"]).exists():
            todo.append((w, ph, source))
    print(f"{len(todo):,} to generate", flush=True)
    t0 = time.time()
    for n, (w, ph, source) in enumerate(todo, start=1):
        dst = OUT_DIR / f"{slug(w['key'])}.m4a"
        audio, sr = kokoro.create(ph, voice=VOICE, speed=SPEED, is_phonemes=True)
        encode(audio, sr, dst)
        m[w["key"]] = {"file": f"tts/{dst.name}", "phonemes": ph, "source": source, "voice": VOICE,
                       "seconds": round(len(audio) / sr, 2)}
        if n % 200 == 0 or n == len(todo):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(todo):,} · {rate:.1f}/s · about {(len(todo) - n) / rate / 60:.0f} min left", flush=True)
    save_manifest(m)
    return 0


def audio16k(path: Path):
    """Mono 16 kHz samples for Whisper, decoded with ffmpeg."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def similar(a: str, b: str) -> float:
    """Similarity of what Whisper heard to the word (letters only, 0–1)."""
    from difflib import SequenceMatcher
    norm = lambda s: re.sub(r"[^a-z]", "", s.lower())
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
        segs, _ = model.transcribe(audio16k(DATA / m[k]["file"]), language="en", beam_size=1,
                                   initial_prompt="A single English word or phrase.")
        heard = " ".join(s.text for s in segs).strip()
        m[k]["heard"] = heard
        m[k]["match"] = round(similar(heard, words[k]["word"]), 2)
        if n % 200 == 0 or n == len(keys):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(keys):,} · {rate:.1f}/s", flush=True)
    save_manifest(m)
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    if cmd == "generate":
        return generate(only, force="--force" in sys.argv)
    if cmd == "verify":
        return verify(only)
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main())
