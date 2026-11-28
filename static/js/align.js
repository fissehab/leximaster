// Where each sound of a word is in its recording, read from the recording
// itself, so the mouth drawing can move in step with the voice. Recordings
// carry no timings for each sound; this finds the voiced stretches (vowels,
// m n ng l r w y: strong low-frequency energy) and the quiet sounds around
// them (th, f, s, sh, h: hiss; p, t, k, b, d, g: a short silence, then a burst),
// and fits the word's sounds to them:
//   - each run of voiced sounds goes to one voiced stretch, shared by usual
//     length (a stressed vowel longest);
//   - the sounds between two stretches share the gap between them;
//   - the sounds before the first stretch reach back to where the hiss or
//     burst starts, and those after the last reach on to where it ends.
// When the runs and stretches don't match up one to one, the sounds share the
// whole span of speech by usual length instead.

// Sounds that usually break the voicing (silence or hiss), and of those the
// ones that often don't when between voiced sounds: the American flap in
// "water", b d g after m n ng, the voiced fricatives, h between vowels, a word
// gap without a pause. Ranked: the likeliest to keep the voicing first.
const BREAKS = new Set(["p", "t", "k", "f", "θ", "s", "ʃ", "h", "tʃ", "b", "d", "ɡ", "dʒ", "v", "ð", "z", "ʒ", "rest"]);
const SOFT_RANK = { t: 0, d: 0, b: 1, ɡ: 1, rest: 2, v: 3, ð: 3, z: 3, ʒ: 3, h: 4 };
const VOWELS = new Set(["i", "ɪ", "ɛ", "æ", "ɑ", "ɔ", "ʊ", "u", "ʌ", "ə", "ɚ", "eɪ", "aɪ", "ɔɪ", "oʊ", "aʊ"]);
// Shortest believable time for a sound outside the voiced stretches, seconds.
const MIN_DUR = { p: .05, t: .05, k: .06, b: .04, d: .04, ɡ: .05, f: .08, θ: .08, s: .09, ʃ: .09, h: .06,
                  tʃ: .09, dʒ: .08, v: .05, ð: .04, z: .07, ʒ: .07, rest: .03 };

/** Usual length of a sound, in parts (the walk-through uses the same). */
export function weight(t) {
  if (t.syllabic) return 1.2;
  if (["eɪ", "aɪ", "ɔɪ", "oʊ", "aʊ"].includes(t.sym)) return 1.8;
  if (VOWELS.has(t.sym)) return t.stress === 1 ? 1.6 : 1.2;
  return { p: .6, b: .6, t: .6, d: .6, k: .6, ɡ: .6, tʃ: .8, dʒ: .8, m: .8, n: .8, ŋ: .8, l: .8, ɫ: .8, ɹ: .8,
           w: .8, j: .8, ə: .8, rest: .8 }[t.sym] || .9;
}

// A second-order filter (RBJ cookbook), run over the samples.
function biquad(x, sr, type, f0) {
  const w = 2 * Math.PI * f0 / sr, cos = Math.cos(w), alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const b = type === "low" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b[0] * x[i] + b[1] * x1 + b[2] * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const FRAME = .01;   // seconds
function framesDb(x, sr) {
  const n = Math.round(sr * FRAME), out = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let e = 0;
    for (let k = i; k < i + n; k++) e += x[k] * x[k];
    out.push(10 * Math.log10(e / n + 1e-14));
  }
  return out;
}
const percentile = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/**
 * The acoustic landmarks of a recording: voiced stretches [[start, end]],
 * and where any sound starts and ends (seconds). `samples` is mono.
 */
export function landmarks(samples, sr) {
  const low = framesDb(biquad(samples, sr, "low", 900), sr);
  const high = framesDb(biquad(samples, sr, "high", 2500), sr);
  const all = framesDb(samples, sr);
  // The room's noise: the quiet tenth of the frames that aren't digital silence.
  const live = all.map((v, i) => v > -120 ? i : -1).filter(i => i >= 0);
  const floor = arr => percentile(live.map(i => arr[i]), .1);
  const nLow = floor(low), nHigh = floor(high), nAll = floor(all);
  const peakLow = Math.max(...low);
  // Voiced: strong low-frequency energy, well above the noise, and not
  // outweighed by hiss (a short f or s between vowels keeps some voicing).
  const voiced = low.map((v, i) => v > Math.max(peakLow - 26, nLow + 16) && v > high[i] + 6);
  let stretches = [];
  for (let i = 0; i < voiced.length; i++) {
    if (!voiced[i]) continue;
    let j = i;
    while (j + 1 < voiced.length && voiced[j + 1]) j++;
    stretches.push([i, j + 1]);
    i = j;
  }
  // Bridge dips under 30 ms; drop blips under 40 ms.
  stretches = stretches.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && s[0] - last[1] <= 3) last[1] = s[1]; else acc.push([...s]);
    return acc;
  }, []).filter(([a, b]) => b - a >= 4);
  // Any sound at all: hiss or voice clearly above the noise.
  const sound = all.map((v, i) => v > nAll + 9 || high[i] > nHigh + 9 || low[i] > nLow + 12);
  return { stretches: stretches.map(([a, b]) => [a * FRAME, b * FRAME]), sound, frames: all.length };
}

