// Shared UI: DOM helper, icons, the dictionary entry, stars, toasts, dialogs.

import { api, allWords, cachedWords, invalidateWords, patchCachedWord } from "./api.js";
import { playWord, speedButton } from "./audio.js";
import { hardestIndex, label as soundLabel, tokenize } from "./phonemes.js";
import { EVERYDAY_DOMAINS } from "./shared.gen.js";
import { loadFilter, saveFilter, saveSettings, settings } from "./state.js";

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
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><path d="M12 7.5v.3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mouth: '<path d="M3.5 12.5c2.5-4.5 14.5-4.5 17 0-2.5 5-14.5 5-17 0z"/><path d="M7.5 12.8c3 1.4 6 1.4 9 0"/>',
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
    title: word.audio_url ? "Play American recording · Space"
      : word.tts_url ? "Play (natural synthesized voice; no US recording available) · Space"
      : "Play (your device's American voice; no US recording available) · Space",
    "aria-label": `Play pronunciation of ${word.word}`,
    html: PLAY_SVG,
  });
  btn.addEventListener("click", e => { e.stopPropagation(); playWord(word, btn); });
  return btn;
}

export const EVERYDAY = EVERYDAY_DOMAINS;
const GENERAL = ["advanced", "academic", "literary", "professional", "linked", "reference"];

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
  custom: "My words", linked: "Linked words", reference: "Look-up only (linked, very rare or very common)",
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
    const b = h("button", { type: "button", role: "radio", title: `${i} star${i > 1 ? "s" : ""} · key ${i}`, "aria-label": `${i} star${i > 1 ? "s" : ""}`, html: STAR_SVG });
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

export async function setKnown(word, known, { quiet = false } = {}) {
  const res = await api.patch(`/api/words/${word.id}/state`, { known });
  word.known = res.known;
  patchCachedWord(word.id, { known: res.known });
  if (!quiet) toast(res.known ? `“${word.word}” marked as known` : `“${word.word}” is back in your study pool`);
  return res;
}

