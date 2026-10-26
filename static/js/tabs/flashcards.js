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

async function load() {
  try {
    const res = await api.get("/api/flashcards", { ...filter, n: 60, shuffle: doShuffle });
    cards = res.cards;
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
    h("div.flip-face.back.panel", { inert: true }, renderEntry(w, { compact: true })));
  flip.addEventListener("click", e => { if (!e.target.closest("button")) toggle(); });
  els.flip = flip;
  els.stage.replaceChildren(h("div.flip-wrap", flip));
  els.counter.textContent = `${idx + 1} / ${cards.length}`;
  els.stars.replaceChildren(starsFor(w));
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
      h("button.btn", { type: "button", on: { click: () => go(-1) } }, icon("arrowL"), "Previous"),
      h("button.btn.btn-primary", { type: "button", on: { click: toggle } }, "Flip ", h("kbd", "Enter")),
      h("button.btn", { type: "button", on: { click: () => go(1) } }, "Next", icon("arrowR")),
      els.counter),
    h("div.fc-nav", { style: { marginTop: "10px" } }, els.stars,
      h("button.btn.btn-quiet", { type: "button", on: { click: async () => { const w = cards[idx]; if (w) { await setKnown(w, !w.known); go(1); } } } }, "Mark known & next ", h("kbd", "M"))),
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
