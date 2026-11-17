// English course: grammar lessons for American English (static/js/
// course-lessons.js), by level. #course lists them; #course/<id> opens one:
// a banner (what it's about, what you'll learn, the key idea), then numbered
// parts: the rule, a table, examples and a conversation to hear, mistakes,
// a tip and a fun fact, and questions to check yourself (some by ear). On a
// wide screen a guide beside the lesson jumps to each part. Progress and the
// chosen level stay in this browser.

import { playSound, stopAudio } from "../audio.js";
import { AUDIO } from "../course-audio.js";
import { COMING, LESSONS, LEVELS as COURSE_LEVELS } from "../course-lessons.js";
import { DONE_KEY, lessonSentences, LEVEL_KEY, plain, segments, spoken } from "../course-text.js";
import { h, PLAY_SVG, termLink } from "../ui.js";

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
const doneSet = () => { try { return new Set(JSON.parse(read(DONE_KEY, "[]"))); } catch (e) { return new Set(); } };
function markDone(id) {
  const s = doneSet();
  s.add(id);
  write(DONE_KEY, JSON.stringify([...s]));
}

const levelOf = id => COURSE_LEVELS.find(l => l.id === id);
const RECORDINGS = Object.keys(AUDIO).length;
const QUESTIONS = LESSONS.reduce((n, l) => n + l.checks.length, 0);

/** Lesson text with its markup: the point of an example in bold, an
 * English word being talked about in italics; "___" as a gap. */
function rich(s) {
  return segments(s).map(x => x.b ? h("strong.c-point", x.text) : x.i ? h("em.c-word", x.text)
    : x.text.split(/(___)/).map(t => t === "___" ? h("span.c-gap", { "aria-label": "blank" }, "   ") : t));
}

/** A play button for one sentence (its recording; the device's voice if
 * there is none). `btn.play()` plays it and resolves when it ends. */
function sayButton(text, label = text) {
  const file = AUDIO[text];
  const btn = h("button.play.sm.synth", { type: "button", title: "Play", "aria-label": `Play: ${label}`, html: PLAY_SVG });
  btn.play = () => playSound(file ? `media/${file}` : null, btn, text);
  btn.addEventListener("click", e => { e.stopPropagation(); btn.play(); });
  return btn;
}

/** "Play all": the rows' sentences one after another, the row being said
 * lit; a second press stops. */
function playAll(rows, label = "Play all") {
  let run = 0;
  const text = h("span.lbl", label);
  const btn = h("button.btn.course-playall", { type: "button" }, h("span.pa-icon", { html: PLAY_SVG, "aria-hidden": "true" }), text);
  const reset = () => { btn.classList.remove("on"); text.textContent = label; rows.forEach(r => r.row.classList.remove("speaking")); };
  btn.addEventListener("click", async () => {
    if (btn.classList.contains("on")) { run++; stopAudio(); reset(); return; }
    const mine = ++run;
    btn.classList.add("on");
    text.textContent = "Stop";
    for (const r of rows) {
      if (mine !== run) return;
      rows.forEach(x => x.row.classList.toggle("speaking", x === r));
      await r.btn.play();
      if (mine !== run) return;
      await new Promise(ok => setTimeout(ok, 350));
    }
    if (mine === run) reset();
  });
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
  const select = h("select.input#course-level", { on: { change: e => {
    write(LEVEL_KEY, e.target.value);
    root.replaceChildren(...listView(root));
    root.querySelector("#course-level")?.focus();
  } } },
    h("option", { value: "" }, "All levels"),
    COURSE_LEVELS.map(l => h("option", { value: l.id }, `${l.name} (${l.cefr})`)));
  select.value = COURSE_LEVELS.some(l => l.id === pick) ? pick : "";
  const levels = COURSE_LEVELS.filter(l => !select.value || l.id === select.value);
  const n = LESSONS.filter(l => done.has(l.id)).length;
  const next = LESSONS.find(l => !done.has(l.id));
  return [
    h("header.course-banner",
      h("div.course-banner-text",
        h("p.course-kicker", "LexiMaster"),
        h("h1", "English course"),
        h("p.course-banner-sub", "Grammar for American English, one short lesson at a time. Hear every example, listen to everyday conversations, and check yourself as you go."),
        h("ul.course-stats", { "aria-label": "In the course" },
          h("li", h("strong", String(LESSONS.length)), " lessons"),
          h("li", h("strong", QUESTIONS.toLocaleString("en-US")), " questions"),
          h("li", h("strong", RECORDINGS.toLocaleString("en-US")), " recordings"),
          h("li", h("strong", "3"), " levels"))),
      h("div.course-banner-side",
        h("label.course-level-pick", { for: "course-level" }, h("span", "Course level"), select),
        h("div.course-progress", { role: "status" },
          h("span.course-bar", { "aria-hidden": "true" }, h("span", { style: { width: `${(100 * n) / LESSONS.length}%` } })),
          h("span", `${n} of ${LESSONS.length} lessons done`)),
        next ? h("a.btn.btn-primary.course-continue", { href: `#course/${next.id}` }, `${n ? "Continue" : "Start"}: ${next.title}`) : null)),
    ...levels.map(level => levelBlock(level, done)),
  ];
}

