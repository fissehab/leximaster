// Daily review: SM-2 queue sized to the session target. Due cards are graded
// Again/Hard/Good/Easy; a new word is Show again, Got it, or Know it (known
// words leave the review).
//
// Cards are asked two ways: word → meaning, and, once a word has been seen a
// few times, meaning → word (recall the word itself, the harder and more
// useful direction for speaking and writing). A new word gets a second look
// a few cards later, asked the other way round. The session (queue,
// position, second looks) is kept for the day, so leaving the tab and coming
// back resumes it; the last grade can be undone.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { setStudyFocus, settings, studyFocus } from "../state.js";
import { SCOPES, fmtDuration, h, highlight, icon, levelPicker, levelsText, pageHead, playButton, renderEntry, setKnown, showError, smart, toast } from "../ui.js";

let queue = [];
let pos = 0;
let total = 0;
let revealed = false;
let shownAt = 0;
let sessionStart = 0;
let els = {};
let busy = false;
let posted = false;
let lastGrade = null;   // { w, at, body, previous } for Undo
let levelShort = false; // the chosen word levels ran out of new words
let live = () => true;
let track = studyFocus();
const GRADES = [["again", "Again", "forgot"], ["hard", "Hard", "struggled"], ["good", "Good", "recalled"], ["easy", "Easy", "instant"]];
const AGAIN_GAP = 5;    // an "Again" card comes back at least this many cards later
const CHECK_GAP = 6;    // a new word's second look

// ------------------------------------------------------------ session memory

const SAVE_KEY = "lexi-review-session";
const today = () => new Date().toDateString();
function saveSession() {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ day: today(), track, queue, pos, total, sessionStart }));
  } catch (e) { /* storage full or unavailable: the session just won't resume */ }
}
function restoreSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null");
    if (!s || s.day !== today() || s.track !== track || !(s.pos < s.queue.length)) return false;
    ({ queue, pos, total, sessionStart } = s);
    return true;
  } catch (e) { return false; }
}
function clearSession() {
  try { sessionStorage.removeItem(SAVE_KEY); } catch (e) { /* unavailable */ }
}

async function load(extra = 0) {
  const res = await api.get("/api/review/queue", { extra, track });
  if (!live()) return;
  queue = res.queue;
  levelShort = !!res.level_short;
  pos = 0;
  total = queue.length;
  sessionStart = Date.now();
  posted = false;
  lastGrade = null;
  show();
}

function progress() {
  const pct = total ? (pos / total) * 100 : 100;
  els.bar.style.width = `${pct}%`;
  els.count.textContent = `${pos} / ${total}`;
  els.undo.hidden = !lastGrade;
}

// ------------------------------------------------------------ the card front

/** Meaning → word, from the third review on, every other time. */
const asksForWord = w => !w.is_new && (w.check || (w.srs && w.srs.reps >= 2 && (w.srs.reps + w.id) % 2 === 0));

function definitionOf(w) {
  const n = w.nuance || {};
  return (n.core && n.core.definition) || w.def || "";
}
function masked(w, text) {
  const words = w.word.split(/\s+/).filter(x => x.length > 2).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return words.length ? text.replace(new RegExp(`\\b(${words.join("|")})[a-z]{0,4}\\b`, "gi"), "…") : text;
}
/** One example with the word blanked out, if one uses it plainly. */
function cloze(w) {
  const n = w.nuance || {};
  const ex = n.examples || {};
  const sentences = [...(w.conversation || []).map(c => c.text), ex.professional, ex.everyday, ex.analytical].filter(Boolean);
  for (const s of sentences) {
    const parts = highlight(s, w.word);
    if (parts.length === 3) return [parts[0], h("span.blank", { "aria-label": "blank" }, "_____"), parts[2]];
  }
  return null;
}

let typed = null;   // the answer field on a meaning → word card

