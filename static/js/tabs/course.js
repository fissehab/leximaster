// English course: grammar lessons for American English (static/js/
// course-lessons.js), by level. #course lists them; #course/<id> opens one:
// the key idea, the rule, a table to compare, examples and mistakes to hear,
// and questions to check yourself (some by ear). Progress and the chosen
// level stay in this browser.

import { playSound } from "../audio.js";
import { AUDIO } from "../course-audio.js";
import { COMING, LESSONS, LEVELS as COURSE_LEVELS } from "../course-lessons.js";
import { DONE_KEY, LEVEL_KEY, plain, segments, spoken } from "../course-text.js";
import { h, pageHead, PLAY_SVG, termLink } from "../ui.js";

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
const doneSet = () => { try { return new Set(JSON.parse(read(DONE_KEY, "[]"))); } catch (e) { return new Set(); } };
function markDone(id) {
  const s = doneSet();
  s.add(id);
  write(DONE_KEY, JSON.stringify([...s]));
}

const levelOf = id => COURSE_LEVELS.find(l => l.id === id);

/** Lesson text with its markup: the point of an example in bold, an
 * English word being talked about in italics; "___" as a gap. */
function rich(s) {
  return segments(s).map(x => x.b ? h("strong.c-point", x.text) : x.i ? h("em.c-word", x.text)
    : x.text.split(/(___)/).map(t => t === "___" ? h("span.c-gap", { "aria-label": "blank" }, "   ") : t));
}

/** A play button for one sentence of the lesson (its recording; the
 * device's voice if there is none). */
function sayButton(text, label = text) {
  const file = AUDIO[text];
  const btn = h("button.play.sm.synth", { type: "button", title: "Play", "aria-label": `Play: ${label}`, html: PLAY_SVG });
  btn.addEventListener("click", e => { e.stopPropagation(); playSound(file ? `media/${file}` : null, btn, text); });
  return btn;
}

export async function render(root, { param } = {}) {
  const lesson = LESSONS.find(l => l.id === param);
  if (lesson) root.append(lessonView(lesson));
  else root.append(...listView(root));
  root.closest("main")?.scrollTo?.(0, 0);
}

// ------------------------------------------------------------ the list

function listView(root) {
  const done = doneSet();
  const pick = read(LEVEL_KEY, "");
  const select = h("select.input#course-level", { "aria-label": "Course level", on: { change: e => {
    write(LEVEL_KEY, e.target.value);
    root.replaceChildren(...listView(root));
    root.querySelector("#course-level")?.focus();
  } } },
    h("option", { value: "" }, "All levels"),
    COURSE_LEVELS.map(l => h("option", { value: l.id }, `${l.name} (${l.cefr})`)));
  select.value = COURSE_LEVELS.some(l => l.id === pick) ? pick : "";
  const levels = COURSE_LEVELS.filter(l => !select.value || l.id === select.value);
  const n = LESSONS.filter(l => done.has(l.id)).length;
  return [
    pageHead("English course",
      "Grammar for American English, one short lesson at a time. Every example has a recording, and each lesson ends with questions to check yourself.",
      h("label.course-level-pick", { for: "course-level" }, h("span", "Course level"), select)),
    h("p.course-progress", { role: "status" },
      h("span.course-bar", { "aria-hidden": "true" }, h("span", { style: { width: `${(100 * n) / LESSONS.length}%` } })),
      `${n} of ${LESSONS.length} lessons done`),
    ...levels.map(level => levelBlock(level, done)),
  ];
}

function levelBlock(level, done) {
  const lessons = LESSONS.filter(l => l.level === level.id);
  const units = [...new Set(lessons.map(l => l.unit))];
  return h(`section.course-level.lv-${level.id}`, { "aria-labelledby": `lv-${level.id}` },
    h("div.course-level-head",
      h("h2", { id: `lv-${level.id}` }, level.name), h("span.cefr", `CEFR ${level.cefr}`)),
    h("p.course-goal", level.goal),
    units.map(unit => h("div.course-unit",
      h("h3.course-unit-title", unit),
      h("ol.course-list", lessons.filter(l => l.unit === unit).map(l => {
        const num = LESSONS.indexOf(l) + 1;
        const isDone = done.has(l.id);
        return h("li", h(`a.course-item${isDone ? ".done" : ""}`, { href: `#course/${l.id}` },
          h("span.course-num", { "aria-hidden": "true" }, isDone ? "✓" : String(num)),
          h("span.course-item-text",
            h("strong", l.title, l.tag ? h("span.course-tag", l.tag) : null),
            h("span.course-item-key", plain(l.key))),
          isDone ? h("span.sr-only", " (done)") : null));
      })))),
    lessons.length ? null : h("p.course-empty", "The first lessons at this level are being written."),
    COMING[level.id]?.length ? h("details.course-coming",
      h("summary", `Coming later: ${COMING[level.id].length} more lessons`),
      h("ul", COMING[level.id].map(t => h("li", t)))) : null);
}

// ------------------------------------------------------------ a lesson

function section(kind, title, lead, ...body) {
  return h(`section.cs.cs-${kind}`, { "aria-label": title },
    h("header.cs-head", h("span.cs-mark", { "aria-hidden": "true" }), h("h2", title)),
    lead ? h("p.cs-lead", lead) : null,
    ...body);
}

