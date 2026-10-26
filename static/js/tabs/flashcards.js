// Flashcards: word on the front; flip for pronunciation, meaning, examples.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { settings } from "../state.js";
import { emptyState, filterBar, filterSources, h, icon, pageHead, renderEntry, setKnown, setStars, shuffle, showError } from "../ui.js";

let cards = [];
let idx = 0;
let flipped = false;
let els = {};
let filter = {};
let doShuffle = true;
const entries = new Map();   // word id -> Promise of its full entry (the back of the card)

// The deck comes as fronts only; each back is loaded when needed, and the
// next card's ahead of time, so the first card shows at once.
function entry(w) {
  if (!entries.has(w.id)) {
    entries.set(w.id, api.get(`/api/words/${w.id}`).catch(e => { entries.delete(w.id); throw e; }));
  }
  return entries.get(w.id);
}

async function load() {
  try {
    const res = await api.get("/api/flashcards", { ...filter, n: 60, shuffle: doShuffle, brief: true });
    cards = res.cards;
    entries.clear();
    idx = 0;
    show();
  } catch (e) { showError(e); }
}

function show() {
  flipped = false;
  if (!cards.length) {
    els.stage.replaceChildren(emptyState("No cards match", "Widen the filters above to include more words."));
    return;
  }
  const w = cards[idx];
  const flip = h("div.flip", { tabindex: "0", role: "button", "aria-label": "Flip card (Enter)" },
    h("div.flip-face.front.panel",
      w.stars ? h("span", { style: { color: "var(--gilt)" } }, "★".repeat(w.stars)) : null,
      h("h2.headword", w.word),
      h("p.flip-hint", "Say it aloud, recall the meaning, then flip · Enter")),
    h("div.flip-face.back.panel", { inert: true }, h("p.muted", "Loading…")));
  flip.addEventListener("click", e => { if (!e.target.closest("button")) toggle(); });
  els.flip = flip;
  els.stage.replaceChildren(h("div.flip-wrap", flip));
  els.counter.textContent = `${idx + 1} / ${cards.length}`;
  els.stars.replaceChildren(starsFor(w));
  const shown = idx;
  entry(w).then(full => {
    if (idx !== shown || els.flip !== flip) return;   // moved on meanwhile
    Object.assign(full, { stars: w.stars, known: w.known });   // changed on this card since the deck loaded
    flip.querySelector(".back").replaceChildren(renderEntry(full, { compact: true }));
  }).catch(showError);
  if (cards.length > 1) entry(cards[(idx + 1) % cards.length]).catch(() => {});
}

function starsFor(w) {
  const wrap = h("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } });
  const paint = () => wrap.replaceChildren(
    h("span.muted", { style: { fontSize: "13px" } }, "Familiarity"),
    ...[1, 2, 3, 4, 5].map(i => h("button.btn.btn-quiet", {
      type: "button", style: { minHeight: "30px", padding: "0 6px", color: i <= w.stars ? "var(--gilt)" : "var(--rule-strong)" },
      title: `${i} stars · key ${i}`, "aria-label": `${i} stars`,
      on: { click: async () => { try { await setStars(w, w.stars === i ? 0 : i); paint(); } catch (e) { showError(e); } } },
    }, "★")));
  paint();
  return wrap;
}

function toggle() {
  flipped = !flipped;
  els.flip.classList.toggle("flipped", flipped);
  els.flip.querySelector(".front").inert = flipped;
  els.flip.querySelector(".back").inert = !flipped;
  const w = cards[idx];
  if (flipped && settings.autoplay === "1") playWord(w, els.flip.querySelector(".back .play"));
}

function go(delta) {
  if (!cards.length) return;
  idx = (idx + delta + cards.length) % cards.length;
  show();
}

// After a mouse click the button would keep focus and take Enter and Space
// for itself (another "Next"); keyboard use keeps focus where it is.
const unfocus = e => { if (e.detail > 0) e.currentTarget.blur(); };

export async function render(root) {
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
      saveSettings({ autoplay: e.target.checked });
    } } }), "Play audio on flip");
  els.stage = h("div");
  els.counter = h("span.tnum.muted");
  els.stars = h("span");
  root.append(
    pageHead("Flashcards", "Recall first, then check. Weaker words come up more often.", autoplay, shuffleBtn),
    await filterBar(f => { filter = f; load(); }, src, { tab: "flashcards" }),
    els.stage,
    h("div.fc-nav", { style: { marginTop: "18px" } },
      h("button.btn", { type: "button", on: { click: e => { unfocus(e); go(-1); } } }, icon("arrowL"), "Previous"),
      h("button.btn.btn-primary", { type: "button", on: { click: e => { unfocus(e); toggle(); } } }, "Flip ", h("kbd", "Enter")),
      h("button.btn", { type: "button", on: { click: e => { unfocus(e); go(1); } } }, "Next", icon("arrowR")),
      els.counter),
    h("div.fc-nav", { style: { marginTop: "10px" } }, els.stars,
      h("button.btn.btn-quiet", { type: "button", on: { click: async e => { unfocus(e); const w = cards[idx]; if (w) { await setKnown(w, !w.known); go(1); } } } }, "Know it & next ", h("kbd", "M"))),
  );
  filter = (await import("../state.js")).loadFilter("flashcards");
  await load();
}

export async function onKey(e) {
  if (!cards.length) return;
  const w = cards[idx];
  if (e.key === "Enter") { e.preventDefault(); toggle(); }
  else if (e.key === " ") { e.preventDefault(); playWord(w, els.flip.querySelector(flipped ? ".back .play" : ".play")); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  else if (/^[1-5]$/.test(e.key)) { await setStars(w, Number(e.key)); els.stars.replaceChildren(starsFor(w)); }
  else if (e.key === "m" || e.key === "M") { await setKnown(w, !w.known); go(1); }
}
