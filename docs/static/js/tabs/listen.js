// Listen & Identify: hear the word, then pick or type it.
// Spelling test: hear it, type it exactly; letters are compared one by one.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, fmtDuration, h, markOption, pageHead, reveal, showError, toast } from "../ui.js";

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
let hinted = false;   // the pronunciation was shown instead of heard

const MODES = [["choose", "Pick the word"], ["type", "Type the word"], ["spell", "Spelling test"], ["stress", "Where's the stress?"]];

/** For "Where's the stress?": the respelling with each syllable stressed in
 * turn (in-EF-uh-bul, IN-ef-uh-bul…), at most four, the right one included.
 * Null for words without a clear single stressed syllable. */
function stressChoices(w) {
  const n = w.nuance || {};
  const r = n.pronunciation && n.pronunciation.respelling;
  if (!r || /\s/.test(w.word) || /\s/.test(r)) return null;
  const syl = r.split("-");
  const stressed = syl.map((x, i) => (/[A-Z]/.test(x) && x === x.toUpperCase() ? i : -1)).filter(i => i >= 0);
  if (syl.length < 2 || stressed.length !== 1) return null;
  const at = stressed[0];
  const variant = i => syl.map((x, k) => (k === i ? x.toUpperCase() : x.toLowerCase())).join("-");
  let idx = syl.map((_, i) => i);
  if (idx.length > 4) idx = idx.sort((a, b) => Math.abs(a - at) - Math.abs(b - at)).slice(0, 4).sort((a, b) => a - b);
  return { options: idx.map(variant), answer: variant(at) };
}
const clean = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();
// Spelling counts letters and apostrophes; sentence punctuation and case don't.
const spelling = s => s.replace(/[’‘]/g, "'").replace(/[?!.,…"“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function start() {
  const token = ++startToken;
  try {
    const res = await api.get("/api/listen", { ...filter, n: mode === "stress" ? 30 : 10, audio_only: audioOnly });
    if (token !== startToken) return;
    items = res.items;
    if (mode === "stress") {
      items = items.map(w => { const c = stressChoices(w); return c ? { ...w, options: c.options, answer: c.answer } : null; })
        .filter(Boolean).slice(0, 10);
      if (items.length < 3) throw new Error("Too few words here with a clear stressed syllable. Choose a wider scope.");
    }
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
  const playBtn = h("button.play.play-big", { type: "button", style: { width: "72px", height: "72px" }, "aria-label": "Play the word",
    "aria-keyshortcuts": "Space",
    html: '<svg viewBox="0 0 24 24" style="width:28px;height:28px"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>' });
  playBtn.addEventListener("click", play);
  let body;
  if (mode === "choose" || mode === "stress") {
    body = h(`div.options${mode === "stress" ? ".stress-opts" : ""}`, w.options.map((o, k) =>
      h("button.opt.word-opt", { type: "button", "data-v": o, on: { click: () => check(o) } }, h("span.key", { "aria-hidden": "true" }, String(k + 1)), h("span", o))));
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
        h("button.btn.btn-primary", { type: "submit" }, "Check ", h("kbd", { "aria-hidden": "true" }, "Enter")),
        mode === "type" ? h("button.btn", { type: "button", on: { click: () => hint(input) } }, "Hint") : null));
  }
  els.stage.replaceChildren(h("div.panel.q-card", { style: { alignItems: "center", textAlign: "center" } },
    h("div.score-line", h("span.tnum", `${i + 1} of ${items.length}`), h("span.tnum", `Score ${score}`)),
    playBtn,
    h("p.muted", w.has_audio ? "American recording" : w.tts_url ? "Natural synthesized voice (no US recording for this word)"
      : "Your device's American voice (no US recording for this word)"),
    h("div", { style: { width: "100%" } }, body),
    // Can't play sound right now (a quiet room, no headphones): see how it's
    // said instead. It counts as a hint, so the answer isn't scored as heard.
    mode === "stress" ? h("p.muted", "Which syllable is the strongest?") : h("button.btn.btn-quiet.cant-listen", { type: "button", on: { click: e => {
      const n = w.nuance || {};
      const respell = n.pronunciation && n.pronunciation.respelling;
      e.currentTarget.replaceWith(h("p.listen-hint", w.phonetic ? h("span.ipa", { lang: "en-fonipa" }, w.phonetic) : null,
        respell ? [" ", h("span.respell", respell)] : null));
      hinted = true;
    } } }, "Can't listen now?"),
    h("p.sr-only#listen-verdict", { role: "alert" }),
    h("div#listen-feedback", { style: { width: "100%", textAlign: "left" } })));
  hinted = false;
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
  // The correct spelling, each letter marked right or wrong after aligning the
  // two spellings (edit distance), so one missing letter marks one letter,
  // not everything after it. A letter typed but not in the word shows as "·".
  const a = typed.toLowerCase(), b = target.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const out = [];
  let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      out.push(h(`span.${a[i - 1] === b[j - 1] ? "ok" : "no"}`, target[j - 1])); i--; j--;
    } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
      out.push(h("span.no", target[j - 1])); j--;      // a letter left out
    } else {
      out.push(h("span.no.extra", "·")); i--;          // a letter too many
    }
  }
  return h("div.diff", out.reverse());
}

