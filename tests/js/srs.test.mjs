// The website's scheduler (static/js/local/srs.js) against the cases in
// tests/fixtures/srs_vectors.json, which app/srs.py passes too
// (tests/test_practice_schedule.py): both apps schedule words alike.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { practiceGrade, schedule } from "../../static/js/local/srs.js";

const V = JSON.parse(readFileSync(new URL("../fixtures/srs_vectors.json", import.meta.url), "utf8"));

for (const c of V.practice) {
  test(`practice: ${c.name}`, () => {
    assert.equal(practiceGrade(c.card, c.correct, c.today_grade, V.day), c.expect);
  });
}

for (const c of V.schedule) {
  test(`schedule: ${c.name}`, () => {
    assert.deepEqual(schedule(c.card, c.grade, V.day, () => 0.5), c.expect);   // 0.5: no fuzz
  });
}

test("drilling a list every day doesn't push it years out", () => {
  // Answer right every day for 60 days: only answers on due days count.
  let card = null;
  for (let d = 0; d < 60; d++) {
    const day = new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10);
    const g = practiceGrade(card, true, null, day);
    if (g !== null) card = schedule(card || { ease: 2.5, interval_days: 0, reps: 0, lapses: 0, due_date: day, last_reviewed: null }, g, day, () => 0.5);
  }
  assert.ok(card.interval_days < 120, `interval ${card.interval_days}`);
});
