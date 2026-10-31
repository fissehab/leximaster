// Type It: read the meaning (or hear the word) and type the word before the
// time runs out. The blanks show how many letters; with meanings the first
// letter is given. A wrong try can be tried once more; a second wrong try or
// the end of the time costs a heart. 15 words a round, or Endless (more
// words keep coming until the hearts run out). Answers are logged as `match`
// (`spell` when heard): a miss makes the word due today.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import {
  bestScore, buzz, comboFor, freshOnly, fromListen, HEART_BACK_EVERY, hintFor, letterCount, nextLevel, PERFECT_BONUS, points,
  pref, REFILL_AT, saveBest, setPref, setSounds, sfx, soundsOn, START_LEVEL, typedRight, typeTime, unlockSounds,
} from "../games.js";
import { scoreBoard, scoreResult } from "../gameui.js";
import { loadFilter, settings } from "../state.js";
import { diffView, filterBar, filterSources, fmtDuration, h, pageHead, playButton, scrollBehavior, shuffle, smart, toast } from "../ui.js";

const CLUES = [["meaning", "Meanings"], ["hear", "Hear it"]];
const SPEEDS = [["calm", "Calm"], ["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]];
const LENGTHS = [["round", "15 words"], ["endless", "Endless"]];
const WORDS = 15;
const HIT_STRIP = 1200;   // ms the "✓ word — meaning" line stays after a right answer
const CARD_ARM = 400;     // ms before the miss card's buttons work

let clues = pref("lexi-typeit-clues", "meaning");
let speed = pref("lexi-typeit-speed", "slow");
let length = pref("lexi-typeit-length", "round");
if (!CLUES.some(c => c[0] === clues)) clues = "meaning";
if (!SPEEDS.some(s => s[0] === speed)) speed = "slow";
if (!LENGTHS.some(l => l[0] === length)) length = "round";
let filter = loadFilter("typeit");
let els = {};
let alive = false;
let token = 0;

// The game
let qs = [];
let w = 0;
let phase = "idle";      // idle | typing | hit | miss | done
let paused = false;
let resolved = false;
let tries = 0;           // wrong tries on this word
let shown = 0;           // letters given on this word (the start, and hints)
let helped = false;      // a hint was used: right, but no points
let hearts = 3;
let score = 0;
let streak = 0;
let bestRun = 0;
let hits = 0;
let level = 1;
let missed = [];
let endless = false;
let seen = new Set();
let refilling = false;
let logged = new Set();
let posts = [];
let still = false;
// The clock
let limit = Infinity;    // ms for this word
let elapsed = 0;
let last = 0;
let raf = 0;
let shownSecs = -1;
let shownAt = 0;
let pausedAt = 0;
let activeMs = 0;
let runFrom = 0;
let timers = new Set();

const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = n => n.toLocaleString("en-US");
const bestKey = () => `typeit:${length === "endless" ? "endless:" : ""}${speed === "calm" ? "calm" : "timed"}`;
const boardLabel = () => `${length === "endless" ? "Endless" : "15 words"}, ${speed === "calm" ? "Calm" : "with a clock"}`;

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function halt() {
  stopLoop();
  clearTimers();
  paused = false;
  phase = "idle";
  if (els.root) els.root.classList.remove("in-session");
}

// ---------------------------------------------------------------- start

function startCard() {
  halt();
  ++token;
  const best = bestScore(bestKey());
  els.stage.replaceChildren(h("div.panel.shoot-start",
    h("ol.shoot-steps", h("li", clues === "hear" ? "Listen to the word." : "Read the meaning."),
      h("li", "Type the word, then press Enter."),
      h("li", length === "endless" ? "You have 3 hearts. Play until they are gone." : "You have 3 hearts.")),
    h("p.muted", clues === "hear" ? "The blanks show how many letters the word has."
      : "The first letter is given. The blanks show how many letters the word has."),
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: () => start() } }, "Start ", h("kbd", { "aria-hidden": "true" }, "Enter")),
    best > 0 ? h("p.shoot-best.tnum", `Best: ${num(best)}`) : null),
  scoreBoard(bestKey(), boardLabel(), { limit: 5 }));
}

function empty(text) {
  els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start a game"), h("p", text)));
}

/** 15 words for the chosen clues. A meaning question's answer is its word. */
async function batch() {
  if (clues === "hear") return (await api.get("/api/listen", { ...filter, n: WORDS })).items.map(fromListen);
  return (await api.get("/api/quiz", { ...filter, types: "meaning_word", n: WORDS })).questions;
}

