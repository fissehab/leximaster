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


def promote(tok: str, reading: str = "") -> str:
    """Make one secondary stress of a word primary: the one on the syllable
    Kokoro's own reading of the word stresses ("transcendental" is
    tɹˌænsɛndˈɛntəl, not TRANS-cendental), else the first (sigmoid, necktie)."""
    if "ˈ" in reading:
        at = syllables(reading[:reading.index("ˈ")].replace("ɐ", "ə"))
        for m in re.finditer("ˌ", tok):
            if syllables(tok[:m.start()].replace("ɐ", "ə")) == at:
                return tok[:m.start()] + "ˈ" + tok[m.start() + 1:]
    return tok.replace("ˌ", "ˈ", 1)


def to_phonemes(ipa: str, vocab: dict, words: list[str] | None = None, flap: bool = True,
                reading: str = "") -> str:
    """The entry's General American IPA in the notation Kokoro was trained on:
    stress marks just before the stressed vowel (not at the syllable start),
    ɹ for r, ɜɹ for ɝ, no syllable dots, brackets or diacritics, the American
    flap for t between vowels before an unstressed one, and a final "." so the
    word ends as a statement. flap=False keeps every t (NO_FLAP). `reading`:
    Kokoro's own reading of the text, which picks the primary stress of a
    word the IPA gives only secondary stresses ("ˌtɹænsɛnˌdɛntəl")."""
    s = clean_ipa(ipa)
    s = re.sub(r"k\(?ə\)?lli\b", "kli", s)          # "-ically" written /ɪkəlli/ is "-ick-lee", not "-ick-uh-lee"
    s = re.sub(r"\(([^)]*)\)", r"\1", s)             # "(ɹ)": the American r is said
    for a, b in (("ɝ", "ɜɹ"), ("r", "ɹ"), ("ɫ", "l"), ("g", "ɡ"), ("'", "ˈ"), ("ʉ", "u"), ("ʍ", "w"),
                 ("n̩", "ən"), ("l̩", "əl"), ("m̩", "əm"), ("‿", " "), ("-", " ")):
        s = s.replace(a, b)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c)).replace(".", "")
    s = s.replace("ɚɚ", "ɚɹɚ")   # "devourer" dɪvˈaʊɚɚ: Kokoro says ɚɚ as one ɚ ("devour")
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
    said = [t for t in re.sub(r"[.,!?;:]", " ", reading).split()]
    said = said if len(said) == len(toks) else [""] * len(toks)
    out_words = []
    for tok, name, own in zip(toks, names, said):
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
                tok = promote(tok, own)
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
# both judges heard it better in two runs; a second, wider pass the same way
# the same day ("unmitigated" heard as "un-Marigated"). Elsewhere the flap stays
# (2,254 of 2,347).
NO_FLAP = {
    "ad infinitum", "Ahitub", "amativeness", "anathematization", "apocatastasis", "Artaxerxes",
    "asyndetically", "auditability", "authenticator", "beta-test", "Botany Bay dozen", "BTW", "catechist",
    "chronotope", "comforter", "coruscating", "crepitus", "dedicator", "delineator", "disunity", "dubitable",
    "editorship", "embitterment", "emulative", "endogeneity", "epitomist", "Etam", "etiological",
    "etiologist", "ETL", "Eupator", "expropriator", "habitability", "habitus", "hamartiology", "heartening",
    "hypostatization", "iconolater", "ill at ease", "incorrigibility", "infinitist", "innatism", "involutory",
    "irresistibility", "iterable", "Jezreelitess", "kittle", "lentitude", "maieutic", "martinetism", "meta",
    "mitigated", "mitotically", "mouthwatering", "nepotist", "nubility", "nugatoriness", "palatinate",
    "pertinence", "Platonist", "plebiscitary", "potability", "pseudonymity", "rewriter", "salutariness",
    "sanative", "sanguinity", "saturninity", "schematization", "seltzer water", "sfumato", "stridulatory",
    "submittal", "substitutability", "substitutable", "substitutive", "take out of context", "tautologize",
    "tentativeness", "the writing on the wall", "titillate", "tumidity", "turtledove", "uberty", "unedited",
    "unmitigated", "unwitting", "validator", "vitalist", "vitiator", "vomitus", "witting", "wittol"
}


