// Router, navigation, theme, global keyboard shortcuts and activity tracking.

import { api } from "./api.js";
import { stopAudio } from "./audio.js";
import { loadSettings } from "./state.js";
import { formDialog, h, icon, showError } from "./ui.js";

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "browse", label: "Browse", icon: "book" },
  { id: "flashcards", label: "Flashcards", icon: "cards" },
  { id: "review", label: "Daily review", icon: "review" },
  { id: "quiz", label: "Quiz", icon: "quiz" },
  { id: "matching", label: "Matching", icon: "match" },
  { id: "listen", label: "Listen", icon: "listen" },
  { id: "pronounce", label: "Pronounce", icon: "mic" },
  { id: "lists", label: "My lists", icon: "list" },
  { id: "stats", label: "Stats", icon: "stats" },
];

const view = document.getElementById("view");
let current = null;   // { id, module, cleanup }
let navToken = 0;

function buildNav() {
  const wrap = document.getElementById("nav-links");
  wrap.replaceChildren(...TABS.map(t =>
    h("a.nav-link", { href: `#${t.id}`, "data-tab": t.id, title: t.label }, icon(t.icon), h("span.label", t.label),
      t.id === "review" ? h("span.count#due-count", { hidden: true }) : null)));
}

export async function refreshDueCount() {
  try {
    const s = await api.get("/api/stats");
    const el = document.getElementById("due-count");
    el.textContent = s.words.due;
    el.hidden = !s.words.due;
  } catch (e) { /* non-critical */ }
}

function parseHash() {
  const [tab, ...rest] = (location.hash.slice(1) || "home").split("/");
  return { tab: TABS.some(t => t.id === tab) ? tab : "home", param: rest.join("/") };
}

async function route() {
  const { tab, param } = parseHash();
  const token = ++navToken;
  stopAudio();
  if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current = null;
  document.querySelectorAll(".nav-link").forEach(a => {
    if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  // Phone layout: the bottom bar scrolls sideways; keep the current tab in view.
  const currentLink = document.querySelector(".nav-link[aria-current]");
  if (currentLink && matchMedia("(max-width: 760px)").matches) {
    currentLink.scrollIntoView({ block: "nearest", inline: "center" });
  }
  const mod = await import(`./tabs/${tab}.js`);
  if (token !== navToken) return;
  view.className = "";
  view.replaceChildren();
  const root = h("div.view-enter");
  view.append(root);
  try {
    const cleanup = await mod.render(root, { param, view });
    if (token !== navToken) { cleanup && cleanup(); return; }
    current = { id: tab, module: mod, cleanup };
  } catch (e) {
    console.error(e);
    root.replaceChildren(h("div.panel.empty", h("h2", "Something went wrong"), h("p", e.message)));
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
function setTheme(id) {
  if (id === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
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
        type: "button", role: "menuitemradio", "aria-checked": String(t.id === current),
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

function showShortcuts() {
  const rows = [
    ["Space", "Play pronunciation"], ["← →", "Previous / next word"], ["1–5", "Set star rating"],
    ["M", "Mark known / unknown"], ["/", "Search (Browse)"], ["Enter", "Flip card / reveal answer"],
    ["1–4", "Grade recall in Daily review; choose an answer in Quiz"], ["?", "Show this help"],
  ];
  formDialog({
    title: "Keyboard shortcuts", submit: null,
    body: h("div.shortcuts", rows.flatMap(([k, v]) => [h("span", k.split(" ").map(x => h("kbd", x))), h("span", v)])),
  });
}
document.getElementById("help-btn").addEventListener("click", showShortcuts);

document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
  // Enter/Space on a focused button or link should press it, not trigger a shortcut.
  if ((e.key === "Enter" || e.key === " ") && t.closest && t.closest("button, a, summary")) return;
  if (document.getElementById("dialog").open) return;
  if (e.key === "?") { e.preventDefault(); showShortcuts(); return; }
  if (current && current.module.onKey) current.module.onKey(e);
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
loadSettings().catch(showError).finally(() => { route(); refreshDueCount(); });
