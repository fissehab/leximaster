// Router, navigation, theme, global keyboard shortcuts and activity tracking.

import { api } from "./api.js";
import { stopAudio } from "./audio.js";
import { loadSettings } from "./state.js";
import { formDialog, h, icon, showError } from "./ui.js";

// The rail lists every tab. On a phone the bottom bar has five: Home,
// Review, Practice, Browse and More; Practice and More are pages of links
// (`hub`), and the tabs they hold are reached from there (`under`).
// One order for the sidebar and the phone bar: today's review first, then
// practice from easiest to hardest (see the answer, recognize it, recall it,
// hear it, say it), then the words themselves, then progress. The phone shows
// only Home, Review, the two hubs and Browse, in this same page order, so
// keyboard and screen-reader order match what is on screen. `group` makes a
// labeled group in the sidebar; `sep` draws a line above a link.
export const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "review", label: "Daily review", icon: "review" },
  { id: "practice", label: "Practice", icon: "cards", hub: true },
  { id: "flashcards", label: "Flashcards", icon: "cards", under: "practice", group: "Practice", note: "Flip through words" },
  { id: "matching", label: "Matching", icon: "match", under: "practice", group: "Practice", note: "Timed pairs" },
  { id: "quiz", label: "Quiz", icon: "quiz", under: "practice", group: "Practice", note: "Meanings, blanks, synonyms" },
  { id: "listen", label: "Listen", icon: "listen", under: "practice", group: "Practice", note: "Hear it, name it, spell it" },
  { id: "pronounce", label: "Pronounce", icon: "mic", under: "practice", group: "Practice", note: "Record and compare" },
  { id: "browse", label: "Browse", icon: "book", group: "Words", note: "The full lexicon" },
  { id: "lists", label: "My lists", icon: "list", under: "more", group: "Words", note: "Your word lists and notes" },
  { id: "more", label: "More", icon: "more", hub: true },
  { id: "stats", label: "Stats", icon: "stats", under: "more", sep: true, note: "Progress, backup and offline use" },
  // Reached from the button at the foot of the menu (and More on a phone), not a menu link.
  { id: "about", label: "About", icon: "info", under: "more", foot: true, note: "Who made LexiMaster and why" },
];

const view = document.getElementById("view");
let current = null;   // { id, module, cleanup }
let navToken = 0;

function buildNav() {
  const wrap = document.getElementById("nav-links");
  const link = t => h(`a.nav-link${t.hub ? ".hub" : ""}${t.under ? ".under" : ""}${t.sep ? ".sep" : ""}`,
    { href: `#${t.id}`, "data-tab": t.id, title: t.label },
    icon(t.icon), h("span.nav-text", t.id === "review" ? h("span.long", "Daily review") : t.label,
      t.id === "review" ? h("span.short", "Review") : null),
    t.id === "review" ? h("span.count#due-count", { hidden: true }) : null);
  const items = [];
  for (const t of TABS.filter(t => !t.foot)) {
    const last = items[items.length - 1];
    if (!t.group) items.push(link(t));
    else if (last && last.dataset.group === t.group) last.append(link(t));
    else items.push(h("div.nav-group", { role: "group", "aria-label": t.group, "data-group": t.group },
      h("span.nav-heading", { "aria-hidden": "true" }, t.group), link(t)));
  }
  wrap.replaceChildren(...items);
}

/** Cards left in today's review (the Review track you chose): the same
 * number Home shows. */
export function reviewTrack() {
  try { return localStorage.getItem("lexi-review-track") || ""; } catch (e) { return ""; }
}
export async function refreshDueCount() {
  try {
    const s = await api.get("/api/review/queue", { count: 1, track: reviewTrack() });
    const el = document.getElementById("due-count");
    el.textContent = s.total;
    el.hidden = !s.total;
  } catch (e) { /* non-critical */ }
}

function parseHash() {
  const [tab, ...rest] = (location.hash.slice(1) || "home").split("/");
  return { tab: TABS.some(t => t.id === tab) ? tab : "home", param: rest.join("/") };
}

