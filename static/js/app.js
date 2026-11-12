// Router, navigation, theme, global keyboard shortcuts and activity tracking.

import { api } from "./api.js";
import { stopAudio } from "./audio.js";
import { loadSettings } from "./state.js";
import { formDialog, h, icon, showError } from "./ui.js";

// The rail lists every tab. On a phone the bottom bar has six: Today,
// Review, Practice, Games, Words (the dictionary) and More; Practice, Games and More are
// pages of links (`hub`), and the tabs they hold are reached from there
// (`under`). One order for the sidebar and the phone bar: today's review
// first, then calm practice (see it, recall it, hear it, say it), then the
// timed games, then the words themselves, then progress. The phone shows
// only Today, Review, the three hubs and Words, in this same page order, so
// keyboard and screen-reader order match what is on screen. `group` makes a
// labeled group in the sidebar; `sep` draws a line above a link; `short` is
// the label on the phone bar when the full one is too long.
export const TABS = [
  { id: "home", label: "Today", icon: "home" },
  { id: "review", label: "Daily review", short: "Review", icon: "review" },
  { id: "practice", label: "Practice", icon: "cards", hub: true },
  { id: "flashcards", label: "Flashcards", icon: "cards", under: "practice", group: "Practice", note: "Flip cards to learn words" },
  { id: "quiz", label: "Quiz", icon: "quiz", under: "practice", group: "Practice", note: "Choose the right word" },
  { id: "listen", label: "Listen", icon: "listen", under: "practice", group: "Practice", note: "Hear a word. Pick it or type it." },
  { id: "pronounce", label: "Pronounce", icon: "mic", under: "practice", group: "Practice", note: "Say a word. Hear yourself." },
  { id: "sounds", label: "Hard sounds", icon: "mouth", under: "practice", group: "Practice", note: "Ship or sheep? Hear the difference." },
  { id: "games", label: "Games", icon: "game", hub: true },
  { id: "shooter", label: "Word Shooter", icon: "target", under: "games", group: "Games", note: "Shoot the word that fits" },
  { id: "rush", label: "Word Rush", icon: "bolt", under: "games", group: "Games", note: "Yes or no, as fast as you can" },
  { id: "typeit", label: "Type It", icon: "keys", under: "games", group: "Games", note: "Type the word before time runs out" },
  { id: "matching", label: "Matching", icon: "match", under: "games", group: "Games", note: "Match words to meanings" },
  { id: "browse", label: "Dictionary", short: "Words", icon: "book", group: "Words", note: "Find any word" },
  { id: "lists", label: "My lists", icon: "list", under: "more", group: "Words", note: "Your own word lists" },
  { id: "more", label: "More", icon: "more", hub: true },
  { id: "stats", label: "Progress", icon: "stats", under: "more", sep: true, note: "See how you are doing" },
  { id: "settings", label: "Settings", icon: "gear", under: "more", note: "How you study, colors, save your work" },
  { id: "about", label: "About", icon: "info", under: "more", note: "Who made LexiMaster and why" },
];

const view = document.getElementById("view");
let current = null;   // { id, module, cleanup }
let navToken = 0;

function buildNav() {
  const wrap = document.getElementById("nav-links");
  const link = t => h(`a.nav-link${t.hub ? ".hub" : ""}${t.under ? ".under" : ""}${t.sep ? ".sep" : ""}`,
    { href: `#${t.id}`, "data-tab": t.id, title: t.label },
    icon(t.icon), h("span.nav-text", t.short ? [h("span.long", t.label), h("span.short", t.short)] : t.label),
    t.id === "review" ? h("span.count#due-count", { hidden: true }) : null);
  const items = [];
  for (const t of TABS) {
    const last = items[items.length - 1];
    if (!t.group) items.push(link(t));
    else if (last && last.dataset.group === t.group) last.append(link(t));
    else items.push(h("div.nav-group", { role: "group", "aria-label": t.group, "data-group": t.group },
      FOLDING.includes(t.group) ? foldButton(t.group) : h("span.nav-heading", { "aria-hidden": "true" }, t.group), link(t)));
  }
  wrap.replaceChildren(...items);
  for (const name of FOLDING) {
    const group = wrap.querySelector(`[data-group="${name}"]`);
    const was = stored(foldKey(name));
    if (group) setFolded(group, was ? was !== "open" : !OPEN_AT_FIRST.includes(name));
  }
}

// The Practice and Games groups fold on a wide screen (a click on the
// heading). Practice starts open, so a first visit sees the ways to study;
// Games starts folded. A folded group still shows the tab you're on. Each
// is remembered.
const FOLDING = ["Practice", "Games"];
const OPEN_AT_FIRST = ["Practice"];
const foldKey = group => `lexi-nav-${group.toLowerCase()}`;
function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function setFolded(group, folded) {
  group.classList.toggle("folded", folded);
  group.querySelector(".nav-fold").setAttribute("aria-expanded", String(!folded));
  try { localStorage.setItem(foldKey(group.dataset.group), folded ? "closed" : "open"); } catch (e) { /* storage unavailable */ }
}
function foldButton(name) {
  return h("button.nav-heading.nav-fold", { type: "button", "aria-expanded": "true", title: `Show or hide the ${name.toLowerCase()} tabs`,
    on: { click: e => { const g = e.currentTarget.closest(".nav-group"); setFolded(g, !g.classList.contains("folded")); } } },
    name, h("span.fold-mark", { "aria-hidden": "true" }));
}

