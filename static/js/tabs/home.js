// Home: today's review first (what's left, one button to start, the day so far), then the word of the day.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { reviewTrack } from "../app.js";
import { saveSettings, setStudyFocus } from "../state.js";
import { SCOPES, fmtDuration, h, renderEntry, showError } from "../ui.js";

const stored = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* unavailable */ } };

// First visit, step 1: how much English, which sets the word levels.
const ENGLISH = [["I know some simple words", "1,2"], ["I can talk about everyday things", "1,2,3"],
  ["I use English at work or school", "2,3,4"], ["I read books and news easily", "3,4,5"]];

/** First visit: how much English you know, then what to study first. */
function welcomeCard(root) {
  const close = () => { store("lexi-welcomed", "1"); card.remove(); };
  const body = h("div.welcome-body");
  const card = h("section.panel.welcome", { "aria-label": "Welcome" }, h("h2", "Welcome to LexiMaster"), body);
  const step2 = beginner => {
    const order = beginner ? ["everyday", "", "core", "bible"] : ["", "everyday", "core", "bible"];
    body.replaceChildren(
      h("p", "Daily review brings back each word just before you'd forget it, a few minutes a day. " +
        "Practice (flashcards, quizzes, listening) is extra and any time. What would you like to study first?"),
      h("div.choice-row", order.map(v => {
        const label = SCOPES.find(([s]) => s === v)[1];
        return h("button.btn", { type: "button", on: { click: () => {
          setStudyFocus(v);
          store("lexi-welcomed", "1");
          location.hash = "#review";
        } } }, beginner && v === "everyday" ? `${label} (recommended)` : label);
      })),
      h("button.btn.btn-quiet", { type: "button", on: { click: close } }, "Not now"));
  };
  const pick = async levels => {
    try { await saveSettings({ word_levels: levels }); } catch (e) { return showError(e); }
    step2(levels.startsWith("1,"));
  };
  body.append(
    h("p", h("b", "How much English do you know?"), " LexiMaster has words from the most common to the rare; " +
      "this picks where your new words come from."),
    h("div.choice-row", ENGLISH.map(([label, levels]) =>
      h("button.btn", { type: "button", on: { click: () => pick(levels) } }, label))),
    h("button.btn.btn-quiet", { type: "button", on: { click: () => pick("1,2,3,4,5") } }, "Skip: show all words"),
    h("p.muted", "You can change this any time with the Word levels menu in Review or in Settings."));
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
    h("p", days === null ? "Your progress lives only in this browser. Export a copy now and then (Settings → Export progress)."
      : `Your last export was ${days} days ago. Export a fresh copy so a cleared browser can't cost you your progress.`),
    h("div.toolbar",
      h("a.btn.btn-primary", { href: "#settings" }, "Go to export"),
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
           h("p.muted", `${review.due} due · ${review.new} new · about ${minutes} min`)]
        : [h("p.today-left", h("span.big-num", "Done"), " for today"), h("p.muted", "Nothing left in today's review. Well done.")]),
    h("a.btn.btn-primary.btn-lg", { href: queued ? "#review" : "#review/more" }, queued ? "Start today's review" : "Learn 5 more words"),
    h("dl.today-stats",
      stat("Streak", `${stats.streak.current} day${stats.streak.current === 1 ? "" : "s"}`),
      stat("Reviewed today", review.done_today.reviews),
      stat("Time today", fmtDuration(review.done_today.seconds)),
      stat("Words mastered", `${w.mastered.toLocaleString()} of ${(w.mastered + w.learning).toLocaleString()}`)));

  const banner = w.total === 0
    ? h("p.build-banner", "No words yet. Build the dataset with build_dataset.py (see README.md), then reload this page.")
    : null;

  const studied = w.mastered + w.learning;
  const fresh = !studied && !stats.accuracy.attempts && !stored("lexi-welcomed");

  root.append(...[
    h("div.page-head", h("div", h("h1", greet), h("p.sub", "Ten to twenty minutes a day keeps your words within reach."))),
    banner ? h("div", { style: { marginBottom: "16px" } }, banner) : null,
    fresh && w.total ? welcomeCard(root) : null,
    installCard(),
    backupCard(studied),
    h("div.home", todayPanel, wotdPanel),
  ].filter(Boolean));
}

export function onKey(e) {
  if (e.key === " " && wotd) { e.preventDefault(); playWord(wotd, document.querySelector(".play")); }
}