function show() {
  revealed = false;
  typed = null;
  progress();
  if (pos >= queue.length) return done();
  saveSession();
  const w = queue[pos];
  shownAt = Date.now();
  els.root.classList.add("in-session");
  let front;
  if (asksForWord(w)) {
    const blank = cloze(w);
    typed = h("input.input.answer-input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
      "aria-label": "The word (optional)", placeholder: "Type the word, or just say it…" });
    typed.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); reveal(); }
      e.stopPropagation();
    });
    front = h("div.panel.card.card-front.ask-word",
      h("span.new-badge", w.check ? "Second look" : "Recall the word"),
      h("p.ask-def", { tabindex: "-1" }, smart(masked(w, definitionOf(w)))),
      blank ? h("p.example.ask-cloze", blank) : null,
      typed,
      h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: reveal } }, "Reveal ", h("kbd", "Enter")));
  } else {
    front = h("div.panel.card.card-front",
      w.is_new ? h("span.new-badge", "New word") : null,
      // A new word can be heard before the answer (a play button too, for
      // phones that block sound until a tap).
      w.is_new ? h("div.entry-top", h("h2.headword", { tabindex: "-1" }, w.word), playButton(w))
        : h("h2.headword", { tabindex: "-1" }, w.word),
      h("p.muted", w.is_new ? "A new word. Read it, listen, then reveal the meaning." : "Recall the meaning and say it aloud, then reveal."),
      h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: reveal } }, "Reveal ", h("kbd", "Enter")));
  }
  els.stage.replaceChildren(front);
  els.status.textContent = `Card ${pos + 1} of ${total}. ${asksForWord(w) ? "Recall the word for this meaning." : w.word}`;
  (typed && !matchMedia("(hover: none)").matches ? typed : front.querySelector("[tabindex='-1']")).focus({ preventScroll: true });
  if (!asksForWord(w) && w.is_new && settings.autoplay === "1") playWord(w, front.querySelector(".play"));
}

// ------------------------------------------------------------ grading

/** The answers offered for the card on screen: [class, label, hint, action]. */
function choices(w) {
  if (w.repeat) {
    return [["again", "Show again", "once more", () => grade(0)], ["good", "Got it", "done for today", () => grade(2)]];
  }
  if (w.is_new) {
    return [["again", "Show again", "later today", () => grade(0)], ["good", "Got it", "see it again soon", () => grade(2)],
            ["easy.for-good", "Know it", "for good", () => knowIt()]];
  }
  return GRADES.map(([cls, label, hint], i) => [cls, label, hint, () => grade(i)]);
}

const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
/** Close enough: the word, or one slip in a long word. */
function sameWord(a, b) {
  a = norm(a); b = norm(b);
  if (!a) return null;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || b.length < 6) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

function reveal() {
  if (revealed || pos >= queue.length) return;
  revealed = true;
  const w = queue[pos];
  const answer = typed ? typed.value.trim() : "";
  const verdict = typed ? sameWord(answer, w.word) : null;
  const buttons = h(`div.grade-row.n${choices(w).length}`, choices(w).map(([cls, label, hint, act], i) =>
    h(`button.grade.${cls}`, { type: "button", on: { click: act } },
      h("span", label, " ", h("kbd", { "aria-hidden": "true" }, String(i + 1))), h("small", hint))));
  const card = h("div.panel.card", renderEntry(w, { mode: "card" }));
  if (verdict !== null) {
    card.prepend(h(`p.typed-check.${verdict ? "ok" : "bad"}`, verdict
      ? [icon("check"), ` You wrote “${answer}”.`]
      : `You wrote “${answer}”. The word is “${w.word}”.`));
  }
  const fullBtn = h("button.btn.btn-quiet.full-entry", { type: "button", on: { click: () => {
    card.replaceChildren(renderEntry(w));
    fullBtn.remove();
  } } }, "Full entry");
  card.append(fullBtn);
  const prompt = w.repeat ? "Second look." : w.is_new ? "New word. Did it stick?" : "How well did you remember it?";
  // The buttons stay pinned to the bottom of the screen, however long the
  // entry is, so the way to the next word is always in view.
  els.stage.replaceChildren(card, h("div.grade-dock", h("p.grade-prompt", prompt), buttons));
  els.status.textContent = `${w.word}. ${verdict === null ? "" : verdict ? "You wrote it right. " : "Not the word you wrote. "}${prompt}`;
  const head = card.querySelector(".headword");
  if (head) { head.tabIndex = -1; head.focus({ preventScroll: true }); }
  if (settings.autoplay === "1") playWord(w, els.stage.querySelector(".play"));
}