function check(value) {
  if (answered || !value.trim()) return;
  answered = true;
  const w = items[i];
  const right = mode === "spell" ? spelling(value) === spelling(w.word)
    : mode === "stress" ? value === w.answer
    : clean(spelling(value)) === clean(spelling(w.word));
  const ok = right && !hinted;
  if (ok) score++; else missed.push(w);
  if (mode === "choose" || mode === "stress") {
    const target = mode === "stress" ? w.answer : w.word;
    els.stage.querySelectorAll(".opt").forEach(b => markOption(b, b.dataset.v === target, b.dataset.v === value));
  }
  const def = w.nuance && w.nuance.core ? w.nuance.core.definition : w.def;
  const fb = document.getElementById("listen-feedback");
  const nextBtn = h("button.btn.btn-primary", { type: "button", on: { click: next } },
    i + 1 < items.length ? "Next " : "See results ", h("kbd", { "aria-hidden": "true" }, "Enter"));
  const verdict = ok ? "Correct" : right ? "Right, with the pronunciation shown" : "Not quite";
  document.getElementById("listen-verdict").textContent = `${verdict}. The word is ${w.word}.`;
  fb.replaceChildren(h(`div.feedback.${ok ? "ok" : "bad"}`,
    h("strong", verdict),
    !ok && mode !== "choose" && mode !== "stress" ? h("div", h("p.label", "Correct spelling (red letters differ from yours)"), diffView(value.trim(), w.word)) : null,
    mode === "stress" ? h("p", "Stress: ", h("span.respell", w.answer)) : null,
    h("p", h("b.fb-word", w.word), " ",
      w.phonetic ? h("span.ipa", { lang: "en-fonipa" }, w.phonetic) : null, def ? ` — ${def}` : ""),
    h("div.toolbar", nextBtn)));
  // The answer and the way on stay in view, even on a phone.
  reveal(fb);
  nextBtn.focus({ preventScroll: true });
  api.post("/api/answer", { word_id: w.id, mode: mode === "spell" ? "spell" : "listen", correct: right, ms: Date.now() - shownAt })
    .then(() => !right && refreshDueCount()).catch(showError);
}

function next() {
  if (!answered) return;
  i++;
  if (i < items.length) return show();
  const secs = (Date.now() - started) / 1000;
  api.post("/api/sessions", { kind: mode === "spell" ? "spelling" : mode === "stress" ? "stress" : "listening", score, total: items.length, duration_s: Math.round(secs) }).catch(() => {});
  els.stage.replaceChildren(h("div.panel.result",
    h("span.eyebrow", mode === "spell" ? "Spelling test complete" : mode === "stress" ? "Stress round complete" : "Listening round complete"),
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
  else if ((mode === "choose" || mode === "stress") && /^[1-4]$/.test(e.key) && !answered) { e.preventDefault(); check(items[i].options[Number(e.key) - 1]); }
  else if (e.key === "Enter" && answered) { e.preventDefault(); next(); }
}
