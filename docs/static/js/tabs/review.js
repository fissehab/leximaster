// Daily review: SM-2 queue sized to the session target. Due cards are graded
// Again/Hard/Good/Easy; a new word is Show again, Got it, or Know it (known
// words leave the review).

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { settings } from "../state.js";
import { SCOPES, fmtDuration, h, icon, pageHead, renderEntry, setKnown, showError, toast } from "../ui.js";

let queue = [];
let pos = 0;
let total = 0;
let revealed = false;
let shownAt = 0;
let sessionStart = 0;
let els = {};
let busy = false;
let track = "";
try { track = localStorage.getItem("lexi-review-track") || ""; } catch (e) { /* storage unavailable */ }
const GRADES = [["again", "Again", "forgot"], ["hard", "Hard", "struggled"], ["good", "Good", "recalled"], ["easy", "Easy", "instant"]];

async function load(extra = 0) {
  const res = await api.get("/api/review/queue", { extra, track });
  queue = res.queue;
  pos = 0;
  total = queue.length;
  sessionStart = Date.now();
  els.meta = res;
  show();
}

function progress() {
  const pct = total ? (pos / total) * 100 : 100;
  els.bar.style.width = `${pct}%`;
  els.count.textContent = `${pos} / ${total}`;
}

function show() {
  revealed = false;
  progress();
  if (pos >= queue.length) return done();
  const w = queue[pos];
  shownAt = Date.now();
  const front = h("div.panel.card.card-front",
    w.is_new ? h("span.new-badge", "New word") : null,
    h("h2.headword", w.word),
    h("p.muted", "Recall the meaning and say it aloud, then reveal."),
    h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: reveal } }, "Reveal ", h("kbd", "Enter")));
  els.stage.replaceChildren(front);
  if (w.is_new && settings.autoplay === "1") playWord(w);
}

/** The answers offered for the card on screen: [class, label, hint, action]. */
function choices(w) {
  if (w.repeat) {
    return [["again", "Show again", "once more", () => grade(0)], ["good", "Got it", "done for today", () => grade(2)]];
  }
  if (w.is_new) {
    return [["again", "Show again", "later today", () => grade(0)], ["good", "Got it", "see it again soon", () => grade(2)],
            ["easy.for-good", "Know it", "for good", () => knowIt()]];
  }
  return GRADES.map(([cls, label, hint], i) => [cls, label, hint, () => grade(i)]);
}

function reveal() {
  if (revealed) return;
  revealed = true;
  const w = queue[pos];
  const buttons = h(`div.grade-row.n${choices(w).length}`, choices(w).map(([cls, label, hint, act], i) =>
    h(`button.grade.${cls}`, { type: "button", on: { click: act } },
      h("span", label, " ", h("kbd", String(i + 1))), h("small", hint))));
  const card = h("div.panel.card", renderEntry(w, { mode: "card" }));
  const fullBtn = h("button.btn.btn-quiet.full-entry", { type: "button", on: { click: () => {
    card.replaceChildren(renderEntry(w));
    fullBtn.remove();
  } } }, "Full entry");
  card.append(fullBtn);
  const prompt = w.repeat ? "Second look." : w.is_new ? "New word. Did it stick?" : "How well did you remember it?";
  // The buttons stay pinned to the bottom of the screen, however long the
  // entry is, so the way to the next word is always in view.
  els.stage.replaceChildren(card, h("div.grade-dock", h("p.grade-prompt", prompt), buttons));
  if (settings.autoplay === "1") playWord(w, els.stage.querySelector(".play"));
}

async function knowIt() {
  if (busy || !revealed) return;
  busy = true;
  const w = queue[pos];
  try {
    await setKnown(w, true, { quiet: true });
    pos++;
    show();
    refreshDueCount();
    toast(`“${w.word}” won't come up again.`, { action: ["Undo", async () => {
      await setKnown(w, false, { quiet: true });
      queue.splice(pos, 0, w);
      show();
      refreshDueCount();
    }] });
  } catch (e) { showError(e); }
  busy = false;
}