/** Put a card back into the session `gap` cards from now (or last). */
function insertLater(card, gap) {
  queue.splice(Math.min(queue.length, pos + 1 + gap), 0, card);
  total++;
}

async function knowIt() {
  if (busy || !revealed) return;
  busy = true;
  const w = queue[pos];
  try {
    await setKnown(w, true, { quiet: true });
    pos++;
    lastGrade = null;
    show();
    refreshDueCount();
    toast(`“${w.word}” won't come up again.`, { action: ["Undo", async () => {
      await setKnown(w, false, { quiet: true });
      if (!live()) return;
      queue.splice(pos, 0, w);
      show();
      refreshDueCount();
    }] });
  } catch (e) { showError(e); }
  busy = false;
}

async function grade(g) {
  if (!revealed || busy) return;
  busy = true;
  const w = queue[pos];
  const body = { grade: g, ms: Date.now() - shownAt, is_new: w.is_new, repeat: !!w.repeat };
  try {
    const res = await api.post(`/api/review/${w.id}`, body);
    lastGrade = { w, at: pos, body, previous: res.previous || null, inserted: null };
    // "Again" brings the card back a few cards later for another pass; a new
    // word you got gets a second look, asked the other way round. Re-passes
    // are practice and don't reschedule the card a second time.
    if (g === 0) {
      lastGrade.inserted = { ...w, is_new: false, repeat: true, check: false };
      insertLater(lastGrade.inserted, AGAIN_GAP);
    } else if (w.is_new && !w.repeat && definitionOf(w)) {
      lastGrade.inserted = { ...w, is_new: false, repeat: true, check: true };
      insertLater(lastGrade.inserted, CHECK_GAP);
    }
    pos++;
    show();
    refreshDueCount();
  } catch (e) { showError(e); }
  busy = false;
}

async function undo() {
  if (busy || !lastGrade) return;
  busy = true;
  const { w, at, body, previous, inserted } = lastGrade;
  try {
    await api.post(`/api/review/${w.id}/undo`, { previous, is_new: body.is_new, repeat: body.repeat });
    if (inserted) {
      const i = queue.indexOf(inserted);
      if (i > at) { queue.splice(i, 1); total--; }
    }
    lastGrade = null;
    pos = at;
    show();
    refreshDueCount();
    toast(`Grade for “${w.word}” undone.`);
  } catch (e) { showError(e); }
  busy = false;
}

// Out of new words at the chosen levels: offer the next one, never widen silently.
function addLevelNote() {
  const chosen = String(settings.word_levels || "").split(",").map(Number);
  const next = [1, 2, 3, 4, 5].find(n => !chosen.includes(n) && n > Math.max(...chosen))
    || [1, 2, 3, 4, 5].find(n => !chosen.includes(n));
  return h("p.muted", `You've met every new word at ${levelsText(chosen).toLowerCase()} here. `,
    next ? h("button.btn.btn-quiet", { type: "button", on: { click: async () => {
      const { saveSettings } = await import("../state.js");
      try { await saveSettings({ word_levels: [...chosen, next].sort().join(",") }); } catch (e) { return showError(e); }
      toast(`Added level ${next}`);
      refreshDueCount();
      load().catch(showError);
    } } }, `Add level ${next}`) : null);
}

