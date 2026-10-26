// Matching: click a word, then its meaning (or example sentence). Timed, scored.

import { api } from "../api.js";
import { practiceFilter } from "../state.js";
import { filterBar, filterSources, fmtDuration, h, pageHead, shuffle } from "../ui.js";

let kind = "meaning";
let size = 6;
let pairs = [];
let picked = null;       // { side, el, id }
let matched = 0;
let misses = 0;
let started = 0;
let timer = null;
let els = {};
let filter = { ...practiceFilter };
let roundToken = 0;
let missedIds = new Set();
let alive = false;

function score() {
  const secs = (Date.now() - started) / 1000;
  return Math.max(0, Math.round(matched * 100 - misses * 25 - secs));
}

function tick() {
  els.timer.textContent = fmtDuration((Date.now() - started) / 1000);
  els.score.textContent = `${matched}/${pairs.length} matched · ${misses} miss${misses === 1 ? "" : "es"}`;
}

async function start() {
  clearInterval(timer);
  const token = ++roundToken;
  let data;
  try {
    data = await api.get("/api/matching", { ...filter, kind, n: size });
  } catch (e) {
    if (token === roundToken && alive) els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start a round"), h("p", e.message)));
    return;
  }
  if (token !== roundToken || !alive) return;  // a newer round started, or the tab was left
  clearInterval(timer);
  pairs = data.pairs;
  matched = 0; misses = 0; picked = null; started = Date.now(); missedIds = new Set();
  const left = h("div.match-col", shuffle([...pairs]).map(p =>
    h("button.tile.word", { type: "button", "data-id": p.word_id, on: { click: e => pick("word", e.currentTarget, p) } }, p.word)));
  const right = h("div.match-col", shuffle([...pairs]).map(p =>
    h("button.tile.def", { type: "button", "data-id": p.word_id, on: { click: e => pick("def", e.currentTarget, p) } }, p.match)));
  els.stage.replaceChildren(h("div.match-grid", left, right));
  timer = setInterval(tick, 250);
  tick();
}

function pick(side, el, p) {
  if (el.classList.contains("matched")) return;
  if (!picked || picked.side === side) {
    if (picked) picked.el.classList.remove("picked");
    picked = { side, el, id: p.word_id };
    el.classList.add("picked");
    return;
  }
  const ok = picked.id === p.word_id;
  const wordId = side === "word" ? p.word_id : picked.id;
  if (ok || !missedIds.has(wordId)) {
    if (!ok) missedIds.add(wordId);
    api.post("/api/answer", { word_id: wordId, mode: "match", correct: ok }).catch(() => {});
  }
  if (ok) {
    [picked.el, el].forEach(x => { x.classList.remove("picked"); x.classList.add("matched"); x.disabled = true; });
    matched++;
  } else {
    misses++;
    [picked.el, el].forEach(x => { x.classList.remove("picked"); x.classList.add("miss"); setTimeout(() => x.classList.remove("miss"), 400); });
  }
  picked = null;
  tick();
  if (matched === pairs.length) finish();
}

function finish() {
  clearInterval(timer);
  const secs = (Date.now() - started) / 1000;
  const pts = score();
  api.post("/api/sessions", { kind: `matching-${kind}`, score: matched, total: matched + misses, duration_s: Math.round(secs) }).catch(() => {});
  els.stage.prepend(h("div.panel.result", { style: { marginBottom: "18px" } },
    h("span.eyebrow", "Round complete"),
    h("div.big-num.tnum", pts),
    h("p.muted", `${pairs.length} pairs in ${fmtDuration(secs)} with ${misses} miss${misses === 1 ? "" : "es"} · 100 per pair, −25 per miss, −1 per second`),
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Play again")));
}

export async function render(root) {
  const src = await filterSources();
  const seg = h("div.seg", { role: "group", "aria-label": "Match words with" },
    [["meaning", "Meanings"], ["example", "Example sentences"]].map(([v, l]) => {
      const b = h("button", { type: "button", "aria-pressed": String(kind === v) }, l);
      b.addEventListener("click", () => { kind = v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); start(); });
      return b;
    }));
  const sizeSel = h("select.input#match-size", { "aria-label": "Pairs" }, [4, 6, 8, 10].map(n => h("option", { value: n }, `${n} pairs`)));
  sizeSel.value = String(size);
  sizeSel.addEventListener("change", () => { size = Number(sizeSel.value); start(); });
  els.timer = h("span.timer", "0s");
  els.score = h("span.muted.tnum");
  els.stage = h("div");
  root.append(
    pageHead("Matching", "Pair each word with its meaning or with a sentence it completes. Faster and cleaner scores higher.", seg, sizeSel,
      h("button.btn.btn-primary", { type: "button", on: { click: start } }, "New round")),
    await filterBar(f => { filter = f; start(); }, src),
    h("div.score-line", { style: { marginBottom: "14px", justifyContent: "center" } }, els.timer, els.score),
    els.stage);
  filter = { ...practiceFilter };
  alive = true;
  await start();
  return () => { alive = false; clearInterval(timer); };
}