function levelBlock(level, done) {
  const lessons = LESSONS.filter(l => l.level === level.id);
  const units = [...new Set(lessons.map(l => l.unit))];
  return h(`section.course-level.lv-${level.id}`, { "aria-labelledby": `lv-${level.id}` },
    h("div.course-level-head",
      h("h2", { id: `lv-${level.id}` }, level.name), h("span.cefr", `CEFR ${level.cefr}`),
      h("span.course-level-count", `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`)),
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
            h("span.course-item-key", plain(l.key)),
            h("span.course-item-meta", `${l.checks.length} questions · ${lessonSentences(l).length} recordings${l.dialogue ? " · a conversation" : ""}`)),
          isDone ? h("span.sr-only", " (done)") : null));
      })))),
    lessons.length ? null : h("p.course-empty", "The first lessons at this level are being written."),
    COMING[level.id]?.length ? h("details.course-coming",
      h("summary", `Coming later: ${COMING[level.id].length} more lessons`),
      h("ul", COMING[level.id].map(t => h("li", t)))) : null);
}

// ------------------------------------------------------------ a lesson

/** One numbered part of a lesson, in its own color. */
function section(kind, num, title, lead, tools, ...body) {
  return h(`section.cs.cs-${kind}`, { id: `cs-${kind}`, "aria-labelledby": `cs-${kind}-h` },
    h("header.cs-head",
      h("span.cs-num", { "aria-hidden": "true" }, String(num)),
      h("div.cs-titles", h("h2", { id: `cs-${kind}-h` }, title), lead ? h("p.cs-lead", lead) : null),
      tools || null),
    ...body);
}

/** Example sentences, each with its play button. */
function exampleRows(items) {
  return items.map(e => {
    const btn = sayButton(spoken(e.t, e.say), plain(e.t));
    const row = h("li", btn, h("span.cs-sentence", rich(e.t)), e.note ? h("span.cs-note-chip", e.note) : null);
    return { btn, row };
  });
}

const CARDS = { tip: "Remember", fact: "Did you know?", myth: "Myth", us: "Good to know" };

