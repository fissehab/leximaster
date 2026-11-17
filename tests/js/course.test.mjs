// The English course's lesson data (static/js/course-lessons.js) and its
// text helpers (static/js/course-text.js).
import assert from "node:assert/strict";
import { test } from "node:test";

import { AUDIO } from "../../static/js/course-audio.js";
import { COMING, LESSONS, LEVELS } from "../../static/js/course-lessons.js";
import { lessonSentences, plain, segments, spoken } from "../../static/js/course-text.js";

test("markup: **point**, *word*, plain text and what the voice reads", () => {
  assert.deepEqual(segments("She **works** in *a* bank."), [
    { text: "She " }, { text: "works", b: true }, { text: " in " }, { text: "a", i: true }, { text: " bank." }]);
  assert.equal(plain("The **book** is *new*."), "The book is new.");
  assert.equal(spoken("The meeting starts **at** 9:00.", "The meeting starts at nine."), "The meeting starts at nine.");
  assert.equal(spoken("I **went** home."), "I went home.");
});

// Every piece of text a learner reads, with the lesson it is in.
function texts(l) {
  const c = l.compare ? [...l.compare.head, ...l.compare.rows.flat()] : [];
  return [l.title, l.key, ...l.rule, ...c, l.note || "", l.myth || "", l.intro || "", l.tip || "", l.fact || "",
    ...(l.learn || []), ...(l.dialogue || []).flatMap(d => [d.name, d.t]),
    ...l.examples.flatMap(e => [e.t, e.note || ""]),
    ...l.mistakes.flatMap(m => [m.bad, m.good, m.note]),
    ...l.checks.flatMap(c => [c.q, c.why, ...c.choices])];
}

test("lessons are well formed", () => {
  const ids = LESSONS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length, "lesson ids are unique");
  for (const l of LESSONS) {
    assert.ok(LEVELS.some(v => v.id === l.level), `${l.id}: a known level`);
    for (const f of ["title", "unit", "key"]) assert.ok(l[f], `${l.id}: ${f}`);
    assert.ok(l.rule.length >= 2 && l.examples.length >= 3 && l.mistakes.length >= 2, `${l.id}: rule, examples, mistakes`);
    assert.ok(l.checks.length >= 8, `${l.id}: at least 8 questions`);
    for (const f of ["intro", "tip", "fact"]) assert.ok(l[f], `${l.id}: ${f}`);
    assert.ok(l.learn?.length >= 2, `${l.id}: what you will learn`);
    assert.ok(l.dialogue?.length >= 4, `${l.id}: a conversation`);
    for (const d of l.dialogue) assert.ok(["A", "B"].includes(d.who) && d.name, `${l.id}: a speaker for ${d.t}`);
    // Each speaker keeps one name (A is said by a woman's voice, B by a man's).
    for (const who of ["A", "B"]) assert.ok(new Set(l.dialogue.filter(d => d.who === who).map(d => d.name)).size <= 1, `${l.id}: ${who}'s name`);
    if (l.compare) for (const r of l.compare.rows) assert.equal(r.length, l.compare.head.length, `${l.id}: table row width`);
    for (const m of l.mistakes) assert.notEqual(plain(m.bad), plain(m.good), `${l.id}: ✗ and ✓ differ`);
  }
});

test("every question has one right answer among distinct choices", () => {
  for (const l of LESSONS) for (const c of l.checks) {
    assert.ok(Number.isInteger(c.answer) && c.answer >= 0 && c.answer < c.choices.length, `${l.id}: ${c.q}`);
    assert.equal(new Set(c.choices).size, c.choices.length, `${l.id}: distinct choices in ${c.q}`);
    assert.ok(c.why, `${l.id}: a reason for ${c.q}`);
    assert.ok((c.q.match(/___/g) || []).length <= 1, `${l.id}: at most one gap in ${c.q}`);
    if (/^Listen\b/.test(c.q)) assert.ok(c.say, `${l.id}: a listening question has a sentence to play`);
  }
});

test("markup is balanced and the text is English (no other alphabet)", () => {
  // Latin letters, digits, punctuation, and the typography the lessons use.
  const ok = /^[\x20-\x7E–—…“”‘’→✓✗]*$/;
  for (const l of LESSONS) for (const t of texts(l)) {
    assert.ok(!plain(t).includes("*"), `${l.id}: unbalanced * in ${t}`);
    assert.ok(ok.test(t), `${l.id}: unexpected character in ${t}`);
  }
});

test("a question doesn't repeat an example or a line of the conversation", () => {
  const norm = t => plain(t).toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  for (const l of LESSONS) {
    const seen = new Set([...l.examples.map(e => norm(e.t)), ...(l.dialogue || []).map(d => norm(d.t))]);
    for (const c of l.checks) {
      const filled = norm(c.say || c.q.replace("___", c.choices[c.answer] === "(nothing)" ? "" : c.choices[c.answer]));
      assert.ok(!seen.has(filled), `${l.id}: “${filled}” is on the page already`);
    }
  }
});

test("one voice per sentence: a sentence isn't said by both voices", () => {
  const voice = new Map();
  for (const s of LESSONS.flatMap(l => lessonSentences(l))) {
    const v = s.voice || "female";
    assert.ok(!voice.has(s.key) || voice.get(s.key) === v, s.key);
    voice.set(s.key, v);
  }
});

test("every sentence said aloud has a recording", () => {
  const missing = LESSONS.flatMap(l => lessonSentences(l)).map(s => s.key).filter(k => !AUDIO[k]);
  assert.deepEqual(missing, [], "run tools/course_audio.py");
});

test("lessons still to come are not ones already written", () => {
  const titles = new Set(LESSONS.map(l => l.title.toLowerCase()));
  for (const list of Object.values(COMING)) for (const t of list) assert.ok(!titles.has(t.toLowerCase()), t);
});
