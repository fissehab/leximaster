// Word Rush: a word and a meaning. Is it the word's meaning? Yes or no,
// against the clock (1 or 2 minutes), or 20 cards with no clock. The clock
// only runs while a card waits for an answer. Answers are logged as `match`.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import {
  bestScore, buzz, comboFor, points, pref, rushDeck, saveBest, setPref, setSounds, sfx, soundsOn, unlockSounds,
} from "../games.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, h, pageHead, playButton, smart } from "../ui.js";

const TIMES = [["60", "1 minute"], ["120", "2 minutes"], ["calm", "No clock (20 cards)"]];
const CALM_CARDS = 20;

let time = pref("lexi-rush-time", "120");
if (!TIMES.some(t => t[0] === time)) time = "120";
let filter = loadFilter("rush");
let els = {};
let alive = false;
let token = 0;

let deck = [];
let c = 0;               // this card
let phase = "idle";      // idle | card | right | wrong | done
let paused = false;
let resolved = false;
let score = 0;
let streak = 0;
let right = 0;
let wrong = 0;
let missed = [];
let logged = new Set();
let posts = [];
let still = false;
// The clock (timed rounds): ms left, and since when it has been running.
let total = 0;
let left = 0;
let clockFrom = 0;
let shownSecs = -1;
let shownAt = 0;
let pausedAt = 0;
let activeMs = 0;
let runFrom = 0;
let timers = new Set();

const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
const timed = () => time !== "calm";
const num = n => n.toLocaleString("en-US");
const clockText = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

/** Stop the clock and every timer (no session is posted). */
function halt() {
  clearTimers();
  clockFrom = 0;
  paused = false;
  phase = "idle";
  if (els.root) els.root.classList.remove("in-session");
}

function startCard() {
  halt();
  ++token;
  const best = bestScore(`rush:${time}`);
  els.stage.replaceChildren(h("div.panel.shoot-start",
    h("ol.shoot-steps", h("li", "Read the word and the meaning."), h("li", "Tap Yes if it is right, No if it is wrong."),
      h("li", "Get as many as you can.")),
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Start ", h("kbd", { "aria-hidden": "true" }, "Enter")),
    best > 0 ? h("p.shoot-best.tnum", `Best: ${num(best)}`) : null));
}

async function start() {
  unlockSounds();   // inside the tap, before any await
  halt();
  const mine = ++token;
  let questions;
  try {
    questions = (await api.get("/api/quiz", { ...filter, types: "word_meaning", n: 40 })).questions;
  } catch (e) {
    if (mine === token && alive) els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start a game"), h("p", e.message)));
    return;
  }
  if (mine !== token || !alive) return;
  if (questions.length < 4) {
    els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start a game"),
      h("p", "Not enough words here. Choose a wider set of words above.")));
    return;
  }
  deck = rushDeck(timed() ? questions : questions.slice(0, CALM_CARDS));
  c = 0; score = 0; streak = 0; right = 0; wrong = 0; missed = []; logged = new Set(); posts = [];
  total = timed() ? Number(time) * 1000 : 0;
  left = total;
  shownSecs = -1;
  still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  activeMs = 0; runFrom = performance.now();
  buildScreen();
  els.root.classList.add("in-session");
  show();
  focusCard();
}

/** Focus sits on the card, not on Yes: Enter and Space then reach onKey
 * (Go on, skip ahead) and can never answer Yes by mistake. */
const focusCard = () => els.card.focus({ preventScroll: true });

function buildScreen() {
  els.clock = h("span.timer.rush-clock", { "aria-hidden": "true" });
  els.bar = h("div.shoot-timebar.rush-timebar", { "aria-hidden": "true" }, h("span"));
  els.count = h("span.tnum");
  els.score = h("span");
  els.combo = h("span.shoot-combo.tnum");
  els.pauseBtn = h("button.chip", { type: "button", on: { click: () => (paused ? resume() : pause()) } }, "Pause ",
    h("kbd", { "aria-hidden": "true" }, "P"));
  els.sound = h("button.chip", { type: "button", "aria-pressed": String(soundsOn()), on: { click: e => {
    setSounds(!soundsOn());
    e.currentTarget.setAttribute("aria-pressed", String(soundsOn()));
  } } }, "Sounds");
  els.word = h("span");
  els.mark = h("span.mark", { "aria-hidden": "true" });
  els.meaning = h("p.rush-meaning");
  els.ask = h("div.rush-ask", h("p.q-ask", "Does it mean:"), els.meaning);
  els.fb = h("div.rush-fb");
  els.card = h("div.panel.rush-card", { tabindex: "-1", on: { click: () => { if (phase === "right") next(); } } },
    h("p.rush-word", els.word, " ", els.mark), els.ask, els.fb);
  els.no = h("button.rush-no", { type: "button", on: { click: () => answer(false) } },
    h("span", { "aria-hidden": "true" }, "✗ "), "No", h("kbd", { "aria-hidden": "true" }, "N"));
  els.yes = h("button.rush-yes", { type: "button", on: { click: () => answer(true) } },
    h("span", { "aria-hidden": "true" }, "✓ "), "Yes", h("kbd", { "aria-hidden": "true" }, "Y"));
  els.status = h("p.sr-only", { role: "status" });
  els.alert = h("p.sr-only", { role: "alert" });
  els.stage.replaceChildren(h("div.rush-game",
    h("div.score-line.shoot-hud", timed() ? h("span.rush-time", els.clock, els.bar) : els.count,
      h("span.tnum", h("span.shoot-label", "Score "), els.score), els.combo,
      h("span.shoot-hud-tools", els.pauseBtn, els.sound)),
    els.card,
    h("div.rush-buttons", els.no, els.yes),
    els.status, els.alert));
  hud();
}