function lessonView(lesson) {
  const level = levelOf(lesson.level);
  const i = LESSONS.indexOf(lesson);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  let n = 0;
  const parts = [];

  parts.push(section("rule", ++n, "The rule", null, null, h("div.cs-rule-body", lesson.rule.map(p => h("p", rich(p))))));

  if (lesson.compare) parts.push(section("compare", ++n, "Compare", "Read across each row.", null,
    h("div.cs-table-wrap", h("table.cs-table",
      h("thead", h("tr", lesson.compare.head.map(c => h("th", { scope: "col" }, c)))),
      h("tbody", lesson.compare.rows.map(r => h("tr", r.map((c, k) => k === 0 ? h("th", { scope: "row" }, rich(c)) : h("td", rich(c))))))))));

  // Examples: the core ones, then the groups.
  const core = exampleRows(lesson.examples.filter(e => !e.group));
  const groups = [...new Set(lesson.examples.filter(e => e.group).map(e => e.group))]
    .map(g => ({ g, rows: exampleRows(lesson.examples.filter(e => e.group === g)) }));
  parts.push(section("examples", ++n, "Examples", "Tap ▶ to hear one, or play them all.", playAll([...core, ...groups.flatMap(x => x.rows)]),
    h("ul.cs-examples", core.map(r => r.row)),
    groups.map(({ g, rows }) => h("div.cs-group", h("h3.cs-group-title", rich(g)), h("ul.cs-examples", rows.map(r => r.row))))));

  if (lesson.dialogue?.length) {
    const names = [...new Set(lesson.dialogue.map(d => d.name))];
    const rows = lesson.dialogue.map(d => {
      const btn = sayButton(spoken(d.t), `${d.name}: ${plain(d.t)}`);
      const row = h(`li.cs-line.who-${d.who}`,
        h("span.cs-avatar", { "aria-hidden": "true" }, d.name[0]),
        h("div.cs-bubble", h("span.cs-speaker", d.name), h("p", rich(d.t))), btn);
      return { btn, row };
    });
    parts.push(section("dialogue", ++n, "Conversation", `${names.join(" and ")} are talking. Play the whole conversation, then read it again.`,
      playAll(rows, "Play conversation"), h("ol.cs-dialogue", rows.map(r => r.row))));
  }

  parts.push(section("mistakes", ++n, "Common mistakes", "Hear the wrong sentence, then the right one.", null,
    h("ul.cs-mistakes", lesson.mistakes.map(m => h("li",
      h("div.cs-pair",
        h("div.cs-bad", h("span.cs-sign", { "aria-label": "Wrong" }, "✗"), sayButton(spoken(m.bad, m.sayBad), m.bad), h("s", m.bad)),
        h("div.cs-good", h("span.cs-sign", { "aria-label": "Right" }, "✓"), sayButton(spoken(m.good, m.sayGood), m.good), h("span", m.good))),
      h("p.cs-why", rich(m.note)))))));

  const cards = ["tip", "fact", "myth", "us"].map(k => [k, k === "us" ? lesson.note : lesson[k]]).filter(([, t]) => t);
  if (cards.length) parts.push(h("div.cs-cards", { id: "cs-notes", "data-title": "Tip and fun fact" }, cards.map(([kind, text]) =>
    h(`aside.cs-card.card-${kind}`, { "aria-label": CARDS[kind] },
      h("h2.cs-card-title", h("span.cs-card-icon", { "aria-hidden": "true" }), CARDS[kind]), h("p", rich(text))))));

  parts.push(checks(lesson, ++n));

  const toc = h("nav.course-toc", { "aria-label": "On this page" },
    h("p.course-toc-title", "On this page"),
    h("ol", parts.map(p => {
      const kind = p.id.replace("cs-", "");
      const title = p.dataset.title || p.querySelector("h2")?.textContent;
      return h("li", h(`button.course-toc-link.toc-${kind}`, { type: "button",
        on: { click: () => p.scrollIntoView({ behavior: "smooth", block: "start" }) } }, title));
    })));

  return h(`div.course-page.lv-${lesson.level}`,
    h("article.course-lesson",
      h("a.course-back", { href: "#course" }, "← All lessons"),
      h("header.course-hero",
        h("p.course-eyebrow", h("span.cefr", `${level.name} · ${lesson.tag || level.cefr}`), h("span", lesson.unit)),
        h("p.course-lesson-no", `Lesson ${i + 1}`, h("span", ` of ${LESSONS.length}`)),
        h("h1", lesson.title),
        lesson.intro ? h("p.course-intro", rich(lesson.intro)) : null,
        lesson.learn?.length ? h("div.course-learn", h("p.course-learn-title", "In this lesson you will"),
          h("ul", lesson.learn.map(x => h("li", h("span", rich(x)))))) : null,
        h("div.course-key", { role: "note" }, h("span.course-key-label", "Key idea"), h("p", rich(lesson.key)))),
      ...parts,
      lesson.words?.length ? h("div.course-words", h("span.related-label", "Look up in the dictionary"), h("div.tags", lesson.words.map(w => termLink(w)))) : null,
      h("nav.course-pager", { "aria-label": "Lessons" },
        prev ? h("a.course-pager-link.prev", { href: `#course/${prev.id}` }, h("span", "← Previous"), h("strong", prev.title)) : h("span"),
        next ? h("a.course-pager-link.next", { href: `#course/${next.id}` }, h("span", "Next →"), h("strong", next.title))
          : h("a.course-pager-link.next", { href: "#course" }, h("span", "Done"), h("strong", "All lessons")))),
    toc);
}