// A new version (static site) waits until a calm screen, never mid-session,
// then takes over and the page reloads on the same screen. Every open tab
// reloads when the new version takes over (at its own next calm screen), and
// the switch waits for any save in progress to finish.
const CALM_TABS = ["home", "browse", "lists", "stats", "more", "practice", "about"];
let updating = false;
let reloadPending = false;
if ("serviceWorker" in navigator) {
  let hadController = !!navigator.serviceWorker.controller;   // the first install also claims the page
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (updating || CALM_TABS.includes(parseHash().tab)) location.reload();
    else reloadPending = true;
  });
}
function watchInstalling(reg) {
  const w = reg && reg.installing;
  if (w) w.addEventListener("statechange", () => { if (w.state === "installed") applyWaitingUpdate(parseHash().tab); });
}
function applyWaitingUpdate(tab) {
  const reg = window.LEXI_SW;
  if (!CALM_TABS.includes(tab)) return false;
  if (reloadPending) { location.reload(); return true; }
  // Only a page already run by a service worker updates; on a first visit
  // the worker that is installing is the first version, not an update.
  if (updating || !reg || !navigator.serviceWorker.controller) return false;
  if (!reg.waiting) {   // look for one for next time
    reg.update().then(() => watchInstalling(reg)).catch(() => {});
    watchInstalling(reg);
    return false;
  }
  updating = true;
  const go = () => { if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING"); else updating = false; };
  if (navigator.locks) navigator.locks.request("lexi-write", go); else go();
  return true;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") applyWaitingUpdate(parseHash().tab);
});

async function route() {
  const { tab, param } = parseHash();
  if (applyWaitingUpdate(tab)) return;
  const token = ++navToken;
  stopAudio();
  closeThemeMenu();
  if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current = null;
  const under = (TABS.find(t => t.id === tab) || {}).under;
  document.querySelectorAll(".nav-link").forEach(a => {
    if (a.dataset.tab === tab || a.dataset.tab === under) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const about = document.getElementById("about-btn");
  if (tab === "about") about.setAttribute("aria-current", "page"); else about.removeAttribute("aria-current");
  // A slow screen (the word list on first visit) says so instead of staying blank.
  const slow = setTimeout(() => { if (token === navToken) view.classList.add("is-loading"); }, 250);
  // `live()` lets a screen that finishes loading after you've left it stay quiet.
  const live = () => token === navToken;
  try {
    const mod = await import(`./tabs/${tab}.js`);
    if (!live()) return;
    view.className = "";
    view.replaceChildren();
    const root = h("div.view-enter");
    view.append(root);
    try {
      const cleanup = await mod.render(root, { param, view, live });
      if (!live()) { cleanup && cleanup(); return; }
      current = { id: tab, module: mod, cleanup };
    } catch (e) {
      console.error(e);
      if (!live()) return;
      root.replaceChildren(h("div.panel.empty", h("h2", "Something went wrong"), h("p", e.message)));
    }
  } catch (e) {   // the screen's code didn't load (offline, or a new version replaced it)
    console.error(e);
    if (!live()) return;
    view.replaceChildren(h("div.panel.empty", h("h2", "This screen didn't load"),
      h("p", navigator.onLine ? "Reload the page to try again." : "You're offline, and this screen isn't saved on this device yet.")));
  } finally {
    clearTimeout(slow);
    if (live()) view.classList.remove("is-loading");
  }
  view.scrollTop = 0;
  view.focus({ preventScroll: true });
  document.title = `${TABS.find(t => t.id === tab).label} · LexiMaster`;
}

// ---------------------------------------------------------------- theme

// Paper and Night keep the old "light"/"dark" values; "system" follows the OS.
const THEMES = [
  { id: "system", name: "Match system", swatch: ["#F3F4F7", "#0F121A", "#2B47A8"] },
  { id: "light", name: "Paper", swatch: ["#F3F4F7", "#2B47A8", "#0D7465"] },
  { id: "dark", name: "Night", swatch: ["#0F121A", "#93A8FF", "#4CC3AE"] },
  { id: "mariana", name: "Mariana", swatch: ["#303841", "#7DB4EA", "#FAC761"] },
];
const themeBtn = document.getElementById("theme-toggle");
let themeMenu = null;

function savedTheme() {
  return document.documentElement.dataset.theme || "system";
}
// The phone's status bar takes the theme's background.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}
syncThemeColor();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
function setTheme(id) {
  if (id === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  syncThemeColor();
  try {
    if (id === "system") localStorage.removeItem("lexi-theme");
    else localStorage.setItem("lexi-theme", id);
  } catch (e) { /* storage unavailable */ }
}
function closeThemeMenu({ focus = false } = {}) {
  if (!themeMenu) return;
  themeMenu.remove();
  themeMenu = null;
  themeBtn.setAttribute("aria-expanded", "false");
  if (focus) themeBtn.focus();
}
function openThemeMenu() {
  const current = savedTheme();
  themeMenu = h("div.theme-menu", { role: "menu", "aria-label": "Theme" },
    THEMES.map(t => {
      const item = h("button.theme-item", {
        type: "button", role: "menuitemradio", "aria-checked": String(t.id === current), tabindex: "-1",
      }, h("span.swatch", { "aria-hidden": "true" },
        t.swatch.map(c => h("i", { style: { background: c } }))), t.name);
      item.addEventListener("click", () => { setTheme(t.id); closeThemeMenu({ focus: true }); });
      return item;
    }));
  themeMenu.addEventListener("keydown", e => {
    const items = [...themeMenu.querySelectorAll(".theme-item")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeThemeMenu({ focus: true }); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "Tab") closeThemeMenu();   // a menu is one stop: Tab leaves it
    e.stopPropagation();  // keep the app's single-key shortcuts out of the menu
  });
  document.body.append(themeMenu);
  const r = themeBtn.getBoundingClientRect();
  const m = themeMenu.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left), innerWidth - m.width - 8);
  const top = r.top - m.height - 8 > 8 ? r.top - m.height - 8 : r.bottom + 8;
  Object.assign(themeMenu.style, { left: `${left}px`, top: `${top}px` });
  themeBtn.setAttribute("aria-expanded", "true");
  (themeMenu.querySelector('[aria-checked="true"]') || themeMenu.querySelector(".theme-item")).focus();
}
themeBtn.replaceChildren(icon("palette"));

// ---------------------------------------------------------------- collapsible menu

const shell = document.querySelector(".shell");
const railBtn = document.getElementById("rail-toggle");
function setRail(collapsed) {
  shell.classList.toggle("rail-collapsed", collapsed);
  railBtn.setAttribute("aria-expanded", String(!collapsed));
  const label = collapsed ? "Expand the menu" : "Collapse the menu";
  railBtn.title = label;
  railBtn.setAttribute("aria-label", label);
  try { localStorage.setItem("lexi-rail", collapsed ? "collapsed" : ""); } catch (e) { /* storage unavailable */ }
}
railBtn.replaceChildren(icon("sidebar"));
try { setRail(localStorage.getItem("lexi-rail") === "collapsed"); } catch (e) { setRail(false); }
railBtn.addEventListener("click", () => setRail(!shell.classList.contains("rail-collapsed")));
themeBtn.setAttribute("aria-haspopup", "menu");
themeBtn.setAttribute("aria-expanded", "false");
themeBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (themeMenu) closeThemeMenu(); else openThemeMenu();
});
document.addEventListener("click", e => {
  if (themeMenu && !themeMenu.contains(e.target)) closeThemeMenu();
});

