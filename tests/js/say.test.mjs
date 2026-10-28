// "How to say it": the mouth positions, the IPA reader and the word lists.
//     node --test tests/js/
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DIPHTHONGS, pose, SOUNDS } from "../../static/js/mouth.js";
import { CLIPS } from "../../static/js/mri.gen.js";
import { hardestIndex, LABELS, PRIORITY, tokenize } from "../../static/js/phonemes.js";
import { CARDS, MRI, PAIRS } from "../../static/js/say-strings.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const syms = ipa => tokenize(ipa).map(t => t.sym).join(" ");

test("every position draws: six tongue points, all numbers", () => {
  for (const [sym, s] of Object.entries(SOUNDS)) {
    assert.equal(s.tongue.length, 6, sym);
    const p = pose(sym);
    for (const k of ["w", "h", "lip", "bite", "out", "up", "level"]) assert.ok(Number.isFinite(p[k]), `${sym}.${k}: ${p[k]}`);
    assert.ok(p.w > 0 && p.h >= 0 && p.level >= 0 && p.level <= 1, sym);
  }
  assert.equal(Object.keys(SOUNDS).length, 40);
});

test("the front view shows what a learner can copy", () => {
  assert.equal(pose("p").h, 0);                         // lips closed
  assert.equal(pose("f").bite, 1);                      // top teeth on the lower lip
  assert.equal(pose("θ").out, 1);                       // tongue between the teeth
  assert.equal(pose("l").up, 1);                        // tongue tip up behind the teeth
  assert.ok(pose("u").w < pose("i").w);                 // rounded is narrower than spread
  assert.ok(pose("æ").h > pose("ɪ").h);                 // open wider for short a
  assert.ok(pose("i").level > pose("ɑ").level);         // tongue high for ee, low for o
});

test("every sound the reader can return has a position", () => {
  for (const sym of [...Object.keys(LABELS), "rest"]) {
    const parts = DIPHTHONGS[sym] || [sym];
    for (const x of parts) assert.ok(SOUNDS[x], `${sym} → ${x}`);
  }
});

test("reading IPA", () => {
  assert.equal(syms("/ˈθɪŋk/"), "θ ɪ ŋ k");
  assert.equal(syms("/əˈɹaʊnd/"), "ə ɹ aʊ n d");             // ə + r, not the r-colored vowel
  assert.equal(syms("/bɝd/"), "b ɚ d");
  assert.equal(syms("/ˈwɜɹk/"), "w ɚ k");
  assert.equal(syms("/bɑl/"), "b ɑ ɫ");                     // dark l at the end of a word
  assert.equal(syms("/ˈlɪ.tl̩/"), "l ɪ t ɫ");
  assert.equal(syms("/ˈkiŋ/"), "k ɪ ŋ");
  assert.equal(syms("/ˈhaɪ ˈlɛv.əl/"), "h aɪ rest l ɛ v ə ɫ");
  assert.equal(syms("/ˈsʌm(p)θɪŋ/"), "s ʌ m θ ɪ ŋ");          // optional sounds left out
  assert.equal(tokenize("/ˈθɪŋk/")[1].stress, 1);
  assert.equal(tokenize("/ˈdi-sə-ˌlüt-lē/"), null);         // a dictionary respelling
  assert.equal(tokenize(""), null);
});

test("a word's panel opens on its hardest sound", () => {
  const t = tokenize("/ˈθɪŋk/");
  assert.equal(t[hardestIndex(t)].sym, "θ");
  const u = tokenize("/kæt/");
  assert.equal(u[hardestIndex(u)].sym, "æ");
  const v = tokenize("/ˈtɑp/");
  assert.equal(v[hardestIndex(v)].sym, "p");
});

test("cards, pairs and clips line up", () => {
  for (const c of CARDS) {
    for (const p of c.parts || [c]) {
      assert.ok(SOUNDS[p.sym] && LABELS[p.sym] && PRIORITY.has(p.sym) || ["i", "ɛ", "ɑ", "u"].includes(p.sym), p.sym);
      assert.ok(p.short && p.full && p.try.length, p.sym);
    }
    for (const d of c.drill || []) assert.ok(PAIRS[d] && PAIRS[d].length >= 6, d);
  }
  for (const m of Object.values(MRI)) {
    const clip = CLIPS[m.file];
    assert.ok(clip, m.file);
    assert.ok(existsSync(ROOT + clip.src) && existsSync(ROOT + clip.poster), m.file);
    assert.ok(clip.tongue, `${m.file}: tongue outline`);
    if (m.teeth) assert.ok(clip.teeth, `${m.file}: teeth outline`);
  }
});

test("each sound is placed where it is in the recording", async () => {
  const { alignTokens } = await import("../../static/js/align.js");
  // A made-up "think": 0.15 s digital silence, room noise throughout, a hiss
  // (th) 0.20–0.30, a voiced vowel 0.30–0.42, silence, a burst (k) 0.50–0.54.
  const sr = 16000, x = new Float32Array(Math.round(.8 * sr));
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    if (t < .15) continue;
    let v = rnd() * .0005;
    if (t >= .2 && t < .3) v += rnd() * .02 * Math.sin(2 * Math.PI * 4000 * t);
    if (t >= .3 && t < .42) v += .5 * Math.sin(2 * Math.PI * 180 * t) + .2 * Math.sin(2 * Math.PI * 360 * t);
    if (t >= .5 && t < .54) v += rnd() * .1;
    x[i] = v;
  }
  const { times, how } = alignTokens(tokenize("/θɪk/"), x, sr);
  assert.equal(how, "stretches");
  assert.ok(Math.abs(times[0][0] - .2) <= .03, `th starts ${times[0][0]}`);
  assert.ok(Math.abs(times[1][0] - .3) <= .02 && Math.abs(times[1][1] - .42) <= .02, `vowel ${times[1]}`);
  assert.ok(times[2][1] >= .53, `k ends ${times[2][1]}`);
});