/** Typewriter quotes and apostrophes as typographic ones ("it's" → it’s). */
export function smart(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/(^|[\s(\[{\u2014\u2013-])"/g, "$1\u201C").replace(/"/g, "\u201D")
    .replace(/(^|[\s(\[{\u201C\u2014\u2013-])'/g, "$1\u2018").replace(/'/g, "\u2019");
}

/** Render *word* spans (cited forms in etymologies) as italics, safely. */
function italicize(text) {
  text = smart(text);
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
  sentence = smart(sentence);
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
    type: "button", "aria-pressed": String(!!w.known), title: "Know it: stop studying this word (press again to study it) · M",
    on: { click: async () => {
      try { await setKnown(w, !w.known); } catch (err) { return showError(err); }
      knownBtn.setAttribute("aria-pressed", String(!!w.known));
      knownBtn.lastChild.textContent = w.known ? "Known" : "Know it";
      onChange && onChange();
    } },
  }, icon("check"), h("span", w.known ? "Known" : "Know it"));
  const respelling = n && n.pronunciation && n.pronunciation.respelling;
  const parts = [h("header.entry-head",
    h("div.entry-top", h("h2.headword", w.word), h("span.play-group", playButton(w), speedButton())),
    w.phonetic || respelling ? h("div.entry-pron",
      w.phonetic ? h("span.ipa", { lang: "en-fonipa", title: "IPA" }, h("span.sr-only", "IPA: "), w.phonetic) : null,
      respelling ? h("span.respell", respelling) : null) : null,
    full ? sayRow(w) : null,
    h("div.entry-meta",
      pos ? posBadge(pos) : null,
      w.level && mode !== "card" ? h("span.chip.level", { title: `How common the word is: level ${w.level} of 5` },
        `Level ${w.level} · ${levelLabel(w.level)}`) : null,
      isName ? h("span.chip.name-kind", `Bible name · ${NAME_KIND_LABELS[w.name_kind] || w.name_kind}`) : null,
      domains.slice(0, 2).map(d => h("span.chip", domainLabel(d))),
      domains.length > 2 ? h("span.chip", { title: domains.slice(2).map(domainLabel).join(", ") }, `+${domains.length - 2}`) : null),
    full ? h("div.entry-actions", starsEl(w, { onChange: () => onChange && onChange() }), knownBtn, w.list_actions || null) : null,
  )];
  if (w.also && w.also.length) parts.push(h("p.also.muted", "Also spelled ", w.also.map((a, i) => [i ? ", " : "", h("em", a)])));
  if (w.variant_of) parts.push(h("p.muted", "Variant of ", h("em", w.variant_of), "; definitions below are for the main form."));

  const senseList = list => {
    const many = list.length > 1;
    return list.map(g => h("div.sense-group", many ? posBadge(g.pos) : null,
      h("ol.sense-list", { start: g.start || 1 }, g.senses.map(s => h("li", smart(s.definition),
        s.example ? h("span.sense-ex", smart(s.example)) : null)))));
  };
  // All the dictionary's meanings, in its order, each with its example: the
  // first few in view, the rest one tap away.
  const MEANINGS_SHOWN = 6;
  const meaningsList = () => {
    const count = groups.reduce((a, g) => a + g.senses.length, 0);
    let left = MEANINGS_SHOWN;
    const head = [], rest = [];
    for (const g of groups) {
      const a = g.senses.slice(0, Math.max(0, left)), b = g.senses.slice(a.length);
      left -= a.length;
      if (a.length) head.push({ pos: g.pos, senses: a });
      if (b.length) rest.push({ pos: g.pos, senses: b, start: a.length + 1 });
    }
    return h("section.senses.all-meanings", { "aria-label": "All meanings" },
      h("h3", count > 1 ? `Meanings (${count})` : "Meaning"), senseList(head),
      rest.length ? h("details.fold", h("summary", `Show all ${count} meanings`),
        h("div.fold-body", senseList(rest))) : null);
  };
  const exampleLine = (text, label) => h("p.example", label ? h("span.ex-ctx", label) : null, highlight(text, w.word));

  // Meaning, and one example right under it (for a Bible name, what the Bible says).
  let lead = null;
  if (core) {
    parts.push(h("p.core-def", smart(core.definition)));
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

  // Synonyms and antonyms: always in view, each a link when it has an entry.
  const distinct = new Set(((n && n.distinctions) || []).map(d => (d.vs || "").toLowerCase()));
  const uniq = list => [...new Map(list.filter(Boolean).map(x => [x.toLowerCase(), x])).values()];
  const synonyms = isName ? [] : uniq([...(w.synonyms || []), ...(w.meanings || []).flatMap(m => m.synonyms || [])])
    .filter(x => !distinct.has(x.toLowerCase()) && x.toLowerCase() !== w.word.toLowerCase());
  const antonyms = uniq([...((n && n.antonyms) || []), ...(w.antonyms || []), ...(w.meanings || []).flatMap(m => m.antonyms || [])])
    .filter(x => x.toLowerCase() !== w.word.toLowerCase());
  const related = (synonyms.length || antonyms.length) && mode !== "summary" ? h("div.related",
    synonyms.length ? h("div.related-row", h("span.related-label", "Synonyms"), wordChips(synonyms.slice(0, mode === "card" ? 5 : 8))) : null,
    antonyms.length ? h("div.related-row", h("span.related-label", "Antonyms"), wordChips(antonyms.slice(0, mode === "card" ? 3 : 6))) : null) : null;

  if (mode === "card") {
    const others = core ? groups.flatMap(g => g.senses.map(s => ({ pos: g.pos, s })))
      .filter(x => x.s.definition !== core.definition).slice(0, 3) : [];
    if (others.length) parts.push(h("div.card-senses", h("span.related-label", "Also means"),
      h("ol", others.map(x => h("li", h("span.muted", `${x.pos} · `), smart(x.s.definition))))));
    if (related) parts.push(related);
    // One contrast and one pitfall, a different one each day, so repeat
    // reviews bring something new to notice.
    const day = Math.floor(Date.now() / 86400000);
    const pick = list => list && list.length ? list[(day + w.id) % list.length] : null;
    const d = n && pick(n.distinctions);
    const mistake = n && pick((n.common_mistakes || []).filter(m => !/pronounc|stress|syllable|sound|rhyme|said like|say it/i.test(m)));
    if (d || mistake) {
      parts.push(h("div.card-notes",
        d ? h("p.card-note", h("span.card-note-label", "vs ", termLink(d.vs, { chip: false })), " ", smart(d.note)) : null,
        mistake ? h("p.card-note", h("span.card-note-label", "Watch out"), " ", smart(mistake)) : null));
    }
    if (n && n.patterns && n.patterns.length) parts.push(grammarBlock(n.patterns.slice(0, 2)));
    if (n && n.collocations && n.collocations.length) {
      parts.push(h("div.tags.card-collocations", n.collocations.slice(0, 3).map(c => h("span.chip", c))));
    }
    return h("article.entry.entry-card", parts);
  }
  if (mode === "summary") {
    if (n && n.usage_note) parts.push(h("p.summary-usage", smart(n.usage_note)));
    if (open) parts.push(h("a.btn.btn-quiet.open-entry", { href: open }, "Open full entry →"));
    return h("article.entry.entry-summary", parts);
  }

  const section = (title, ...body) => h("section.npanel.wide", h("h3", title), ...body);
  const fold = (title, ...body) => h("details.fold", h("summary", title), h("div.fold-body", ...body));
  const block = (label, ...body) => h("div.block", h("h4", label), ...body);
  const isPron = m => /pronounc|stress|syllable|sound|rhyme|said like|say it/i.test(m);
  const nuanceParts = [];

  if (core && groups.length) parts.push(meaningsList());
  // Use it right: what an advanced learner needs to use the word well.
  if (related) parts.push(related);
  const forms = wordForms(w, n);
  if (forms) parts.push(forms);
  if (n) {
    const mistakes = (n.common_mistakes || []).filter(m => !isPron(m));
    const use = [
      n.patterns && n.patterns.length ? grammarBlock(n.patterns) : null,
      n.usage_note ? h("p", smart(n.usage_note)) : null,
      n.distinctions && n.distinctions.length ? block("Compared with",
        h("dl.distinctions", n.distinctions.map(d => [h("dt", termLink(d.vs, { chip: false })), h("dd", smart(d.note))]))) : null,
      mistakes.length ? block("Common mistakes", h("ul", mistakes.map(m => h("li", smart(m))))) : null,
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
      h("dl", views.map(t => [h("dt", { "data-tradition": t.tradition }, t.tradition), h("dd", smart(t.view))]))));
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


  // Reference: folded; each block only when it has something to say.
  if (n || w.etymology || wording.length) {
    const pron = n && n.pronunciation;
    const pronMistakes = ((n && n.common_mistakes) || []).filter(isPron);
    const register = (n && n.register) || [];
    const showRegister = register.length && !(register.length === 1 && register[0] === "neutral");
    const connotation = n && n.connotation && !/^neutral\b/i.test(n.connotation) ? n.connotation : "";
    const dictEtym = w.etymology && n && n.etymology && w.etymology !== n.etymology ? w.etymology : "";
    const ref = [
      pron && (pron.tip || pronMistakes.length) ? block("Pronunciation",
        pron.tip ? h("p", smart(pron.tip)) : null, pronMistakes.length ? h("ul", pronMistakes.map(m => h("li", smart(m)))) : null) : null,
      showRegister || connotation ? block("Register",
        showRegister ? h("div.tags", register.map(r => h("span.chip", r))) : null, connotation ? h("p", smart(connotation)) : null) : null,
      n && n.analogy ? block("Analogy", h("p", smart(n.analogy))) : null,
      (n && n.etymology) || w.etymology ? block("Etymology", h("p", italicize((n && n.etymology) || w.etymology)),
        dictEtym ? h("p.muted", "Dictionary: ", italicize(dictEtym)) : null) : null,
      wording.length ? block("Dictionary wording", h("ul.muted", wording.map(s => h("li", smart(s.definition))))) : null,
    ].filter(Boolean);
    if (ref.length) nuanceParts.push(h("section.npanel.wide.reference", fold("Pronunciation, register, origin", h("div.ref-grid", ref))));
  }

  if (nuanceParts.length) parts.push(h("div.nuance", nuanceParts));
  if (full && w.id !== undefined && navigator.mediaDevices && window.MediaRecorder) parts.push(sayYourself(w));
  if (w.notes !== undefined) parts.push(notesEditor(w));
  return h("article.entry", parts);
}

// How to say it: a row under the IPA, always closed at first; opening it
// loads the mouth drawing (say.js) on the word's hardest sound, named on the row.
const SAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5c2.5-4.5 14.5-4.5 17 0-2.5 5-14.5 5-17 0z"/><path d="M7.5 12.8c3 1.4 6 1.4 9 0"/></svg>';
function sayRow(w) {
  const tokens = tokenize(w.phonetic);
  if (!tokens) return null;
  const body = h("div.say-body");
  const row = h("details.say", h("summary", h("span", { html: SAY_ICON, style: { display: "contents" } }),
    h("span", "How to say it"), h("span.say-hint", soundLabel(tokens[hardestIndex(tokens)].sym))), body);
  let loaded = false;
  row.addEventListener("toggle", async () => {
    if (!row.open || loaded) return;
    loaded = true;
    try { (await import("./say.js")).fillPanel(body, w, tokens); } catch (e) { loaded = false; showError(e); }
  });
  return row;
}

/** fn after `ms` of quiet; .now() runs a pending call at once. Pending calls
 * also run when the page is hidden or closed, so the last words typed are kept. */
const pendingSaves = new Set();
const flushAll = () => pendingSaves.forEach(run => run());
addEventListener("pagehide", flushAll);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
export function debounced(fn, ms) {
  let t = null;
  const run = () => {
    clearTimeout(t); t = null;
    pendingSaves.delete(run);
    return Promise.resolve(fn()).catch(showError);
  };
  const call = () => { clearTimeout(t); t = setTimeout(run, ms); pendingSaves.add(run); };
  call.now = () => (t ? run() : Promise.resolve());
  return call;
}

/** Grammar patterns: "insist on doing sth", "[U] advice on sth". The
 * placeholders (sb, sth) and labels ([U], [C]) are set apart from the words
 * you actually say. */
const PATTERN_TOKEN = /(\bsb\/sth\b|\bsb\b|\bsth\b|\bdo sth\b|\bdoing sth\b|\[[^\]]+\]|\((?:not|only|usually)[^)]*\)|…)/g;
function grammarBlock(patterns) {
  return h("div.grammar", h("span.grammar-label", "Grammar"),
    h("ul.patterns", patterns.map(p => h("li", p.split(PATTERN_TOKEN).map((part, i) =>
      i % 2 ? h("span.slot", part) : part)))));
}

/** Words as chips; each opens its entry, or a short definition when it has none. */
// Word forms: tenses, plural, comparative; then the words built from it in
// other parts of speech (each opens its entry or a short definition).
function wordForms(w, n) {
  const f = w.forms || {};
  // A word added since the last build has no forms yet: its word family.
  const related = f.related || (!w.forms && n && n.word_family) || [];
  const rows = (f.inflections || []).map(([pos, list]) => h("div.forms-row",
    h("span.related-label", pos),
    h("span.forms-list", list.map(([label, value]) => h("span.form", h("span.form-label", label), " ", h("b", value))))));
  if (related.length) rows.push(h("div.forms-row", h("span.related-label", "Related"), wordChips(related)));
  return rows.length ? h("section.npanel.wide.word-forms", h("h3", "Word forms"), rows) : null;
}

function wordChips(words) {
  return h("div.tags", words.map(x => termLink(x)));
}

// Lookup form of a related word: as the glossary keys it (app/common.py gloss_key).
const termKey = t => String(t).replace(/[\u2018\u2019]/g, "'").trim().replace(/\s*\([^()]*\)\s*$/, "")
  .replace(/\s+/g, " ").toLowerCase();
let entryMap = null;   // [word list, Map of lowercase word -> id]
function entryIds(list) {
  if (!entryMap || entryMap[0] !== list) entryMap = [list, new Map(list.map(e => [e.word.toLowerCase(), e.id]))];
  return entryMap[1];
}

/** A related word or phrase: a link to its entry when it has one (once the
 * word list is loaded), otherwise a button that opens a short definition. */
export function termLink(text, { chip = true } = {}) {
  const cls = chip ? "chip.term" : "term";
  const key = termKey(text);
  const entry = id => h(`a.${cls}.has-entry`, { href: `#browse/${id}`, title: `Open “${key}”`,
    on: { click: e => e.stopPropagation() } }, smart(text));
  const list = cachedWords();
  const id = list && entryIds(list).get(key);
  if (id) return entry(id);
  const btn = h(`button.${cls}`, { type: "button", title: `What does “${key}” mean?`,
    on: { click: e => { e.stopPropagation(); defineTerm(text); } } }, smart(text));
  // Not loaded yet: becomes a link once the list arrives (by then it's on the page).
  if (!list) allWords().then(l => { const i = entryIds(l).get(key); if (i) btn.replaceWith(entry(i)); }).catch(() => {});
  return btn;
}

/** The short definition of a word without an entry (Open English WordNet),
 * in the dialog; a form of a headword ("kings") opens that entry instead. */
async function defineTerm(text) {
  let g;
  try {
    g = await api.get("/api/gloss", { w: text });
  } catch (e) { return showError(e); }
  const list = await allWords().catch(() => null);
  const ids = list ? entryIds(list) : new Map();
  // A form of a headword opens it, unless that's the entry already open ("abased" under "abase").
  if (g.see && ids.get(g.see.toLowerCase()) && location.hash !== `#browse/${ids.get(g.see.toLowerCase())}`) {
    const dlg = document.getElementById("dialog");
    if (dlg.open) dlg.close();
    location.hash = `#browse/${ids.get(g.see.toLowerCase())}`;
    return;
  }
  const term = termKey(text);
  const shown = g.base || term;
  const byPos = [];
  for (const [pos, definition, example] of g.senses || []) {
    let group = byPos.find(x => x.pos === pos);
    if (!group) byPos.push(group = { pos, senses: [] });
    group.senses.push([definition, example]);
  }
  const wiktionary = `https://en.wiktionary.org/wiki/${encodeURIComponent(shown.replace(/ /g, "_"))}`;
  const first = (g.senses || [])[0];
  const body = h("div.gloss",
    g.base ? h("p.muted.gloss-base", "Defined under ", h("em", g.base)) : null,
    g.see ? h("p", "A form of ", h("em", g.see), ".") : byPos.length ? byPos.map(x => h("div.gloss-group", posBadge(x.pos),
      h("ol", x.senses.map(([d, ex]) => h("li", smart(d), ex ? h("span.gloss-example", " · ", h("em", smart(ex))) : null)))))
      : h("p", "LexiMaster has no short definition for this word or phrase. Wiktionary may have one."),
    g.form_of ? h("p.gloss-also", "Also a form of ", termLink(g.form_of, { chip: false })) : null,
    g.syn && g.syn.length ? h("div.related-row", h("span.related-label", "Similar"), wordChips(g.syn)) : null,
    h("p.gloss-links",
      h("a", { href: wiktionary, target: "_blank", rel: "noopener" }, "Wiktionary ↗"),
      first ? h("button.btn.btn-quiet", { type: "button", on: { click: () => addAsMyWord(shown, first) } }, "Add to my words") : null),
    byPos.length ? h("p.gloss-source.muted", "Short definition from Open English WordNet") : null);
  // A link inside (an entry, or a word that has one) leaves the dialog behind.
  body.addEventListener("click", e => { if (e.target.closest("a[href^='#']")) document.getElementById("dialog").close(); }, true);
  const dlg = document.getElementById("dialog");
  if (dlg.open) dlg.close();   // from a word inside the dialog: this one replaces it
  formDialog({ title: term, body, submit: null });
  // Start at the word, not on its first link (no focus ring on a link nobody chose).
  const title = document.getElementById("dlg-title");
  title.tabIndex = -1;
  title.focus();
}

async function addAsMyWord(word, [pos, definition, example]) {
  try {
    const w = await api.post("/api/words", { word, pos, definition: smart(definition), example: example || "" });
    document.getElementById("dialog").close();
    invalidateWords();
    toast(`Added “${word}” to My words`);
    location.hash = `#browse/${w.id}`;
  } catch (e) { showError(e); }
}

// Say it yourself: record your own take and compare it with the reference,
// as in the Pronounce tab (recorder.js, loaded when first opened).
function sayYourself(w) {
  const body = h("div.fold-body");
  const fold = h("details.fold", h("summary", "Record yourself and compare",
    w.recording_url ? h("span.muted", " · you have a recording") : null), body);
  let box = null;
  const stop = () => { if (box) box.stop(); };
  fold.addEventListener("toggle", async () => {
    if (!fold.open) { stop(); return; }
    if (box && box.isConnected) return;
    try { box = (await import("./recorder.js")).recordCompare(w); } catch (e) { return showError(e); }
    body.replaceChildren(box);
    addEventListener("hashchange", stop, { once: true });
  });
  return h("section.npanel.wide.say-yourself", h("h3", "Say it yourself"), fold);
}

function notesEditor(w) {
  const ta = h("textarea.input#word-notes", { rows: 2, "aria-label": "My notes", placeholder: "Your notes: a mnemonic, a sentence of your own, where you met this word…" });
  ta.value = w.notes || "";
  const status = h("span.save-status.muted", { "aria-live": "polite" });
  const flush = debounced(async () => {
    if (ta.value === (w.notes || "")) return;
    const value = ta.value;
    await api.patch(`/api/words/${w.id}/state`, { notes: value });
    w.notes = value;
    status.textContent = "Saved";
  }, 600);
  ta.addEventListener("input", () => { status.textContent = ""; flush(); });
  ta.addEventListener("blur", () => flush.now());
  ta.addEventListener("keydown", e => e.stopPropagation());
  return h("div.npanel.wide", h("h3", "My notes ", status), ta);
}

// ---------------------------------------------------------------- toasts & dialogs

/** A short message; action: [label, fn] adds a button (e.g. Undo) and keeps it up longer. */
export function toast(msg, { error = false, ms = 2600, action = null } = {}) {
  const t = h(`div.toast${error ? ".err" : ""}`, msg);
  if (action) {
    t.append(" ", h("button.toast-action", { type: "button", on: { click: () => {
      t.remove();
      Promise.resolve(action[1]()).catch(showError);
    } } }, action[0]));
  }
  document.getElementById("toasts").append(t);
  // A toast with an action stays while the pointer or focus is on it.
  let left = action ? Math.max(ms, 6000) : ms;
  let started = Date.now();
  let timer = setTimeout(() => t.remove(), left);
  if (action) {
    const pause = () => { clearTimeout(timer); left -= Date.now() - started; };
    const resume = () => { started = Date.now(); timer = setTimeout(() => t.remove(), Math.max(left, 2000)); };
    t.addEventListener("pointerenter", pause);
    t.addEventListener("pointerleave", resume);
    t.addEventListener("focusin", pause);
    t.addEventListener("focusout", resume);
  }
}

export function showError(e) { toast(e.message || String(e), { error: true, ms: 4500 }); }

/**
 * Modal form. fields: [{id, label, type, value, options, placeholder, required, maxlength}].
 * Resolves the values, or null when cancelled. With onSubmit(values), the
 * dialog stays open while it runs and shows its error inline (so nothing
 * typed is lost); it resolves onSubmit's result.
 */
export function formDialog({ title, fields = [], submit = "Save", body = null, onSubmit = null }) {
  const dlg = document.getElementById("dialog");
  return new Promise(resolve => {
    const inputs = {};
    const error = h("p.form-error", { role: "alert", hidden: true });
    const okBtn = submit ? h("button.btn.btn-primary", { type: "submit", value: "ok" }, submit) : null;
    let result;
    const form = h("form", { method: "dialog" },
      h("h2#dlg-title", title),
      body,
      fields.map(f => {
        let input;
        const attrs = { id: `dlg-${f.id}`, placeholder: f.placeholder || "", required: !!f.required };
        if (f.maxlength) attrs.maxlength = f.maxlength;
        if (f.type === "select") {
          input = h("select.input", { id: `dlg-${f.id}` }, f.options.map(([v, l]) => h("option", { value: v }, l)));
        } else if (f.type === "textarea") {
          input = h("textarea.input", { ...attrs, rows: 3 });
        } else {
          input = h("input.input", { ...attrs, type: f.type || "text" });
        }
        if (f.value !== undefined) input.value = f.value;
        inputs[f.id] = input;
        const field = h("div.field", h("label", { for: `dlg-${f.id}` }, f.label), input);
        if (f.showIf) field.dataset.showIf = JSON.stringify(f.showIf);
        return field;
      }),
      error,
      h("div.actions",
        h("button.btn", { type: "button", value: "cancel", on: { click: () => dlg.close("cancel") } }, submit ? "Cancel" : "Close"),
        okBtn),
    );
    // A field shown only for one choice of another (a new list's name).
    const conditional = [...form.querySelectorAll("[data-show-if]")];
    const sync = () => conditional.forEach(f => {
      const [other, value] = JSON.parse(f.dataset.showIf);
      f.hidden = inputs[other].value !== value;
    });
    conditional.forEach(f => inputs[JSON.parse(f.dataset.showIf)[0]].addEventListener("change", sync));
    sync();
    dlg.replaceChildren(form);
    dlg.setAttribute("aria-labelledby", "dlg-title");
    dlg.onclose = () => {
      if (dlg.returnValue !== "ok") return resolve(null);
      resolve(result);
    };
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const values = {};
      for (const [k, el] of Object.entries(inputs)) values[k] = el.value;
      if (!onSubmit) { result = values; return dlg.close("ok"); }
      okBtn.disabled = true;
      try {
        result = await onSubmit(values);
        dlg.close("ok");
      } catch (err) {
        error.textContent = err.message || String(err);
        error.hidden = false;
      } finally { okBtn.disabled = false; }
    });
    dlg.returnValue = "";
    dlg.showModal();
    const first = form.querySelector("input, select, textarea");
    if (first) first.focus();
  });
}

