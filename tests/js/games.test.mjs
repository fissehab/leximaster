// The games' shared logic (static/js/games.js): points, speed, lanes, the
// Rush deck, hear mode, endless refills, typed answers, best and top scores.
//     node --test tests/js/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  addScore, cleanName, clearScores, freshOnly, fromListen, hintFor, letterCount, playerName, renameScore, setPlayerName,
  today, topScores, typedRight, typeTime, TOP,
  bestScore, buzz, comboFor, fallTime, fontFor, nextLevel, pickLanes, points, pref, readTime, rushDeck, saveBest, setPref,
  setSounds, sfx, soundsOn, SPEED_FACTORS, unlockSounds,
} from "../../static/js/games.js";

/** A repeatable random number source (mulberry32). */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("games.js never names the DOM: no document or window anywhere in it", () => {
  const src = readFileSync(new URL("../../static/js/games.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");   // comments may say "document"
  assert.doesNotMatch(src, /\b(document|window)\b/);
});

test("sounds, buzz and prefs are safe with no storage, AudioContext or navigator", () => {
  assert.equal(typeof globalThis.AudioContext, "undefined");
  assert.doesNotThrow(() => {
    unlockSounds();
    sfx("hit"); sfx("miss"); sfx("heart"); sfx("end"); sfx("no such sound");
    buzz(30);
    setSounds(false);
    setPref("lexi-shooter-speed", "fast");
  });
  assert.equal(soundsOn(), true);   // nothing saved: sounds default on
  assert.equal(pref("lexi-shooter-speed", "slow"), "slow");
});

test("the combo steps up at 3, 6 and 10 hits in a row", () => {
  const got = [1, 2, 3, 5, 6, 9, 10, 15].map(comboFor);
  assert.deepEqual(got, [1, 1, 2, 2, 3, 3, 4, 4]);
});

test("points: 100 a word, up to 50 for speed, times the combo", () => {
  assert.equal(points({ streak: 1, left: 0, fall: 8000 }), 100);
  assert.equal(points({ streak: 1, left: 8000, fall: 8000 }), 150);
  assert.equal(points({ streak: 1, left: 4000, fall: 8000 }), 125);
  assert.equal(points({ streak: 1, left: 1000, fall: 3000 }), 117);        // 16.7 rounds to 17
  assert.equal(points({ streak: 3, left: 8000, fall: 8000 }), 300);
  assert.equal(points({ streak: 10, left: 4000, fall: 8000 }), 500);
  // Calm and Rush: no clock, no speed bonus.
  assert.equal(points({ streak: 1 }), 100);
  assert.equal(points({ streak: 6, left: 5000 }), 300);
});

test("reading time grows with the clue, from 6 to 16 seconds", () => {
  assert.equal(readTime("cat"), 6);
  assert.equal(readTime(""), 6);
  assert.equal(readTime(Array(10).fill("w").join(" ")), 9);
  assert.equal(readTime(Array(60).fill("w").join("  ")), 16);
});

test("fall time uses the factor of its level", () => {
  const clue = Array(10).fill("w").join(" ");   // 9 s to read
  SPEED_FACTORS.forEach((f, i) => assert.equal(fallTime(clue, i + 1), 9 * f * 1000));
  assert.equal(fallTime(clue, 1), 11250);
  assert.equal(fallTime(clue, 5), 9 * 0.62 * 1000);
});

test("the level goes up on every third hit in a row, down on a miss, within 1–5", () => {
  assert.equal(nextLevel(2, { hit: true, streak: 1 }), 2);
  assert.equal(nextLevel(2, { hit: true, streak: 2 }), 2);
  assert.equal(nextLevel(2, { hit: true, streak: 3 }), 3);
  assert.equal(nextLevel(2, { hit: true, streak: 4 }), 2);
  assert.equal(nextLevel(2, { hit: true, streak: 6 }), 3);
  assert.equal(nextLevel(5, { hit: true, streak: 9 }), 5);
  assert.equal(nextLevel(3, { hit: false, streak: 0 }), 2);
  assert.equal(nextLevel(1, { hit: false, streak: 0 }), 1);
});

test("lanes keep the answer and the server's order", () => {
  const opts = ["alpha", "beta", "gamma", "delta"];
  for (const answer of opts) {
    for (let seed = 1; seed <= 40; seed++) {
      assert.deepEqual(pickLanes(opts, answer, 4, seeded(seed)), opts);
      const three = pickLanes(opts, answer, 3, seeded(seed));
      assert.equal(three.length, 3);
      assert.ok(three.includes(answer));
      assert.deepEqual(three, opts.filter(o => three.includes(o)));   // same order
    }
  }
  // Different seeds drop different words.
  const dropped = new Set(Array.from({ length: 40 }, (_, s) => opts.find(o => !pickLanes(opts, "beta", 3, seeded(s + 1)).includes(o))));
  assert.ok(dropped.size > 1 && !dropped.has("beta"));
});

test("font size steps down for long words", () => {
  assert.equal(fontFor("calm"), 18);
  assert.equal(fontFor("abundant"), 18);           // 8
  assert.equal(fontFor("abundance"), 16);          // 9
  assert.equal(fontFor("comfortably"), 16);        // 11
  assert.equal(fontFor("questionnaire"), 14);      // 13
  assert.equal(fontFor("incomprehensible"), 13);   // 16
  assert.equal(fontFor("look forward to"), 18);    // by the longest single word
});

test("a Rush deck is half true, half false, in every ten cards", () => {
  const qs = Array.from({ length: 40 }, (_, i) => {
    const options = [`meaning ${i}a`, `meaning ${i}b`, `meaning ${i}c`, `meaning ${i}d`];
    return { word: `w${i}`, answer: options[i % 4], options };
  });
  for (let seed = 1; seed <= 10; seed++) {
    const deck = rushDeck(qs, seeded(seed));
    assert.equal(deck.length, 40);
    for (let k = 0; k < 40; k += 10) {
      assert.equal(deck.slice(k, k + 10).filter(c => c.truth).length, 5);
    }
    for (const c of deck) {
      if (c.truth) assert.equal(c.meaning, c.q.answer);
      else { assert.notEqual(c.meaning, c.q.answer); assert.ok(c.q.options.includes(c.meaning)); }
    }
  }
});

function fakeStorage(store = {}) {
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    store,
  };
}

