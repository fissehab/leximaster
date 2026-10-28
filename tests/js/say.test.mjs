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
    for (const v of [p.jaw, p.round, p.velum, p.lipToTeeth, p.lipClose, ...p.tongue.flat(), ...(p.focus || [])]) {
      assert.ok(Number.isFinite(v), `${sym}: ${v}`);
    }
  }
  assert.equal(Object.keys(SOUNDS).length, 40);
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