export function confirmDialog(title, message, action = "Delete") {
  return formDialog({ title, body: h("p", message), submit: action }).then(v => v !== null);
}

// ---------------------------------------------------------------- word levels

/** Word levels by how common a word is (build_dataset.word_level). */
export const LEVELS = [[1, "Most common", "believe, need, busy"], [2, "Common", "schedule, goodbye, fully"],
  [3, "Less common", "receipt, grasp, vicinity"], [4, "Uncommon", "avid, outburst, reaffirm"],
  [5, "Rare", "loquacity, symbiosis, mentee"]];
export const levelLabel = n => (LEVELS.find(([l]) => l === n) || [])[1] || "";
const chosenLevels = () => String(settings.word_levels || "1,2,3,4,5").split(",").map(Number);
/** "Levels 1–3", "Levels 1, 3", "All levels". */
export function levelsText(levels = chosenLevels()) {
  if (levels.length === 5) return "All levels";
  if (levels.length === 1) return `Level ${levels[0]} only`;
  const run = levels.every((l, i) => !i || l === levels[i - 1] + 1);
  return `Levels ${run ? `${levels[0]}–${levels[levels.length - 1]}` : levels.join(", ")}`;
}

/**
 * The word-level dropdown: tick the levels new words come from. Saved at
 * once (an app-wide setting); at least one stays ticked. onChange(levels)
 * runs after a save.
 */
