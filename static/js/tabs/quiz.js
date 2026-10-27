// Quiz: word→meaning, meaning→word, fill-in-the-blank, synonym/antonym, and
// for Bible names "Who or what is it?". A changed setting applies to the next
// quiz (or restarts at once, before the first answer).
// Wrong answers are logged and pushed back into today's review queue.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { filterBar, filterSources, fmtDuration, h, highlight, markOption, pageHead, reveal, showError, shuffle, smart, toast } from "../ui.js";
import { loadFilter, settings } from "../state.js";

const TYPES = [
  ["word_meaning", "Word → meaning"], ["meaning_word", "Meaning → word"], ["fill_blank", "Fill in the blank"],
  ["synonym", "Synonyms"], ["antonym", "Antonyms"], ["name_kind", "Bible names: who or what?"],
];
let enabled = new Set(TYPES.map(t => t[0]));
let qs = [];
let i = 0;
let score = 0;
let answered = false;
let started = 0;
let shownAt = 0;
let missed = [];
let els = {};
let filter = loadFilter("quiz");
let length = 10;
let finished = false;   // on the results screen
let token = 0;

/** A setting changed: restart now if nothing's been answered yet, else offer to. */
function changed() {
  if (!qs.length || finished || (i === 0 && !answered)) return start();
  toast("The new settings apply to your next quiz.", { action: ["Restart now", start] });
}

async function start() {
  const mine = ++token;
  try {
    const res = await api.get("/api/quiz", { ...filter, types: [...enabled].join(","), n: length });
    if (mine !== token) return;
    qs = res.questions;
    i = 0; score = 0; missed = []; started = Date.now(); finished = false;
    if (!qs.length) {
      els.stage.replaceChildren(h("div.panel.empty", h("h2", "No questions available"), h("p", "These words don't have enough content for the chosen question types yet. Try other types or filters.")));
      return;
    }
    show();
    if (qs.length < length) toast(`Only ${qs.length} question${qs.length === 1 ? "" : "s"} match these question types and filters.`);
  } catch (e) {
    els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't build a quiz"), h("p", e.message)));
  }
}

function show() {
  answered = false;
  shownAt = Date.now();
  const q = qs[i];
  const isWord = q.type === "word_meaning" || q.type === "name_kind" || q.type === "synonym" || q.type === "antonym";
  const opts = h("div.options", q.options.map((o, k) =>
    h("button.opt", { type: "button", "data-v": o, on: { click: () => answer(o) } }, h("span.key", { "aria-hidden": "true" }, String(k + 1)), h("span", smart(o)))));
  els.stage.replaceChildren(h("div.panel.q-card",
    h("div.score-line", h("span.tnum", `Question ${i + 1} of ${qs.length}`), h("span.tnum", `Score ${score}`)),
    h("p.q-ask", q.ask),
    h(`p.q-prompt${isWord ? ".is-word" : ""}`, { tabindex: "-1" }, smart(q.prompt)),
    opts,
    h("p.sr-only#quiz-verdict", { role: "alert" }),
    h("div#quiz-feedback")));
  els.opts = opts;
  els.stage.querySelector(".q-prompt").focus({ preventScroll: true });
}

async function answer(choice) {
  if (answered) return;
  answered = true;
  const q = qs[i];
  const ok = choice === q.answer;
  if (ok) score++; else missed.push(q);
  els.opts.querySelectorAll(".opt").forEach(b => markOption(b, b.dataset.v === q.answer, b.dataset.v === choice));
  const fb = document.getElementById("quiz-feedback");
  const play = h("button.btn", { type: "button", on: { click: () => playWord(q) } }, "Hear it ", h("kbd", { "aria-hidden": "true" }, "Space"));
  const nextBtn = h("button.btn.btn-primary", { type: "button", on: { click: next } }, i + 1 < qs.length ? "Next " : "See results ",
    h("kbd", { "aria-hidden": "true" }, "Enter"));
  // The meaning is said once; the answer is named only when it isn't the word or its meaning.
  const named = q.answer !== q.word && q.answer !== q.definition && !q.definition.includes(q.answer.replace(/…/g, ""));
  const verdict = ok ? "Correct." : named ? `Not quite. The answer is “${q.answer}”.` : `Not quite. The answer is “${q.word}”.`;
  document.getElementById("quiz-verdict").textContent = verdict;
  // The wrong pick, explained: the most useful moment to notice a difference.
  const why = !ok && q.explain && q.explain[choice];
  fb.replaceChildren(h(`div.feedback.${ok ? "ok" : "bad"}`,
    h("strong", ok ? "Correct" : named ? `Not quite. The answer is “${q.answer}”.` : "Not quite."),
    why ? h("p.chose", h("span.label", "You chose"), " ", smart(why)) : null,
    h("p", h("b.fb-word", q.word), " ",
      q.phonetic ? h("span.ipa", { lang: "en-fonipa" }, q.phonetic) : null, " — ", smart(q.definition)),
    q.example ? h("p.example", highlight(q.example, q.word)) : null,
    h("div.toolbar", play, h("a.btn.btn-quiet", { href: `#browse/${q.word_id}` }, "Open entry →"), nextBtn)));
  reveal(fb);
  nextBtn.focus({ preventScroll: true });
  if (settings.autoplay === "1") playWord(q);
  api.post("/api/answer", { word_id: q.word_id, mode: "quiz", correct: ok, ms: Date.now() - shownAt })
    .then(() => !ok && refreshDueCount()).catch(showError);
}

