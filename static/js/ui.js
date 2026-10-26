// Shared UI: DOM helper, icons, the dictionary entry, stars, toasts, dialogs.

import { api, allWords, patchCachedWord } from "./api.js";
import { playWord } from "./audio.js";
import { practiceFilter } from "./state.js";

/** h("div.cls#id", {attrs, on: {click}}, ...children) — text children are escaped. */
export function h(tag, attrs, ...children) {
  const [, name, rest] = tag.match(/^([a-z0-9]+)(.*)$/i);
  const el = document.createElement(name);
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (attrs !== null && attrs !== undefined && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === "html") el.innerHTML = v;
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5"/><path d="M8 7h8M8 11h6"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/>',
  review: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M12 7v5l3 2"/>',
  quiz: '<circle cx="12" cy="12" r="9.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.3"/>',
  match: '<rect x="2.5" y="4" width="7" height="6" rx="1.5"/><rect x="14.5" y="14" width="7" height="6" rx="1.5"/><path d="M9.5 7h3a2 2 0 0 1 2 2v8"/>',
  listen: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2.5" y="14" width="5" height="7" rx="2"/><rect x="16.5" y="14" width="5" height="7" rx="2"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".8"/><circle cx="3.5" cy="12" r=".8"/><circle cx="3.5" cy="18" r=".8"/>',
  stats: '<path d="M3 21h18"/><path d="M6 17V11M11 17V6M16 17v-4M21 17V8" />',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.2" r="1.2"/><circle cx="15" cy="7.8" r="1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowL: '<path d="M15 5l-7 7 7 7"/>',
  arrowR: '<path d="M9 5l7 7-7 7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
export function icon(name) {
  const span = document.createElement("span");
  span.style.display = "contents";
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  return span.firstChild;
}
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.83 5.74 6.33.92-4.58 4.47 1.08 6.3L12 17.25l-5.66 2.98 1.08-6.3L2.84 9.46l6.33-.92z"/></svg>';

export function playButton(word, { small = false } = {}) {
  const synth = !word.audio_url;
  const btn = h(`button.play${small ? ".sm" : ""}${synth ? ".synth" : ""}`, {
    type: "button",
    title: synth ? "Play (American synthesized voice; no US recording available) · Space" : "Play American recording · Space",
    "aria-label": `Play pronunciation of ${word.word}`,
    html: PLAY_SVG,
  });
  btn.addEventListener("click", e => { e.stopPropagation(); playWord(word, btn); });
  return btn;
}

export const EVERYDAY = ["dining", "food", "shopping", "outdoors", "small_talk", "phrasal_verbs", "idioms",
  "feelings", "home_health", "getting_around", "sports_culture", "meetings", "phone_calls"];
const GENERAL = ["advanced", "academic", "literary", "professional"];

export const DOMAIN_LABELS = {
  everyday: "All everyday English",
  dining: "Dining out", food: "Food & taste", shopping: "Shopping & errands", outdoors: "Beach & outdoors",
  small_talk: "Small talk", phrasal_verbs: "Phrasal verbs", idioms: "Idioms & expressions",
  feelings: "Feelings & reactions", home_health: "Home & health", getting_around: "Getting around",
  sports_culture: "Sports & pop culture", meetings: "Meetings", phone_calls: "Phone & video calls",
  advanced: "Advanced", academic: "Academic", literary: "Literary", professional: "Professional",
  mathematics: "Mathematics", statistics: "Statistics & probability", data_science: "Data science",
  philosophy: "Philosophy", theology: "Theology", christian_anthropology: "Christian anthropology",
  orthodox_mysticism: "Orthodox mysticism", artificial_intelligence: "Artificial intelligence", bible: "Bible", bible_vocab: "Bible · Vocabulary", bible_names: "Bible · Names", logic: "Logic", software_engineering: "Software engineering",
  custom: "My words",
};
const NAME_KIND_LABELS = { person: "Person", place: "Place", people: "People" };
export const domainLabel = d => DOMAIN_LABELS[d] || d.replace(/_/g, " ");
export const isEveryday = w => (w.domains || []).some(d => EVERYDAY.includes(d));

/** Domain <option>s grouped as Everyday English, Subjects and General. */
export function domainOptions(domains) {
  const byLabel = list => list.sort((a, b) => domainLabel(a).localeCompare(domainLabel(b)))
    .map(d => h("option", { value: d }, domainLabel(d)));
  const everyday = domains.filter(d => EVERYDAY.includes(d));
  const general = domains.filter(d => GENERAL.includes(d));
  const subjects = domains.filter(d => !EVERYDAY.includes(d) && !GENERAL.includes(d) && d !== "custom");
  return [
    everyday.length ? h("optgroup", { label: "Everyday English" },
      h("option", { value: "everyday" }, domainLabel("everyday")), byLabel(everyday)) : null,
    subjects.length ? h("optgroup", { label: "Subjects" }, byLabel(subjects)) : null,
    h("optgroup", { label: "General" }, byLabel(general),
      domains.includes("custom") ? h("option", { value: "custom" }, domainLabel("custom")) : null),
  ].filter(Boolean);
}

export function posBadge(pos) {
  const p = (pos || "").toLowerCase();
  return h("span.pos", { "data-pos": p }, p || "word");
}

/** Interactive 1–5 star rating; clicking the current value clears it. */
export function starsEl(word, { small = false, readonly = false, onChange } = {}) {
  const wrap = h(`span.stars${small ? ".small" : ""}${readonly ? ".readonly" : ""}`, {
    role: readonly ? null : "radiogroup", "aria-label": "Familiarity rating",
  });
  const paint = v => [...wrap.children].forEach((b, i) => {
    b.classList.toggle("on", i < v);
    b.setAttribute("aria-checked", String(i + 1 === v));
  });
  for (let i = 1; i <= 5; i++) {
    const b = h("button", { type: "button", role: "radio", title: `${i} star${i > 1 ? "s" : ""} · key ${i}`, "aria-label": `${i} stars`, html: STAR_SVG });
    b.addEventListener("click", async e => {
      e.stopPropagation();
      const v = word.stars === i ? 0 : i;
      try {
        await setStars(word, v);
      } catch (err) { return showError(err); }
      paint(v);
      onChange && onChange(v);
    });
    wrap.append(b);
  }
  paint(word.stars || 0);
  wrap.repaint = () => paint(word.stars || 0);
  return wrap;
}

export async function setStars(word, v) {
  const res = await api.patch(`/api/words/${word.id}/state`, { stars: v });
  word.stars = res.stars;
  patchCachedWord(word.id, { stars: res.stars });
  return res;
}

export async function setKnown(word, known) {
  const res = await api.patch(`/api/words/${word.id}/state`, { known });
  word.known = res.known;
  patchCachedWord(word.id, { known: res.known });
  toast(res.known ? `Marked “${word.word}” as known` : `“${word.word}” is back in your study pool`);
  return res;
}

/** Render *word* spans (cited forms in etymologies) as italics, safely. */
function italicize(text) {
  return text.split(/(\*[^*]+\*)/).map(part =>
    part.length > 2 && part.startsWith("*") && part.endsWith("*") ? h("em", part.slice(1, -1)) : part);
}

/** Wrap occurrences of the headword in <mark> inside an example sentence. */
function highlight(sentence, word) {
  const parts = word.trim().replace(/[?!.,…]+$/, "").split(/[\s-]+/)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let last = parts.pop();
  if (last.length > 4 && /[ey]$/.test(last)) last = last.slice(0, -1);
  let re;
  if (parts.length && parts.length <= 2) {
    // Phrasal verbs: an inflected verb, and up to three words between it and
    // its particle ("picked you up", "turning the music down").
    const [verb, ...rest] = parts;
    const stem = verb.length > 3 && /e$/.test(verb) ? verb.slice(0, -1) : verb;
    const tail = [...rest, last].join("[\\s-]+");
    re = new RegExp(`\\b(${stem}[a-z]{0,4}(?:[\\s-]+[\\w']+){0,3}?[\\s-]+${tail}[a-z]{0,4})\\b`, "i");
  } else {
    re = new RegExp(`\\b(${[...parts, last].join("[\\s-]+")}[a-z]{0,4})\\b`, "i");
  }
  const m = sentence.match(re);
  if (!m) return [sentence];
  return [sentence.slice(0, m.index), h("mark", m[0]), sentence.slice(m.index + m[0].length)];
}

/**
 * The dictionary entry. Options:
 *   compact: hide nuance panels (flashcard back)
 *   onChange: called after stars/known change
 */
export function renderEntry(w, { compact = false, onChange } = {}) {
  const n = w.nuance;
  const knownBtn = h("button.btn.known-toggle", {
    type: "button", "aria-pressed": String(!!w.known), title: "Mark known / unknown · M",
    on: { click: async () => {
      try { await setKnown(w, !w.known); } catch (err) { return showError(err); }
      knownBtn.setAttribute("aria-pressed", String(!!w.known));
      knownBtn.lastChild.textContent = w.known ? "Known" : "Mark known";
      onChange && onChange();
    } },
  }, icon("check"), h("span", w.known ? "Known" : "Mark known"));

  const head = h("header.entry-head",
    h("div.entry-top",
      h("h2.headword", w.word),
      playButton(w),
    ),
    h("div.entry-pron",
      w.phonetic ? h("span.ipa", w.phonetic) : null,
      n && n.pronunciation && n.pronunciation.respelling ? h("span.respell", n.pronunciation.respelling) : null,
      h("span.chip", w.audio_url ? "US recording" : "US synthesized voice"),
    ),
    h("div.entry-meta",
      [...new Set(w.meanings.map(m => m.pos))].map(posBadge),
      w.name_kind ? h("span.chip.name-kind", `Bible name · ${NAME_KIND_LABELS[w.name_kind] || w.name_kind}`) : null,
      (w.domains || []).filter(d => !["custom", "bible_vocab", "bible_names"].includes(d) && !(w.name_kind && d === "bible"))
        .map(d => h("span.chip", domainLabel(d))),
    ),
    compact ? null : h("div.entry-actions",
      starsEl(w, { onChange: () => onChange && onChange() }),
      knownBtn,
      w.list_actions || null,
    ),
  );

  const parts = [head];
  if (w.variant_of) parts.push(h("p.muted", { style: { marginTop: "-10px" } }, "Variant of ", h("em", w.variant_of), "; definitions below are for the main form."));
  if (n && n.core && n.core.definition) {
    parts.push(h("p.core-def", n.core.definition));
  }

  // Dictionary senses, grouped by part of speech.
  const MAX = compact ? 2 : 4;
  const senseGroups = h("section.senses", { "aria-label": "Definitions" });
  let hidden = 0;
  for (const m of w.meanings) {
    const items = m.senses.filter(s => s.definition);
    if (!items.length) continue;
    const ol = h("ol.sense-list");
    items.forEach((s, i) => {
      const li = h("li", s.definition, s.example ? h("span.sense-ex", s.example) : null);
      if (i >= MAX) { li.hidden = true; hidden++; }
      ol.append(li);
    });
    senseGroups.append(h("div.sense-group", posBadge(m.pos), ol));
  }
  if (hidden && !compact) {
    const more = h("button.btn.btn-quiet.more-senses", { type: "button" }, `Show ${hidden} more sense${hidden > 1 ? "s" : ""}`);
    more.addEventListener("click", () => { senseGroups.querySelectorAll("li[hidden]").forEach(li => (li.hidden = false)); more.remove(); });
    senseGroups.append(more);
  }
  parts.push(senseGroups);

  const uniq = list => [...new Map(list.filter(Boolean).map(x => [x.toLowerCase(), x])).values()];
  const synonyms = uniq([...(w.synonyms || []), ...w.meanings.flatMap(m => m.synonyms || [])])
    .filter(x => !(n && n.distinctions || []).some(d => (d.vs || "").toLowerCase() === x.toLowerCase()));
  const antonyms = uniq([...(n && n.antonyms || []), ...(w.antonyms || []), ...w.meanings.flatMap(m => m.antonyms || [])]);
  const etymology = (n && n.etymology) || w.etymology;

  const conversation = w.conversation || [];
  const convoList = list => h("div.examples-list", list.map(e =>
    h("p.example", e.sense ? h("span.ex-ctx", e.sense) : null, highlight(e.text, w.word))));

  if (compact) {
    if (conversation.length) {
      parts.push(convoList(conversation.slice(0, 2)));
    } else if (n && n.examples) {
      const ex = n.examples;
      parts.push(h("div.examples-list",
        [["everyday", "Everyday"], ["professional", "Professional"], ["analytical", "Analytical"]]
          .filter(([k]) => ex[k])
          .map(([k, label]) => h("p.example", h("span.ex-ctx", label), highlight(ex[k], w.word)))));
    }
    return h("article.entry", parts);
  }

  const panels = h("section.nuance", { "aria-label": "Usage notes" });
  if (conversation.length) {
    panels.append(h("div.npanel.wide", h("h3", "In conversation"), convoList(conversation)));
  }
  if (n) {
    const ex = n.examples || {};
    panels.append(h("div.npanel.wide", h("h3", "Examples in context"), h("div.examples-list",
      [["everyday", "Everyday"], ["professional", "Professional"], ["analytical", "Analytical"]]
        .filter(([k]) => ex[k])
        .map(([k, label]) => h("p.example", h("span.ex-ctx", label), highlight(ex[k], w.word))))));
    if (n.usage_note) panels.append(h("div.npanel.wide", h("h3", "How Americans use it"), h("p", n.usage_note)));
    if (n.biblical_note) panels.append(h("div.npanel.wide", h("h3", "In the Bible"), h("p", italicize(n.biblical_note))));
    if (n.traditions && n.traditions.length) {
      const order = ["Eastern Orthodox", "Roman Catholic", "Protestant"];
      const views = [...n.traditions].sort((a, b) => order.indexOf(a.tradition) - order.indexOf(b.tradition));
      panels.append(h("div.npanel.wide.traditions", h("h3", "Orthodox · Catholic · Protestant"),
        h("p.muted", "These Christian traditions understand this differently:"),
        h("dl", views.map(t => [h("dt", { "data-tradition": t.tradition }, t.tradition), h("dd", t.view)]))));
    }
    if (n.pronunciation && n.pronunciation.tip) {
      panels.append(h("div.npanel", h("h3", "Pronunciation"),
        n.pronunciation.respelling ? h("p", h("strong", n.pronunciation.respelling)) : null,
        h("p", n.pronunciation.tip)));
    }
    panels.append(h("div.npanel", h("h3", "Register & connotation"),
      h("div.tags", (n.register || []).map(r => h("span.chip", r))),
      h("p", n.connotation)));
    if (n.distinctions && n.distinctions.length) {
      panels.append(h("div.npanel.wide", h("h3", "Distinctions from near-synonyms"),
        h("dl", n.distinctions.map(d => [h("dt", d.vs), h("dd", d.note)]))));
    }
    if (n.collocations && n.collocations.length) {
      panels.append(h("div.npanel", h("h3", "Collocations"), h("ul", n.collocations.map(c => h("li", c)))));
    }
  }
  if (synonyms.length) panels.append(h("div.npanel", h("h3", "Synonyms"), h("div.tags", synonyms.slice(0, 12).map(x => h("span.chip", x)))));
  if (antonyms.length) panels.append(h("div.npanel", h("h3", "Antonyms"), h("div.tags", antonyms.slice(0, 10).map(x => h("span.chip", x)))));
  if (n && n.word_family && n.word_family.length) {
    panels.append(h("div.npanel", h("h3", "Word family"), h("div.tags", n.word_family.map(x => h("span.chip", x)))));
  }
  if (n && n.analogy) panels.append(h("div.npanel", h("h3", "Analogy"), h("p", n.analogy)));
  if (etymology) panels.append(h("div.npanel", h("h3", "Etymology"), h("p", italicize(etymology))));
  if (n && n.common_mistakes && n.common_mistakes.length) {
    panels.append(h("div.npanel.wide", h("h3", "Common mistakes"), h("ul", n.common_mistakes.map(m => h("li", m)))));
  }
  if (panels.children.length) parts.push(panels);
  if (!compact && w.notes !== undefined) parts.push(notesEditor(w));
  return h("article.entry", parts);
}

function notesEditor(w) {
  const ta = h("textarea.input#word-notes", { rows: 2, "aria-label": "My notes", placeholder: "Your notes: a mnemonic, a sentence of your own, where you met this word…" });
  ta.value = w.notes || "";
  let t;
  ta.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => api.patch(`/api/words/${w.id}/state`, { notes: ta.value })
      .then(() => { w.notes = ta.value; })
      .catch(showError), 600);
  });
  ta.addEventListener("keydown", e => e.stopPropagation());
  return h("div.npanel.wide", h("h3", "My notes"), ta);
}