# Words and phrases Kokoro misreads from the spelling although they are
# common: spoken from the entry's IPA. Each was chosen by `retry`, whose
# IPA take passed the check where the text take failed, then checked by hand
# (2026-11-16: their phonemes against the IPA and the respelling).
FROM_IPA: set[str] = {
    "community garden", "e-ticket", "home away from home", "how-to", "on-off",
    "reel off", "so that", "sous-chef", "such-and-such", "writing on the wall",
}


# Pronunciations written by hand, checked against the entry's meaning and its
# respelling, where neither Kokoro's reading nor the entry's IPA is right: IPA
# that leaves part of the entry out ("F1 score" /ˌɛf ˈskɔɹ/), names written as
# their letters ("Meshach" /ˈmɛʃˌeɪˌsiˌeɪtʃ/), initialisms read as words ("DWI",
# "MCMC"), and words Kokoro guesses wrong from the spelling ("refill", "seer").
# Found 2026-10-29 comparing every text reading with the IPA, every recording's
# syllables with its respelling, and every recording Whisper base.en and
# small.en both heard badly with its respelling ("heroic couplet" said
# "heroic KOOL-et", "quester" said "KYOOZ-ter").
SAY = {
    "A* search": "ˈeɪ stˈɑːɹ sˈɜːtʃ.", "acetylate": "əsˈɛtəlˌeɪt.", "Achish": "ˈeɪkɪʃ.",
    "adamance": "ˈædəməns.", "apodeictic": "ˌæpədˈaɪktɪk.", "apodeictically": "ˌæpədˈaɪktɪkli.",
    "archiepiscopal": "ˌɑːɹkiːɪpˈɪskəpəl.", "arete": "ˌæɹətˈeɪ.", "avant-garde": "ˌɑːvɑːntɡˈɑːɹd.",
    "counterfactual conditional": "kˌaʊntɚfˈæktʃuːəl kəndˈɪʃənəl.", "deontic logic": "diːˈɑːntɪk lˈɑːdʒɪk.",
    "infinitesimal calculus": "ˌɪnfɪnɪtˈɛsɪməl kˈælkjələs.", "intercession of the saints": "ˌɪntɚsˈɛʃən əv ðə sˈeɪnts.",
    "paraconsistent logic": "pˌɛɹəkənsˈɪstənt lˈɑːdʒɪk.",
    "Ca": "sˌiːˈeɪ.", "camo": "kˈæmoʊ.", "catechetic": "kˌætəkˈɛtɪk.", "chemic": "kˈɛmɪk.", "cussed": "kˈʌsɪd.",
    "dequeue": "dˌiːkjˈuː.", "Diophantine": "dˌaɪəfˈæntaɪn.", "DWI": "dˌiːdˌʌbəljuːˈaɪ.", "effaceable": "ɪfˈeɪsəbəl.",
    "F1 score": "ˌɛf wˈʌn skˈɔːɹ.", "feuilletonist": "fɔɪtˈɑːnɪst.", "gemütlich": "ɡəmˈuːtlɪk.",
    "gestator": "dʒˈɛsteɪtɚ.", "Gilles de la Tourette syndrome": "ʒˈiːl də lɑː tʊɹˈɛt sˈɪndɹoʊm.",
    "haughtily": "hˈɔːtɪli.", "haut monde": "ˌoʊ mˈɑːnd.", "heroic couplet": "hɪɹˈoʊɪk kˈʌplɪt.",
    "hypochondriasis": "hˌaɪpoʊkɑːndɹˈaɪəsɪs.", "in fine": "ɪn fˈiːneɪ.", "ineradicable": "ˌɪnɪɹˈædɪkəbəl.",
    "maimer": "mˈeɪmɚ.", "MCMC": "ˌɛmsiːˌɛmsˈiː.", "Meshach": "mˈiːʃæk.", "overture": "ˈoʊvɚtʃɚ.",
    "Pascha": "pˈɑːskə.", "pentagon": "pˈɛntəɡˌɑːn.", "per diem": "pɚ dˈiːəm.",
    "proletarianize": "pɹˌoʊlətˈɛɹiənaɪz.", "quester": "kwˈɛstɚ.", "refill": "ɹˈiːfɪl.", "rehab": "ɹˈiːhæb.",
    "reranker": "ɹiːɹˈæŋkɚ.", "ressentiment": "ɹəsˌɑːntiːmˈɑːn.", "ruach": "ɹˈuːɑːk.",
    "rubicundity": "ɹˌuːbɪkˈʌndɪti.", "seba": "sˈiːbə.", "seer": "sˈɪɹ.", "Sethite": "sˈɛθaɪt.",
    "Sirach": "sˈaɪɹæk.", "to the nth degree": "tə ðɪ ˈɛnθ dɪɡɹˈiː.", "uncoated": "ʌnkˈoʊtɪd.",
    "vasodilator": "vˌeɪzoʊdaɪlˈeɪtɚ.",
    "be-all and end-all": "bˈiː ˈɔːl ən ˈɛnd ˈɔːl.",   # Kokoro's own: "and" in full, "end alls"
    "It sold out in minutes.": "ˈɪt sˈoʊld ˈaʊt ɪn mˈɪnəts.",   # Kokoro's own reading was heard "sold-out"
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
    if w["word"] in SAY:
        return SAY[w["word"]], "said"
    ipa = w.get("phonetic") or ""
    if ipa and bad_ipa(w["word"], ipa):
        ipa = ""
    tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
    if ipa and w.get("prons"):
        # Said more than one way (seeds/heteronyms.txt): read as text, Kokoro
        # picks one of them; spoken from the IPA, it says the one meant.
        return to_phonemes(ipa, tokenizer.vocab, tokens, w["word"] not in NO_FLAP), "ipa"
    rare = min((zipf_frequency(x, "en") for x in tokens), default=0) < COMMON
    rare = rare or bool(w.get("name_kind")) or w["word"][:1].isupper()   # names: "Ira" isn't the IRA
    sentence = bool(re.search(r"[?!.,]", w["word"]))
    flap = w["word"] not in NO_FLAP
    text = " ".join(NUMERALS.get(x, x) for x in w["word"].split())
    ph = tokenizer.phonemize(text)
    ipa_ph = to_phonemes(ipa, tokenizer.vocab, tokens, flap, ph) if ipa and not sentence and len(tokens) <= 4 else ""
    if ipa_ph and (rare or w["word"] in FROM_IPA):
        return ipa_ph, "ipa"
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


def doubtful(w: dict, ph: str, source: str, tokenizer) -> bool:
    """Spoken from IPA no dictionary or reviewer gave (built by rule from CMU,
    or espeak's), and Kokoro's own reading of the word says something else:
    worth a look before anyone hears it. Reported, not changed."""
    if source != "ipa" or w.get("phonetic_source") not in ("cmu", "espeak"):
        return False
    tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
    return differs(tokenizer.phonemize(w["word"]), ph, tokens)


# af_heart ends a final /v/ or /f/ with a hiss Whisper (and a learner)
# hears as an added s: "love" as "loves", "behoove" as "behooves". af_bella
# says them cleanly (audio audit 2026-11-16).
END_VF = re.compile(r"[vf][.!?]?$")
VF_VOICE = "af_bella"
PAUSE = 0.2   # seconds of silence at a comma ("faith, hope, and love")


def voice_for(ph: str) -> str:
    return VF_VOICE if END_VF.search(ph) else VOICE


def synth(kokoro, ph: str, voice: str, speed: float):
    """Kokoro's audio for these phonemes. Kokoro makes no pause at a comma
    in phoneme input, so each part is spoken alone and the parts are joined
    with a short silence."""
    import numpy as np
    parts = [p.strip() for p in re.split(r"(?<=,)\s+", ph) if p.strip()]
    if len(parts) == 1:
        return kokoro.create(ph, voice=voice, speed=speed, is_phonemes=True)
    out, sr = [], 24000
    for i, p in enumerate(parts):
        audio, sr = kokoro.create(p, voice=voice, speed=speed, is_phonemes=True)
        if i:
            out.append(np.zeros(int(sr * PAUSE), dtype=audio.dtype))
        out.append(audio)
    return np.concatenate(out), sr


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
    """Entries without an American recording, and each sound of a word said
    more than one way (seeds/heteronyms.txt) that has none, as its own
    target "<key>~<n>" spoken from that sound's IPA."""
    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))["words"]
    out = [w for w in words if not w.get("has_audio")]
    for w in words:
        for n, p in enumerate(w.get("prons") or []):
            if n and not p.get("audio"):   # the first sound is the entry's own recording
                out.append({"key": f"{w['key']}~{n}", "word": w["word"], "phonetic": p["ipa"],
                            "prons": True, "has_audio": False})
    return [w for w in out if not only or w["key"] in only or w["key"].split("~")[0] in only]


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
                or not re.search(r"\.[0-9a-f]{8}\.m4a$", done["file"])     # from before names had hashes
                or (not done.get("retried") and done.get("voice", VOICE) != voice_for(ph))):
            todo.append((w, ph, source))
    print(f"{len(todo):,} to generate", flush=True)
    doubt = [w["word"] for w, ph, source in todo if doubtful(w, ph, source, kokoro.tokenizer)]
    if doubt:
        print(f"{len(doubt):,} spoken from rule-made IPA that Kokoro reads otherwise (check them): "
              + ", ".join(doubt[:40]), flush=True)
    t0 = time.time()
    for n, (w, ph, source) in enumerate(todo, start=1):
        # A voice an earlier retry chose (it says this word's sounds most clearly) is kept.
        old = m.get(w["key"]) or {}
        voice, speed = (old.get("voice", VOICE), old.get("speed", SPEED)) if old.get("retried") \
            else (voice_for(ph), SPEED)
        audio, sr = synth(kokoro, ph, voice, speed)
        dst = write_hashed(audio, sr, slug(w["key"]))
        if old and old.get("file") != f"tts/{dst.name}":
            (DATA / old["file"]).unlink(missing_ok=True)      # the replaced recording
        m[w["key"]] = {"file": f"tts/{dst.name}", "phonemes": ph, "source": source, "voice": voice,
                       "seconds": round(len(audio) / sr, 2)}
        if speed != SPEED:
            m[w["key"]]["speed"] = speed
        if old.get("retried"):
            m[w["key"]]["retried"] = True
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


