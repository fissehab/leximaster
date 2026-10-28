// Pronunciation practice: hear the reference, record yourself, compare side by side.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { recordCompare } from "../recorder.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, h, pageHead, showError } from "../ui.js";

let words = [];
let current = null;
let box = null;           // the reference and your recording (recorder.js)
let els = {};
let filter = loadFilter("pronounce");
let alive = false;        // false once the tab is left
let chooseToken = 0;

let wordsToken = 0;
async function loadWords() {
  const mine = ++wordsToken;
  try {
    const res = await api.get("/api/practice/words", { ...filter, n: 60 });
    if (mine !== wordsToken || !alive) return;
    words = res.words;
  } catch (e) { return showError(e); }
  els.picker.replaceChildren(...words.map(w => {
    const b = h("button", { type: "button", "aria-current": "false", on: { click: () => choose(w.id) } }, w.word, h("small", { "aria-hidden": "true" }, w.phonetic || " "));
    b.dataset.id = w.id;
    return b;
  }));
  if (words.length) choose(words[0].id);
  else els.stage.replaceChildren(h("div.panel.empty", h("h2", "No words match"), h("p", "Widen the filters to choose words to practice.")));
}

async function choose(id) {
  if (box) box.stop();
  const token = ++chooseToken;
  let w;
  try { w = await api.get(`/api/words/${id}`); } catch (e) { return showError(e); }
  if (token !== chooseToken || !alive) return;
  current = w;
  els.picker.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", String(Number(b.dataset.id) === id)));
  paint();
  // On a phone the list sits below the stage: bring the chosen word into view.
  if (matchMedia("(max-width: 900px)").matches) els.stage.scrollIntoView({ block: "start" });
}

function paint() {
  const w = current;
  const n = w.nuance || {};
  box = recordCompare(w);
  box.style.marginTop = "14px";
  box.querySelector(".rec-btn").setAttribute("aria-keyshortcuts", "R");
  els.stage.replaceChildren(
    h("div.panel", { style: { padding: "22px", display: "flex", flexDirection: "column", gap: "14px" } },
      h("div.entry-top", h("h2.headword", w.word)),
      h("div.entry-pron", w.phonetic ? h("span.ipa", { lang: "en-fonipa" }, w.phonetic) : null,
        n.pronunciation && n.pronunciation.respelling ? h("span.respell", n.pronunciation.respelling) : null),
      n.pronunciation && n.pronunciation.tip ? h("p", { style: { fontFamily: "var(--font-body)", maxWidth: "65ch" } }, n.pronunciation.tip) : null),
    box);
}

export async function render(root) {
  const src = await filterSources();
  els.picker = h("div.panel.pick-list", { "aria-label": "Words to practice" });
  els.stage = h("div");
  root.append(
    pageHead("Pronunciation", "Listen to the reference, record yourself (up to 8 seconds), then play both back to compare."),
    await filterBar(f => { filter = f; loadWords().catch(showError); }, src, { tab: "pronounce" }),
    h("div.pron-layout", els.picker, els.stage));
  filter = loadFilter("pronounce");
  alive = true;
  current = null;
  await loadWords();
  return () => { alive = false; if (box) box.stop(); };
}

export function onKey(e) {
  if (!current) return;
  if (e.key === " ") { e.preventDefault(); playWord(current); }
  else if (e.key === "r" || e.key === "R") { e.preventDefault(); if (box) box.toggle(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const k = words.findIndex(w => w.id === current.id) + (e.key === "ArrowDown" ? 1 : -1);
    if (words[k]) choose(words[k].id);
  }
}