function hud() {
  els.score.textContent = num(score);
  const combo = comboFor(streak);
  els.combo.textContent = `×${combo}`;
  els.combo.hidden = combo === 1;
  els.count.textContent = `Card ${c + 1} of ${deck.length}`;
  if (timed()) drawClock(left);
}

/** The clock and its bar, redrawn only when the whole second changes. */
function drawClock(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  if (secs === shownSecs) return;
  shownSecs = secs;
  els.clock.textContent = clockText(secs);
  els.clock.classList.toggle("low", secs <= 10);
  els.bar.firstChild.style.width = `${(100 * secs * 1000) / total}%`;
}

function tick() {
  if (phase !== "card" || paused || !clockFrom) return;
  const ms = left - (performance.now() - clockFrom);
  if (ms <= 0) { left = 0; clockFrom = 0; drawClock(0); return finish(false); }
  drawClock(ms);
  later(tick, 250);
}

/** Stop the clock, keeping the time left. */
function spend() {
  if (!clockFrom) return;
  left -= performance.now() - clockFrom;
  clockFrom = 0;
}

// ---------------------------------------------------------------- a card

function show() {
  const card = deck[c];
  resolved = false;
  phase = "card";
  els.card.classList.remove("right", "wrong", "enter");
  if (!still) { void els.card.offsetWidth; els.card.classList.add("enter"); }
  els.word.textContent = smart(card.q.word);
  els.mark.textContent = "";
  els.meaning.textContent = smart(card.meaning);
  els.ask.hidden = false;
  els.fb.replaceChildren();
  els.no.parentNode.classList.remove("wait");
  hud();
  els.status.textContent = `${card.q.word}. Does it mean: ${card.meaning}`;
  els.alert.textContent = "";
  shownAt = performance.now();
  if (timed()) { clockFrom = shownAt; later(tick, 250); }
}

function log(q, correct) {
  if (logged.has(q.word_id)) return;
  logged.add(q.word_id);
  const ms = Math.round(performance.now() - shownAt);
  posts.push(api.post("/api/answer", { word_id: q.word_id, mode: "match", correct, ms }).catch(() => {}));
}

function answer(yes) {
  if (resolved || paused || phase !== "card") return;
  resolved = true;
  spend();
  clearTimers();
  const card = deck[c];
  const q = card.q;
  const ok = yes === card.truth;
  log(q, ok);
  els.no.parentNode.classList.add("wait");
  if (ok) {
    phase = "right";
    streak++; right++;
    score += points({ streak });
    sfx("hit");
    focusCard();   // off Yes/No, so Enter skips ahead
    els.card.classList.add("right");
    els.mark.textContent = "✓";
    hud();
    if (card.truth) {
      els.alert.textContent = "Right!";
      later(next, 700);
    } else {
      els.ask.hidden = true;
      els.fb.replaceChildren(h("div.feedback.ok", h("strong", "Right."), h("p", `“${smart(q.word)}” means: `, smart(q.answer))));
      els.alert.textContent = `Right. ${q.word} means: ${q.answer}`;
      later(next, 1500);
    }
    return;
  }
  phase = "wrong";
  streak = 0; wrong++;
  if (!missed.includes(q)) missed.push(q);
  sfx("miss");
  buzz(30);
  els.card.classList.add("wrong");
  els.mark.textContent = "✗";
  hud();
  els.ask.hidden = true;
  const goOn = h("button.btn.btn-primary", { type: "button", on: {
    click: next,
    // Space hears the word (as the hint says), it doesn't press "Go on".
    keydown: e => { if (e.key === " ") { e.preventDefault(); e.stopPropagation(); playWord(q); } },
    keyup: e => { if (e.key === " ") e.preventDefault(); },
  } }, "Go on ", h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.fb.replaceChildren(h("div.feedback.bad",
    h("strong", `Not quite. “${smart(q.word)}” means:`),
    h("p", smart(q.answer)),
    h("div.toolbar",
      h("button.btn", { type: "button", on: { click: () => playWord(q) } }, "Hear it ", h("kbd", { "aria-hidden": "true" }, "Space")),
      goOn)));
  els.alert.textContent = `Not quite. ${q.word} means: ${q.answer}`;
  goOn.focus({ preventScroll: true });
}

function next() {
  if (paused || (phase !== "right" && phase !== "wrong")) return;
  clearTimers();
  if (c + 1 >= deck.length || (timed() && left <= 0)) return finish(timed() && left > 0);
  c++;
  show();
  focusCard();
}

// ---------------------------------------------------------------- pause

function pause() {
  if (paused || (phase !== "card" && phase !== "right")) return;
  paused = true;
  spend();
  clearTimers();
  pausedAt = performance.now();
  activeMs += pausedAt - runFrom;
  const goOn = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: resume } }, "Go on ",
    h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.card.classList.add("is-paused");   // the card is hidden: no reading for free
  els.card.append(h("div.shoot-pause", h("p", "Paused"), goOn));
  els.pauseBtn.setAttribute("aria-pressed", "true");
  goOn.focus({ preventScroll: true });
}