/** Where sound reaches before `t` (going back) or after it (going on), across
 * silences up to `bridge` seconds (a stop's closure), at most `max` seconds. */
function reach(sound, t, dir, max, bridge = .12) {
  let i = Math.round(t / FRAME), edge = i, quiet = 0;
  for (let n = 0; n < max / FRAME; n++) {
    i += dir;
    if (i < 0 || i >= sound.length) break;
    if (sound[i]) { edge = i; quiet = 0; } else if (++quiet * FRAME > bridge) break;
  }
  return dir < 0 ? edge * FRAME : (edge + 1) * FRAME;
}

/** Share [a, b] among tokens by usual length: [[t0, t1], ...]. */
function share(tokens, a, b) {
  const ws = tokens.map(weight), total = ws.reduce((x, y) => x + y, 0) || 1;
  let t = a;
  return ws.map(w => { const t0 = t; t += (b - a) * w / total; return [t0, t]; });
}

/**
 * Times of each token in the recording: [[t0, t1], ...] in seconds, and how
 * they were found ("stretches" or "span"). tokens as phonemes.tokenize gives.
 */
export function alignTokens(tokens, samples, sr) {
  const { stretches, sound } = landmarks(samples, sr);
  if (!stretches.length || !tokens.length) return null;
  const start = reach(sound, stretches[0][0], -1, .35);
  const end = reach(sound, stretches[stretches.length - 1][1], 1, .4);
  // Runs of voiced tokens, with the ones that break the voicing between them.
  const runs = [];
  tokens.forEach((t, i) => {
    const v = !(t.gap || BREAKS.has(t.sym)), last = runs[runs.length - 1];
    if (last && last.voiced === v) last.idx.push(i); else runs.push({ voiced: v, idx: [i] });
  });
  const count = () => runs.filter(r => r.voiced).length;
  // More runs than stretches: let the likeliest break keep the voicing
  // (join it and its neighbours into one run).
  while (count() > stretches.length) {
    let best = -1, rank = Infinity;
    runs.forEach((r, k) => {
      if (r.voiced || k === 0 || k === runs.length - 1) return;
      const syms = r.idx.map(i => tokens[i].gap ? "rest" : tokens[i].sym);
      if (!syms.every(x => x in SOFT_RANK)) return;
      const score = Math.max(...syms.map(x => SOFT_RANK[x])) + (syms.length - 1) * 5;
      if (score < rank) { rank = score; best = k; }
    });
    if (best < 0) break;
    const [a, r, b] = runs.slice(best - 1, best + 2);
    runs.splice(best - 1, 3, { voiced: true, idx: [...a.idx, ...r.idx, ...b.idx] });
  }
  // More stretches than runs: a dip inside a run (a dark l, a nasal); join
  // the two stretches closest together.
  while (stretches.length > count() && stretches.length > 1) {
    let k = 0;
    for (let i = 1; i < stretches.length - 1; i++) {
      if (stretches[i + 1][0] - stretches[i][1] < stretches[k + 1][0] - stretches[k][1]) k = i;
    }
    stretches.splice(k, 2, [stretches[k][0], stretches[k + 1][1]]);
  }
  if (count() !== stretches.length) return { times: share(tokens, start, end), how: "span" };
  const times = new Array(tokens.length);
  const minDur = toks => toks.reduce((x, t) => x + (MIN_DUR[t.gap ? "rest" : t.sym] || .05), 0);
  let n = 0;
  runs.forEach((r, k) => {
    const toks = r.idx.map(i => tokens[i]);
    let a, b;
    if (r.voiced) [a, b] = stretches[n++];
    else if (k === 0) { b = stretches[0][0]; a = Math.min(start, b - minDur(toks)); }
    else if (k === runs.length - 1) { a = stretches[stretches.length - 1][1]; b = Math.max(end, a + minDur(toks)); }
    else { a = stretches[n - 1][1]; b = stretches[n][0]; }
    share(toks, Math.max(0, a), b).forEach((tt, j) => { times[r.idx[j]] = tt; });
  });
  return { times, how: "stretches" };
}