async function done() {
  clearSession();
  els.root.classList.remove("in-session");
  const mins = (Date.now() - sessionStart) / 1000;
  const words = new Set(queue.map(w => w.id)).size;   // repeats are the same word
  const heading = h("h2", { tabindex: "-1" }, "Done for today");
  els.stage.replaceChildren(h("div.panel.done-state",
    h("div.seal", icon("check")),
    heading,
    h("p.muted", words
      ? `You studied ${words} word${words === 1 ? "" : "s"} in ${fmtDuration(mins)}. Each comes back when you're about to forget it.`
      : "Nothing is due right now. Come back tomorrow, or learn a few new words now."),
    els.more = h("p.muted"),
    levelShort ? addLevelNote() : null,
    h("div.toolbar",
      h("button.btn.btn-primary", { type: "button", on: { click: () => load(5).catch(showError) } }, "Learn 5 more words"),
      h("a.btn", { href: "#quiz" }, "Take a quiz"))));
  heading.focus({ preventScroll: true });
  if (total && !posted) {
    posted = true;
    api.post("/api/sessions", { kind: "review", score: words, total: words, duration_s: Math.round(mins) }).catch(() => {});
  }
  // Words marked "Know it" make room for others: say so rather than claim the day is done.
  try {
    const left = await api.get("/api/review/queue", { count: 1, track });
    if (left.total && live()) {
      els.more.replaceChildren(`${left.total} more ${left.total === 1 ? "is" : "are"} ready for today. `,
        h("button.btn.btn-quiet", { type: "button", on: { click: () => load().catch(showError) } }, "Continue"));
    }
  } catch (e) { /* the count is a nicety */ }
}

export async function render(root, { param, live: isLive } = {}) {
  live = isLive || (() => true);
  track = studyFocus();   // may have changed in Settings
  els.root = root;
  els.bar = h("span");
  els.count = h("span.tnum");
  els.stage = h("div.study-card");
  els.status = h("p.sr-only", { role: "status" });
  els.undo = h("button.btn.btn-quiet.undo-grade", { type: "button", hidden: true, title: "Undo the last grade · Z",
    on: { click: undo } }, "Undo last grade");
  const lengths = [...new Set([5, 10, 15, 20, 30, Number(settings.session_minutes)])].sort((a, b) => a - b);
  const minutes = h("select.input#review-minutes", { "aria-label": "Session length" },
    lengths.map(m => h("option", { value: m }, `${m}-minute session`)));
  minutes.value = settings.session_minutes;
  // A new length or scope applies to the next session; the cards already
  // dealt today stay (they're saved), so nothing in progress is lost.
  minutes.addEventListener("change", async () => {
    const { saveSettings } = await import("../state.js");
    try { await saveSettings({ session_minutes: Number(minutes.value) }); } catch (e) { return showError(e); }
    if (pos === 0 || pos >= queue.length) load().catch(showError);
    else toast("The new length applies to your next session.");
  });
  const trackSel = h("select.input#review-track", { "aria-label": "Scope" },
    SCOPES.map(([v, label]) => h("option", { value: v }, label)));
  trackSel.value = track;
  trackSel.addEventListener("change", () => {
    track = trackSel.value;
    setStudyFocus(track);
    clearSession();
    load().catch(showError);
  });
  // Word levels apply to new words in the broad tracks, not to a Bible track.
  const levels = levelPicker({ onChange: () => { refreshDueCount(); if (pos === 0 || pos >= queue.length) load().catch(showError); } });
  const showLevels = () => { levels.hidden = track.startsWith("bible"); };
  trackSel.addEventListener("change", showLevels);
  showLevels();
  root.append(
    pageHead("Daily review", "Spaced repetition (SM-2). Grade honestly: low stars and quiz misses bring words back sooner.",
      trackSel, levels, minutes),
    h("div.study-card.progress-wrap",
      h("div.progress-row", h("div.progress", els.bar), els.count), els.undo),
    els.status,
    els.stage);
  if (param === "more") {
    history.replaceState(null, "", "#review");
    clearSession();
    return load(5);
  }
  if (restoreSession()) {
    lastGrade = null;
    posted = false;
    return show();
  }
  await load();
}

export function onKey(e) {
  if (e.key.toLowerCase() === "z" && lastGrade) { e.preventDefault(); undo(); return; }
  if (pos >= queue.length) return;
  if (e.key === "Enter" || (e.key === " " && !revealed)) {
    if (!revealed) { e.preventDefault(); reveal(); }
  } else if (e.key === " ") {
    e.preventDefault(); playWord(queue[pos], els.stage.querySelector(".play"));
  } else if (/^[1-4]$/.test(e.key) && revealed) {
    const pick = choices(queue[pos])[Number(e.key) - 1];
    if (pick) { e.preventDefault(); pick[3](); }
  } else if (e.key.toLowerCase() === "m" && revealed) {   // never before the answer has been seen
    e.preventDefault(); knowIt();
  }
}
