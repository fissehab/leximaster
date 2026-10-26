// Listen & Identify: hear the word, then pick or type it.
// Spelling test: hear it, type it exactly; letters are compared one by one.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, fmtDuration, h, pageHead, showError, toast } from "../ui.js";

let mode = "choose";       // choose | type | spell
let items = [];
let i = 0;
let score = 0;
let answered = false;
let started = 0;
let shownAt = 0;
let missed = [];
let audioOnly = true;
let els = {};
let filter = loadFilter("listen");
let playTimer = null;
let startToken = 0;

const MODES = [["choose", "Pick the word"], ["type", "Type the word"], ["spell", "Spelling test"]];
const clean = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();
// Spelling counts letters and apostrophes; sentence punctuation and case don't.
const spelling = s => s.replace(/[’‘]/g, "'").replace(/[?!.,…"“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function start() {
  const token = ++startToken;
  try {
    const res = await api.get("/api/listen", { ...filter, n: 10, audio_only: audioOnly });
    if (token !== startToken) return;
    items = res.items;
    if (res.fallback) {
      audioOnly = false;
      document.getElementById("listen-audio-only").checked = false;
      toast("Not enough words with recordings here yet, so synthesized voice is included.");
    }
  } catch (e) {
    els.stage.replaceChildren(h("div.panel.empty", h("h2", "Can't start"), h("p", e.message)));
    return;
  }
  i = 0; score = 0; missed = []; started = Date.now();
  show();
}

function play() { return playWord(items[i], els.stage.querySelector(".play-big")); }

function show() {
  answered = false;
  shownAt = Date.now();
  const w = items[i];
  const playBtn = h("button.play.play-big", { type: "button", style: { width: "72px", height: "72px" }, "aria-label": "Play again (Space)",
    html: '<svg viewBox="0 0 24 24" style="width:28px;height:28px"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>' });
  playBtn.addEventListener("click", play);
  let body;
  if (mode === "choose") {
    body = h("div.options", w.options.map((o, k) =>
      h("button.opt", { type: "button", "data-v": o, on: { click: () => check(o) } }, h("span.key", String(k + 1)), h("span", { style: { fontFamily: "var(--font-word)", fontWeight: 600 } }, o))));
  } else {
    const input = h("input.input.type-in#listen-input", { type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: false,
      "aria-label": mode === "spell" ? "Spelling" : "The word you hear",
      placeholder: mode === "spell" ? "Type the exact spelling" : "Type the word you hear" });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); answered ? next() : check(input.value); }
      if (e.key === " " && !input.value) { e.preventDefault(); play(); }
    });
    body = h("form", { on: { submit: e => { e.preventDefault(); check(input.value); } } }, input,
      h("div.toolbar", { style: { marginTop: "10px", justifyContent: "center" } },
        h("button.btn.btn-primary", { type: "submit" }, "Check ", h("kbd", "Enter")),
        mode === "type" ? h("button.btn", { type: "button", on: { click: () => hint(input) } }, "Hint") : null));
  }
  els.stage.replaceChildren(h("div.panel.q-card", { style: { alignItems: "center", textAlign: "center" } },
    h("div.score-line", h("span.tnum", `${i + 1} of ${items.length}`), h("span.tnum", `Score ${score}`)),
    playBtn,
    h("p.muted", w.has_audio ? "American recording" : "American synthesized voice (no US recording for this word)"),
    h("div", { style: { width: "100%" } }, body),
    h("div#listen-feedback", { style: { width: "100%", textAlign: "left" } })));
  const input = document.getElementById("listen-input");
  if (input) input.focus();
  clearTimeout(playTimer);
  playTimer = setTimeout(play, 150);
}

function hint(input) {
  const w = items[i].word;
  input.value = w.slice(0, Math.min(w.length - 1, input.value.length + 1));
  input.focus();
}

function diffView(typed, target) {
  // Letter-by-letter comparison, aligned by position after a common prefix/suffix.
  const out = [];
  const n = Math.max(typed.length, target.length);
  for (let k = 0; k < n; k++) {
    const t = target[k] || "", c = typed[k] || "";
    out.push(h(`span.${t.toLowerCase() === c.toLowerCase() ? "ok" : "no"}`, t || "·"));
  }
  return h("div.diff", out);
}

