// Today (the home screen, #home): today's review first (what's left, one button to start, the day so far), then the word of the day.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { installPrompt, refreshDueCount, reviewTrack } from "../app.js";
import { saveSettings, settings } from "../state.js";
import { fmtDuration, h, renderEntry, showError, toast } from "../ui.js";

const stored = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* unavailable */ } };

// A new learner starts on levels 2-4 (app/common.py DEFAULT_LEVELS). While
// they're new and haven't chosen levels themselves, Today shows a few of the
// day's new words and a way to easier ones: one step down at a time
// (2-4, 1-3, 1-2, 1), each with Undo.
const NEW_LEARNER = 50;          // words studied
const LEVELED = ["", "everyday", "core"];   // the study tracks levels narrow (app/common.py)
/** The next easier set of levels, or null at the easiest. */
export function easierLevels(levels) {
  if (levels[0] > 1) return levels.map(l => l - 1);
  return levels.length > 1 ? levels.slice(0, -1) : null;
}

function easierLine(root, review, studied) {
  const levels = String(settings.word_levels).split(",").map(Number);
  const easier = easierLevels(levels);
  // Not for anyone studying rare words: they chose them, or started before
  // the 2-4 default (all levels) and keep what they had.
  if (studied >= NEW_LEARNER || stored("lexi-levels-set") || levels.includes(5) || !LEVELED.includes(reviewTrack())
      || !easier) return null;
  const set = async (to, msg, action) => {
    try { await saveSettings({ word_levels: to.join(",") }); } catch (e) { return showError(e); }
    try { sessionStorage.removeItem("lexi-review-session"); } catch (e) { /* unavailable */ }
    toast(msg, action ? { action } : {});
    root.replaceChildren();
    await render(root);
    refreshDueCount();
  };
  // Words and short phrases; a whole sentence ("Did you catch the game?") would crowd the line.
  const samples = (review.samples || []).filter(x => !/[?.!]/.test(x) && x.split(" ").length <= 3);
  return h("p.easier-line",
    samples.length ? [`New words today: ${samples.join(", ")}`, " · "] : null,
    h("span.nowrap", "Too hard? ",
      h("button.link-btn", { type: "button", on: { click: () =>
        set(easier, "Easier words from now on.", ["Undo", () => set(levels, "Back to your earlier words.")]) } },
        "Easier words")));
}

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

export async function render(root) {
  const [stats, review, word] = await Promise.all([
    api.get("/api/stats"),
    api.get("/api/review/queue", { count: 1, track: reviewTrack() }),
    api.get("/api/wotd", { track: reviewTrack() }).catch(() => null),
  ]);
  wotd = word;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const queued = review.total;
  const minutes = Math.max(1, Math.round(review.est_seconds / 60));

  const wotdPanel = word
    ? h("section.panel.wotd", { "aria-label": "Word of the day" },
        h("span.eyebrow", `Word of the day · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`),
        renderEntry(word, { mode: "summary", open: `#browse/${word.id}` }))
    : h("section.panel.wotd", h("span.eyebrow", "Word of the day"),
        h("p", "No words yet. Build the dataset with build_dataset.py, then reload."));

  // Today's review first: what's left, one button to start, then the day so far.
  const w = stats.words;
  const stat = (label, value) => h("div", h("dt", label), h("dd", value));
  const todayPanel = h("section.panel.today-hero", { "aria-label": "Today's review" },
    h("div",
      h("span.eyebrow", "Today's review"),
      queued
        ? [h("p.today-left", h("span.big-num.tnum", queued), queued === 1 ? " card left" : " cards left"),
           h("p.muted", [review.due ? `${review.due} to review` : null, review.new ? `${review.new} new word${review.new === 1 ? "" : "s"}` : null,
             `about ${minutes} min`].filter(Boolean).join(" · ")),
           easierLine(root, review, w.mastered + w.learning)]
        : [h("p.today-left", h("span.big-num", "Done"), " for today"), h("p.muted", "Nothing left in today's review. Well done.")]),
    h("a.btn.btn-primary.btn-lg", { href: queued ? "#review" : "#review/more" }, queued ? "Start today's review" : "Learn 5 more words"),
    h("dl.today-stats",
      stat("Streak", `${stats.streak.current} day${stats.streak.current === 1 ? "" : "s"}`),
      stat("Reviewed today", review.done_today.reviews),
      stat("Time today", fmtDuration(review.done_today.seconds)),
      w.mastered + w.learning ? stat("Words mastered", `${w.mastered.toLocaleString()} of ${(w.mastered + w.learning).toLocaleString()} studied`) : null),
    h("a.today-more", { href: "#stats" }, "See all your progress →"));

  const banner = w.total === 0
    ? h("p.build-banner", "No words yet. Build the dataset with build_dataset.py (see README.md), then reload this page.")
    : null;

  root.append(...[
    h("div.page-head", h("div", h("h1", greet), h("p.sub", "Ten to twenty minutes a day keeps your words within reach."))),
    banner ? h("div", { style: { marginBottom: "16px" } }, banner) : null,
    installCard(),
    h("div.home", todayPanel, wotdPanel),
  ].filter(Boolean));
}

export function onKey(e) {
  if (e.key === " " && wotd) { e.preventDefault(); playWord(wotd, document.querySelector(".play")); }
}