# A headword heard as more words at a prefix is fine ("non-public", "re-enter").
SPLIT_OK = ("non", "un", "re", "pre", "anti", "multi", "over", "under", "out", "self", "co", "post", "sub")


def split_headword(word: str, heard: str) -> bool:
    """Whisper heard the right letters cut into more words than the headword
    has: "Red-Action Criticism" for "redaction criticism", "laugh ably" for
    "laughably", the mark of a word read as two. Reported, never failed:
    Whisper also writes some real compounds apart ("Lock up")."""
    said = [x for x in re.split(r"[\s\-]+", re.sub(r"[^\w\s\-']", "", spell_numbers(heard).lower())) if x]
    own = [x for x in re.split(r"[\s\-]+", word.lower()) if x]
    while said and said[0] in ("a", "an", "the") and len(said) > len(own):
        said = said[1:]
    if len(said) <= len(own) or similar(" ".join(said), word) < 0.8:
        return False
    i = 0
    for w_ in own:                # the heard words that spell this headword word
        j, run = i, ""
        while j < len(said) and len(run) < len(w_) - 1:
            run += said[j]
            j += 1
        if j - i > 1 and similar(run, w_) >= 0.8 and said[i] not in SPLIT_OK:
            return True
        i = j
    return False


def is_rare(w: dict) -> bool:
    """A rare word or a name: Whisper often writes it as something else even
    when the recording is right, so only a clear fault fails it."""
    from wordfreq import zipf_frequency
    tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
    return (min((zipf_frequency(x, "en") for x in tokens), default=0) < COMMON
            or bool(w.get("name_kind")) or w["word"][:1].isupper())