async function grade(g) {
  if (!revealed || busy) return;
  busy = true;
  const w = queue[pos];
  try {
    await api.post(`/api/review/${w.id}`, { grade: g, ms: Date.now() - shownAt, is_new: w.is_new, repeat: !!w.repeat });
    // "Again" puts the card back at the end of this session for another pass;
    // the re-pass is practice and doesn't reschedule the card a second time.
    if (g === 0) { queue.push({ ...w, is_new: false, repeat: true }); total++; }
    pos++;
    show();
    refreshDueCount();
  } catch (e) { showError(e); }
  busy = false;
}

async function done() {
  const mins = (Date.now() - sessionStart) / 1000;
  const words = new Set(queue.map(w => w.id)).size;   // repeats are the same word
  els.stage.replaceChildren(h("div.panel.done-state",
    h("div.seal", icon("check")),
    h("h2", "Done for today"),
    h("p.muted", words
      ? `You studied ${words} word${words === 1 ? "" : "s"} in ${fmtDuration(mins)}. Each comes back when you're about to forget it.`
      : "Nothing is due right now. Come back tomorrow, or learn a few new words now."),
    els.more = h("p.muted"),
    h("div.toolbar",
      h("button.btn.btn-primary", { type: "button", on: { click: () => load(5).catch(showError) } }, "Learn 5 more words"),
      h("a.btn", { href: "#quiz" }, "Take a quiz"))));
  if (total) api.post("/api/sessions", { kind: "review", score: words, total: words, duration_s: Math.round(mins) }).catch(() => {});
  // Words marked "Know it" make room for others: say so rather than claim the day is done.
  try {
    const left = await api.get("/api/review/queue", { count: 1, track });
    if (left.total) {
      els.more.replaceChildren(`${left.total} more ${left.total === 1 ? "is" : "are"} ready for today. `,
        h("button.btn.btn-quiet", { type: "button", on: { click: () => load().catch(showError) } }, "Continue"));
    }
  } catch (e) { /* the count is a nicety */ }
}

export async function render(root) {
  els.bar = h("span");
  els.count = h("span.tnum");
  els.stage = h("div.study-card");
  const lengths = [...new Set([5, 10, 15, 20, 30, Number(settings.session_minutes)])].sort((a, b) => a - b);
  const minutes = h("select.input#review-minutes", { "aria-label": "Session length" },
    lengths.map(m => h("option", { value: m }, `${m}-minute session`)));
  minutes.value = settings.session_minutes;
  minutes.addEventListener("change", async () => {
    const { saveSettings } = await import("../state.js");
    await saveSettings({ session_minutes: Number(minutes.value) });
    load().catch(showError);
  });
  const trackSel = h("select.input#review-track", { "aria-label": "Scope" },
    SCOPES.map(([v, label]) => h("option", { value: v }, label)));
  trackSel.value = track;
  trackSel.addEventListener("change", () => {
    track = trackSel.value;
    try { localStorage.setItem("lexi-review-track", track); } catch (e) { /* storage unavailable */ }
    load().catch(showError);
  });
  root.append(
    pageHead("Daily review", "Spaced repetition (SM-2). Grade honestly: low stars and quiz misses bring words back sooner.",
      trackSel, minutes),
    h("div.study-card", { style: { marginBottom: "18px" } },
      h("div.progress-row", h("div.progress", els.bar), els.count)),
    els.stage);
  await load();
}

export function onKey(e) {
  if (pos >= queue.length) return;
  if (e.key === "Enter" || (e.key === " " && !revealed)) {
    if (!revealed) { e.preventDefault(); reveal(); }
  } else if (e.key === " ") {
    e.preventDefault(); playWord(queue[pos], els.stage.querySelector(".play"));
  } else if (/^[1-4]$/.test(e.key) && revealed) {
    const pick = choices(queue[pos])[Number(e.key) - 1];
    if (pick) { e.preventDefault(); pick[3](); }
  } else if (e.key.toLowerCase() === "m" && revealed) {   // never before the answer has been seen
    e.preventDefault(); knowIt();
  }
}
