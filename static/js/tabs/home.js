// Home: word of the day, today's progress, quick links.

import { api } from "../api.js";
import { playWord } from "../audio.js";
import { fmtDuration, h, renderEntry } from "../ui.js";

let wotd = null;

export async function render(root) {
  const [stats, review, word] = await Promise.all([
    api.get("/api/stats"),
    api.get("/api/review/queue"),
    api.get("/api/wotd").catch(() => null),
  ]);
  wotd = word;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const queued = review.queue.length;
  const minutes = Math.max(1, Math.round(review.est_seconds / 60));

  const wotdPanel = word
    ? h("section.panel.wotd", { "aria-label": "Word of the day" },
        h("span.eyebrow", `Word of the day · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`),
        renderEntry(word))
    : h("section.panel.wotd", h("span.eyebrow", "Word of the day"),
        h("p", "No words yet. Build the dataset with build_dataset.py, then reload."));

  const w = stats.words;
  const todayPanel = h("section.panel.today", { "aria-label": "Today" },
    h("span.eyebrow", "Today"),
    queued
      ? h("div", h("div.big-num.tnum", queued), h("p.muted", `cards in today's session · about ${minutes} min`))
      : h("div", h("div.big-num", "Done"), h("p.muted", "Nothing left in today's review queue.")),
    h("a.btn.btn-primary.btn-lg", { href: "#review" }, queued ? "Start daily review" : "Review more words"),
    h("dl.kv",
      h("dt", "Reviewed today"), h("dd", review.done_today.reviews),
      h("dt", "Time studied today"), h("dd", fmtDuration(review.done_today.seconds)),
      h("dt", "Current streak"), h("dd", `${stats.streak.current} day${stats.streak.current === 1 ? "" : "s"}`),
      h("dt", "Words mastered"), h("dd", `${w.mastered.toLocaleString()} / ${w.total.toLocaleString()}`),
      h("dt", "Due now"), h("dd", w.due)),
  );

  const banner = w.total === 0
    ? h("p.build-banner", "No words yet. Build the dataset with build_dataset.py (see README.md), then reload this page.")
    : null;

  const quick = h("nav.quick", { "aria-label": "Practice" },
    [["#flashcards", "Flashcards", "Flip through words"], ["#quiz", "Quiz", "Meanings, blanks, synonyms"],
     ["#matching", "Matching", "Timed pairs"], ["#listen", "Listen & spell", "Hear it, name it"],
     ["#pronounce", "Pronounce", "Record and compare"], ["#browse", "Browse", "The full lexicon"]]
      .map(([href, t, s]) => h("a", { href }, h("strong", t), h("span", s))));

  root.append(...[
    h("div.page-head", h("div", h("h1", greet), h("p.sub", "Ten to twenty minutes keeps precise words within reach."))),
    banner ? h("div", { style: { marginBottom: "16px" } }, banner) : null,
    h("div.home", wotdPanel, h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } }, todayPanel, quick)),
  ].filter(Boolean));
}

export function onKey(e) {
  if (e.key === " " && wotd) { e.preventDefault(); playWord(wotd, document.querySelector(".play")); }
}
