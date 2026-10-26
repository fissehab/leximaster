// Stats: mastery, streak, accuracy by domain, weakest words, test history,
// settings and progress export/import.

import { api, invalidateWords } from "../api.js";
import { loadSettings, saveSettings, settings } from "../state.js";
import { domainLabel, fmtDuration, h, icon, pageHead, showError, toast } from "../ui.js";

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

function bar(label, value, total, extra, { count = false } = {}) {
  const p = pct(value, total);
  const tone = count ? ".count" : p < 60 ? ".low" : p < 80 ? ".mid" : "";
  return h("div.bar-row",
    h("span", label),
    h("div.bar", h(`span${tone}`, { style: { width: `${p}%` } })),
    h("span.v", extra || `${p}%`));
}

export async function render(root) {
  const s = await api.get("/api/stats");
  const w = s.words;
  const acc = s.accuracy;
  const tile = (label, value, note) => h("div.panel.stat", h("p.label", label), h("div.big-num.tnum", value), note ? h("small", note) : null);

  const heat = h("div.heat", { "aria-label": "Activity over the last 12 weeks" }, s.days.map(d => {
    const l = d.reviews === 0 && d.seconds < 60 ? 0 : d.reviews < 10 ? 1 : d.reviews < 25 ? 2 : d.reviews < 50 ? 3 : 4;
    return h("span", { "data-l": l, title: `${d.date}: ${d.reviews} reviews, ${fmtDuration(d.seconds)}` });
  }));
  const fmax = Math.max(1, ...s.forecast.map(f => f.n));
  const forecast = s.forecast.length
    ? h("div.forecast", s.forecast.map(f => h("div", { title: `${f.date}: ${f.n} due` },
        h("span.tnum", f.n), h("i", { style: { height: `${(f.n / fmax) * 60}px` } }),
        new Date(f.date + "T12:00").toLocaleDateString(undefined, { weekday: "short" }))))
    : h("p.muted", "No reviews scheduled in the next two weeks yet.");

  root.append(
    pageHead("Stats", [`${w.total.toLocaleString()} words in the lexicon`,
      `${w.with_audio.toLocaleString()} with American recordings`,
      w.enriched ? `${w.enriched.toLocaleString()} with nuance notes` : null].filter(Boolean).join(" · ")),
    h("div.stat-row",
      tile("Words mastered", w.mastered.toLocaleString(), `interval of 3+ weeks, or marked known`),
      tile("Learning", w.learning.toLocaleString(), `${w.due} due now`),
      tile("Daily streak", `${s.streak.current}`, `best ${s.streak.best} day${s.streak.best === 1 ? "" : "s"}${s.streak.today_done ? " · today done" : ""}`),
      tile("Accuracy", acc.attempts ? `${pct(acc.correct, acc.attempts)}%` : "—", `${acc.attempts.toLocaleString()} answers`)),
    h("div.stats-grid",
      h("section.panel", h("h2", "Activity"), heat, h("p.muted", { style: { fontSize: "12.5px" } }, "Last 12 weeks; darker means more reviews.")),
      h("section.panel", h("h2", "Reviews due, next 14 days"), forecast),
      h("section.panel", h("h2", "Accuracy by domain"),
        s.by_domain.length ? h("div.bars", s.by_domain.map(d => bar(domainLabel(d.domain), d.correct, d.attempts, `${pct(d.correct, d.attempts)}% · ${d.attempts}`)))
          : h("p.muted", "Answer some quiz, listening or review questions to see this.")),
      h("section.panel", h("h2", "Weakest words"),
        s.weakest.length ? h("div.table-wrap", h("table.data",
          h("thead", h("tr", h("th", "Word"), h("th", "Accuracy"), h("th", "Misses"), h("th", "Attempts"))),
          h("tbody", s.weakest.map(x => h("tr",
            h("td.w", h("button", { type: "button", on: { click: () => (location.hash = `#browse/${x.id}`) } }, x.word)),
            h("td", `${Math.round(x.accuracy * 100)}%`), h("td", x.misses), h("td", x.attempts))))))
          : h("p.muted", "Words you miss more than once will appear here.")),
      h("section.panel", h("h2", "Test history"),
        s.tests.length ? h("div.table-wrap", h("table.data",
          h("thead", h("tr", h("th", "When"), h("th", "Activity"), h("th", "Score"), h("th", "Time"))),
          h("tbody", s.tests.map(t => h("tr",
            h("td", new Date(t.ts.replace(" ", "T")).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
            h("td", t.kind.replace(/-/g, " ")),
            h("td", `${t.score}/${t.total} (${pct(t.score, t.total)}%)`),
            h("td", fmtDuration(t.duration_s)))))))
          : h("p.muted", "Quizzes, matching rounds and listening tests are recorded here.")),
      h("section.panel", h("h2", "Ratings"),
        h("div.bars", [5, 4, 3, 2, 1].map(n => bar("★".repeat(n), w.stars[n] || 0, Math.max(1, ...Object.values(w.stars)), String(w.stars[n] || 0), { count: true })))),
      settingsPanel(),
      dataPanel()));
}

function settingsPanel() {
  const minutes = h("input.input#set-minutes", { type: "number", min: 5, max: 60, value: settings.session_minutes });
  const perDay = h("input.input#set-new", { type: "number", min: 0, max: 100, value: settings.new_per_day });
  const rate = h("select.input#set-rate", [["0.75", "Slow"], ["0.9", "Measured"], ["1", "Natural"]].map(([v, l]) => h("option", { value: v }, l)));
  rate.value = String(parseFloat(settings.speech_rate));
  if (!rate.value) rate.value = "0.9";
  const save = h("button.btn.btn-primary", { type: "button", on: { click: async () => {
    try {
      await saveSettings({ session_minutes: Number(minutes.value), new_per_day: Number(perDay.value), speech_rate: Number(rate.value) });
      await loadSettings();
      toast("Settings saved");
    } catch (e) { showError(e); }
  } } }, "Save settings");
  return h("section.panel", h("h2", "Study settings"),
    h("div.setup-row",
      h("div.field", h("label", { for: "set-minutes" }, "Session minutes"), minutes),
      h("div.field", h("label", { for: "set-new" }, "New words per day"), perDay),
      h("div.field", h("label", { for: "set-rate" }, "Voice speed"), rate)),
    h("div", save));
}

async function exportProgress() {
  try {
    const data = await api.get("/api/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = h("a", { href: url, download: `leximaster-progress-${data.exported_at}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { showError(e); }
}

function dataPanel() {
  const file = h("input#import-file", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", async () => {
    if (!file.files[0]) return;
    const fd = new FormData();
    fd.append("file", file.files[0]);
    try {
      const res = await api.post("/api/import", fd);
      invalidateWords();
      toast(`Imported ${Object.entries(res.imported).map(([k, v]) => `${v} ${k}`).join(", ")}. Reloading…`, { ms: 3000 });
      setTimeout(() => location.reload(), 2500);
    } catch (e) { showError(e); }
    file.value = "";
  });
  return h("section.panel", h("h2", "Your data"),
    h("p.muted", "Export saves ratings, review schedules, answers, lists, notes and your own words as JSON. Import merges an export back in."),
    h("div.toolbar",
      h("button.btn", { type: "button", on: { click: exportProgress } }, icon("download"), "Export progress"),
      h("button.btn", { type: "button", on: { click: () => file.click() } }, icon("upload"), "Import progress"),
      file),
    window.LEXI_STATIC ? sitePanel() : null);
}

// On the website, progress stays in this browser; offer offline use and credits.
function sitePanel() {
  const btn = h("button.btn", { type: "button" }, icon("download"), "Download for offline use");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.lastChild.textContent = "Downloading…";
    try {
      await api.post("/api/offline");
      toast("Every entry is saved on this device. LexiMaster now works offline; recordings play offline once heard.");
      btn.lastChild.textContent = "Available offline";
    } catch (e) {
      showError(e);
      btn.disabled = false;
      btn.lastChild.textContent = "Download for offline use";
    }
  });
  return h("div", { style: { marginTop: "14px" } },
    h("p.muted", "Your progress is saved in this browser on this device only. Use Export and Import to move it between devices."),
    h("div.toolbar", btn, h("a.btn", { href: "credits.html" }, "Sources & credits")));
}