function check(value) {
  if (answered || !value.trim()) return;
  answered = true;
  const w = items[i];
  const ok = mode === "spell" ? spelling(value) === spelling(w.word)
    : clean(spelling(value)) === clean(spelling(w.word));
  if (ok) score++; else missed.push(w);
  if (mode === "choose") {
    els.stage.querySelectorAll(".opt").forEach(b => {
      b.disabled = true;
      if (b.dataset.v === w.word) b.classList.add("right"); else if (b.dataset.v === value) b.classList.add("wrong");
    });
  }
  const def = w.nuance && w.nuance.core ? w.nuance.core.definition : w.def;
  const fb = document.getElementById("listen-feedback");
  const nextBtn = h("button.btn.btn-primary", { type: "button", on: { click: next } },
    i + 1 < items.length ? "Next " : "See results ", h("kbd", "Enter"));
  fb.replaceChildren(h(`div.feedback.${ok ? "ok" : "bad"}`,
    h("strong", ok ? "Correct" : "Not quite"),
    !ok && mode !== "choose" ? h("div", h("p.label", "Correct spelling (red letters differ from yours)"), diffView(value.trim(), w.word)) : null,
    h("p", h("b", { style: { fontFamily: "var(--font-word)", color: "var(--lapis)" } }, w.word), " ",
      w.phonetic ? h("span.ipa", w.phonetic) : null, def ? ` — ${def}` : ""),
    h("div.toolbar", nextBtn)));
  // The answer and the way on stay in view, even on a phone.
  fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
  nextBtn.focus({ preventScroll: true });
  api.post("/api/answer", { word_id: w.id, mode: mode === "spell" ? "spell" : "listen", correct: ok, ms: Date.now() - shownAt })
    .then(() => !ok && refreshDueCount()).catch(showError);
}

function next() {
  if (!answered) return;
  i++;
  if (i < items.length) return show();
  const secs = (Date.now() - started) / 1000;
  api.post("/api/sessions", { kind: mode === "spell" ? "spelling" : "listening", score, total: items.length, duration_s: Math.round(secs) }).catch(() => {});
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", mode === "spell" ? "Spelling test complete" : "Listening round complete"),
    h("div.big-num.tnum", `${score}/${items.length}`),
    h("p.muted", fmtDuration(secs)),
    missed.length ? h("div.missed", h("p.label", "Added back to today's review"),
      h("ul", missed.map(w => h("li", h("a", { href: `#browse/${w.id}` }, w.word), w.phonetic ? h("span.ipa", "  ", w.phonetic) : null)))) : null,
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: start } }, "Another round")));
}

export async function render(root) {
  const src = await filterSources();
  const seg = h("div.seg", { role: "group", "aria-label": "Mode" }, MODES.map(([v, l]) => {
    const b = h("button", { type: "button", "aria-pressed": String(mode === v) }, l);
    b.addEventListener("click", () => { mode = v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); start(); });
    return b;
  }));
  const rec = h("label.chip", { style: { cursor: "pointer" } },
    h("input#listen-audio-only", { type: "checkbox", checked: audioOnly, on: { change: e => { audioOnly = e.target.checked; start(); } } }),
    "US recordings only");
  els.stage = h("div.q-wrap");
  root.append(
    pageHead("Listen & identify", "The audio plays first. Name the word you hear, or spell it exactly.", seg, rec),
    await filterBar(f => { filter = f; start(); }, src, { tab: "listen" }),
    els.stage);
  filter = loadFilter("listen");
  await start();
  return () => { clearTimeout(playTimer); startToken++; };
}

export function onKey(e) {
  if (!items.length || i >= items.length) return;
  if (e.key === " ") { e.preventDefault(); play(); }
  else if (mode === "choose" && /^[1-4]$/.test(e.key) && !answered) { e.preventDefault(); check(items[i].options[Number(e.key) - 1]); }
  else if (e.key === "Enter" && answered) { e.preventDefault(); next(); }
}