test("best scores are kept per game and mode, and only a higher score is new", () => {
  const ls = fakeStorage();
  globalThis.localStorage = ls;
  try {
    assert.equal(bestScore("shooter:timed"), 0);
    assert.deepEqual(saveBest("shooter:timed", 1200), { best: 1200, isNew: true });
    assert.deepEqual(saveBest("shooter:timed", 900), { best: 1200, isNew: false });
    assert.deepEqual(saveBest("shooter:timed", 1200), { best: 1200, isNew: false });
    assert.deepEqual(saveBest("shooter:timed", 1500), { best: 1500, isNew: true });
    assert.deepEqual(saveBest("rush:60", 0), { best: 0, isNew: false });
    assert.equal(bestScore("shooter:timed"), 1500);
    assert.equal(bestScore("shooter:calm"), 0);
    assert.deepEqual(JSON.parse(ls.store["lexi-game-bests"]), { "shooter:timed": 1500 });
  } finally {
    delete globalThis.localStorage;
  }
});

test("blocked or broken storage never throws: no best", () => {
  const boom = () => { throw new Error("blocked"); };
  for (const ls of [{ getItem: boom, setItem: boom }, fakeStorage({ "lexi-game-bests": "not json" }), undefined]) {
    globalThis.localStorage = ls;
    try {
      assert.equal(bestScore("rush:120"), 0);
      assert.deepEqual(saveBest("rush:120", 700), { best: 0, isNew: false });
    } finally {
      delete globalThis.localStorage;
    }
  }
});

test("a heard word becomes a Shooter wave: its own word is the answer, options kept", () => {
  const item = { id: 7, word: "affect", options: ["effect", "affect", "infect", "afford"], phonetic: "/əˈfɛkt/",
    audio_url: "/media/audio/affect.m4a", tts_url: null, def: "short meaning",
    nuance: { core: { definition: "To change or influence something." } },
    meanings: [{ senses: [{ definition: "dictionary meaning", example: "The cold affects her mood." }] }] };
  const q = fromListen(item);
  assert.equal(q.word_id, 7);
  assert.equal(q.answer, "affect");
  assert.deepEqual(q.options, item.options);
  assert.equal(q.hear, true);
  assert.equal(q.prompt, "");
  assert.equal(q.definition, "To change or influence something.");
  assert.equal(q.example, "The cold affects her mood.");
  assert.equal(q.audio_url, "/media/audio/affect.m4a");
  // No nuance: the short meaning, then the dictionary's.
  assert.equal(fromListen({ ...item, nuance: null }).definition, "short meaning");
  assert.equal(fromListen({ ...item, nuance: null, def: "" }).definition, "dictionary meaning");
  assert.equal(fromListen({ id: 1, word: "x", options: [] }).definition, "");
});

test("endless refills skip words already shown", () => {
  const seen = new Set([1, 2]);
  const got = freshOnly([{ word_id: 2 }, { word_id: 3 }, { word_id: 3 }, { word_id: 4 }], seen);
  assert.deepEqual(got.map(q => q.word_id), [3, 4]);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
  assert.deepEqual(freshOnly([{ word_id: 1 }], seen), []);
});

