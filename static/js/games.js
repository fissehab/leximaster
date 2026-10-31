// What the practice games share (Word Shooter, Word Rush, Type It): points,
// speed, lanes, the Rush deck, endless refills, typed answers, best and top
// scores, saved choices and sound effects.
// No DOM at import time, so node can test it (tests/js/games.test.mjs).

// ---------------------------------------------------------------- points

export const PERFECT_BONUS = 500;      // every word in the round hit
export const HEART_BACK_EVERY = 5;     // first-try hits in a row that win a heart back

/** ×1–×4 for first-try hits in a row (this one included). */
export function comboFor(streak) {
  return streak >= 10 ? 4 : streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
}

/** 100 a word, up to 50 more for time left on the clock, times the combo.
 * No clock (Calm, Rush): no time bonus. */
export function points({ streak, left = 0, fall = Infinity }) {
  const bonus = isFinite(fall) ? Math.round(50 * Math.min(Math.max(left, 0), fall) / fall) : 0;
  return Math.round((100 + bonus) * comboFor(streak));
}

// ---------------------------------------------------------------- speed

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Seconds to read a clue: more words, more time (6 to 16). */
export function readTime(clue) {
  const words = String(clue || "").split(/\s+/).filter(Boolean).length;
  return clamp(4.5 + 0.45 * words, 6, 16);
}

// Levels 1–5: each a little faster. A round starts at the chosen speed and
// moves one level up after every third hit in a row, one down after a miss.
export const SPEED_FACTORS = [1.25, 1.0, 0.85, 0.72, 0.62];
export const START_LEVEL = { slow: 1, normal: 2, fast: 3 };   // Calm: no clock

/** Milliseconds a word takes to fall at this level. */
export function fallTime(clue, level) {
  return readTime(clue) * SPEED_FACTORS[clamp(level, 1, 5) - 1] * 1000;
}

export function nextLevel(level, { hit, streak = 0 }) {
  if (!hit) return Math.max(1, level - 1);
  return streak > 0 && streak % 3 === 0 ? Math.min(5, level + 1) : level;
}

// ---------------------------------------------------------------- words on screen

/** The options that fit `count` lanes: the answer always stays, and the
 * server's order (already shuffled) is kept. */
export function pickLanes(options, answer, count, rng = Math.random) {
  const keep = [...options];
  while (keep.length > count) {
    const others = keep.map((o, i) => i).filter(i => keep[i] !== answer);
    if (!others.length) break;
    keep.splice(others[Math.floor(rng() * others.length)], 1);
  }
  return keep;
}

/** Font size (px) for a falling word, by its longest single word. */
export function fontFor(text) {
  const longest = Math.max(0, ...String(text || "").split(/\s+/).map(w => w.length));
  return longest <= 8 ? 18 : longest <= 11 ? 16 : longest <= 14 ? 14 : 13;
}

/** Word Rush cards from "word → meaning" questions: half show the word's
 * own meaning, half another word's (5 and 5 in every 10, in random order). */