function resume() {
  if (!paused) return;
  paused = false;
  const now = performance.now();
  shownAt += now - pausedAt;
  runFrom = now;
  els.card.classList.remove("is-paused");
  els.card.querySelectorAll(".shoot-pause").forEach(x => x.remove());
  els.pauseBtn.setAttribute("aria-pressed", "false");
  if (phase === "right") return next();
  focusCard();
  if (timed()) { clockFrom = now; later(tick, 250); }
}

const onHide = () => { if (document.visibilityState === "hidden") pause(); };
const onBlur = () => pause();

// ---------------------------------------------------------------- results

function finish(allDone) {
  const answered = right + wrong;
  activeMs += performance.now() - runFrom;
  halt();
  phase = "done";
  const secs = activeMs / 1000;
  sfx("end");
  api.post("/api/sessions", { kind: "word-rush", score: right, total: answered, duration_s: Math.round(secs) }).catch(() => {});
  if (missed.length) Promise.allSettled(posts).then(refreshDueCount);
  const { best, isNew } = saveBest(`rush:${time}`, score);
  const again = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Play again");
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", "Round complete"),
    h("div.big-num.tnum", num(score)),
    allDone ? h("p", "You did every card!") : null,
    isNew ? h("p.shoot-best", "New best!") : best > 0 ? h("p.muted.tnum", `Best: ${num(best)}`) : null,
    h("p.muted", `${right} right · ${wrong} wrong`),
    missed.length ? h("div.missed", h("p.label", "Added back to today's review"),
      h("ul", missed.map(q => h("li", playButton(q, { small: true }), " ",
        h("a", { href: `#browse/${q.word_id}` }, q.word), " — ", smart(q.definition))))) : null,
    h("div.toolbar", again)),
  h("p.sr-only", { role: "alert" }, `Round complete. ${num(score)} points.${isNew ? " New best!" : ""}`));
  again.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the page

export async function render(root) {
  const src = await filterSources();
  const timeSel = h("select.input", { "aria-label": "Time" }, TIMES.map(([v, l]) => h("option", { value: v }, l)));
  timeSel.value = time;
  timeSel.addEventListener("change", () => { time = timeSel.value; setPref("lexi-rush-time", time); startCard(); });
  els.root = root;
  els.stage = h("div.rush-wrap");
  root.append(
    pageHead("Word Rush", "Does the word have this meaning? Answer yes or no, fast.", timeSel),
    await filterBar(f => { filter = f; startCard(); }, src, { tab: "rush" }),
    els.stage);
  filter = loadFilter("rush");
  alive = true;
  startCard();
  document.addEventListener("visibilitychange", onHide);
  addEventListener("blur", onBlur);
  return () => {
    alive = false;
    ++token;
    halt();
    document.removeEventListener("visibilitychange", onHide);
    removeEventListener("blur", onBlur);
  };
}

export function onKey(e) {
  const k = e.key;
  if (k === "p" || k === "P" || k === "Escape") {
    if (paused) { e.preventDefault(); resume(); } else if (phase === "card" || phase === "right") { e.preventDefault(); pause(); }
    return;
  }
  if (paused) {
    if (k === "Enter") { e.preventDefault(); resume(); }
    return;
  }
  if (phase === "card" && (k === "y" || k === "Y" || k === "ArrowRight")) { e.preventDefault(); answer(true, els.yes); }
  else if (phase === "card" && (k === "n" || k === "N" || k === "ArrowLeft")) { e.preventDefault(); answer(false, els.no); }
  else if (k === "Enter") {
    if (phase === "idle" && els.stage.querySelector(".shoot-start")) { e.preventDefault(); start(); }
    else if (phase === "right" || phase === "wrong") { e.preventDefault(); next(); }
    else if (phase === "done") { e.preventDefault(); start(); }
  } else if (k === " " && phase === "wrong") {
    e.preventDefault();
    playWord(deck[c].q);
  }
}
