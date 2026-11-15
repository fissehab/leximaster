// Today (the home screen, #home): the word of the day, the words to refresh
// (practiced words due to come back, only when there are some; a nudge into
// Practice, never required), how you're doing and, until installed, how to
// install.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { installPrompt, showDueCount } from "../app.js";
import { saveFilter, loadFilter } from "../state.js";
import { fmtDuration, h, renderEntry } from "../ui.js";

const stored = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* unavailable */ } };

const GUIDE = "guide/LexiMaster-Install-Guide.pdf";

/** Installing keeps progress safe (iPhone/iPad Safari clears an unused
 *  site's data after a week) and makes LexiMaster open like an app. iPhone
 *  and iPad get the Share-menu steps; Chrome and Edge an "Install" button
 *  once the browser offers one (beforeinstallprompt, app.js). */
function installCard() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  if (!window.LEXI_STATIC || standalone || stored("lexi-install-hint")) return null;
  let card;
  const guide = h("a", { href: GUIDE, target: "_blank", rel: "noopener" }, "Step-by-step guide (PDF)");
  const dismiss = h("button.btn.btn-quiet", { type: "button", on: { click: () => { store("lexi-install-hint", "1"); card.remove(); } } },
    ios ? "Got it" : "Not now");
  if (ios) {
    card = h("section.panel.notice-card", { "aria-label": "Add to Home Screen" },
      h("p", "On iPhone and iPad, add LexiMaster to your Home Screen (Share → Add to Home Screen). " +
        "Safari clears a website's saved data after a week without a visit; a Home Screen app keeps your progress. ", guide),
      dismiss);
    return card;
  }
  const install = h("button.btn.btn-primary", { type: "button", on: { click: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({}));
    if (outcome === "accepted") card.remove();
  } } }, "Install");
  card = h("section.panel.notice-card", { "aria-label": "Install LexiMaster", hidden: !installPrompt },
    h("p", "Install LexiMaster as an app: it opens in its own window, works offline and keeps your progress. ", guide),
    h("div.toolbar", install, dismiss));
  if (!installPrompt) addEventListener("lexi-installable", () => { card.hidden = false; }, { once: true });
  return card;
}

let wotd = null;

/** "Refresh them": Flashcards with the words to refresh. */
function refreshThem() {
  saveFilter("flashcards", { ...loadFilter("flashcards"), domain: "refresh", list_id: "", stars: "" });
  location.hash = "#flashcards";
}

export async function render(root) {
  const [stats, refresh, word] = await Promise.all([
    api.get("/api/stats"),
    api.get("/api/refresh"),
    api.get("/api/wotd").catch(() => null),
  ]);
  wotd = word;
  showDueCount(refresh.count);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // The word of the day; its name opens the full entry in the Dictionary.
  const wotdPanel = word
    ? h("section.panel.wotd", { "aria-label": "Word of the day" },
        h("span.eyebrow", `Word of the day · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`),
        renderEntry(word, { mode: "summary", open: `#browse/${word.id}` }))
    : h("section.panel.wotd", h("span.eyebrow", "Word of the day"),
        h("p", "No words yet. Build the dataset with build_dataset.py, then reload."));

  const n = refresh.count;
  // Words due: refresh them. Nothing due: a way into practice (a new learner
  // otherwise has nothing to do here).
  const refreshPanel = n ? h("section.panel.refresh-card", { "aria-label": "Words to refresh" },
    h("span.eyebrow", "Words to refresh"),
    h("p.today-left", h("span.big-num.tnum", n), n === 1 ? " word to refresh" : " words to refresh"),
    h("p.muted", "Words you've practiced, due to come back today so they stick."),
    h("div.toolbar", h("button.btn.btn-primary", { type: "button", on: { click: refreshThem } }, "Refresh them"),
      h("a.btn", { href: "#practice" }, "Practice something else")))
    : h("section.panel.refresh-card.start-card", { "aria-label": "Practice" },
        h("span.eyebrow", "Practice"),
        h("p", "Learn words with flashcards, quizzes, listening and games: any list, topic or level. " +
          "The words you practice come back here when it's time to see them again."),
        h("div.toolbar", h("a.btn.btn-primary", { href: "#practice" }, "Start practicing")));

  const w = stats.words;
  const today = stats.days[stats.days.length - 1] || {};
  const stat = (label, value) => h("div", h("dt", label), h("dd", value));
  const progressPanel = h("section.panel.today-progress", { "aria-label": "Your progress" },
    h("dl.today-stats",
      stat("Streak", `${stats.streak.current} day${stats.streak.current === 1 ? "" : "s"}`),
      stat("Words studied", (w.learning + w.mastered + (w.seen || 0)).toLocaleString()),
      stat("Time today", fmtDuration(today.seconds || 0))),
    h("a.today-more", { href: "#stats" }, "See all your progress →"));

  const banner = w.total === 0
    ? h("p.build-banner", "No words yet. Build the dataset with build_dataset.py (see README.md), then reload this page.")
    : null;

  root.append(...[
    h("div.page-head", h("div", h("h1", greet), h("p.sub", "A word to discover, and the words you're learning."))),
    banner ? h("div", { style: { marginBottom: "16px" } }, banner) : null,
    installCard(),
    h("div.home", wotdPanel, h("div.home-side", refreshPanel, progressPanel)),
  ].filter(Boolean));
}

export function onKey(e) {
  if (e.key === " " && wotd) { e.preventDefault(); playWord(wotd, document.querySelector(".play")); }
}