export function levelPicker({ onChange } = {}) {
  const summary = h("summary.input.level-summary", { "aria-label": "Word levels to study" }, levelsText());
  const boxes = LEVELS.map(([n, label, eg]) => {
    const box = h("input", { type: "checkbox", value: n, checked: chosenLevels().includes(n) });
    return [box, h("label.level-option", box, h("span", h("b", `${n} · ${label}`), h("span.muted", eg)))];
  });
  const sync = () => {
    const on = boxes.filter(([b]) => b.checked);
    on.forEach(([b]) => { b.disabled = on.length === 1; });   // never none
    boxes.filter(([b]) => !b.checked).forEach(([b]) => { b.disabled = false; });
  };
  boxes.forEach(([box]) => box.addEventListener("change", async () => {
    const levels = boxes.filter(([b]) => b.checked).map(([b]) => Number(b.value));
    sync();
    try { await saveSettings({ word_levels: levels.join(",") }); } catch (e) { return showError(e); }
    summary.textContent = levelsText(levels);
    toast(`New words: ${levelsText(levels).toLowerCase()}`);
    try { sessionStorage.removeItem("lexi-review-session"); } catch (e) { /* unavailable */ }
    onChange && onChange(levels);
  }));
  sync();
  const menu = h("details.level-picker", summary,
    h("fieldset.level-menu", h("legend", "Study new words from"), boxes.map(([, l]) => l),
      h("p.muted.level-note", "Every word still opens from links and search.")));
  // Closes like a menu: Escape, or a click elsewhere.
  menu.addEventListener("keydown", e => { if (e.key === "Escape" && menu.open) { menu.open = false; summary.focus(); } });
  const close = e => {
    if (!menu.isConnected) return document.removeEventListener("click", close);   // its page was left
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  };
  document.addEventListener("click", close);
  return menu;
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
  saveFilter(tab, practiceFilter);   // the tab reads it back after this
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

/** "smooth", unless the system asks for less motion. */
export const scrollBehavior = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// Bring answer feedback into view, and again once its fonts have loaded: an
// italic face loaded on first use makes the text taller after the first scroll.
export function reveal(el) {
  el.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  document.fonts.ready.then(() => requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: scrollBehavior() })));
}

/** An answered option: disabled, and marked right or wrong by a sign and
 * words as well as color. */
export function markOption(button, right, chosen) {
  button.disabled = true;
  if (right) button.append(h("span.mark", { "aria-hidden": "true" }, "✓"), h("span.sr-only", " (correct answer)"));
  else if (chosen) button.append(h("span.mark", { "aria-hidden": "true" }, "✗"), h("span.sr-only", " (your answer)"));
  if (right) button.classList.add("right"); else if (chosen) button.classList.add("wrong");
}

export function fmtDuration(s) {
  s = Math.round(s);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
