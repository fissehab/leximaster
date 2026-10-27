// Home: word of the day, today's progress, quick links.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { TABS, reviewTrack } from "../app.js";
import { SCOPES, fmtDuration, h, renderEntry } from "../ui.js";

const stored = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* unavailable */ } };

/** First visit: pick what to study before the first session. */
function welcomeCard(root) {
  const card = h("section.panel.welcome", { "aria-label": "Welcome" },
    h("h2", "Welcome to LexiMaster"),
    h("p", "Daily review brings back each word just before you'd forget it, a few minutes a day. " +
      "Practice (flashcards, quizzes, listening) is extra and any time. What would you like to study first?"),
    h("div.choice-row", SCOPES.filter(([v]) => ["", "everyday", "core", "bible"].includes(v)).map(([v, label]) =>
      h("button.btn", { type: "button", on: { click: () => {
        store("lexi-review-track", v);
        store("lexi-welcomed", "1");
        location.hash = "#review";
      } } }, label))),
    h("button.btn.btn-quiet", { type: "button", on: { click: () => { store("lexi-welcomed", "1"); card.remove(); } } }, "Not now"));
  return card;
}

/** The website keeps progress in this browser only: nudge a backup now and then. */
function backupCard(studied) {
  if (!window.LEXI_STATIC || studied < 10) return null;
  let days = null;
  const t = Number(stored("lexi-last-export"));
  if (t) days = Math.floor((Date.now() - t) / 86400000);
  const snoozed = Number(stored("lexi-backup-snooze")) > Date.now();
  if ((days !== null && days < 7) || snoozed) return null;
  const card = h("section.panel.notice-card", { "aria-label": "Backup reminder" },
    h("p", days === null ? "Your progress lives only in this browser. Export a copy now and then (Stats → Export progress)."
      : `Your last export was ${days} days ago. Export a fresh copy so a cleared browser can't cost you your progress.`),
    h("div.toolbar",
      h("a.btn.btn-primary", { href: "#stats" }, "Go to export"),
      h("button.btn.btn-quiet", { type: "button", on: { click: () => {
        store("lexi-backup-snooze", String(Date.now() + 3 * 86400000));
        card.remove();
      } } }, "Remind me later")));
  return card;
}

/** iPhone/iPad Safari clears an unused site's data after a week; a Home Screen app keeps it. */
function installCard() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!window.LEXI_STATIC || !ios || navigator.standalone || stored("lexi-install-hint")) return null;
  const card = h("section.panel.notice-card", { "aria-label": "Add to Home Screen" },
    h("p", "On iPhone and iPad, add LexiMaster to your Home Screen (Share → Add to Home Screen). " +
      "Safari clears a website's saved data after a week without a visit; a Home Screen app keeps your progress."),
    h("button.btn.btn-quiet", { type: "button", on: { click: () => { store("lexi-install-hint", "1"); card.remove(); } } }, "Got it"));
  return card;
}

let wotd = null;

export async function render(root) {
  const [stats, review, word] = await Promise.all([
    api.get("/api/stats"),
    api.get("/api/review/queue", { count: 1, track: reviewTrack() }),
    api.get("/api/wotd").catch(() => null),
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

  const w = stats.words;
  const todayPanel = h("section.panel.today", { "aria-label": "Today" },
    h("span.eyebrow", "Today"),
    queued
      ? h("div", h("div.big-num.tnum", queued),
          h("p.muted", `left today · ${review.due} due · ${review.new} new · about ${minutes} min`))
      : h("div", h("div.big-num", "Done"), h("p.muted", "Nothing left in today's review queue.")),
    h("a.btn.btn-primary.btn-lg", { href: queued ? "#review" : "#review/more" }, queued ? "Start daily review" : "Learn 5 more words"),
    h("dl.kv",
      h("dt", "Reviewed today"), h("dd", review.done_today.reviews),
      h("dt", "Time studied today"), h("dd", fmtDuration(review.done_today.seconds)),
      h("dt", "Current streak"), h("dd", `${stats.streak.current} day${stats.streak.current === 1 ? "" : "s"}`),
      h("dt", "Words mastered"), h("dd", `${w.mastered.toLocaleString()} of ${(w.mastered + w.learning).toLocaleString()} studied`)),
  );

  const banner = w.total === 0
    ? h("p.build-banner", "No words yet. Build the dataset with build_dataset.py (see README.md), then reload this page.")
    : null;

  const quick = h("nav.quick", { "aria-label": "Practice and words" },
    TABS.filter(t => t.under === "practice" || t.id === "browse" || t.id === "lists")
      .map(t => h("a", { href: `#${t.id}` }, h("strong", t.label), h("span", t.note))));
  const studied = w.mastered + w.learning;
  const fresh = !studied && !stats.accuracy.attempts && !stored("lexi-welcomed");

  root.append(...[
    h("div.page-head", h("div", h("h1", greet), h("p.sub", "Ten to twenty minutes keeps precise words within reach."))),
    banner ? h("div", { style: { marginBottom: "16px" } }, banner) : null,
    fresh && w.total ? welcomeCard(root) : null,
    installCard(),
    backupCard(studied),
    h("div.home", wotdPanel, h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, todayPanel, quick)),
  ].filter(Boolean));
}

export function onKey(e) {
  if (e.key === " " && wotd) { e.preventDefault(); playWord(wotd, document.querySelector(".play")); }
}
