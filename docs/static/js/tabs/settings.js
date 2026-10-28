// Settings: how you study (session length, new words, word levels,
// pronunciation speed), the theme, and your data (export, import, offline use).

import { api, invalidateWords } from "../api.js";
import { savedTheme, setTheme, THEMES } from "../app.js";
import { playbackSpeed } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { loadSettings, saveSettings, setStudyFocus, settings, studyFocus } from "../state.js";
import { h, icon, levelPicker, pageHead, SCOPES, showError, toast } from "../ui.js";

export async function render(root) {
  root.append(pageHead("Settings", "How you study, how LexiMaster looks, and your saved progress."),
    h("div.settings-grid", settingsPanel(), themePanel(), dataPanel()));
}

function settingsPanel() {
  const minutes = h("input.input#set-minutes", { type: "number", min: 5, max: 60, value: settings.session_minutes });
  const perDay = h("input.input#set-new", { type: "number", min: 0, max: 100, value: settings.new_per_day });
  const rate = h("select.input#set-rate", [["1", "Normal (1×)"], ["0.75", "Slower (0.75×)"], ["0.5", "Slowest (0.5×)"]]
    .map(([v, l]) => h("option", { value: v }, l)));
  rate.value = String(playbackSpeed());
  const focus = h("select.input#set-focus", SCOPES.map(([v, l]) => h("option", { value: v }, l)));
  focus.value = studyFocus();
  focus.addEventListener("change", () => {
    setStudyFocus(focus.value);
    refreshDueCount();
    toast(`Daily review, Home and the practice tabs now study: ${focus.selectedOptions[0].textContent}`);
  });
  const save = h("button.btn.btn-primary", { type: "button", on: { click: async () => {
    try {
      await saveSettings({ session_minutes: Number(minutes.value), new_per_day: Number(perDay.value), speech_rate: Number(rate.value) });
      await loadSettings();
      toast("Settings saved");
    } catch (e) { showError(e); }
  } } }, "Save settings");
  return h("section.panel", h("h2", "Study"),
    h("div.setup-row",
      h("div.field", h("label", { for: "set-focus" }, "Study focus"), focus),
      h("div.field", h("label", { for: "set-minutes" }, "Session minutes"), minutes),
      h("div.field", h("label", { for: "set-new" }, "New words per day"), perDay),
      h("div.field", h("label", { for: "set-rate" }, "Pronunciation speed"), rate),
      h("div.field", h("span.label", "Word levels"), levelPicker())),
    h("p.muted", "Study focus is what Daily review and Home study, and where every practice tab starts (each tab can " +
      "still pick its own). Study focus and word levels change at once; the other settings when you save. Both are " +
      "also in Daily review."),
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

// The four themes (app.js); the choice is kept in this browser.
function themePanel() {
  const current = savedTheme();
  return h("section.panel", h("h2", "Theme"),
    h("div.theme-choices", { role: "radiogroup", "aria-label": "Theme" }, THEMES.map(t => h("label.theme-choice",
      h("input", { type: "radio", name: "theme", value: t.id, checked: t.id === current,
        on: { change: () => setTheme(t.id) } }),
      h("span.theme-swatch", { "aria-hidden": "true" }, t.swatch.map(c => h("i", { style: { background: c } }))),
      h("span", t.name)))),
    h("p.muted", "Match system follows your device's light or dark setting."));
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
