// Stats: mastery, streak, accuracy by domain, weakest words, test history,
// settings and progress export/import.

import { api, invalidateWords } from "../api.js";
import { playbackSpeed } from "../audio.js";
import { loadSettings, saveSettings, settings } from "../state.js";
import { domainLabel, fmtDuration, h, icon, levelPicker, pageHead, showError, toast } from "../ui.js";

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
  // Retention: reviews of words seen before, recalled (Hard or better).
  const spans = s.retention || {};
  const ret = Object.values(spans).reduce((a, x) => ({ n: a.n + x.n, ok: a.ok + x.ok }), { n: 0, ok: 0 });
  const tile = (label, value, note) => h("div.panel.stat", h("p.label", label), h("div.big-num.tnum", value), note ? h("small", note) : null);

  const activeDays = s.days.filter(d => d.reviews > 0);
  const heat = h("div.heat", { role: "img", "aria-label": `Activity over the last 12 weeks: reviews on ${activeDays.length} of 84 days, ` +
    `${activeDays.reduce((n, d) => n + d.reviews, 0).toLocaleString()} reviews in all.` }, s.days.map(d => {
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
    s.notice ? h("p.build-banner", { role: "alert" }, s.notice) : null,
    pageHead("Stats", [`${w.total.toLocaleString()} words in the lexicon`,
      `${w.with_audio.toLocaleString()} with American recordings`,
      w.enriched ? `${w.enriched.toLocaleString()} with nuance notes` : null].filter(Boolean).join(" · ")),
    h("div.stat-row",
      tile("Words mastered", w.mastered.toLocaleString(), `recalled after a 3+ week gap · ${(w.known || 0).toLocaleString()} more marked known`),
      tile("Learning", w.learning.toLocaleString(), `${w.due} due now`),
      tile("Daily streak", `${s.streak.current}`, `best ${s.streak.best} day${s.streak.best === 1 ? "" : "s"}${s.streak.today_done ? " · today done" : ""}`),
      tile("Retention", ret.n ? `${pct(ret.ok, ret.n)}%` : "—",
        ret.n ? `recalled at review, last 30 days · practice ${acc.attempts ? `${pct(acc.correct, acc.attempts)}%` : "—"}`
          : `shows after your first reviews · practice ${acc.attempts ? `${pct(acc.correct, acc.attempts)}%` : "—"}`)),
    h("div.stats-grid",
      h("section.panel", h("h2", "Activity"), heat, h("p.muted.bar-note", "Last 12 weeks; a stronger color means more reviews.")),
      h("section.panel", h("h2", "Reviews due, next 14 days"), forecast),
      ret.n ? h("section.panel", h("h2", "Retention by gap"),
        h("div.bars", [["days", "After days"], ["weeks", "After weeks"], ["months", "After a month+"]]
          .filter(([k]) => spans[k]).map(([k, label]) => bar(label, spans[k].ok, spans[k].n, `${pct(spans[k].ok, spans[k].n)}% · ${spans[k].n}`))),
        h("p.muted.bar-note", "Share of reviews you recalled, last 30 days. Around 85–90% means the schedule suits you.")) : null,
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
        h("div.bars", [5, 4, 3, 2, 1].map(n => bar(h("span.star-label", { "aria-label": `${n} star${n > 1 ? "s" : ""}` }, "★".repeat(n)), w.stars[n] || 0, Math.max(1, ...Object.values(w.stars)), String(w.stars[n] || 0), { count: true })))),
      settingsPanel(),
      dataPanel()));
}

function settingsPanel() {
  const minutes = h("input.input#set-minutes", { type: "number", min: 5, max: 60, value: settings.session_minutes });
  const perDay = h("input.input#set-new", { type: "number", min: 0, max: 100, value: settings.new_per_day });
  const rate = h("select.input#set-rate", [["1", "Normal (1×)"], ["0.75", "Slower (0.75×)"], ["0.5", "Slowest (0.5×)"]]
    .map(([v, l]) => h("option", { value: v }, l)));
  rate.value = String(playbackSpeed());
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
      h("div.field", h("label", { for: "set-rate" }, "Pronunciation speed"), rate),
      h("div.field", h("span.label", "Word levels"), levelPicker())),
    h("div", save));
}

