// Text helpers for the English course (no DOM, so tests and
// tools/course_audio.py can use them in Node): the lesson markup (**point**,
// *word*), what the voice reads for a sentence, and every sentence that has
// a recording.

/** "She **works** in *a* bank." → [{text, b}, {text, i}, …]: bold is the
 * point of an example, italic an English word being talked about. */
export function segments(s) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], b: true } : { text: m[2], i: true });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** The text without markup. */
export const plain = s => segments(s).map(x => x.text).join("");

/** What the voice reads: the sentence, or its `say` when written forms
 * ("9:00", "March 3rd") would be read wrong. */
export const spoken = (text, say) => (say || plain(text)).trim();

/** Every sentence a lesson says aloud: [{key, where}], key being the spoken
 * text (the recordings are kept by it, static/js/course-audio.js). */
export function lessonSentences(lesson) {
  const out = [];
  for (const e of lesson.examples || []) out.push({ key: spoken(e.t, e.say), where: "example" });
  for (const m of lesson.mistakes || []) {
    out.push({ key: spoken(m.bad, m.sayBad), where: "mistake", wrong: true });
    out.push({ key: spoken(m.good, m.sayGood), where: "mistake" });
  }
  for (const c of lesson.checks || []) if (c.say) out.push({ key: spoken(c.say), where: "check" });
  return out;
}

/** The course's progress, kept in this browser: the ids of finished lessons. */
export const DONE_KEY = "lexi-course-done";
export const LEVEL_KEY = "lexi-course-level";
