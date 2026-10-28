// Stats: mastery, streak, accuracy by domain, weakest words, test history.
// Settings, backup and offline use are on the Settings page.

import { api } from "../api.js";
import { domainLabel, fmtDuration, h, pageHead } from "../ui.js";

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
        h("div.bars", [5, 4, 3, 2, 1].map(n => bar(h("span.star-label", { "aria-label": `${n} star${n > 1 ? "s" : ""}` }, "★".repeat(n)), w.stars[n] || 0, Math.max(1, ...Object.values(w.stars)), String(w.stars[n] || 0), { count: true }))))),
    h("p.muted", "Study settings, backup and offline use are in ", h("a", { href: "#settings" }, "Settings"), "."));
}
