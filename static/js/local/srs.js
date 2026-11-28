// SM-2 spaced repetition for the website, the same as app/srs.py: pure
// functions; server.js keeps the cards. tests/fixtures/srs_vectors.json is
// checked against both (tests/js/srs.test.mjs, tests/test_practice_schedule.py).

const QUALITY = { 0: 1, 1: 3, 2: 4, 3: 5 };
const MIN_EASE = 1.3;
const LAPSE_EASE = 0.2;    // ease lost when a learned word is forgotten
const LAPSE_KEEP = 0.2;    // share of the interval a forgotten word keeps
const GOOD_PULL = 0.05;    // "Good" moves ease this share of the way back to 2.5

// Python's round(): halves go to the even number, so both apps schedule alike.
export function roundHalfEven(x) {
  const f = Math.floor(x);
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

const pad = n => String(n).padStart(2, "0");
/** The ISO date `days` after `day` (both "YYYY-MM-DD"). */
export function addDaysTo(day, days) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const daysBetween = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);

// ±5% on intervals over 3 days, so words learned together don't stay due together.
export function fuzz(interval, rand = Math.random) {
  if (interval <= 3) return interval;
  const spread = Math.max(1, roundHalfEven(interval * 0.05));
  return interval - spread + Math.floor(rand() * (2 * spread + 1));
}

/** One SM-2 step on `day`: a lapse keeps a fifth of the interval and comes
 *  back tomorrow; "Good" eases ease back toward 2.5; a late recall gets credit
 *  for the extra days; ±5% fuzz. Returns the card's new fields. */
export function schedule(card, grade, day, rand = Math.random) {
  const q = QUALITY[grade];
  let { ease, interval_days: interval, reps, lapses } = card;
  if (q < 3 && reps === 0 && lapses === 0 && !card.last_reviewed) {
    // A new word missed the first time it is seen isn't a lapse: it comes
    // back tomorrow without lowering its ease.
    return { ease, interval_days: 1, reps: 0, lapses: 0, due_date: addDaysTo(day, 1), last_reviewed: day };
  }
  if (q < 3) {
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - LAPSE_EASE);   // SM-2's own formula takes 0.54
    if (reps >= 2) { interval = Math.max(1, roundHalfEven(interval * LAPSE_KEEP)); reps = 2; }
    else { interval = 1; reps = 0; }
    return { ease: Math.round(ease * 1000) / 1000, interval_days: interval, reps, lapses,
             due_date: addDaysTo(day, 1), last_reviewed: day };
  }
  if (reps === 0) interval = grade === 1 ? 1 : (grade === 3 ? 4 : 1);
  else if (reps === 1) interval = grade === 1 ? 3 : (grade === 2 ? 6 : 8);
  else {
    const overdue = card.due_date ? Math.max(0, daysBetween(card.due_date, day)) : 0;
    const base = interval + { 1: 0, 2: overdue / 2, 3: overdue }[grade];
    const factor = { 1: 1.2, 2: ease, 3: ease * 1.3 }[grade];
    interval = fuzz(Math.max(interval + 1, roundHalfEven(base * factor)), rand);
  }
  reps += 1;
  ease = Math.max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (grade === 2) ease += GOOD_PULL * (2.5 - ease);
  return { ease: Math.round(ease * 1000) / 1000, interval_days: interval, reps, lapses,
           due_date: addDaysTo(day, Math.trunc(interval)), last_reviewed: day };
}

/**
 * What a practice answer does to a word's schedule (app/srs.py
 * practice_grade): the grade to apply, or null to only log it.
 * - Right, for a word not due yet (practiced early): nothing, or drilling a
 *   list every day would push it years out.
 * - Already scheduled today: nothing more, except a miss after a right
 *   answer, which turns the day's Good into Again. Answers never compound.
 * - Otherwise right is Good (2), wrong is Again (0).
 * `todayGrade` is the grade already applied today, `day` today's date.
 */
export function practiceGrade(card, correct, todayGrade, day) {
  if (card && card.last_reviewed === day) return !correct && todayGrade === 2 ? 0 : null;
  if (correct && card && card.last_reviewed && card.due_date > day) return null;
  return correct ? 2 : 0;
}