// ---------------------------------------------------------------- toasts & dialogs

export function toast(msg, { error = false, ms = 2600 } = {}) {
  const t = h(`div.toast${error ? ".err" : ""}`, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

export function showError(e) { toast(e.message || String(e), { error: true, ms: 4500 }); }

/** Modal form. fields: [{id, label, type, value, options, placeholder, required}] → resolves values or null. */
export function formDialog({ title, fields = [], submit = "Save", body = null }) {
  const dlg = document.getElementById("dialog");
  return new Promise(resolve => {
    const inputs = {};
    const form = h("form", { method: "dialog" },
      h("h2", title),
      body,
      fields.map(f => {
        let input;
        if (f.type === "select") {
          input = h("select.input", { id: `dlg-${f.id}` }, f.options.map(([v, l]) => h("option", { value: v }, l)));
        } else if (f.type === "textarea") {
          input = h("textarea.input", { id: `dlg-${f.id}`, rows: 3, placeholder: f.placeholder || "" });
        } else {
          input = h("input.input", { id: `dlg-${f.id}`, type: f.type || "text", placeholder: f.placeholder || "", required: !!f.required });
        }
        if (f.value !== undefined) input.value = f.value;
        inputs[f.id] = input;
        return h("div.field", h("label", { for: `dlg-${f.id}` }, f.label), input);
      }),
      h("div.actions",
        h("button.btn", { type: "button", value: "cancel", on: { click: () => dlg.close("cancel") } }, "Cancel"),
        submit ? h("button.btn.btn-primary", { type: "submit", value: "ok" }, submit) : null),
    );
    dlg.replaceChildren(form);
    dlg.onclose = () => {
      if (dlg.returnValue !== "ok") return resolve(null);
      const out = {};
      for (const [k, el] of Object.entries(inputs)) out[k] = el.value;
      resolve(out);
    };
    form.addEventListener("submit", e => { e.preventDefault(); dlg.close("ok"); });
    dlg.returnValue = "";
    dlg.showModal();
    const first = form.querySelector("input, select, textarea");
    if (first) first.focus();
  });
}

export function confirmDialog(title, message, action = "Delete") {
  return formDialog({ title, body: h("p", message), submit: action }).then(v => v !== null);
}

// ---------------------------------------------------------------- practice filters

/** Shared filter bar: stars, list, domain. Calls onChange(filter) with query params. */
export async function filterBar(onChange, { lists = [], domains = [] } = {}) {
  const starSel = h("select.input#f-stars",
    h("option", { value: "" }, "Any rating"),
    h("option", { value: "0" }, "Unrated"),
    h("option", { value: "1,2" }, "★1–2 · unfamiliar"),
    h("option", { value: "3" }, "★3 · getting there"),
    h("option", { value: "4,5" }, "★4–5 · familiar"));
  const listSel = h("select.input#f-list", h("option", { value: "" }, "All words"),
    lists.map(l => h("option", { value: l.id }, `${l.name} (${l.count})`)));
  const domSel = h("select.input#f-domain", h("option", { value: "" }, "All domains"),
    domainOptions(domains));
  starSel.value = practiceFilter.stars;
  listSel.value = practiceFilter.list_id;
  domSel.value = practiceFilter.domain;
  // A remembered value that's no longer offered (deleted list, gone domain) resets.
  if (listSel.value !== String(practiceFilter.list_id)) practiceFilter.list_id = "";
  if (domSel.value !== practiceFilter.domain) practiceFilter.domain = "";
  const fire = () => {
    practiceFilter.stars = starSel.value;
    practiceFilter.list_id = listSel.value;
    practiceFilter.domain = domSel.value;
    onChange({ ...practiceFilter });
  };
  [starSel, listSel, domSel].forEach(s => s.addEventListener("change", fire));
  return h("div.filters-bar",
    h("div.field", h("label", { for: "f-stars" }, "Rating"), starSel),
    h("div.field", h("label", { for: "f-list" }, "Word list"), listSel),
    h("div.field", h("label", { for: "f-domain" }, "Domain"), domSel));
}

export async function filterSources() {
  const [{ lists }, words] = await Promise.all([api.get("/api/lists"), allWords()]);
  const domains = [...new Set(words.flatMap(w => w.domains))].sort((a, b) => domainLabel(a).localeCompare(domainLabel(b)));
  return { lists, domains };
}

export function pageHead(title, sub, ...tools) {
  return h("div.page-head", h("div", h("h1", title), sub ? h("p.sub", sub) : null), tools.length ? h("div.toolbar", tools) : null);
}

export function emptyState(title, text, ...actions) {
  return h("div.panel.empty", h("h2", title), h("p", text), actions.length ? h("div.toolbar", actions) : null);
}

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function fmtDuration(s) {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