async function start(replay = null) {
  unlockSounds();   // inside the tap, before any await
  halt();
  const mine = ++token;
  let list = replay;
  if (!list) {
    try {
      list = await batch();
    } catch (e) {
      if (mine === token && alive) empty(e.message);
      return;
    }
    if (mine !== token || !alive) return;
    if (list.length < 4) return empty("Not enough words here. Choose a wider set of words above.");
    if (list.length < WORDS && length !== "endless") toast(`Only ${list.length} words match these settings.`);
  }
  qs = list;
  endless = length === "endless" && !replay;
  seen = new Set(list.map(q => q.word_id));
  refilling = false;
  w = 0; hearts = 3; score = 0; streak = 0; bestRun = 0; hits = 0; missed = []; logged = new Set(); posts = [];
  level = START_LEVEL[speed] || 1;
  still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  activeMs = 0; runFrom = performance.now();
  buildScreen();
  els.root.classList.add("in-session");
  els.stage.firstChild.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  show();
}

/** Endless: fetch the next words while a few are still left. */
function refill() {
  if (!endless || refilling || qs.length - w - 1 > REFILL_AT) return;
  refilling = true;
  const mine = token;
  batch().then(list => {
    if (mine !== token) return;
    const fresh = freshOnly(list, seen);
    qs.push(...(fresh.length ? fresh : list));
  }).catch(() => {}).finally(() => { if (mine === token) refilling = false; });
}

function buildScreen() {
  els.hearts = h("span.shoot-hearts", { "aria-hidden": "true" });
  els.heartsText = h("span.sr-only");
  els.scoreNum = h("span");
  els.combo = h("span.shoot-combo.tnum");
  els.count = h("span.tnum");
  els.sound = h("button.chip", { type: "button", "aria-pressed": String(soundsOn()), on: { click: e => {
    setSounds(!soundsOn());
    e.currentTarget.setAttribute("aria-pressed", String(soundsOn()));
  } } }, "Sounds");
  els.pauseBtn = h("button.chip", { type: "button", on: { click: () => (paused ? resume() : pause()) } }, "Pause ",
    h("kbd", { "aria-hidden": "true" }, "Esc"));
  els.timebar = h("div.shoot-timebar.type-timebar", { "aria-hidden": "true" }, h("span"));
  els.secs = h("span.shoot-secs.tnum", { "aria-hidden": "true" });
  els.clock = h("div.shoot-clock", els.timebar, els.secs);
  els.clue = h("div.shoot-clue");
  els.blanks = h("p.type-blanks", { "aria-hidden": "true" });
  els.input = h("input.input.type-in.type-game-in", { type: "text", autocomplete: "off", autocapitalize: "off", autocorrect: "off",
    spellcheck: false, enterkeyhint: "go", "aria-label": "Type the word" });
  els.input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); if (phase === "typing") check(); else if (phase === "hit" || phase === "miss") next(); }
    else if (e.key === "Escape") { e.preventDefault(); paused ? resume() : pause(); }
    else if (e.key === " " && !els.input.value && qs[w] && qs[w].hear) { e.preventDefault(); playWord(qs[w]); }
  });
  els.tryAgain = h("p.type-try", { role: "status" });
  els.hintBtn = h("button.btn", { type: "button", on: { click: hint } }, "Hint");
  els.checkBtn = h("button.btn.btn-primary", { type: "submit" }, "Check ", h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.form = h("form.type-form", { on: { submit: e => { e.preventDefault(); check(); } } },
    els.input, h("div.toolbar", els.checkBtn, els.hintBtn), els.tryAgain);
  els.fb = h("div.type-fb");
  els.status = h("p.sr-only", { role: "status" });
  els.alert = h("p.sr-only", { role: "alert" });
  els.box = h("div.type-box", els.clue, els.blanks, els.form, els.fb);
  els.stage.replaceChildren(h("div.shoot-game.type-game",
    h("div.score-line.shoot-hud", h("span", els.hearts, els.heartsText), h("span.tnum", h("span.shoot-label", "Score "), els.scoreNum),
      els.combo, els.count,
      h("span.shoot-hud-tools", els.pauseBtn, els.sound)),
    speed === "calm" ? null : els.clock,
    els.box, els.status, els.alert));
  hud();
}

function hud() {
  els.hearts.textContent = "♥".repeat(hearts) + "♡".repeat(3 - hearts);
  els.heartsText.textContent = `Hearts: ${hearts} of 3`;
  els.scoreNum.textContent = num(score);
  const combo = comboFor(streak);
  els.combo.textContent = `×${combo}`;
  els.combo.hidden = combo === 1;
  els.count.textContent = endless ? `Word ${w + 1}` : `Word ${w + 1} of ${qs.length}`;
}

