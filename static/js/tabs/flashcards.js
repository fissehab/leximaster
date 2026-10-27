// Flashcards: word on the front; flip for pronunciation, meaning, examples.
// After the flip, "Missed" or "Knew it" records the answer (a miss brings the
// word up in today's review) and moves on; swipe left or right on a phone.
// The deck ends with a summary; the deck and place are kept for the visit.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { settings } from "../state.js";
import { emptyState, filterBar, filterSources, h, icon, pageHead, renderEntry, setKnown, showError, starsEl, toast } from "../ui.js";

let cards = [];
let idx = 0;
let flipped = false;
let els = {};
let filter = {};
let doShuffle = true;
let busy = false;
let token = 0;
let tally = { seen: new Set(), knew: 0, missed: 0, known: 0 };
let live = () => true;
const entries = new Map();   // word id -> Promise of its full entry (the back of the card)
const touch = matchMedia("(hover: none)").matches;

// The deck comes as fronts only; each back is loaded when needed, and the
// next card's ahead of time, so the first card shows at once.
function entry(w) {
  if (!entries.has(w.id)) {
    entries.set(w.id, api.get(`/api/words/${w.id}`).catch(e => { entries.delete(w.id); throw e; }));
  }
  return entries.get(w.id);
}

const SAVE_KEY = "lexi-flashcards";
const deckKey = () => JSON.stringify([filter.stars, filter.list_id, filter.domain, doShuffle]);
function saveDeck() {
  try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ key: deckKey(), cards, idx })); } catch (e) { /* unavailable */ }
}
function restoreDeck() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || "null");
    if (!s || s.key !== deckKey() || !s.cards.length) return false;
    ({ cards, idx } = s);
    return true;
  } catch (e) { return false; }
}

async function load({ resume = false } = {}) {
  const mine = ++token;
  tally = { seen: new Set(), knew: 0, missed: 0, known: 0 };
  entries.clear();
  if (resume && restoreDeck()) return show();
  try {
    const res = await api.get("/api/flashcards", { ...filter, n: 60, shuffle: doShuffle, brief: true });
    if (mine !== token || !live()) return;   // a newer request (or another tab) took over
    cards = res.cards;
    idx = 0;
    show();
  } catch (e) { showError(e); }
}

function show() {
  flipped = false;
  els.answer.hidden = true;
  if (!cards.length) {
    els.nav.hidden = true;
    els.stage.replaceChildren(emptyState("No cards match", "Widen the settings above to include more words."));
    return;
  }
  els.nav.hidden = false;
  if (idx >= cards.length) return finished();
  saveDeck();
  const w = cards[idx];
  tally.seen.add(w.id);
  // The front is a real button that names the word, so a screen reader hears
  // "headache, show the meaning" rather than only "flip card".
  const front = h("button.flip-face.front.panel", { type: "button", "aria-label": `${w.word}: show the meaning` },
    w.stars ? h("span.front-stars", { "aria-hidden": "true" }, "★".repeat(w.stars)) : null,
    h("span.headword", w.word),
    h("span.flip-hint", touch ? "Say it aloud, recall the meaning, then tap" : "Say it aloud, recall the meaning, then flip · Enter"));
  front.addEventListener("click", toggle);
  const back = h("div.flip-face.back.panel", { inert: true }, h("p.muted", "Loading…"));
  const flip = h("div.flip", front, back);
  els.flip = flip;
  els.stage.replaceChildren(h("div.flip-wrap", flip));
  els.counter.textContent = `${idx + 1} / ${cards.length}`;
  els.stars.replaceChildren(h("span.muted.stars-label", "Familiarity"), starsEl(w, { small: true }));
  const shown = idx;
  entry(w).then(full => {
    if (idx !== shown || els.flip !== flip) return;   // moved on meanwhile
    Object.assign(full, { stars: w.stars, known: w.known });   // changed on this card since the deck loaded
    back.replaceChildren(renderEntry(full, { compact: true }));
  }).catch(showError);
  if (idx + 1 < cards.length) entry(cards[idx + 1]).catch(() => {});
}

function toggle() {
  if (!els.flip) return;
  flipped = !flipped;
  els.flip.classList.toggle("flipped", flipped);
  els.flip.querySelector(".front").inert = flipped;
  const back = els.flip.querySelector(".back");
  back.inert = !flipped;
  els.answer.hidden = !flipped;
  const w = cards[idx];
  if (flipped) {
    const head = back.querySelector(".headword");
    if (head) { head.tabIndex = -1; head.focus({ preventScroll: true }); }
    if (settings.autoplay === "1") playWord(w, back.querySelector(".play"));
  } else {
    els.flip.querySelector(".front").focus({ preventScroll: true });
  }
}

function go(delta) {
  if (!cards.length) return;
  idx = Math.max(0, idx + delta);
  show();
}

/** After the flip: record how it went, then the next card. */
async function answer(correct) {
  if (busy || !flipped) return;
  busy = true;
  const w = cards[idx];
  try {
    await api.post("/api/answer", { word_id: w.id, mode: "flash", correct });
    if (correct) tally.knew++; else tally.missed++;
    go(1);
  } catch (e) { showError(e); }
  busy = false;
}

async function knowIt() {
  if (busy) return;
  busy = true;
  const w = cards[idx];
  try {
    if (w && !w.known) {
      await setKnown(w, true, { quiet: true });
      tally.known++;
      toast(`“${w.word}” marked as known`, { action: ["Undo", async () => {
        await setKnown(w, false, { quiet: true });
        tally.known--;
      }] });
    }
    go(1);
  } catch (e) { showError(e); }
  busy = false;
}