DIPHTHONGS = (("aɪ", "A"), ("eɪ", "E"), ("oʊ", "O"), ("aʊ", "W"), ("ɔɪ", "Y"))


def _flat(ph: str) -> str:
    """Phonemes for comparing what was heard: strip_stress, each diphthong
    one letter (so it stays one syllable), no spaces or punctuation."""
    for a, b in DIPHTHONGS:
        ph = ph.replace(a, b)
    return re.sub(r"[\W_]", "", strip_stress(ph))


def _syl(flat: str) -> int:
    return len(re.findall(r"[aeiouæɑɒɔəɛɜɚɪʊʌᵻᵊAEOWY]", flat))


def flags(word: str, ph: str, heard: str, tokenizer) -> dict:
    """What a transcript says is wrong with a recording of `word` spoken as
    `ph`: "plural", a word heard with an s it doesn't have ("love" as
    "loves", the hiss of a final v); "syllables", how many more (or fewer)
    syllables were heard; "distance", how far the heard words sound from the
    word. The heard words are compared with both the entry's phonemes and
    Kokoro's reading of the word, so a word written differently but heard as
    itself ("Back pressure") is no fault."""
    if similar(heard, word) == 1.0:
        return {}
    # Whisper puts an article before a lone word ("A bland."): not said.
    if not re.match(r"(?:a|an|the)\b", word, re.I):
        heard = re.sub(r"^\s*(?:a|an|the)\b\s*", "", heard, flags=re.I)
        if not heard or similar(heard, word) == 1.0:
            return {}
    out = {}
    said = re.findall(r"[a-z']+", spell_numbers(heard).lower())
    own = re.findall(r"[a-z']+", word.lower())
    for h in said:
        for i, o in enumerate(own):
            if h not in own and h in (o + "s", o + "es", o + "'s"):
                if i == len(own) - 1 and re.search(r"[sz][.!?]?$", ph.strip()):
                    continue       # the word itself ends in s or z
                out["plural"] = h
    heard_ph = _flat(tokenizer.phonemize(spell_numbers(heard)))
    mine, read = _flat(ph), _flat(tokenizer.phonemize(word))
    n = _syl(heard_ph)
    if n != _syl(mine) and n != _syl(read):
        out["syllables"] = n - _syl(mine)
    d = min(distance(mine, heard_ph), distance(read, heard_ph))
    if d > 0.35:
        out["distance"] = round(d, 2)
    return out