function next() {
  if (!answered) return;
  i++;
  if (i < qs.length) return show();
  const secs = (Date.now() - started) / 1000;
  api.post("/api/sessions", { kind: "quiz", score, total: qs.length, duration_s: Math.round(secs) }).catch(() => {});
  finished = true;
  results(secs);
}

function results(secs = (Date.now() - started) / 1000) {
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", "Quiz complete"),
    h("div.big-num.tnum", `${score}/${qs.length}`),
    h("p.muted", `${Math.round((100 * score) / qs.length)}% in ${fmtDuration(secs)}`),
    missed.length ? h("div.missed", h("p.label", "Added back to today's review"),
      h("ul", missed.map(q => h("li", h("a", { href: `#browse/${q.word_id}` }, q.word), " — ", smart(q.definition))))) : h("p", "No misses. Well done."),
    h("div.toolbar",
      h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Play again"),
      missed.length ? h("button.btn.btn-lg", { type: "button", on: { click: retryMisses } },
        `Retry the ${missed.length} miss${missed.length === 1 ? "" : "es"}`) : null)));
  els.stage.querySelector(".big-num").setAttribute("tabindex", "-1");
  els.stage.querySelector(".big-num").focus({ preventScroll: true });
}

/** The same questions you missed, options reshuffled. */
function retryMisses() {
  qs = shuffle(missed.map(q => ({ ...q, options: shuffle([...q.options]) })));
  i = 0; score = 0; missed = []; started = Date.now(); finished = false;
  show();
}

export async function render(root) {
  const src = await filterSources();
  const typeChips = h("div.toolbar", TYPES.map(([id, label]) => {
    const b = h("button.chip", { type: "button", "aria-pressed": String(enabled.has(id)) }, label);
    b.addEventListener("click", () => {
      if (enabled.has(id) && enabled.size === 1) return;
      enabled.has(id) ? enabled.delete(id) : enabled.add(id);
      b.setAttribute("aria-pressed", String(enabled.has(id)));
      changed();
    });
    return b;
  }));
  const len = h("select.input#quiz-length", { "aria-label": "Questions" }, [10, 20, 30].map(n => h("option", { value: n }, `${n} questions`)));
  len.value = String(length);
  len.addEventListener("change", () => { length = Number(len.value); changed(); });
  els.stage = h("div.q-wrap");
  root.append(
    pageHead("Quiz", "Multiple choice, fill-in-the-blank and synonym questions. Misses return to your review queue."),
    await filterBar(f => { filter = f; changed(); }, src, { tab: "quiz", extra: [
      h("div.field", h("label", { for: "quiz-length" }, "Length"), len),
      h("div.field.field-wide", h("label", "Question types"), typeChips)] }),
    els.stage);
  filter = loadFilter("quiz");
  // Back from "Open entry →" or a missed word returns to the same quiz.
  if (finished && qs.length) results();
  else if (qs.length && i < qs.length) { if (answered) next(); else show(); }
  else await start();
}

export function onKey(e) {
  if (!qs.length || i >= qs.length) return;
  if (/^[1-4]$/.test(e.key) && !answered) { e.preventDefault(); answer(qs[i].options[Number(e.key) - 1]); }
  else if (e.key === "Enter" && answered) { e.preventDefault(); next(); }
  // Only after answering: before, the sound would give the answer away.
  else if (e.key === " " && answered) { e.preventDefault(); playWord(qs[i]); }
}