// ---------------------------------------------------------------- a word

function show() {
  const q = qs[w];
  resolved = false;
  tries = 0;
  helped = false;
  shown = q.hear ? 0 : 1;
  phase = "typing";
  elapsed = 0;
  shownSecs = -1;
  limit = speed === "calm" ? Infinity : typeTime(q.prompt, q.answer, level);
  els.clue.replaceChildren(h("p.q-ask", q.hear ? "Type the word you hear." : "Type the word that means:"), q.hear
    ? h("button.btn.shoot-hear", { type: "button", on: { click: () => { playWord(q); els.input.focus(); } } }, "▶ Hear it again ",
      h("kbd", { "aria-hidden": "true" }, "Space"))
    : h("p.shoot-prompt", smart(q.prompt)));
  drawBlanks();
  els.input.value = "";
  els.input.readOnly = false;
  els.checkBtn.disabled = false;
  els.input.classList.remove("shake");
  els.form.hidden = false;
  els.hintBtn.disabled = false;
  els.tryAgain.textContent = "";
  els.fb.replaceChildren();
  els.box.classList.remove("right", "wrong");
  hud();
  els.status.textContent = `Word ${endless ? w + 1 : `${w + 1} of ${qs.length}`}. ${q.hear ? "Type the word you hear" : `Type the word that means: ${q.prompt}`}. ${plural(letterCount(q.answer), "letter")}${shown ? `, starting with ${q.answer[0]}` : ""}.`;
  els.alert.textContent = "";
  els.input.focus({ preventScroll: true });
  shownAt = performance.now();
  if (q.hear) later(() => playWord(q), 300);
  if (isFinite(limit)) {
    els.timebar.firstChild.style.width = "100%";
    els.secs.textContent = `${Math.ceil(limit / 1000)}s`;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  refill();
}

function drawBlanks() {
  els.blanks.textContent = hintFor(qs[w].answer, shown);
}

function frame(now) {
  if (phase !== "typing" || paused) return;
  elapsed += Math.min(now - last, 50);
  last = now;
  const secs = Math.max(0, Math.ceil((limit - elapsed) / 1000));
  if (still) {
    if (secs !== shownSecs) els.timebar.firstChild.style.width = `${(100 * secs * 1000) / limit}%`;
  } else els.timebar.firstChild.style.width = `${(100 * Math.max(0, limit - elapsed)) / limit}%`;
  if (secs !== shownSecs) {
    shownSecs = secs;
    els.secs.textContent = `${secs}s`;
    els.clock.classList.toggle("low", secs <= 3);
  }
  if (elapsed >= limit) { resolved = true; stopLoop(); return miss(true); }
  raf = requestAnimationFrame(frame);
}

function hint() {
  if (phase !== "typing" || paused) return;
  const q = qs[w];
  helped = true;
  shown = Math.min(letterCount(q.answer) - 1, shown + 1);
  if (shown >= letterCount(q.answer) - 1) els.hintBtn.disabled = true;
  drawBlanks();
  els.tryAgain.textContent = "A hint: this word scores no points.";
  els.input.focus({ preventScroll: true });
}

function check() {
  if (resolved || paused || phase !== "typing") return;
  const q = qs[w];
  const typed = els.input.value;
  if (!typed.trim()) { els.input.focus(); return; }
  if (typedRight(typed, q.answer)) { resolved = true; stopLoop(); return hit(); }
  tries++;
  if (tries < 2) {
    sfx("miss");
    buzz(20);
    if (!still) { els.input.classList.remove("shake"); void els.input.offsetWidth; els.input.classList.add("shake"); }
    els.tryAgain.textContent = "Not quite. Try once more.";
    els.input.select();
    return;
  }
  resolved = true;
  stopLoop();
  miss(false);
}

function log(q, correct) {
  if (logged.has(q.word_id)) return;
  logged.add(q.word_id);
  const ms = Math.round(performance.now() - shownAt);
  posts.push(api.post("/api/answer", { word_id: q.word_id, mode: q.hear ? "spell" : "match", correct, ms }).catch(() => {}));
}

// ---------------------------------------------------------------- right and wrong

function hit() {
  const q = qs[w];
  phase = "hit";
  log(q, true);
  hits++;
  let add = 0;
  let heartBack = false;
  if (helped || tries) {
    streak = 0;   // a hint or a second try: right, but the combo starts again
    if (!helped) add = 50;
  } else {
    streak++;
    add = points({ streak, left: limit - elapsed, fall: limit });
    heartBack = streak % HEART_BACK_EVERY === 0 && hearts < 3;
    if (heartBack) hearts++;
  }
  bestRun = Math.max(bestRun, streak);
  score += add;
  level = nextLevel(level, { hit: !helped && !tries, streak });
  sfx(heartBack ? "heart" : "hit");
  hud();
  // The box stays (read-only), so a phone keeps its keyboard open for the next word.
  els.input.readOnly = true;
  els.checkBtn.disabled = true;
  els.hintBtn.disabled = true;
  els.tryAgain.textContent = "";
  els.box.classList.add("right");
  els.blanks.textContent = hintFor(q.answer, Infinity);
  els.fb.replaceChildren(h("p.shoot-strip", { on: { click: next } }, h("span.mark", { "aria-hidden": "true" }, "✓ "),
    h("b.fb-word", smart(q.word)), " — ", smart(q.definition), add ? h("span.shoot-combo.tnum", `  +${add}`) : null));
  els.alert.textContent = `Right: ${q.word}.${add ? ` Plus ${add}.` : ""}${heartBack ? " One heart back." : ""}`;
  if (settings.autoplay === "1" && !q.hear) later(() => playWord(q), 150);
  later(next, HIT_STRIP);
}

function miss(timeUp) {
  const q = qs[w];
  phase = "miss";
  log(q, false);
  hearts--; streak = 0;
  level = nextLevel(level, { hit: false });
  if (!missed.includes(q)) missed.push(q);
  sfx("miss");
  buzz(30);
  hud();
  const typed = els.input.value.trim();
  els.form.hidden = true;
  els.input.blur();
  els.box.classList.add("wrong");
  els.blanks.textContent = hintFor(q.answer, Infinity);
  const head = timeUp ? "Time is up." : "Not quite.";
  const cardAt = performance.now();
  const armed = fn => () => { if (performance.now() - cardAt >= CARD_ARM) fn(); };
  const goOn = h("button.btn.btn-primary", { type: "button", on: {
    click: armed(next),
    keydown: e => { if (e.key === " ") { e.preventDefault(); e.stopPropagation(); playWord(q); } },
    keyup: e => { if (e.key === " ") e.preventDefault(); },
  } }, "Go on ", h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.fb.replaceChildren(h("div.feedback.bad",
    h("strong", head),
    typed ? h("div", h("p.label", "Right spelling (red letters differ from yours)"), diffView(typed, q.answer)) : null,
    h("p", h("b.fb-word", smart(q.word)), " ",
      q.phonetic ? h("span.ipa", { lang: "en-fonipa" }, q.phonetic) : null, " — ", smart(q.definition)),
    h("div.toolbar",
      h("button.btn", { type: "button", on: { click: armed(() => playWord(q)) } }, "Hear it ", h("kbd", { "aria-hidden": "true" }, "Space")),
      goOn)));
  els.alert.textContent = `${head} The word is ${q.word}. ${plural(hearts, "heart")} left.`;
  goOn.focus({ preventScroll: true });
}

function next() {
  if (paused || (phase !== "hit" && phase !== "miss")) return;
  clearTimers();
  if (hearts > 0 && w + 1 >= qs.length && refilling) return void later(next, 300);   // endless: more words are on the way
  if (hearts <= 0 || w + 1 >= qs.length) return finish();
  w++;
  show();
}

// ---------------------------------------------------------------- pause

function pause() {
  if (paused || (phase !== "typing" && phase !== "hit")) return;
  paused = true;
  stopLoop();
  clearTimers();
  pausedAt = performance.now();
  activeMs += pausedAt - runFrom;
  const goOn = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: resume } }, "Go on ",
    h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.box.classList.add("is-paused");   // the clue is hidden: no thinking time for free
  els.box.append(h("div.shoot-pause", h("p", "Paused"), goOn));
  els.pauseBtn.setAttribute("aria-pressed", "true");
  goOn.focus({ preventScroll: true });
}