function lessonView(lesson) {
  const level = levelOf(lesson.level);
  const i = LESSONS.indexOf(lesson);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  // h() skips the parts a lesson doesn't have (no myth, no note).
  return h(`article.course-lesson.lv-${lesson.level}`,
    h("a.course-back", { href: "#course" }, "← All lessons"),
    h("header.course-hero",
      h("p.course-eyebrow", h("span.cefr", `${level.name} · ${lesson.tag || level.cefr}`),
        h("span", `${lesson.unit} · Lesson ${i + 1} of ${LESSONS.length}`)),
      h("h1", lesson.title),
      h("div.course-key", { role: "note" }, h("span.course-key-label", "Key idea"), h("p", rich(lesson.key)))),
    section("rule", "The rule", null, h("div.cs-rule-body", lesson.rule.map(p => h("p", rich(p))))),
    lesson.compare ? section("compare", "Compare", "Read across each row.",
      h("div.cs-table-wrap", h("table.cs-table",
        h("thead", h("tr", lesson.compare.head.map(c => h("th", { scope: "col" }, c)))),
        h("tbody", lesson.compare.rows.map(r => h("tr", r.map((c, n) => n === 0 ? h("th", { scope: "row" }, rich(c)) : h("td", rich(c))))))))) : null,
    section("examples", "Examples", "Tap ▶ to hear each one.",
      h("ul.cs-examples", lesson.examples.map(e => h("li",
        sayButton(spoken(e.t, e.say), e.t.replace(/\*/g, "")),
        h("span.cs-sentence", rich(e.t)),
        e.note ? h("span.cs-note-chip", e.note) : null)))),
    section("mistakes", "Common mistakes", "Hear the wrong sentence, then the right one.",
      h("ul.cs-mistakes", lesson.mistakes.map(m => h("li",
        h("div.cs-pair",
          h("div.cs-bad", h("span.cs-sign", { "aria-label": "Wrong" }, "✗"), sayButton(spoken(m.bad, m.sayBad), m.bad), h("s", m.bad)),
          h("div.cs-good", h("span.cs-sign", { "aria-label": "Right" }, "✓"), sayButton(spoken(m.good, m.sayGood), m.good), h("span", m.good))),
        h("p.cs-why", rich(m.note)))))),
    lesson.myth ? section("myth", "Myth", null, h("p", rich(lesson.myth))) : null,
    lesson.note ? section("us", "Good to know", null, h("p", rich(lesson.note))) : null,
    checks(lesson),
    lesson.words?.length ? h("div.course-words", h("span.related-label", "Look up"), h("div.tags", lesson.words.map(w => termLink(w)))) : null,
    h("nav.course-pager", { "aria-label": "Lessons" },
      prev ? h("a.course-pager-link.prev", { href: `#course/${prev.id}` }, h("span", "← Previous"), h("strong", prev.title)) : h("span"),
      next ? h("a.course-pager-link.next", { href: `#course/${next.id}` }, h("span", "Next →"), h("strong", next.title)) : h("a.course-pager-link.next", { href: "#course" }, h("span", "Done"), h("strong", "All lessons"))));
}

/** The questions: pick an answer, see right or wrong and why. When all are
 * answered, the score, and the lesson counts as done. */
function checks(lesson) {
  const total = lesson.checks.length;
  let answered = 0, right = 0;
  const result = h("p.cs-score", { role: "status", hidden: true });
  const again = h("button.btn", { type: "button", hidden: true, on: { click: () => box.replaceWith(checks(lesson)) } }, "Try again");
  const box = section("check", "Check yourself",
    `${total} questions.${lesson.checks.some(c => c.say) ? " Questions with ▶ are for listening: play the sentence first." : ""}`,
    h("ol.cs-questions", lesson.checks.map((c, n) => {
      const feedback = h("p.cs-feedback", { hidden: true, "aria-live": "polite" });
      const choices = c.choices.map((label, k) => h("button.cs-choice", { type: "button", on: { click: () => {
        if (li.dataset.done) return;
        li.dataset.done = "1";
        const ok = k === c.answer;
        answered++; right += ok;
        choices.forEach((b, j) => {
          b.disabled = true;
          if (j === c.answer) b.classList.add("right");
          else if (j === k) b.classList.add("wrong");
        });
        feedback.hidden = false;
        feedback.className = `cs-feedback ${ok ? "ok" : "no"}`;
        feedback.replaceChildren(h("strong", ok ? "Right. " : `The answer is “${c.choices[c.answer]}”. `), ...rich(c.why));
        if (answered === total) {
          result.hidden = false;
          result.classList.toggle("perfect", right === total);
          result.textContent = `You got ${right} of ${total} right.${right === total ? " Well done!" : ""}`;
          again.hidden = false;
          markDone(lesson.id);
        }
      } } }, label));
      const li = h("li.cs-q",
        h("div.cs-q-text", c.say ? sayButton(spoken(c.say), "the sentence") : null, h("span", rich(c.q))),
        h("div.cs-choices", { role: "group", "aria-label": `Question ${n + 1}` }, choices),
        feedback);
      return li;
    })),
    h("div.cs-end", result, again));
  return box;
}