/** A copy of the list in random order (Fisher–Yates). */
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

/** The questions: pick an answer, see right or wrong and why. When all are
 * answered, a score card, and the lesson counts as done. */
function checks(lesson, num) {
  const total = lesson.checks.length;
  let answered = 0, right = 0;
  const counter = h("span.cs-counter", { "aria-live": "polite" }, `0 of ${total} answered`);
  const result = h("div.cs-result", { role: "status", hidden: true });
  const box = section("check", num, "Check yourself",
    `${total} questions.${lesson.checks.some(c => c.say) ? " Questions with ▶ are for listening: play the sentence first." : ""}`,
    counter,
    h("ol.cs-questions", lesson.checks.map((c, k) => {
      const feedback = h("p.cs-feedback", { hidden: true });
      // Shown in a fresh order each time, so where the answer sits gives nothing away.
      const order = shuffled(c.choices.map((_, j) => j));
      const choices = order.map(j => h("button.cs-choice", { type: "button", on: { click: () => {
        if (li.dataset.done) return;
        li.dataset.done = "1";
        const ok = j === c.answer;
        answered++; right += ok;
        li.classList.add(ok ? "is-right" : "is-wrong");
        counter.textContent = `${answered} of ${total} answered · ${right} right`;
        choices.forEach((b, x) => {
          b.disabled = true;
          if (order[x] === c.answer) b.classList.add("right");
          else if (order[x] === j) b.classList.add("wrong");
        });
        feedback.hidden = false;
        feedback.className = `cs-feedback ${ok ? "ok" : "no"}`;
        feedback.replaceChildren(h("strong", ok ? "Right. " : `The answer is “${c.choices[c.answer]}”. `), ...rich(c.why));
        if (answered === total) finish();
      } } }, c.choices[j]));
      const li = h("li.cs-q",
        h("div.cs-q-text", h("span.cs-q-num", String(k + 1)), c.say ? sayButton(spoken(c.say), "the sentence") : null, h("span", rich(c.q))),
        h("div.cs-choices", { role: "group", "aria-label": `Question ${k + 1}` }, choices),
        feedback);
      return li;
    })),
    result);
  function finish() {
    markDone(lesson.id);
    const pct = Math.round((100 * right) / total);
    const msg = pct === 100 ? "Perfect score!" : pct >= 80 ? "Great work." : pct >= 50 ? "Good start. Read the rule again and try once more."
      : "Go back over the rule and the examples, then try again.";
    result.hidden = false;
    result.className = `cs-result ${pct >= 80 ? "good" : "more"}`;
    result.replaceChildren(
      h("div.cs-ring", { style: `--pct: ${pct}`, "aria-hidden": "true" }, h("span", `${pct}%`)),
      h("div.cs-result-text", h("p.cs-result-score", `You got ${right} of ${total} right.`), h("p.cs-result-msg", msg),
        h("button.btn", { type: "button", on: { click: () => {
          const fresh = checks(lesson, num);
          box.replaceWith(fresh);
          fresh.scrollIntoView({ block: "start" });
        } } }, "Try again")));
  }
  return box;
}
