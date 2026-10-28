// A word's sounds, read from its IPA (the `phonetic` field), for "How to say
// it": one token per sound the learner can tap, each with the mouth position
// (pose) it uses, a plain label ("th", as in "think") and its place in the
// original IPA. General American broad transcription; small differences in the
// dictionary's spelling of the same sound (ɝ ɚ əɹ ɜɹ, ɾ, ɫ, optional sounds)
// come out as one sound.

// Spelling first, then a key word; vowels and r-colored vowels by key word.
export const LABELS = {
  p: ["p", "pen"], b: ["b", "big"], t: ["t", "ten"], d: ["d", "dog"], k: ["k", "key"], ɡ: ["g", "go"],
  f: ["f", "fish"], v: ["v", "very"], θ: ["th", "think"], ð: ["th", "this"], s: ["s", "sun"], z: ["z", "zoo"],
  ʃ: ["sh", "ship"], ʒ: ["zh", "vision"], h: ["h", "hat"], tʃ: ["ch", "chair"], dʒ: ["j", "jump"],
  m: ["m", "man"], n: ["n", "no"], ŋ: ["ng", "ring"], l: ["l", "light"], ɫ: ["l", "ball"], ɹ: ["r", "red"],
  w: ["w", "wet"], j: ["y", "yes"],
  i: ["ee", "see"], ɪ: ["short i", "sit"], ɛ: ["e", "bed"], æ: ["short a", "hat"], ɑ: ["o", "hot"],
  ɔ: ["aw", "law"], ʊ: ["short oo", "book"], u: ["oo", "blue"], ʌ: ["short u", "cup"], ə: ["uh", "about"],
  ɚ: ["er", "bird"], eɪ: ["ay", "day"], aɪ: ["long i", "time"], ɔɪ: ["oy", "boy"], oʊ: ["long o", "go"],
  aʊ: ["ow", "now"],
};

// The sounds learners find hardest, hardest first: the one a word's panel
// opens on. A word with none of these opens on its stressed vowel.
export const HARDEST = ["θ", "ð", "ɹ", "ɚ", "v", "w", "l", "ɫ", "æ", "ɪ", "ʌ", "ʊ", "ʃ", "ŋ", "z", "f", "p"];
// Sounds with a gold dot and a card on the Sounds page.
export const PRIORITY = new Set(["θ", "ð", "ɹ", "ɚ", "l", "ɫ", "v", "w", "f", "p", "ʃ", "ŋ", "z", "ɪ", "æ", "ʌ", "ʊ"]);

// Two-symbol sounds first (longest match); a diphthong is one tap but two
// mouth positions.
const MULTI = ["tʃ", "dʒ", "eɪ", "aɪ", "ɔɪ", "oʊ", "aʊ", "ɜɹ", "əɹ"];
const SINGLE = new Set([..."pbtdkɡfvθðszʃʒhmnŋlɹwjiɪɛæɑɔʊuʌəɚ"]);
const ALIAS = { "ɝ": "ɚ", "ɜɹ": "ɚ", "əɹ": "ɚ", "ɾ": "d", "ʍ": "w", "g": "ɡ", "o": "oʊ", "e": "eɪ", "a": "ɑ",
                "ʌɪ": "aɪ", "ɐ": "ʌ", "ɒ": "ɑ", "ɜ": "ɚ", "r": "ɹ", "c": "k", "y": "i", "ɨ": "ɪ", "ᵻ": "ɪ" };
const VOWELS = new Set(["i", "ɪ", "ɛ", "æ", "ɑ", "ɔ", "ʊ", "u", "ʌ", "ə", "ɚ", "eɪ", "aɪ", "ɔɪ", "oʊ", "aʊ"]);
const SKIP = new Set([..."/ˈˌ.‿-[]>ʰ̬̟̪̰̥̃̚ʲ"]);
export const isVowel = s => VOWELS.has(s);

/**
 * Tokens of an IPA string: [{ sym, ipa, stress, gap }]. `sym` is the sound
 * (a key of LABELS), `ipa` the text it came from, `stress` 1 or 2 on a
 * stressed vowel, `gap` true for the space between two words. Returns null
 * when the IPA can't be read (dictionary respellings, other alphabets).
 */
export function tokenize(ipa) {
  if (!ipa) return null;
  let s = ipa.normalize("NFC").replace(/^[\s/[]+|[\s/\]]+$/g, "").split(/[;,]|\]|\[/)[0];
  s = s.replace(/\(([^)]*)\)/g, "").replace(/iŋ/g, "ɪŋ").replace(/oɪ/g, "ɔɪ").replace(/ʌɪ/g, "aɪ");
  const out = [];
  let stress = 0;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "ˈ") { stress = 1; i++; continue; }
    if (c === "ˌ") { stress = stress || 2; i++; continue; }
    if (c === " ") { if (out.length && !out[out.length - 1].gap) out.push({ sym: "rest", ipa: " ", gap: true }); i++; continue; }
    if (SKIP.has(c)) { i++; continue; }
    const two = s.slice(i, i + 2);
    let sym = null, len = 1;
    const rVowel = (two === "əɹ" || two === "ɜɹ") && /[iɪɛæɑɔʊuʌəaeoɚɝ]/.test(s[i + 2] || "");   // ə + r of "around"
    if ((MULTI.includes(two) || ALIAS[two]) && !rVowel) { sym = ALIAS[two] || two; len = 2; }
    else if (SINGLE.has(c)) sym = c;
    else if (ALIAS[c]) sym = ALIAS[c];
    else if (/[xçʔ]/.test(c)) { i++; continue; }      // no position of its own: the last one holds
    else if (/[a-zA-ZĀ-ɏЀ-ӿᴀ-ᶿ]/.test(c)) return null;   // respelling, Cyrillic
    else { i++; continue; }
    const syllabic = s[i + len] === "̩";
    const tok = { sym, ipa: s.slice(i, i + len + (syllabic ? 1 : 0)) };
    if (VOWELS.has(sym) || syllabic) { if (stress) tok.stress = stress; stress = 0; }
    if (syllabic) tok.syllabic = true;
    out.push(tok);
    i += len + (syllabic ? 1 : 0);
  }
  while (out.length && out[out.length - 1].gap) out.pop();
  // l at the end of a word, before a consonant or syllabic: the dark l of "ball".
  out.forEach((t, k) => {
    if (t.sym !== "l") return;
    const next = out[k + 1];
    if (t.syllabic || !next || next.gap || !(VOWELS.has(next.sym) || next.sym === "j")) t.sym = "ɫ";
  });
  return out.length ? out : null;
}

/** The token a word's panel opens on: its hardest sound, else its stressed vowel. */
export function hardestIndex(tokens) {
  for (const sym of HARDEST) {
    const k = tokens.findIndex(t => t.sym === sym);
    if (k >= 0) return k;
  }
  const k = tokens.findIndex(t => t.stress === 1);
  return k >= 0 ? k : Math.max(0, tokens.findIndex(t => VOWELS.has(t.sym)));
}

export const label = sym => (LABELS[sym] || [sym, ""])[0];
export const keyWord = sym => (LABELS[sym] || ["", ""])[1];
