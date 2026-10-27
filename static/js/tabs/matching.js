// Matching: click a word, then its meaning (or example sentence). Timed, scored.

import { api } from "../api.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, fmtDuration, h, pageHead, shuffle } from "../ui.js";

let kind = "meaning";
let size = matchMedia("(max-width: 600px)").matches ? 4 : 6;  // 4 pairs fit a phone screen
let pairs = [];
let picked = null;       // { side, el, id }
let matched = 0;
let misses = 0;
let started = 0;
let timer = null;
let els = {};
let filter = loadFilter("matching");
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
    h("button.tile.word", { type: "button", "aria-pressed": "false", "data-id": p.word_id, on: { click: e => pick("word", e.currentTarget, p) } }, p.word)));
  const right = h("div.match-col", shuffle([...pairs]).map(p =>
    h("button.tile.def", { type: "button", "aria-pressed": "false", "data-id": p.word_id, on: { click: e => pick("def", e.currentTarget, p) } }, p.match)));
  els.stage.replaceChildren(h("div.match-grid", left, right));
  els.status.textContent = `${pairs.length} pairs. Pick a word, then its ${kind === "meaning" ? "meaning" : "sentence"}.`;
  timer = setInterval(tick, 250);
  tick();
}

function pick(side, el, p) {
  if (el.classList.contains("matched")) return;
  if (!picked || picked.side === side) {
    if (picked) { picked.el.classList.remove("picked"); picked.el.setAttribute("aria-pressed", "false"); }
    if (picked && picked.el === el) { picked = null; return; }   // the same tile again: unpick
    picked = { side, el, id: p.word_id };
    el.classList.add("picked");
    el.setAttribute("aria-pressed", "true");
    return;
  }
  picked.el.setAttribute("aria-pressed", "false");
  const ok = picked.id === p.word_id;
  const wordId = side === "word" ? p.word_id : picked.id;
  if (ok || !missedIds.has(wordId)) {
    if (!ok) missedIds.add(wordId);
    api.post("/api/answer", { word_id: wordId, mode: "match", correct: ok }).catch(() => {});
  }
  if (ok) {
    [picked.el, el].forEach(x => { x.classList.remove("picked"); x.classList.add("matched"); x.disabled = true; x.removeAttribute("aria-pressed"); });
    matched++;
    const pair = pairs.find(x => x.word_id === p.word_id);
    els.status.textContent = `Matched: ${pair.word}. ${pairs.length - matched} left.`;
    // Focus would fall to the page when the tile is disabled: move it on to
    // the next tile still open in the column you were in.
    const col = el.closest(".match-col");
    const nextTile = [...col.querySelectorAll(".tile:not(.matched)")][0]
      || els.stage.querySelector(".tile:not(.matched)");
    if (nextTile) nextTile.focus({ preventScroll: true });
  } else {
    els.status.textContent = "Not a match. Try again.";
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
  const panel = h("div.panel.result", { style: { marginBottom: "18px" }, tabindex: "-1" },
    h("span.eyebrow", "Round complete"),
    h("div.big-num.tnum", pts),
    h("p.muted", `${pairs.length} pairs in ${fmtDuration(secs)} with ${misses} miss${misses === 1 ? "" : "es"} · 100 per pair, −25 per miss, −1 per second`),
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Play again"));
  els.stage.prepend(panel);
  els.status.textContent = `Round complete: ${pts} points.`;
  panel.focus();
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
  els.status = h("p.sr-only", { role: "status" });
  root.append(
    pageHead("Matching", "Pair each word with its meaning or with a sentence it completes. Faster and cleaner scores higher.", seg, sizeSel,
      h("button.btn.btn-primary", { type: "button", on: { click: start } }, "New round")),
    await filterBar(f => { filter = f; start(); }, src, { tab: "matching" }),
    h("div.score-line", { style: { marginBottom: "14px", justifyContent: "center" } }, els.timer, els.score),
    els.status,
    els.stage);
  filter = loadFilter("matching");
  alive = true;
  await start();
  return () => { alive = false; clearInterval(timer); };
}
