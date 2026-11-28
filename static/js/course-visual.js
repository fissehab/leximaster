// The English course's pictures (static/js/course-visuals.js has the data):
// timelines for tenses, decision flowcharts, bar graphs, scales, formulas,
// word-order strips, infographic tiles, funnels and tables. Plain HTML and
// CSS (app.css "Course visuals"), so they follow the theme and fit a phone.
// `rich` renders the lesson markup (**point**, *word*).

import { h } from "./ui.js";

/** Six slot colors, used in order (strips, formulas, tiles, bars). */
const SLOT = n => `slot-${n % 6}`;

/** Where a time sits on a timeline, -3 (long ago) … 0 (now) … 3 (later), as a %. */
const pos = x => `${((Number(x) + 3) / 6) * 100}%`;

function timeline(v, rich) {
  const axis = h("div.vz-tl-axis", { "aria-hidden": "true" },
    h("span", "past"), h("span.vz-tl-now-label", "now"), h("span", "future"));
  const rows = v.rows.map((r, i) => {
    const track = h(`div.vz-tl-track.${SLOT(i)}`, { "aria-hidden": "true" }, h("span.vz-tl-now"));
    if (r.span) {
      const [a, b] = r.span;
      const bar = h(`span.vz-tl-span${r.repeat ? ".repeat" : ""}${r.open ? ".open" : ""}`,
        { style: `left: ${pos(Math.min(a, b))}; width: calc(${pos(Math.max(a, b))} - ${pos(Math.min(a, b))})` });
      track.append(bar);
    }
    for (const p of r.points || []) {
      track.append(h("span.vz-tl-point", { style: `left: ${pos(p.at)}` }, p.label ? h("span.vz-tl-point-label", p.label) : null));
    }
    return h("li.vz-tl-row", h("div.vz-tl-text", h("span.vz-tl-sentence", rich(r.t)), r.note ? h("span.vz-tl-note", rich(r.note)) : null), track);
  });
  return [axis, h("ol.vz-tl", rows)];
}

function flow(v, rich) {
  const steps = v.steps.map((s, i) => h("li.vz-flow-step",
    h("div.vz-flow-q", h("span.vz-flow-n", String(i + 1)), h("span", rich(s.q))),
    h("div.vz-flow-yes", h("span.vz-flow-tag", "Yes"), h("div.vz-flow-answer", h("strong", rich(s.yes)), s.ex ? h("span.vz-flow-ex", rich(s.ex)) : null)),
    h("div.vz-flow-no", { "aria-hidden": "true" }, h("span.vz-flow-tag.no", "No"), h("span.vz-flow-arrow", "↓"))));
  const last = h("li.vz-flow-end", h("div.vz-flow-answer", h("strong", rich(v.else)), v.elseEx ? h("span.vz-flow-ex", rich(v.elseEx)) : null));
  return h("ol.vz-flow", steps, last);
}

function bars(v, rich) {
  return h("ul.vz-bars", v.items.map((it, i) => h(`li.vz-bar.${SLOT(i)}`,
    h("span.vz-bar-label", rich(it.label)),
    h("span.vz-bar-track", { role: "img", "aria-label": `${it.value}%` }, h("span.vz-bar-fill", { style: `width: ${Math.max(2, it.value)}%` },
      h("span.vz-bar-value", it.show || `${it.value}%`))),
    it.ex ? h("span.vz-bar-ex", rich(it.ex)) : null)));
}

function scale(v, rich) {
  const items = [...v.items].sort((a, b) => a.at - b.at);
  return [
    h("div.vz-scale", { "aria-hidden": "true" },
      h("div.vz-scale-bar"),
      items.map((it, i) => h(`span.vz-scale-mark.${SLOT(i)}`, { style: `left: ${it.at}%` }, h("span", String(i + 1)))),
      h("div.vz-scale-ends", h("span", v.from), h("span", v.to))),
    h("ol.vz-scale-list", items.map((it, i) => h(`li.${SLOT(i)}`,
      h("span.vz-dot", String(i + 1)), h("span", h("strong", rich(it.label)), it.ex ? h("span.vz-scale-ex", rich(it.ex)) : null)))),
  ];
}

function formula(v, rich) {
  return h("div.vz-formulas", v.lines.map(line => h("div.vz-formula",
    line.name ? h("span.vz-formula-name", rich(line.name)) : null,
    // A part is text, or [text, slot] to give two parts the same color.
    h("div.vz-formula-parts", line.parts.map((p, i) => p === "+" ? h("span.vz-plus", "+")
      : Array.isArray(p) ? h(`span.vz-part.${SLOT(p[1])}`, rich(p[0])) : h(`span.vz-part.${SLOT(i)}`, rich(p)))),
    line.ex ? h("p.vz-formula-ex", rich(line.ex)) : null)));
}

function strip(v, rich) {
  return [
    h("ol.vz-strip", v.slots.map((s, i) => h(`li.${SLOT(i)}`, h("strong", rich(s.label)), s.sub ? h("span", rich(s.sub)) : null))),
    (v.sentences || []).map(sent => h("p.vz-strip-sentence", sent.map(([t, k]) => k == null ? h("span", t) : h(`span.vz-word.${SLOT(k)}`, t)))),
  ];
}

function tiles(v, rich) {
  return h("ul.vz-tiles", v.items.map((it, i) => h(`li.vz-tile.${SLOT(i)}`,
    it.big ? h("span.vz-tile-big", rich(it.big)) : null,
    h("strong.vz-tile-head", rich(it.head)),
    it.sub ? h("span.vz-tile-sub", rich(it.sub)) : null,
    it.words?.length ? h("span.vz-tile-words", it.words.map(w => h("span", rich(w)))) : null)));
}

function funnel(v, rich) {
  const n = v.levels.length;
  return h("ol.vz-funnel", v.levels.map((l, i) => h(`li.${SLOT(i)}`, { style: `--w: ${100 - (i * 46) / Math.max(1, n - 1)}%` },
    h("strong", rich(l.label)), h("span", rich(l.sub)))));
}

function table(v, rich) {
  return h("div.cs-table-wrap", h("table.cs-table",
    h("thead", h("tr", v.head.map(c => h("th", { scope: "col" }, rich(c))))),
    h("tbody", v.rows.map(r => h("tr", r.map((c, k) => k === 0 ? h("th", { scope: "row" }, rich(c)) : h("td", rich(c))))))));
}

const KINDS = { timeline, flow, bars, scale, formula, strip, tiles, funnel, table };

/** One picture: a titled figure with an optional caption under it. */
export function visual(v, rich) {
  return h(`figure.vz.vz-is-${v.kind}`,
    h("h3.vz-title", h("span.vz-kind", { "aria-hidden": "true" }, KIND_LABEL[v.kind]), h("span", rich(v.title))),
    KINDS[v.kind](v, rich),
    v.caption ? h("figcaption.vz-caption", rich(v.caption)) : null);
}

const KIND_LABEL = { timeline: "Timeline", flow: "Flowchart", bars: "Graph", scale: "Scale", formula: "Formula",
  strip: "Word order", tiles: "At a glance", funnel: "Big to small", table: "Table" };
