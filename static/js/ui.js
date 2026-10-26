// Shared UI: DOM helper, icons, the dictionary entry, stars, toasts, dialogs.

import { api, allWords, patchCachedWord } from "./api.js";
import { playWord } from "./audio.js";
import { EVERYDAY_DOMAINS } from "./shared.gen.js";
import { loadFilter, saveFilter } from "./state.js";

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
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
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

export const EVERYDAY = EVERYDAY_DOMAINS;
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
export function highlight(sentence, word) {
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
 * The dictionary entry, in three sizes:
 *   "full"    the word page: meaning, how to use it, examples, then other
 *             meanings and reference material folded (Browse, Lists, Review)
 *   "summary" header, meaning, one example, usage note (word of the day)
 *   "card"    header, meaning, one example, top collocations (flashcard
 *             back, review reveal)
 * What is shown was decided when the data was built (build_dataset.
 * normalize_display): senses that only restate the definition carry `dup`.
 * Options: onChange, called after stars/known change; open, a link to the full entry.
 */
export function renderEntry(w, { mode = "full", compact = false, onChange, open = null } = {}) {
  if (compact) mode = "card";
  const full = mode === "full";
  const n = w.nuance || null;
  const core = n && n.core && n.core.definition ? n.core : null;
  const isName = !!w.name_kind;
  const ex = (n && n.examples) || {};
  const conversation = w.conversation || [];
  const groups = (w.meanings || []).map(m => ({ pos: m.pos, senses: m.senses.filter(s => s.definition && !s.dup) }))
    .filter(g => g.senses.length);
  const wording = (w.meanings || []).flatMap(m => m.senses.filter(s => s.dup));

  // Header: word, sound, pronunciation once, one row of labels.
  const pos = core ? core.pos : (groups[0] && groups[0].pos) || "";
  const domains = (w.domains || []).filter(d => !["custom", "bible_vocab", "bible_names"].includes(d) && !(isName && d === "bible"));
  const knownBtn = h("button.btn.known-toggle", {
    type: "button", "aria-pressed": String(!!w.known), title: "Mark known / unknown · M",
    on: { click: async () => {
      try { await setKnown(w, !w.known); } catch (err) { return showError(err); }
      knownBtn.setAttribute("aria-pressed", String(!!w.known));
      knownBtn.lastChild.textContent = w.known ? "Known" : "Mark known";
      onChange && onChange();
    } },
  }, icon("check"), h("span", w.known ? "Known" : "Mark known"));
  const respelling = n && n.pronunciation && n.pronunciation.respelling;
  const parts = [h("header.entry-head",
    h("div.entry-top", h("h2.headword", w.word), playButton(w)),
    w.phonetic || respelling ? h("div.entry-pron",
      w.phonetic ? h("span.ipa", w.phonetic) : null,
      respelling ? h("span.respell", respelling) : null) : null,
    h("div.entry-meta",
      pos ? posBadge(pos) : null,
      isName ? h("span.chip.name-kind", `Bible name · ${NAME_KIND_LABELS[w.name_kind] || w.name_kind}`) : null,
      domains.slice(0, 2).map(d => h("span.chip", domainLabel(d))),
      domains.length > 2 ? h("span.chip", { title: domains.slice(2).map(domainLabel).join(", ") }, `+${domains.length - 2}`) : null),
    full ? h("div.entry-actions", starsEl(w, { onChange: () => onChange && onChange() }), knownBtn, w.list_actions || null) : null,
  )];
  if (w.variant_of) parts.push(h("p.muted", "Variant of ", h("em", w.variant_of), "; definitions below are for the main form."));

  const senseList = list => {
    const many = list.length > 1;
    return list.map(g => h("div.sense-group", many ? posBadge(g.pos) : null,
      h("ol.sense-list", g.senses.map(s => h("li", s.definition, s.example ? h("span.sense-ex", s.example) : null)))));
  };
  const exampleLine = (text, label) => h("p.example", label ? h("span.ex-ctx", label) : null, highlight(text, w.word));

  // Meaning, and one example right under it (for a Bible name, what the Bible says).
  let lead = null;
  if (core) {
    parts.push(h("p.core-def", core.definition));
    if (isName && n.biblical_note) {
      parts.push(h("div.npanel.wide.lead-note", h("h3", "In the Bible"), h("p", italicize(n.biblical_note))));
    } else if (conversation.length) {
      lead = { conv: conversation[0] };
      parts.push(h("div.examples-list", exampleLine(conversation[0].text, conversation[0].sense)));
    } else if (ex.everyday || ex.professional) {
      lead = { key: ex.everyday ? "everyday" : "professional" };
      parts.push(h("div.examples-list", exampleLine(ex[lead.key])));
    }
  } else if (groups.length) {
    // No study notes (a word you added): the dictionary senses are the meaning.
    parts.push(h("section.senses", { "aria-label": "Definitions" }, senseList(mode === "card" ? groups.slice(0, 1) : groups)));
  }

  if (mode === "card") {
    if (n && n.collocations && n.collocations.length) {
      parts.push(h("div.tags.card-collocations", n.collocations.slice(0, 3).map(c => h("span.chip", c))));
    }
    return h("article.entry.entry-card", parts);
  }
  if (mode === "summary") {
    if (n && n.usage_note) parts.push(h("p.summary-usage", n.usage_note));
    if (open) parts.push(h("a.btn.btn-quiet.open-entry", { href: open }, "Open full entry →"));
    return h("article.entry.entry-summary", parts);
  }

  const section = (title, ...body) => h("section.npanel.wide", h("h3", title), ...body);
  const fold = (title, ...body) => h("details.fold", h("summary", title), h("div.fold-body", ...body));
  const block = (label, ...body) => h("div.block", h("h4", label), ...body);
  const isPron = m => /pronounc|stress|syllable|sound|rhyme|said like|say it/i.test(m);
  const nuanceParts = [];

  // Use it right: what an advanced learner needs to use the word well.
  if (n) {
    const mistakes = (n.common_mistakes || []).filter(m => !isPron(m));
    const use = [
      n.usage_note ? h("p", n.usage_note) : null,
      n.distinctions && n.distinctions.length ? block("Compared with",
        h("dl.distinctions", n.distinctions.map(d => [h("dt", d.vs), h("dd", d.note)]))) : null,
      mistakes.length ? block("Common mistakes", h("ul", mistakes.map(m => h("li", m)))) : null,
      n.collocations && n.collocations.length ? block("Common pairings",
        h("div.tags", n.collocations.map(c => h("span.chip", c)))) : null,
    ].filter(Boolean);
    if (use.length) nuanceParts.push(section("Use it right", ...use));
  }

  // The Bible (a name's note is already under its definition).
  if (n && !isName && n.biblical_note) nuanceParts.push(section("In the Bible", h("p", italicize(n.biblical_note))));
  if (n && n.traditions && n.traditions.length) {
    const order = ["Eastern Orthodox", "Roman Catholic", "Protestant"];
    const views = [...n.traditions].sort((a, b) => order.indexOf(a.tradition) - order.indexOf(b.tradition));
    nuanceParts.push(h("section.npanel.wide.traditions", h("h3", "Orthodox · Catholic · Protestant"),
      h("dl", views.map(t => [h("dt", { "data-tradition": t.tradition }, t.tradition), h("dd", t.view)]))));
  }

  // More examples: conversation first, then the study-note examples; two
  // shown, the rest folded. A sense label appears only when it changes.
  const more = [];
  conversation.forEach(e => { if (!lead || lead.conv !== e) more.push({ text: e.text, sense: e.sense }); });
  [["everyday", "Everyday"], ["professional", "Professional"], ["analytical", "Analytical"]].forEach(([k, label]) => {
    if (ex[k] && !(lead && lead.key === k) && !(isName && k === "everyday")) more.push({ text: ex[k], sense: label });
  });
  const shown = more.slice(0, 5);
  if (shown.length) {
    let prev = null;
    const lines = shown.map(e => { const l = exampleLine(e.text, e.sense !== prev ? e.sense : null); prev = e.sense; return l; });
    const list = h("div.examples-list", lines.slice(0, 2));
    nuanceParts.push(section("More examples", list,
      lines.length > 2 ? fold(`${lines.length - 2} more`, h("div.examples-list", lines.slice(2))) : null));
  }

  // Other dictionary meanings: folded, in the dictionary's order.
  if (core && groups.length) {
    const count = groups.reduce((a, g) => a + g.senses.length, 0);
    nuanceParts.push(h("section.senses.npanel.wide", { "aria-label": "Other meanings" },
      fold(`More meanings (${count})`, senseList(groups))));
  }

  // Reference: folded; each block only when it has something to say.
  if (n || w.etymology || wording.length) {
    const distinct = new Set(((n && n.distinctions) || []).map(d => (d.vs || "").toLowerCase()));
    const uniq = list => [...new Map(list.filter(Boolean).map(x => [x.toLowerCase(), x])).values()];
    const synonyms = isName ? [] : uniq([...(w.synonyms || []), ...(w.meanings || []).flatMap(m => m.synonyms || [])])
      .filter(x => !distinct.has(x.toLowerCase()));
    const antonyms = uniq([...((n && n.antonyms) || []), ...(w.antonyms || []), ...(w.meanings || []).flatMap(m => m.antonyms || [])]);
    const pron = n && n.pronunciation;
    const pronMistakes = ((n && n.common_mistakes) || []).filter(isPron);
    const register = (n && n.register) || [];
    const showRegister = register.length && !(register.length === 1 && register[0] === "neutral");
    const connotation = n && n.connotation && !/^neutral\b/i.test(n.connotation) ? n.connotation : "";
    const dictEtym = w.etymology && n && n.etymology && w.etymology !== n.etymology ? w.etymology : "";
    const ref = [
      pron && (pron.tip || pronMistakes.length) ? block("Pronunciation",
        pron.tip ? h("p", pron.tip) : null, pronMistakes.length ? h("ul", pronMistakes.map(m => h("li", m))) : null) : null,
      showRegister || connotation ? block("Register",
        showRegister ? h("div.tags", register.map(r => h("span.chip", r))) : null, connotation ? h("p", connotation) : null) : null,
      synonyms.length ? block("Synonyms", h("div.tags", synonyms.slice(0, 12).map(x => h("span.chip", x)))) : null,
      antonyms.length >= 2 ? block("Antonyms", h("div.tags", antonyms.slice(0, 10).map(x => h("span.chip", x)))) : null,
      n && n.word_family && n.word_family.length ? block("Word family", h("div.tags", n.word_family.map(x => h("span.chip", x)))) : null,
      n && n.analogy ? block("Analogy", h("p", n.analogy)) : null,
      (n && n.etymology) || w.etymology ? block("Etymology", h("p", italicize((n && n.etymology) || w.etymology)),
        dictEtym ? h("p.muted", "Dictionary: ", italicize(dictEtym)) : null) : null,
      wording.length ? block("Dictionary wording", h("ul.muted", wording.map(s => h("li", s.definition)))) : null,
    ].filter(Boolean);
    if (ref.length) nuanceParts.push(h("section.npanel.wide.reference", fold("Pronunciation, register, related words, origin", h("div.ref-grid", ref))));
  }

  if (nuanceParts.length) parts.push(h("div.nuance", nuanceParts));
  if (w.notes !== undefined) parts.push(notesEditor(w));
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
/** Study scopes, the same everywhere (Review, practice tabs): a track or one domain. */
export const SCOPES = [["", "Everything"], ["everyday", "Everyday English"], ["core", "Advanced & subjects"],
  ["bible_vocab", "Bible · Vocabulary"], ["bible_names", "Bible · Names"], ["bible", "Bible · Both"]];

export function scopeSelect(id, domains = []) {
  const tracks = SCOPES.map(([v]) => v);
  const rest = domainOptions(domains.filter(d => !tracks.includes(d)));
  rest.forEach(g => g.querySelectorAll("option").forEach(o => { if (tracks.includes(o.value)) o.remove(); }));
  return h(`select.input#${id}`, { "aria-label": "Scope" },
    h("optgroup", { label: "Study tracks" }, SCOPES.map(([v, l]) => h("option", { value: v }, l))), rest);
}

/**
 * Practice settings: scope, rating and list (plus a tab's own controls in
 * `extra`), remembered per tab. Folded on phones. Any change calls onChange.
 */
export async function filterBar(onChange, { lists = [], domains = [] } = {}, { tab, extra = [] } = {}) {
  const practiceFilter = loadFilter(tab);
  const starSel = h("select.input#f-stars",
    h("option", { value: "" }, "Any rating"),
    h("option", { value: "0" }, "Unrated"),
    h("option", { value: "1,2" }, "★1–2 · unfamiliar"),
    h("option", { value: "3" }, "★3 · getting there"),
    h("option", { value: "4,5" }, "★4–5 · familiar"));
  const listSel = h("select.input#f-list", h("option", { value: "" }, "All words"),
    lists.map(l => h("option", { value: l.id }, `${l.name} (${l.count})`)));
  const domSel = scopeSelect("f-domain", domains);
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
    saveFilter(tab, practiceFilter);
    onChange({ ...practiceFilter });
  };
  [starSel, listSel, domSel].forEach(s => s.addEventListener("change", fire));
  const set = [practiceFilter.domain, practiceFilter.stars, practiceFilter.list_id].filter(Boolean).length;
  return h("details.settings-fold", { open: !matchMedia("(max-width: 760px)").matches },
    h("summary", set ? `Settings (${set})` : "Settings"),
    h("div.filters-bar",
      h("div.field", h("label", { for: "f-domain" }, "Scope"), domSel),
      h("div.field", h("label", { for: "f-stars" }, "Rating"), starSel),
      h("div.field", h("label", { for: "f-list" }, "Word list"), listSel),
      extra));
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

// Bring answer feedback into view, and again once its fonts have loaded: an
// italic face loaded on first use makes the text taller after the first scroll.
export function reveal(el) {
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  document.fonts.ready.then(() => requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" })));
}

export function fmtDuration(s) {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