def failures(base: dict, small: dict, rare: bool, small_match: float) -> list[str]:
    """A fault counts only when a second, larger model (small.en) hears the
    same one: the same added s, syllables missing or added the same way, or
    (for a common word) a word far from it. A rare word or a name never fails
    on distance alone."""
    out = []
    if base.get("plural") and small.get("plural"):
        out.append("plural")
    if base.get("syllables") and small.get("syllables") and (base["syllables"] > 0) == (small["syllables"] > 0):
        out.append("syllables")
    if not rare and base.get("distance") and small.get("distance") and small_match < 0.8:
        out.append("distance")
    return out


def _whisper(name: str):
    from faster_whisper import WhisperModel
    return WhisperModel(name, device="cpu", compute_type="int8")


def hear(model, audio16, beam: int = 1) -> str:
    segs, _ = model.transcribe(audio16, language="en", beam_size=beam, temperature=0)
    return " ".join(s.text for s in segs).strip()


def judge(w: dict, ph: str, audio16, base_model, small_model, tokenizer, heard: str | None = None) -> dict:
    """The check of one recording: base.en's transcript, its flags, and,
    when flagged, small.en's transcript and the faults both agree on."""
    heard = heard if heard is not None else hear(base_model, audio16)
    out = {"heard": heard, "match": round(similar(heard, w["word"]), 2)}
    f = flags(w["word"], ph, heard, tokenizer)
    if f:
        out["flags"] = f
        small = hear(small_model, audio16, beam=5)
        out["heard_small"] = small
        fail = failures(f, flags(w["word"], ph, small, tokenizer), is_rare(w), similar(small, w["word"]))
        if fail:
            out["fail"] = fail
    return out


def verify(only: set[str] | None = None) -> int:
    """Check every recording (only the ones not checked yet): Whisper base.en
    transcribes it; when that sounds wrong (flags()), small.en listens too,
    and a fault both hear fails the recording (failures()). `retry` then
    speaks the failed ones again."""
    from kokoro_onnx.tokenizer import Tokenizer
    tokenizer = Tokenizer()
    base, small = _whisper("base.en"), None
    m = load_manifest()
    words = {w["key"]: w for w in targets(only)}
    keys = [k for k in m if k in words and "checked" not in m[k]]
    print(f"{len(keys):,} to check", flush=True)
    t0 = time.time()
    for n, k in enumerate(keys, start=1):
        e = m[k]
        heard = e.get("heard")
        audio = None
        if heard is None:
            audio = audio16k(DATA / e["file"])
            heard = hear(base, audio)
        if flags(words[k]["word"], e["phonemes"], heard, tokenizer):
            small = small or _whisper("small.en")
            audio = audio if audio is not None else audio16k(DATA / e["file"])
            res = judge(words[k], e["phonemes"], audio, base, small, tokenizer, heard)
        else:
            res = {"heard": heard, "match": round(similar(heard, words[k]["word"]), 2)}
        for f in ("flags", "heard_small", "fail", "split"):
            e.pop(f, None)
        e.update(res)
        if split_headword(words[k]["word"], heard):
            e["split"] = True
        e["checked"] = 2
        if n % 200 == 0 or n == len(keys):
            save_manifest(m)
            rate = n / (time.time() - t0)
            print(f"  {n:,}/{len(keys):,} · {rate:.1f}/s", flush=True)
    save_manifest(m)
    done = [k for k in m if k in words and m[k].get("checked")]
    flagged = [k for k in done if m[k].get("flags")]
    failed = sorted(k for k in done if m[k].get("fail"))
    print(f"{len(done):,} checked: {len(flagged):,} flagged by base.en, {len(failed):,} failed "
          f"({len(failed) / max(len(done), 1):.1%})", flush=True)
    for k in failed[:60]:
        print(f"  {words[k]['word']} → {m[k]['heard']} / {m[k]['heard_small']}  {m[k]['fail']}", flush=True)
    return 0