export function rushDeck(questions, rng = Math.random) {
  let bag = [];
  return questions.map(q => {
    if (!bag.length) {
      bag = [true, true, true, true, true, false, false, false, false, false];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    const wrong = q.options.filter(o => o !== q.answer);
    const truth = bag.pop() || !wrong.length;
    return { q, meaning: truth ? q.answer : wrong[Math.floor(rng() * wrong.length)], truth };
  });
}

/** A Word Shooter wave from an /api/listen item: hear the word, shoot it.
 * The options are words that sound alike (never a homophone). */
export function fromListen(item) {
  const core = (item.nuance || {}).core || {};
  const sense = ((item.meanings || [])[0] || { senses: [] }).senses[0] || {};
  return {
    word_id: item.id, word: item.word, answer: item.word, options: item.options, hear: true,
    ask: "Which word do you hear?", prompt: "", definition: core.definition || item.def || sense.definition || "",
    phonetic: item.phonetic || "", example: sense.example || "", audio_url: item.audio_url, tts_url: item.tts_url,
  };
}

/** Endless mode: the questions of a new batch that this game hasn't shown yet. */
export function freshOnly(list, seen) {
  const out = [];
  for (const q of list) {
    if (seen.has(q.word_id)) continue;
    seen.add(q.word_id);
    out.push(q);
  }
  return out;
}
export const REFILL_AT = 5;   // endless: fetch more when this many words are left

// ---------------------------------------------------------------- typing

// The letters that count: case, accents, curly apostrophes, hyphens and
// spaces don't ("Self-esteem" = "self esteem"), sentence punctuation neither.
const letters = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'")
  .replace(/[?!.,…"“”]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();
export const typedRight = (typed, word) => letters(typed) !== "" && letters(typed) === letters(word);

/** The word with `shown` letters given and the rest as blanks; spaces,
 * hyphens and apostrophes always show: "e _ _ _ _ _" for "esteem", 1. */
export function hintFor(word, shown = 1) {
  let n = 0;
  return [...String(word)].map(ch => {
    if (!/[\p{L}\p{N}]/u.test(ch)) return ch === " " ? "\u2003" : ch;   // a wide gap between words
    return n++ < shown ? ch : "_";
  }).join(" ");
}
export const letterCount = word => [...String(word)].filter(ch => /[\p{L}\p{N}]/u.test(ch)).length;

/** Milliseconds to type a word at this level: time to read the clue (or
 * hear the word) plus a little more for each letter. */
export function typeTime(clue, word, level) {
  return (readTime(clue) + 0.6 * letterCount(word)) * SPEED_FACTORS[clamp(level, 1, 5) - 1] * 1000;
}

// ---------------------------------------------------------------- kept in this browser

// Best scores, one JSON object: shooter:timed, shooter:calm, rush:60,
// rush:120, rush:calm. Storage can be missing or blocked: then no best.
const BESTS = "lexi-game-bests";
function readBests() {
  const all = JSON.parse(globalThis.localStorage.getItem(BESTS) || "{}");
  return all && typeof all === "object" ? all : {};
}
export function bestScore(key) {
  try { return Number(readBests()[key]) || 0; } catch (e) { return 0; }
}
export function saveBest(key, score) {
  try {
    const all = readBests();
    const best = Number(all[key]) || 0;
    if (score <= best) return { best, isNew: false };
    all[key] = score;
    globalThis.localStorage.setItem(BESTS, JSON.stringify(all));
    return { best: score, isNew: true };
  } catch (e) { return { best: 0, isNew: false }; }
}

// Top scores on this device: the 10 best of each board ("shooter:timed",
// "typeit:endless:calm"...), each with a name and a date. Several people can
// share one phone; a list shared between devices would need accounts.
const LEADERS = "lexi-game-leaders";
const NAME = "lexi-game-name";
export const TOP = 10;
function readLeaders() {
  const all = JSON.parse(globalThis.localStorage.getItem(LEADERS) || "{}");
  return all && typeof all === "object" ? all : {};
}
export function topScores(board) {
  try {
    const list = readLeaders()[board];
    return Array.isArray(list) ? list.filter(e => e && Number.isFinite(e.score)) : [];
  } catch (e) { return []; }
}
/** Add a score: returns its place (1 = top) or 0 if it didn't make the list,
 * and the list. A tie goes under the score that was there first. */
/** Today on this device's calendar, as YYYY-MM-DD. */
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addScore(board, score, { name = playerName(), at = today() } = {}) {
  if (!(score > 0)) return { place: 0, list: topScores(board) };
  const list = topScores(board);
  let place = list.findIndex(e => score > e.score);
  if (place < 0) place = list.length;
  if (place >= TOP) return { place: 0, list };
  const entry = { name, score, at, id: `${at}-${score}-${list.length}-${Math.floor(Math.random() * 1e6)}` };
  list.splice(place, 0, entry);
  list.length = Math.min(list.length, TOP);
  try {
    const all = readLeaders();
    all[board] = list;
    globalThis.localStorage.setItem(LEADERS, JSON.stringify(all));
  } catch (e) { /* storage unavailable: shown, not kept */ }
  return { place: place + 1, list, entry };
}
/** Put a new name on a score already in the list. */
export function renameScore(board, id, name) {
  try {
    const all = readLeaders();
    const e = (all[board] || []).find(x => x.id === id);
    if (!e) return;
    e.name = name;
    globalThis.localStorage.setItem(LEADERS, JSON.stringify(all));
  } catch (e) { /* storage unavailable */ }
}
export function clearScores(board) {
  try {
    const all = readLeaders();
    delete all[board];
    globalThis.localStorage.setItem(LEADERS, JSON.stringify(all));
  } catch (e) { /* storage unavailable */ }
}
export const cleanName = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
export const playerName = () => cleanName(pref(NAME, "")) || "Me";
export const setPlayerName = name => setPref(NAME, cleanName(name));

/** A choice remembered on this device (speed, clue type, Rush time, sounds). */
export function pref(key, fallback) {
  try { return globalThis.localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; }
}
export function setPref(key, v) {
  try { globalThis.localStorage.setItem(key, v); } catch (e) { /* storage unavailable */ }
}

// ---------------------------------------------------------------- sound

// Quiet blips made on the spot (no sound files), never over a word being
// said. One AudioContext, made on the Start tap: browsers only allow sound
// that a tap started.
const SOUNDS = "lexi-game-sounds";
const PEAK = 0.08;
const NOTES = {   // [wave, Hz, start s, length s]
  hit: [["sine", 660, 0, 0.06], ["sine", 990, 0.06, 0.06]],
  miss: [["triangle", 180, 0, 0.12]],
  heart: [["sine", 784, 0, 0.07], ["sine", 988, 0.08, 0.07], ["sine", 1319, 0.16, 0.1]],
  end: [["sine", 523, 0, 0.12], ["sine", 659, 0.12, 0.12], ["sine", 784, 0.24, 0.22]],
};
let ctx = null;
let speaking = () => false;

export const soundsOn = () => pref(SOUNDS, "on") !== "off";
export function setSounds(on) { setPref(SOUNDS, on ? "on" : "off"); }

/** Call inside the Start tap, before any await. */
export function unlockSounds() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  } catch (e) { ctx = null; }
  // audio.js makes its <audio> element when it loads, so it's loaded here
  // (in the browser, already loaded by the tab) and not at the top.
  import("./audio.js").then(m => { speaking = m.playbackRunning; }).catch(() => {});
}

export function sfx(name) {
  if (!ctx || !soundsOn() || speaking() || globalThis.speechSynthesis?.speaking) return;
  try {
    const t0 = ctx.currentTime + 0.01;
    for (const [type, hz, at, len] of NOTES[name] || []) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.linearRampToValueAtTime(PEAK, t0 + at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.02);
    }
  } catch (e) { /* no sound: the game goes on */ }
}

/** A short buzz on phones that can, with sounds on. */
export function buzz(ms) {
  if (!soundsOn()) return;
  try { globalThis.navigator?.vibrate?.(ms); } catch (e) { /* not supported */ }
}
