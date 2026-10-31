// What the practice games share (Word Shooter, Word Rush): points, speed,
// lanes, the Rush deck, best scores, saved choices and sound effects.
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
