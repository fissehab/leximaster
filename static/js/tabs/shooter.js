// Word Shooter: read the clue (or hear the word), shoot the word that fits
// before it lands. 15 words a round, or Endless (more words keep coming until
// the hearts run out); 3 hearts. Each word falls in its own lane; the lanes
// are still, full-height buttons, so you never aim at something moving.
// Answers are logged as `match` (`listen` when heard): a miss makes the word
// due today.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import {
  bestScore, buzz, comboFor, fallTime, fontFor, freshOnly, fromListen, HEART_BACK_EVERY, nextLevel, PERFECT_BONUS, pickLanes,
  points, pref, REFILL_AT, saveBest, setPref, setSounds, sfx, soundsOn, START_LEVEL, unlockSounds,
} from "../games.js";
import { scoreBoard, scoreResult } from "../gameui.js";
import { loadFilter, settings } from "../state.js";
import {
  filterBar, filterSources, fmtDuration, h, highlight, pageHead, playButton, scrollBehavior, shuffle, smart, toast,
} from "../ui.js";

const CLUES = [["meaning", "Meanings", "meaning_word"], ["sentence", "Sentences", "fill_blank"],
  ["mixed", "Mixed", "meaning_word,fill_blank,synonym"], ["hear", "Hear it", null]];
const SPEEDS = [["calm", "Calm"], ["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]];
const LENGTHS = [["round", "15 words"], ["endless", "Endless"]];
const WAVES = 15;
const GROUND = 44;        // px under the lanes: the ground line, key hints and cannon
const HIT_STRIP = 1200;   // ms the "✓ word — meaning" line stays after a hit
const CARD_ARM = 400;     // ms before the miss card's buttons work: the tap that missed can't press them

let clues = pref("lexi-shooter-clues", "meaning");
let speed = pref("lexi-shooter-speed", "slow");
let length = pref("lexi-shooter-length", "round");
if (!CLUES.some(c => c[0] === clues)) clues = "meaning";
if (!SPEEDS.some(s => s[0] === speed)) speed = "slow";
if (!LENGTHS.some(l => l[0] === length)) length = "round";
let filter = loadFilter("shooter");
let els = {};
let alive = false;
let token = 0;

// The round
let qs = [];
let w = 0;               // this wave
let phase = "idle";      // idle | ready | falling | hit | miss | done
let paused = false;
let resolved = false;    // this wave has its answer
let hearts = 3;
let score = 0;
let streak = 0;
let bestRun = 0;
let hits = 0;
let level = 1;
let missed = [];
let endless = false;     // this game: more words come until the hearts run out
let seen = new Set();    // endless: the words shown so far
let refilling = false;
let logged = new Set();
let posts = [];
let still = false;       // reduced motion: nothing falls
let lanes = [];          // the words in this wave's lanes
// The clock
let fall = Infinity;
let elapsed = 0;
let last = 0;
let raf = 0;
let shownAt = 0;         // performance.now() when the wave was shown, moved on by pauses
let pausedAt = 0;
let activeMs = 0;        // time played, pauses left out
let runFrom = 0;
let timers = new Set();
let ro = null;
let geo = null;          // cached sizes: { h, travel[], cx[], top[], ph[] }
let shownSecs = -1;

const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
// Best and top scores: one board for each length and clock (clues share it).
const bestKey = () => `shooter:${length === "endless" ? "endless:" : ""}${speed === "calm" ? "calm" : "timed"}`;
const boardLabel = () => `${length === "endless" ? "Endless" : "15 words"}, ${speed === "calm" ? "Calm" : "with a clock"}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = n => n.toLocaleString("en-US");
const inRound = () => ["ready", "falling", "hit", "miss"].includes(phase);

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (els.pills) els.pills.forEach(p => p.classList.remove("live"));   // will-change only while falling
}

/** Stop everything this round has running (no session is posted). */
function halt() {
  stopLoop();
  clearTimers();
  if (ro) { ro.disconnect(); ro = null; }
  paused = false;
  phase = "idle";
  if (els.root) els.root.classList.remove("in-session");
}

// ---------------------------------------------------------------- start

function startCard() {
  halt();
  ++token;
  const best = bestScore(bestKey());
  const go = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: () => start() } }, "Start ",
    h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.stage.replaceChildren(h("div.panel.shoot-start",
    h("ol.shoot-steps", h("li", clues === "hear" ? "Listen to the word." : "Read the clue."),
      h("li", clues === "hear" ? "Tap the word you hear before it lands." : "Tap the word that fits before it lands."),
      h("li", length === "endless" ? "You have 3 hearts. Play until they are gone." : "You have 3 hearts.")),
    h("p.muted", "Need more time? Choose Calm."),
    go,
    best > 0 ? h("p.shoot-best.tnum", `Best: ${num(best)}`) : null),
  scoreBoard(bestKey(), boardLabel(), { limit: 5 }));
}

function empty(text) {
  els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start a game"), h("p", text)));
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
    if (mine !== token || !alive) return;   // a newer start, or the tab was left
    if (list.length < 4) return empty("Not enough words here. Choose a wider set of words above.");
    if (list.length < WAVES) toast(`Only ${list.length} words match these settings.`);
  }
  qs = list;
  endless = length === "endless" && !replay;   // "Practice the misses" is a round
  seen = new Set(list.map(q => q.word_id));
  refilling = false;
  w = 0; hearts = 3; score = 0; streak = 0; bestRun = 0; hits = 0; missed = []; logged = new Set(); posts = [];
  level = START_LEVEL[speed] || 1;
  still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  activeMs = 0; runFrom = performance.now();
  buildScreen();
  els.root.classList.add("in-session");   // on a phone: no page notes over the game
  // The top of the game, not the field: on a short screen the clue stays in view.
  els.stage.firstChild.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  els.field.focus({ preventScroll: true });
  wave();
}

/** 15 questions for the chosen clues. */
async function batch() {
  if (clues === "hear") return (await api.get("/api/listen", { ...filter, n: WAVES })).items.map(fromListen);
  const types = CLUES.find(c => c[0] === clues)[2];
  return (await api.get("/api/quiz", { ...filter, types, n: WAVES })).questions;
}

/** Endless: fetch the next words while a few are still left. New words come
 * first; once every word here has been shown, they come round again. */
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
    h("kbd", { "aria-hidden": "true" }, "P"));
  els.timebar = h("div.shoot-timebar", { "aria-hidden": "true" }, h("span"));
  els.secs = h("span.shoot-secs.tnum", { "aria-hidden": "true" });
  els.clue = h("div.shoot-clue");
  els.lanesWrap = h("div.shoot-lanes");
  els.cannon = h("div.shoot-cannon", { "aria-hidden": "true" });
  els.field = h("div.shoot-field", { tabindex: "-1" }, els.lanesWrap, h("div.shoot-ground", { "aria-hidden": "true" }), els.cannon);
  els.status = h("p.sr-only", { role: "status" });
  els.alert = h("p.sr-only", { role: "alert" });
  els.stage.replaceChildren(h("div.shoot-game",
    h("div.score-line.shoot-hud", h("span", els.hearts, els.heartsText), h("span.tnum", h("span.shoot-label", "Score "), els.scoreNum),
      els.combo, els.count,
      h("span.shoot-hud-tools", els.pauseBtn, els.sound)),
    els.clue,
    still && speed !== "calm" ? h("div.shoot-clock", els.timebar, els.secs) : null,
    els.field, els.status, els.alert));
  ro = new ResizeObserver(() => { measure(); if (phase === "falling" || phase === "ready") place(); });
  ro.observe(els.field);
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

// ---------------------------------------------------------------- a wave

function wave() {
  const q = qs[w];
  const hadFocus = els.lanes ? els.lanes.indexOf(document.activeElement) : -1;
  resolved = false;
  phase = "ready";
  elapsed = 0;
  shownSecs = -1;
  fall = speed === "calm" ? Infinity : fallTime(q.prompt, level);
  lanes = pickLanes(q.options, q.answer, matchMedia("(max-width: 600px)").matches ? 3 : 4);
  els.clue.replaceChildren(h("p.q-ask", q.ask), q.hear
    ? h("button.btn.shoot-hear", { type: "button", on: { click: () => playWord(q) } }, "▶ Hear it again ",
      h("kbd", { "aria-hidden": "true" }, "Space"))
    : h("p.shoot-prompt", smart(q.prompt)));
  els.clue.onclick = null;
  els.pills = [];
  els.lanes = lanes.map((word, k) => {
    const pill = h("span.shoot-pill", { lang: "en", style: { fontSize: `${fontFor(word)}px` } }, smart(word));
    els.pills.push(pill);
    return h("button.shoot-lane", { type: "button", on: {
      // A mouse shoots on press. A finger waits for the click, so a swipe to
      // scroll the page never shoots. preventDefault keeps focus off the lane.
      pointerdown: e => { if (e.pointerType === "mouse" && e.button === 0) { e.preventDefault(); shoot(k); } },
      click: () => shoot(k),
    } }, pill, h("kbd", { "aria-hidden": "true" }, String(k + 1)));
  });
  els.ready = h("p.shoot-ready", { "aria-hidden": "true" }, "Get ready…");
  els.lanesWrap.style.setProperty("--lanes", lanes.length);
  els.lanesWrap.replaceChildren(...els.lanes);
  els.field.querySelectorAll(".shoot-card, .shoot-pause, .shoot-ready").forEach(x => x.remove());
  els.field.append(els.ready);
  if (still && isFinite(fall)) {
    els.timebar.firstChild.style.width = "100%";
    els.secs.textContent = `${Math.ceil(fall / 1000)}s`;
  }
  els.cannon.style.transform = "";
  hud();
  measure();
  place();
  if (hadFocus >= 0) els.lanes[Math.min(hadFocus, els.lanes.length - 1)].focus({ preventScroll: true });
  els.status.textContent = `Word ${endless ? w + 1 : `${w + 1} of ${qs.length}`}. ${q.ask} ${q.prompt}. Choices: ${lanes.map((x, k) => `${k + 1} ${x}`).join(", ")}.`;
  els.alert.textContent = "";
  shownAt = performance.now();
  if (q.hear) later(() => playWord(q), 300);
  later(startFall, w === 0 ? 2000 : 900);
  refill();
}

/** Sizes read once per wave (and on resize), never inside the loop. */
function measure() {
  if (!els.pills || !els.field.isConnected) return;
  const fh = els.field.clientHeight;
  geo = {
    h: fh, w: els.field.clientWidth,
    cx: els.lanes.map(l => l.offsetLeft + l.offsetWidth / 2),
    top: els.pills.map((p, i) => els.lanes[i].offsetTop + p.offsetTop),   // lanes are positioned, the field too
    ph: els.pills.map(p => p.offsetHeight),
  };
  geo.travel = els.pills.map((p, i) => Math.max(0, fh - GROUND - geo.top[i] - geo.ph[i] - 6));
}

function place() {
  if (!geo) return;
  const f = still || !isFinite(fall) ? 0 : Math.min(1, elapsed / fall);
  els.pills.forEach((p, i) => { p.style.transform = `translate3d(0,${(f * geo.travel[i]).toFixed(1)}px,0)`; });
}

function startFall() {
  if (phase !== "ready" || paused) return;
  els.ready.remove();
  if (!isFinite(fall)) return;   // Calm: no clock, the words stay still
  phase = "falling";
  if (!still) els.pills.forEach(p => p.classList.add("live"));
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function frame(now) {
  if (phase !== "falling" || paused) return;
  elapsed += Math.min(now - last, 50);
  last = now;
  if (still) {
    const secs = Math.max(0, Math.ceil((fall - elapsed) / 1000));
    if (secs !== shownSecs) {   // a step once a second
      shownSecs = secs;
      els.timebar.firstChild.style.width = `${(100 * secs * 1000) / fall}%`;
      els.secs.textContent = `${secs}s`;
    }
  } else place();
  if (elapsed >= fall) { resolved = true; stopLoop(); return miss(null); }
  raf = requestAnimationFrame(frame);
}

function shoot(k) {
  if (resolved || paused || (phase !== "ready" && phase !== "falling")) return;
  resolved = true;
  stopLoop();
  clearTimers();
  if (els.ready.isConnected) els.ready.remove();
  if (lanes[k] === qs[w].answer) hit(k); else miss(k);
}

function log(q, correct) {
  if (logged.has(q.word_id)) return;
  logged.add(q.word_id);
  const ms = Math.round(performance.now() - shownAt);
  posts.push(api.post("/api/answer", { word_id: q.word_id, mode: q.hear ? "listen" : "match", correct, ms }).catch(() => {}));
}

function mark(lane, right) {
  lane.classList.add(right ? "right" : "wrong");
  lane.setAttribute("aria-disabled", "true");
  lane.append(h("span.mark", { "aria-hidden": "true" }, right ? "✓" : "✗"),
    h("span.sr-only", right ? " (right answer)" : " (your answer)"));
}

// ---------------------------------------------------------------- hit and miss

function hit(k) {
  const q = qs[w];
  phase = "hit";
  log(q, true);
  streak++; hits++;
  bestRun = Math.max(bestRun, streak);
  const add = points({ streak, left: fall - elapsed, fall });
  score += add;
  const heartBack = streak % HEART_BACK_EVERY === 0 && hearts < 3;
  if (heartBack) hearts++;
  level = nextLevel(level, { hit: true, streak });
  sfx(heartBack ? "heart" : "hit");
  if (!still) effects(k, add, heartBack);
  mark(els.lanes[k], true);
  hud();
  els.clue.replaceChildren(h("p.shoot-strip", h("span.mark", { "aria-hidden": "true" }, "✓ "),
    h("b.fb-word", smart(q.word)), " — ", smart(q.definition)));
  els.clue.onclick = next;
  els.alert.textContent = `Right: ${q.word}. Plus ${add}.${heartBack ? " One heart back." : ""}`;
  if (settings.autoplay === "1" && !q.hear) later(() => playWord(q), 150);
  later(next, HIT_STRIP);
}

/** The shot: a beam from the cannon, the word pops, the points float up.
 * Worked out from the cached sizes; each effect removes itself. */
function effects(k, add, heartBack) {
  if (!geo) return;
  const y = geo.top[k] + (isFinite(fall) ? Math.min(1, elapsed / fall) : 0) * geo.travel[k] + geo.ph[k] / 2;
  const dx = geo.cx[k] - geo.w / 2;
  const dy = geo.h - GROUND / 2 - y;
  const angle = Math.atan2(dx, dy) * 180 / Math.PI;
  els.cannon.style.transform = `translateX(-50%) rotate(${angle.toFixed(1)}deg)`;
  const fx = (el, ms) => {
    els.field.append(el);
    el.addEventListener("animationend", () => el.remove());
    later(() => el.remove(), ms);   // in case the animation never runs
  };
  fx(h("div.shoot-beam", { "aria-hidden": "true", style: {
    left: `${geo.w / 2 - 1.5}px`, bottom: `${GROUND / 2}px`, height: `${Math.hypot(dx, dy)}px`,
    transform: `rotate(${angle.toFixed(1)}deg)` } }), 400);
  els.pills[k].classList.add("pop");
  fx(h("span.shoot-float.tnum", { "aria-hidden": "true", style: { left: `${geo.cx[k]}px`, top: `${y}px` } }, `+${add}`), 1200);
  if (heartBack) fx(h("span.shoot-float.heart", { "aria-hidden": "true", style: { left: `${geo.cx[k]}px`, top: `${y + 26}px` } }, "+1 heart"), 1200);
}

function miss(k) {
  const q = qs[w];
  phase = "miss";
  log(q, false);
  hearts--; streak = 0;
  level = nextLevel(level, { hit: false });
  if (!missed.includes(q)) missed.push(q);
  sfx("miss");
  buzz(30);
  const right = lanes.indexOf(q.answer);
  if (k !== null) {
    mark(els.lanes[k], false);
    if (!still) els.lanes[k].classList.add("shake");
  }
  mark(els.lanes[right], true);
  if (els.ready.isConnected) els.ready.remove();
  hud();
  const head = k === null ? "Too slow." : "Not quite.";
  const why = k !== null && q.explain && q.explain[lanes[k]];
  const cardAt = performance.now();
  const armed = fn => () => { if (performance.now() - cardAt >= CARD_ARM) fn(); };
  const goOn = h("button.btn.btn-primary", { type: "button", on: {
    click: armed(next),
    // Space hears the word (as the hint says), it doesn't press "Go on".
    keydown: e => { if (e.key === " ") { e.preventDefault(); e.stopPropagation(); playWord(q); } },
    keyup: e => { if (e.key === " ") e.preventDefault(); },
  } }, "Go on ", h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.field.append(h("div.feedback.bad.shoot-card",
    h("strong", head),
    why ? h("p.chose", h("span.label", "You chose"), " ", smart(why)) : null,
    h("p", h("b.fb-word", smart(q.word)), " ",
      q.phonetic ? h("span.ipa", { lang: "en-fonipa" }, q.phonetic) : null, " — ", smart(q.definition)),
    q.example ? h("p.example", highlight(q.example, q.word)) : null,
    h("div.toolbar",
      h("button.btn", { type: "button", on: { click: armed(() => playWord(q)) } }, "Hear it ", h("kbd", { "aria-hidden": "true" }, "Space")),
      goOn)));
  els.alert.textContent = `${head} The answer is ${q.word}. ${plural(hearts, "heart")} left.`;
  goOn.focus({ preventScroll: true });
}

/** On to the next word, or the results. */
function next() {
  if (paused || (phase !== "hit" && phase !== "miss")) return;
  const wasMiss = phase === "miss";
  clearTimers();
  if (hearts > 0 && w + 1 >= qs.length && refilling) return void later(next, 300);   // endless: more words are on the way
  if (hearts <= 0 || w + 1 >= qs.length) return finish();
  w++;
  wave();
  // The field, not a lane: another Enter or Space can't shoot before the clue is read.
  if (wasMiss) els.field.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- pause

function pause() {
  if (paused || !["ready", "falling", "hit"].includes(phase)) return;
  paused = true;
  stopLoop();
  clearTimers();
  pausedAt = performance.now();
  activeMs += pausedAt - runFrom;
  const goOn = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: resume } }, "Go on ",
    h("kbd", { "aria-hidden": "true" }, "Enter"));
  els.field.append(h("div.shoot-pause", h("p", "Paused"), goOn));
  els.pauseBtn.setAttribute("aria-pressed", "true");
  goOn.focus({ preventScroll: true });
}

function resume() {
  if (!paused) return;
  paused = false;
  const now = performance.now();
  shownAt += now - pausedAt;
  runFrom = now;
  els.field.querySelectorAll(".shoot-pause").forEach(x => x.remove());
  els.pauseBtn.setAttribute("aria-pressed", "false");
  els.field.focus({ preventScroll: true });
  if (phase === "hit") return next();
  if (phase === "ready") return void later(startFall, 900);
  if (!still) els.pills.forEach(p => p.classList.add("live"));
  last = now;
  raf = requestAnimationFrame(frame);
}

const onHide = () => { if (document.visibilityState === "hidden") pause(); };
const onBlur = () => pause();

// ---------------------------------------------------------------- results

function finish() {
  halt();
  phase = "done";
  const played = w + 1;
  const perfect = !endless && hits === qs.length;
  if (perfect) score += PERFECT_BONUS;
  activeMs += performance.now() - runFrom;
  const secs = activeMs / 1000;
  sfx("end");
  const kind = `word-shooter${endless ? "-endless" : ""}${clues === "hear" ? "-hear" : ""}`;
  api.post("/api/sessions", { kind, score: hits, total: played, duration_s: Math.round(secs) }).catch(() => {});
  if (missed.length) Promise.allSettled(posts).then(refreshDueCount);
  const { best, isNew } = saveBest(bestKey(), score);
  const top = scoreResult(bestKey(), boardLabel(), score);
  const again = h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: () => start() } }, "Play again");
  const retry = missed.length ? h("button.btn.btn-lg", { type: "button", on: {
    click: () => start(shuffle(missed.map(q => ({ ...q, options: shuffle([...q.options]) })))),
  } }, `Practice the ${plural(missed.length, "miss", "misses")}`) : null;
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", hearts > 0 ? "Round complete" : endless ? `Out of hearts after ${plural(played, "word")}` : "Out of hearts"),
    h("div.big-num.tnum", num(score)),
    perfect ? h("p.shoot-best", "Perfect round!") : null,
    isNew ? h("p.shoot-best", "New best!") : best > 0 ? h("p.muted.tnum", `Best: ${num(best)}`) : null,
    top.el,
    h("p.muted", `${hits} of ${played} words · best run ${bestRun} · ${fmtDuration(secs)}`),
    h("p.muted", "100 a word, more for fast shots, ×2 ×3 ×4 for hits in a row"),
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
      setPref("lexi-shooter-clues", v);
      seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      startCard();
    });
    return b;
  }));
  const speedSel = h("select.input", { "aria-label": "Speed" }, SPEEDS.map(([v, l]) => h("option", { value: v }, l)));
  speedSel.value = speed;
  speedSel.addEventListener("change", () => { speed = speedSel.value; setPref("lexi-shooter-speed", speed); startCard(); });
  const lengthSel = h("select.input", { "aria-label": "Length" }, LENGTHS.map(([v, l]) => h("option", { value: v }, l)));
  lengthSel.value = length;
  lengthSel.addEventListener("change", () => { length = lengthSel.value; setPref("lexi-shooter-length", length); startCard(); });
  els.root = root;
  els.stage = h("div.shoot-wrap");
  root.append(
    pageHead("Word Shooter", "Read the clue, or hear the word. Tap the word that fits before it falls.", seg, speedSel, lengthSel),
    await filterBar(f => { filter = f; startCard(); }, src, { tab: "shooter" }),
    els.stage);
  filter = loadFilter("shooter");
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
    if (paused) { e.preventDefault(); resume(); } else if (["ready", "falling", "hit"].includes(phase)) { e.preventDefault(); pause(); }
    return;
  }
  if (paused) {
    if (k === "Enter") { e.preventDefault(); resume(); }
    return;
  }
  if (/^[1-4]$/.test(k) && (phase === "ready" || phase === "falling")) {
    e.preventDefault();
    if (els.lanes[Number(k) - 1]) shoot(Number(k) - 1);
  } else if (k === "Enter") {
    if (phase === "idle" && els.stage.querySelector(".shoot-start")) { e.preventDefault(); start(); }
    else if (phase === "hit" || phase === "miss") { e.preventDefault(); next(); }
    else if (phase === "done") { e.preventDefault(); start(); }
  } else if (k === " " && (phase === "miss" || (qs[w] && qs[w].hear && (phase === "ready" || phase === "falling")))) {
    e.preventDefault();
    playWord(qs[w]);
  }
}