# Tried in turn for a recording that failed the check: Kokoro's next
# best-rated American voices, and the first voice a little slower.
RETRY = [("af_bella", SPEED), ("am_michael", SPEED), (VOICE, 0.8)]
TRUSTED = ("reviewed", "manual")   # IPA a reviewer gave or checked


def retry(only: set[str] | None = None) -> int:
    """Speak each failed recording (or each of `only`) again: other voices,
    and, for one read from the text, the entry's reviewed IPA. The first take
    that passes the check replaces it; a word none passes is listed for a
    look by ear. Takes from the IPA are listed for FROM_IPA, which plan()
    reads, so a later `generate` keeps them."""
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(str(MODEL), str(VOICES))
    tok = kokoro.tokenizer
    base, small = _whisper("base.en"), _whisper("small.en")
    m = load_manifest()
    words = {w["key"]: w for w in targets(only)}
    keys = [k for k in m if k in words and (only or m[k].get("fail"))]
    print(f"{len(keys):,} to retry", flush=True)
    fixed, from_ipa, stuck = 0, [], []
    for n, k in enumerate(keys, start=1):
        w, e = words[k], m[k]
        takes = [(voice, speed, e["phonemes"], e["source"]) for voice, speed in RETRY
                 if (voice, speed) != (e.get("voice", VOICE), e.get("speed", SPEED))]
        tokens = [x for x in re.split(r"[\s-]+", re.sub(r"[?!.,;:]", "", w["word"])) if x]
        # Only where plan() can keep it (FROM_IPA): not for a sentence or a long phrase.
        if e["source"] == "text" and w.get("phonetic") and w.get("phonetic_source") in TRUSTED \
                and not bad_ipa(w["word"], w["phonetic"]) and not re.search(r"[?!.,]", w["word"]) \
                and len(tokens) <= 4:
            ipa_ph = to_phonemes(w["phonetic"], tok.vocab, tokens, w["word"] not in NO_FLAP, tok.phonemize(w["word"]))
            if ipa_ph and ipa_ph != e["phonemes"]:
                takes.insert(0, (voice_for(ipa_ph), SPEED, ipa_ph, "ipa"))
        for voice, speed, ph, source in takes:
            audio, sr = synth(kokoro, ph, voice, speed)
            res = judge(w, ph, resample16k(audio, sr), base, small, tok)
            if res.get("fail"):
                continue
            dst = write_hashed(audio, sr, slug(k))
            if e["file"] != f"tts/{dst.name}":
                (DATA / e["file"]).unlink(missing_ok=True)
            m[k] = {"file": f"tts/{dst.name}", "phonemes": ph, "source": source, "voice": voice,
                    "speed": speed, "seconds": round(len(audio) / sr, 2), **res, "checked": 2, "retried": True}
            fixed += 1
            if source != e["source"]:
                from_ipa.append(w["word"])
            break
        else:
            m[k]["retried"] = True
            stuck.append(k)
        if n % 25 == 0 or n == len(keys):
            save_manifest(m)
            print(f"  {n:,}/{len(keys):,} · {fixed:,} fixed", flush=True)
    save_manifest(m)
    if from_ipa:
        print(f"{len(from_ipa):,} now spoken from the IPA (hear them, then add to FROM_IPA): "
              + json.dumps(sorted(from_ipa), ensure_ascii=False), flush=True)
    if stuck:
        print(f"{len(stuck):,} no take passed (check by ear): "
              + ", ".join(f"{words[k]['word']} → {m[k].get('heard_small') or m[k].get('heard')}" for k in stuck), flush=True)
    return 0


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    if cmd == "generate":
        return generate(only, force="--force" in sys.argv)
    if cmd == "verify":
        return verify(only)
    if cmd == "retry":
        return retry(only)
    sys.exit(__doc__)


if __name__ == "__main__":
    sys.exit(main())