test("a typed word is right whatever its case, accents, hyphens, spaces or apostrophes", () => {
  assert.ok(typedRight("Esteem", "esteem"));
  assert.ok(typedRight("  esteem ", "esteem"));
  assert.ok(typedRight("self esteem", "self-esteem"));
  assert.ok(typedRight("selfesteem", "self-esteem") === false);
  assert.ok(typedRight("cafe", "café"));
  assert.ok(typedRight("don't", "don’t"));
  assert.ok(typedRight("How are you", "How are you?"));
  assert.ok(!typedRight("esteam", "esteem"));
  assert.ok(!typedRight("", "a"));
  assert.ok(!typedRight("   ", "a"));
});

test("blanks show the given letters and how many are left", () => {
  assert.equal(hintFor("esteem", 1), "e _ _ _ _ _");
  assert.equal(hintFor("esteem", 0), "_ _ _ _ _ _");
  assert.equal(hintFor("esteem", Infinity), "e s t e e m");
  assert.equal(hintFor("self-esteem", 2), "s e _ _ - _ _ _ _ _ _");
  assert.equal(hintFor("let go", 1), "l _ _ \u2003 _ _");
  assert.equal(letterCount("self-esteem"), 10);
  assert.equal(letterCount("let go of"), 7);
});

test("typing time: reading time, more for longer words, faster at higher levels", () => {
  assert.equal(typeTime("", "cat", 2), (6 + 1.8) * 1000);
  assert.ok(typeTime("", "extraordinary", 2) > typeTime("", "cat", 2));
  assert.ok(typeTime("a long clue to read with many many words in it here", "cat", 2) > typeTime("", "cat", 2));
  assert.ok(typeTime("", "cat", 5) < typeTime("", "cat", 1));
});

test("top scores: best first, 10 kept, a tie goes under, names and clearing", () => {
  const ls = fakeStorage();
  globalThis.localStorage = ls;
  try {
    assert.deepEqual(topScores("shooter:timed"), []);
    assert.equal(playerName(), "Me");
    assert.equal(addScore("shooter:timed", 0).place, 0);   // nothing scored: not listed
    assert.equal(addScore("shooter:timed", 500, { at: "2026-10-30" }).place, 1);
    assert.equal(addScore("shooter:timed", 900, { at: "2026-10-30" }).place, 1);
    const tie = addScore("shooter:timed", 500, { name: "Abebe", at: "2026-10-30" });
    assert.equal(tie.place, 3);
    assert.deepEqual(topScores("shooter:timed").map(e => [e.score, e.name]), [[900, "Me"], [500, "Me"], [500, "Abebe"]]);
    for (let i = 0; i < 12; i++) addScore("shooter:timed", 1000 + i);
    const list = topScores("shooter:timed");
    assert.equal(list.length, TOP);
    assert.equal(list[0].score, 1011);
    assert.equal(addScore("shooter:timed", 1).place, 0);   // too low for the list
    assert.deepEqual(topScores("rush:60"), []);            // boards are apart
    setPlayerName("  Sara   T  ");
    assert.equal(playerName(), "Sara T");
    const { entry } = addScore("rush:60", 300);
    assert.equal(entry.name, "Sara T");
    renameScore("rush:60", entry.id, "Liya");
    assert.equal(topScores("rush:60")[0].name, "Liya");
    assert.equal(cleanName("x".repeat(40)).length, 20);
    clearScores("rush:60");
    assert.deepEqual(topScores("rush:60"), []);
    assert.equal(topScores("shooter:timed").length, TOP);
  } finally {
    delete globalThis.localStorage;
  }
});

test("top scores with blocked or broken storage never throw", () => {
  const boom = () => { throw new Error("blocked"); };
  for (const ls of [{ getItem: boom, setItem: boom }, fakeStorage({ "lexi-game-leaders": "not json" }), undefined]) {
    globalThis.localStorage = ls;
    try {
      assert.deepEqual(topScores("typeit:timed"), []);
      assert.equal(addScore("typeit:timed", 300).place, 1);   // shown, not kept
      assert.doesNotThrow(() => { renameScore("typeit:timed", "x", "y"); clearScores("typeit:timed"); setPlayerName("A"); });
      assert.equal(typeof playerName(), "string");
    } finally {
      delete globalThis.localStorage;
    }
  }
});

test("a score's date is the day on this device's calendar, not in London", () => {
  assert.equal(today(new Date(2026, 9, 30, 23, 30)), "2026-10-30");
  assert.equal(today(new Date(2026, 0, 5, 0, 10)), "2026-01-05");
});
