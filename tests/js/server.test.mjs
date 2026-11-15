// The website's engine (static/js/local/server.js) in Node, on the 200-word
// test sample (harness.mjs): practice scheduling, words to refresh, My words,
// Progress counts and settings. tests/test_backends_agree.py checks that the
// local app gives the same answers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bootServer, fixtureSite } from "./harness.mjs";

const { handle } = await bootServer();
const words = (await handle("GET", "/api/words")).words;
const keys = new Map(JSON.parse(readFileSync(join(fixtureSite(), "data", "index.json"), "utf8")).words.map(e => [e.i, e.k]));
const pad = n => String(n).padStart(2, "0");
const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const card = id => handle("GET", `/api/words/${id}`).then(w => w.srs);
const answer = (id, correct) => handle("POST", "/api/answer", { word_id: id, mode: "quiz", correct });
async function importCards(rows) {
  const fd = new FormData();
  fd.append("file", new Blob([JSON.stringify({ app: "LexiMaster", version: 1, srs: rows })], { type: "application/json" }));
  return handle("POST", "/api/import", fd);
}
const key = id => keys.get(id);
let next = 0;
const fresh = () => words[next++].id;   // a word no other test has touched

test("boots on the sample words", () => {
  assert.equal(words.length, 200);
});

test("a miss after a right answer the same day replaces it", async () => {
  const [a, b] = [fresh(), fresh()];
  const mature = k => ({ key: k, ease: 2.5, interval_days: 30, reps: 5, lapses: 0, due_date: day(), last_reviewed: "2026-01-01" });
  await importCards([mature(key(a)), mature(key(b))]);
  await answer(a, true);
  await answer(a, false);
  await answer(b, false);
  const [ca, cb] = [await card(a), await card(b)];
  assert.deepEqual(ca, cb);
  assert.equal(ca.interval, 6);
  const n = fresh();                        // a new word: right then wrong is not a lapse
  await answer(n, true);
  await answer(n, false);
  assert.deepEqual([(await card(n)).lapses, (await card(n)).reps, (await card(n)).due], [0, 0, day(1)]);
});

test("a right answer before a word is due is only logged", async () => {
  const c = fresh();
  await importCards([{ key: key(c), ease: 2.5, interval_days: 6, reps: 2, lapses: 0, due_date: day(4), last_reviewed: day(-2) }]);
  const before = await card(c);
  await answer(c, true);
  assert.deepEqual(await card(c), before);
});

test("words to refresh: due cards, counted alike on Today and Progress", async () => {
  const [d1, d2] = [fresh(), fresh()];
  await importCards([d1, d2].map((id, i) => ({ key: key(id), ease: 2.5, interval_days: 3, reps: 2, lapses: 0,
    due_date: day(-1 - i), last_reviewed: day(-5) })));
  const { count } = await handle("GET", "/api/refresh");
  const stats = await handle("GET", "/api/stats");
  assert.ok(count >= 2);
  assert.equal(stats.words.due, count);
  assert.ok(stats.words.overdue >= 2);
  const deck = await handle("GET", "/api/flashcards?domain=refresh&n=50");
  assert.ok([d1, d2].every(id => deck.cards.some(c => c.id === id)));
});

test("My words: saved words and list words", async () => {
  const [s, l] = [fresh(), fresh()];
  await handle("PATCH", `/api/words/${s}/state`, { stars: 3 });
  const list = await handle("POST", "/api/lists", { name: "Node test" });
  await handle("POST", `/api/lists/${list.id}/words`, { word_id: l });
  const pool = (await handle("GET", "/api/flashcards?domain=mine&n=50&shuffle=false")).cards.map(c => c.id);
  assert.deepEqual(new Set(pool), new Set([s, l]));
  await assert.rejects(handle("PATCH", `/api/words/${s}/state`, { stars: 2.5 }), /whole number/);
});

test("new words come easiest first", async () => {
  const pool = (await handle("GET", "/api/flashcards?n=500&shuffle=false&brief=true")).cards.map(c => c.id);
  assert.ok(pool.length > 50, `only ${pool.length} words in the pool`);
  const studied = new Set();
  for (const id of pool) if ((await card(id))) studied.add(id);
  const rank = new Map(words.map(w => [w.id, w.freq_rank ?? 1e9]));
  const easiest = new Set(pool.filter(i => !studied.has(i)).sort((a, b) => rank.get(a) - rank.get(b)).slice(0, 50));
  for (let i = 0; i < 5; i++) {
    const deck = (await handle("GET", "/api/flashcards?n=5&brief=true")).cards.map(c => c.id).filter(i => !studied.has(i));
    assert.ok(deck.every(id => easiest.has(id)), `${deck} not among the 50 most common`);
  }
});

test("settings: no daily-review settings", async () => {
  const s = await handle("GET", "/api/settings");
  assert.ok(!("session_minutes" in s) && !("new_per_day" in s));
});