function finished() {
  els.nav.hidden = true;
  try { sessionStorage.removeItem(SAVE_KEY); } catch (e) { /* unavailable */ }
  const heading = h("h2", { tabindex: "-1" }, "Deck done");
  const weak = cards.filter(c => c.stars && c.stars <= 2).length;
  els.stage.replaceChildren(h("div.panel.done-state",
    heading,
    h("p.muted", `${tally.seen.size} card${tally.seen.size === 1 ? "" : "s"} seen` +
      (tally.knew || tally.missed ? ` · ${tally.knew} knew · ${tally.missed} missed (they come up in today's review)` : "") +
      (tally.known ? ` · ${tally.known} marked known` : "") + "."),
    h("div.toolbar",
      h("button.btn.btn-primary", { type: "button", on: { click: () => load() } }, "New deck"),
      h("button.btn", { type: "button", on: { click: () => { idx = 0; show(); } } }, "Go through again"),
      weak ? h("button.btn", { type: "button", on: { click: () => {
        cards = cards.filter(c => c.stars && c.stars <= 2);
        idx = 0;
        show();
      } } }, `Just the ★1–2 words (${weak})`) : null)));
  heading.focus({ preventScroll: true });
}

// Swipe left for the next card, right for the previous one.
function swipe(el) {
  let x0 = null, y0 = 0;
  el.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") { x0 = e.clientX; y0 = e.clientY; } });
  el.addEventListener("pointerup", e => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  el.addEventListener("pointercancel", () => { x0 = null; });
}

// After a mouse click the button would keep focus and take Enter and Space
// for itself (another "Next"); keyboard use keeps focus where it is.
const unfocus = e => { if (e.detail > 0) e.currentTarget.blur(); };

export async function render(root, { live: isLive } = {}) {
  live = isLive || (() => true);
  const src = await filterSources();
  const shuffleBtn = h("button.btn", { type: "button", "aria-pressed": String(doShuffle), title: "Shuffle order" },
    icon("shuffle"), doShuffle ? "Shuffled" : "In order");
  shuffleBtn.addEventListener("click", () => {
    doShuffle = !doShuffle;
    shuffleBtn.setAttribute("aria-pressed", String(doShuffle));
    shuffleBtn.lastChild.textContent = doShuffle ? "Shuffled" : "In order";
    load();
  });
  const autoplay = h("label.chip", { style: { cursor: "pointer" } },
    h("input#fc-autoplay", { type: "checkbox", checked: settings.autoplay === "1", on: { change: async e => {
      const { saveSettings } = await import("../state.js");
      saveSettings({ autoplay: e.target.checked }).catch(showError);
    } } }), "Play audio on flip");
  els.stage = h("div");
  swipe(els.stage);
  els.counter = h("span.tnum.muted");
  els.stars = h("span.fc-stars");
  els.answer = h("div.fc-answer", { hidden: true },
    h("button.btn.miss", { type: "button", on: { click: e => { unfocus(e); answer(false); } } }, "Missed it ", h("kbd", { "aria-hidden": "true" }, "X")),
    h("button.btn.knew", { type: "button", on: { click: e => { unfocus(e); answer(true); } } }, "Knew it ", h("kbd", { "aria-hidden": "true" }, "K")));
  els.nav = h("div.fc-dock",
    els.answer,
    h("div.fc-nav",
      h("button.btn", { type: "button", "aria-label": "Previous card", on: { click: e => { unfocus(e); go(-1); } } }, icon("arrowL"), h("span.lbl", "Previous")),
      h("button.btn.btn-primary", { type: "button", on: { click: e => { unfocus(e); toggle(); } } }, "Flip ", h("kbd", { "aria-hidden": "true" }, "Enter")),
      h("button.btn", { type: "button", "aria-label": "Next card", on: { click: e => { unfocus(e); go(1); } } }, h("span.lbl", "Next"), icon("arrowR")),
      els.counter),
    h("div.fc-nav", els.stars,
      h("button.btn.btn-quiet", { type: "button", on: { click: e => { unfocus(e); knowIt(); } } }, "Know it & next ", h("kbd", { "aria-hidden": "true" }, "M"))));
  root.append(
    pageHead("Flashcards", "Recall first, then check. Weaker words come up more often.", autoplay, shuffleBtn),
    await filterBar(f => { filter = f; load(); }, src, { tab: "flashcards" }),
    els.stage,
    els.nav,
  );
  filter = (await import("../state.js")).loadFilter("flashcards");
  await load({ resume: true });
}

export async function onKey(e) {
  if (!cards.length || idx >= cards.length) return;
  const w = cards[idx];
  const k = e.key.toLowerCase();
  if (e.key === "Enter") { e.preventDefault(); toggle(); }
  else if (e.key === " ") { e.preventDefault(); playWord(w, els.flip.querySelector(flipped ? ".back .play" : ".play")); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  else if (/^[1-5]$/.test(e.key)) {
    const { setStars } = await import("../ui.js");
    await setStars(w, Number(e.key));
    els.stars.querySelector(".stars").repaint();
  }
  else if (k === "m") { e.preventDefault(); knowIt(); }
  else if (k === "k" && flipped) { e.preventDefault(); answer(true); }
  else if (k === "x" && flipped) { e.preventDefault(); answer(false); }
}