/** Cards left in today's review (the Review track you chose): the same
 * number Today shows. */
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
const CALM_TABS = ["home", "browse", "lists", "stats", "settings", "more", "practice", "games", "about"];
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
  // A screen can take a step back or forward within itself (the Dictionary's
  // list and entry on a phone) without being rendered again.
  if (current && current.id === tab && current.module.onRoute && current.module.onRoute(param)) return;
  const token = ++navToken;
  stopAudio();
  if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current = null;
  const under = (TABS.find(t => t.id === tab) || {}).under;
  document.querySelectorAll(".nav-link").forEach(a => {
    if (a.dataset.tab === tab || a.dataset.tab === under) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  // On the Practice or Games page itself (a phone page, or a link on a wide
  // screen) the group's heading shows where you are.
  document.querySelectorAll(".nav-group").forEach(g => g.classList.toggle("current-hub", g.dataset.group.toLowerCase() === tab));
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

// Chosen in Settings. Paper and Night keep the old "light"/"dark" values;
// "system" follows the OS.
export const THEMES = [
  { id: "system", name: "Match system", swatch: ["#F3F4F7", "#0F121A", "#2B47A8"] },
  { id: "light", name: "Paper", swatch: ["#F3F4F7", "#2B47A8", "#0D7465"] },
  { id: "dark", name: "Night", swatch: ["#0F121A", "#93A8FF", "#4CC3AE"] },
  { id: "mariana", name: "Mariana", swatch: ["#303841", "#7DB4EA", "#FAC761"] },
];
export function savedTheme() {
  return document.documentElement.dataset.theme || "system";
}
// The phone's status bar takes the theme's background.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}
syncThemeColor();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeColor);
export function setTheme(id) {
  if (id === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  syncThemeColor();
  try {
    if (id === "system") localStorage.removeItem("lexi-theme");
    else localStorage.setItem("lexi-theme", id);
  } catch (e) { /* storage unavailable */ }
}

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

// ---------------------------------------------------------------- back

// An installed app's window has no browser toolbar, so it has its own Back
// and Forward: at the foot of the menu on a computer, at the left end of the
// tab bar on a phone (shown only there, see app.css). Where the browser can tell
// (the Navigation API), each is grayed out when there is nowhere to go; where
// it can't, both stay enabled and a click with nowhere to go does nothing.
// No key handlers: the app window already does ⌘[ / ⌘] (and mouse buttons).
const goBtns = [...document.querySelectorAll("[data-go]")];
for (const b of goBtns) {
  const back = b.dataset.go === "back";
  b.replaceChildren(icon(back ? "arrowL" : "arrowR"));
  b.addEventListener("click", () => back ? history.back() : history.forward());
}
function syncNav() {
  const nav = window.navigation;
  const known = !!nav && "canGoBack" in nav;
  for (const b of goBtns) b.disabled = known && !(b.dataset.go === "back" ? nav.canGoBack : nav.canGoForward);
}
// currententrychange covers pushState too (no hashchange/popstate for that).
if (window.navigation) window.navigation.addEventListener("currententrychange", syncNav);
for (const ev of ["hashchange", "popstate", "pageshow"]) addEventListener(ev, syncNav);
syncNav();

// ---------------------------------------------------------------- shortcuts

function keysOn() {
  try { return localStorage.getItem("lexi-keys") !== "off"; } catch (e) { return true; }
}
/** The keyboard shortcuts, with the switch for single-key ones: the ? help
 * and Settings → Keyboard shortcuts. */
export function shortcutsList() {
  const rows = [
    ["Space", "Play pronunciation"], ["← →", "Previous / next word"], ["↑ ↓", "Previous / next word (Dictionary, Pronounce)"],
    ["1–5", "Set star rating"], ["M", "Know it (after the answer in Daily review)"], ["/", "Search (Dictionary)"],
    ["Enter", "Flip card / reveal answer"], ["1–4", "Grade recall in Daily review; choose an answer in Quiz"],
    ["1–4", "Shoot a word (Word Shooter)"], ["Y N", "Yes / no (Word Rush)"], ["P Esc", "Pause (games; Esc while typing)"],
    ["R", "Record yourself (Pronounce)"], ["?", "Show this help"],
  ];
  // Single-key shortcuts can be switched off (speech-input users trigger them by accident).
  const toggle = h("input", { type: "checkbox", checked: keysOn() });
  toggle.addEventListener("change", () => {
    try { localStorage.setItem("lexi-keys", toggle.checked ? "" : "off"); } catch (e) { /* storage unavailable */ }
  });
  return h("div",
    h("div.shortcuts", rows.flatMap(([k, v]) => [h("span", k.split(" ").map(x => h("kbd", x))), h("span", v)])),
    h("label.check-row", toggle, " Use single-key shortcuts (? still opens this help)"));
}
function showShortcuts() {
  formDialog({ title: "Keyboard shortcuts", submit: null, body: shortcutsList() });
}

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