function resume() {
  if (!paused) return;
  paused = false;
  const now = performance.now();
  shownAt += now - pausedAt;
  runFrom = now;
  els.box.classList.remove("is-paused");
  els.box.querySelectorAll(".shoot-pause").forEach(x => x.remove());
  els.pauseBtn.setAttribute("aria-pressed", "false");
  if (phase === "hit") return next();
  els.input.focus({ preventScroll: true });
  if (isFinite(limit)) {
    last = now;
    raf = requestAnimationFrame(frame);
  }
}

const onHide = () => { if (document.visibilityState === "hidden") pause(); };
const onBlur = () => pause();

// ---------------------------------------------------------------- results

function finish() {
  halt();
  phase = "done";
  const played = w + 1;
  const perfect = !endless && hits === qs.length && !missed.length;
  if (perfect) score += PERFECT_BONUS;
  activeMs += performance.now() - runFrom;
  const secs = activeMs / 1000;
  sfx("end");
  const kind = `type-it${endless ? "-endless" : ""}${clues === "hear" ? "-hear" : ""}`;
  api.post("/api/sessions", { kind, score: hits, total: played, duration_s: Math.round(secs) }).catch(() => {});
  if (missed.length) Promise.allSettled(posts).then(refreshDueCount);
  const { best, isNew } = saveBest(bestKey(), score);
  const top = scoreResult(bestKey(), boardLabel(), score);
  const again = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: () => start() } }, "Play again");
  const retry = missed.length ? h("button.btn.btn-lg", { type: "button", on: { click: () => start(shuffle([...missed])) } },
    `Practice the ${plural(missed.length, "miss", "misses")}`) : null;
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", hearts > 0 ? "Round complete" : endless ? `Out of hearts after ${plural(played, "word")}` : "Out of hearts"),
    h("div.big-num.tnum", num(score)),
    perfect ? h("p.shoot-best", "Perfect round!") : null,
    isNew ? h("p.shoot-best", "New best!") : best > 0 ? h("p.muted.tnum", `Best: ${num(best)}`) : null,
    top.el,
    h("p.muted", `${hits} of ${played} words · best run ${bestRun} · ${fmtDuration(secs)}`),
    h("p.muted", "100 a word, more for fast answers, ×2 ×3 ×4 for words in a row. A second try scores 50, a hint 0."),
    missed.length ? h("div.missed", h("p.label", "Added back to today's review"),
      h("ul", missed.map(q => h("li", playButton(q, { small: true }), " ",
        h("a", { href: `#browse/${q.word_id}` }, q.word), " — ", smart(q.definition))))) : h("p", "No misses. Well done."),
    h("div.toolbar", again, retry)));
  els.stage.append(h("p.sr-only", { role: "alert" },
    `${hearts > 0 ? "Round complete" : "Out of hearts"}. ${num(score)} points.${perfect ? " Perfect round!" : ""}${isNew ? " New best!" : ""}`));
  again.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- the page