async function exportProgress() {
  try {
    const withRecordings = document.getElementById("export-recordings");
    const data = await api.get("/api/export", withRecordings && withRecordings.checked ? { recordings: 1 } : {});
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = h("a", { href: url, download: `leximaster-progress-${data.exported_at}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    try { localStorage.setItem("lexi-last-export", String(Date.now())); } catch (e) { /* unavailable */ }
    const last = document.getElementById("last-backup");
    if (last) last.textContent = backupText();
  } catch (e) { showError(e); }
}

/** "Last backup: today" / "3 days ago" / "never". */
export function lastExportDays() {
  try {
    const t = Number(localStorage.getItem("lexi-last-export"));
    return t ? Math.floor((Date.now() - t) / 86400000) : null;
  } catch (e) { return null; }
}
function backupText() {
  const d = lastExportDays();
  return `Last export from this browser: ${d === null ? "never" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`}.`;
}

// Everything this browser saved, as it is stored, for when the app itself
// can't read it (a damaged save): nothing is interpreted or changed.
async function downloadRaw() {
  try {
    const { idbEntries } = await import("../local/idb.js");
    const entries = await idbEntries("state", "");
    const url = URL.createObjectURL(new Blob([JSON.stringify({ app: "LexiMaster raw save", saved_at: new Date().toISOString(),
      entries: Object.fromEntries(entries) })], { type: "application/json" }));
    const a = h("a", { href: url, download: `leximaster-raw-save-${new Date().toISOString().slice(0, 10)}.json` });
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
    h("p.muted", "Export saves ratings, review schedules, answers, lists, notes and your own words as JSON. " +
      "Import merges an export back in, keeping whichever copy of each word is newer."),
    h("label.check-row", h("input#export-recordings", { type: "checkbox" }),
      " Include my pronunciation recordings (a larger file)"),
    window.LEXI_STATIC ? h("p#last-backup", backupText()) : null,
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
  // Already downloaded: the data cache holds every detail file.
  if (window.caches) {
    caches.keys().then(async keys => {
      const data = keys.find(k => /^(lexi-)?data-/.test(k));
      if (!data) return;
      const files = (await (await caches.open(data)).keys()).filter(r => r.url.includes("/data/detail/"));
      if (files.length >= 64) { btn.disabled = true; btn.lastChild.textContent = "Available offline"; }
    }).catch(() => {});
  }
  const progressNote = h("span.muted.tnum", { "aria-live": "polite" });
  const onProgress = e => {
    if (!btn.isConnected) return removeEventListener("lexi-offline-progress", onProgress);
    progressNote.textContent = `${e.detail.done} of ${e.detail.total} files`;
  };
  addEventListener("lexi-offline-progress", onProgress);
  // Whether the browser has agreed not to clear this site's data on its own.
  const storageNote = h("p.muted");
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(yes => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      storageNote.textContent = yes ? "This browser keeps your progress until you clear it."
        : ios && !navigator.standalone ? "Safari clears a site's data after 7 days unused. Add LexiMaster to your Home Screen (Share → Add to Home Screen) to keep it, and export now and then."
        : "This browser may clear site data when space runs low: export now and then.";
    }).catch(() => {});
  }
  return h("div", { style: { marginTop: "14px" } },
    h("p.muted", "Your progress is saved in this browser on this device only. Use Export and Import to move it between devices."),
    storageNote,
    h("div.toolbar", btn, progressNote, h("a.btn", { href: "credits.html" }, "Sources & credits")),
    h("details.fold", h("summary", "Trouble with saved progress?"),
      h("div.fold-body", h("p.muted", "If LexiMaster can't read what this browser saved, download it exactly as stored and keep it safe."),
        h("button.btn", { type: "button", on: { click: downloadRaw } }, icon("download"), "Download raw saved data"))));
}