// ---------------------------------------------------------------- shortcuts

function keysOn() {
  try { return localStorage.getItem("lexi-keys") !== "off"; } catch (e) { return true; }
}
function showShortcuts() {
  const rows = [
    ["Space", "Play pronunciation"], ["← →", "Previous / next word"], ["↑ ↓", "Previous / next word (Browse, Pronounce)"],
    ["1–5", "Set star rating"], ["M", "Know it (after the answer in Daily review)"], ["/", "Search (Browse)"],
    ["Enter", "Flip card / reveal answer"], ["1–4", "Grade recall in Daily review; choose an answer in Quiz"],
    ["R", "Record yourself (Pronounce)"], ["?", "Show this help"],
  ];
  // Single-key shortcuts can be switched off (speech-input users trigger them by accident).
  const toggle = h("input#keys-on", { type: "checkbox", checked: keysOn() });
  toggle.addEventListener("change", () => {
    try { localStorage.setItem("lexi-keys", toggle.checked ? "" : "off"); } catch (e) { /* storage unavailable */ }
  });
  formDialog({
    title: "Keyboard shortcuts", submit: null,
    body: h("div",
      h("div.shortcuts", rows.flatMap(([k, v]) => [h("span", k.split(" ").map(x => h("kbd", x))), h("span", v)])),
      h("label.check-row", toggle, " Use single-key shortcuts (? still opens this help)")),
  });
}
document.getElementById("help-btn").addEventListener("click", showShortcuts);
document.getElementById("about-btn").replaceChildren(icon("info"));

document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
  // Enter/Space on a focused button or link should press it, not trigger a shortcut.
  if ((e.key === "Enter" || e.key === " ") && t.closest && t.closest("button, a, summary")) return;
  if (document.getElementById("dialog").open) return;
  if (e.key === "?") { e.preventDefault(); showShortcuts(); return; }
  if (!keysOn()) return;
  if (current && current.module.onKey) Promise.resolve(current.module.onKey(e)).catch(showError);
});

// ---------------------------------------------------------------- activity

let lastInput = Date.now();
["keydown", "pointerdown", "wheel"].forEach(ev => addEventListener(ev, () => (lastInput = Date.now()), { passive: true }));
setInterval(() => {
  if (document.visibilityState === "visible" && Date.now() - lastInput < 60_000) {
    api.post("/api/activity", { seconds: 30 }).catch(() => {});
  }
}, 30_000);

// ---------------------------------------------------------------- boot

buildNav();
addEventListener("hashchange", route);
// Just opened with an update already waiting: apply it before any study starts.
addEventListener("lexi-sw", () => applyWaitingUpdate(parseHash().tab));
loadSettings().catch(showError).finally(() => { route(); refreshDueCount(); });