export async function render(root) {
  const src = await filterSources();
  const seg = h("div.seg", { role: "group", "aria-label": "Clues" }, CLUES.map(([v, l]) => {
    const b = h("button", { type: "button", "aria-pressed": String(clues === v) }, l);
    b.addEventListener("click", () => {
      clues = v;
      setPref("lexi-typeit-clues", v);
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      startCard();
    });
    return b;
  }));
  const speedSel = h("select.input", { "aria-label": "Speed" }, SPEEDS.map(([v, l]) => h("option", { value: v }, l)));
  speedSel.value = speed;
  speedSel.addEventListener("change", () => { speed = speedSel.value; setPref("lexi-typeit-speed", speed); startCard(); });
  const lengthSel = h("select.input", { "aria-label": "Length" }, LENGTHS.map(([v, l]) => h("option", { value: v }, l)));
  lengthSel.value = length;
  lengthSel.addEventListener("change", () => { length = lengthSel.value; setPref("lexi-typeit-length", length); startCard(); });
  els.root = root;
  els.stage = h("div.shoot-wrap");
  root.append(
    pageHead("Type It", "Read the meaning, or hear the word. Type it before the time runs out.", seg, speedSel, lengthSel),
    await filterBar(f => { filter = f; startCard(); }, src, { tab: "typeit" }),
    els.stage);
  filter = loadFilter("typeit");
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
    if (paused) { e.preventDefault(); resume(); } else if (phase === "typing" || phase === "hit") { e.preventDefault(); pause(); }
    return;
  }
  if (paused) {
    if (k === "Enter") { e.preventDefault(); resume(); }
    return;
  }
  if (k === "Enter") {
    if (phase === "idle" && els.stage.querySelector(".shoot-start")) { e.preventDefault(); start(); }
    else if (phase === "hit" || phase === "miss") { e.preventDefault(); next(); }
    else if (phase === "done") { e.preventDefault(); start(); }
  } else if (k === " " && phase === "miss") {
    e.preventDefault();
    playWord(qs[w]);
  }
}
