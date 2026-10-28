// Browse / Study: A–Z rail, instant search, sortable virtual list, full entry.

import { allWords, api } from "../api.js";
import { playWord } from "../audio.js";
import { refreshDueCount } from "../app.js";
import { LEVELS, domainLabel, domainOptions, formDialog, isEveryday, h, icon, renderEntry, scrollBehavior, setKnown, setStars, showError, toast } from "../ui.js";

const ROW_H = 54;
const state = { q: "", sort: "alpha", domain: "", stars: "", known: "", level: "", selectedId: null };
let words = [];
let shown = [];
let els = {};
let detail = null;     // full word currently displayed
let lists = [];
let live = () => true;

function norm(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
// Normalized once per word list, not on every keystroke.
const nw = w => w._nw || (w._nw = norm(w.word));
const nd = w => w._nd || (w._nd = norm(w.def || ""));

function applyFilters() {
  const q = norm(state.q.trim());
  let out = words;
  if (state.domain === "everyday") out = out.filter(isEveryday);
  else if (state.domain) out = out.filter(w => w.domains.includes(state.domain));
  if (state.stars !== "") out = out.filter(w => state.stars.split(",").map(Number).includes(w.stars));
  if (state.level) out = out.filter(w => w.level === Number(state.level));
  if (state.known === "known") out = out.filter(w => w.known);
  if (state.known === "unknown") out = out.filter(w => !w.known);
  if (q) {
    const prefix = [], inner = [], inDef = [];
    for (const w of out) {
      const n = nw(w);
      if (n.startsWith(q)) prefix.push(w);
      else if (n.includes(q)) inner.push(w);
      else if (q.length >= 3 && nd(w).includes(q)) inDef.push(w);
    }
    out = [...prefix, ...inner, ...inDef];
    if (state.sort === "alpha") { shown = out; return; } // keep relevance order
  }
  const byWord = (a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: "base" });
  const sorters = {
    alpha: byWord,
    freq: (a, b) => (a.freq_rank ?? 1e9) - (b.freq_rank ?? 1e9) || byWord(a, b),
    stars: (a, b) => b.stars - a.stars || byWord(a, b),
    stars_low: (a, b) => (a.stars || 9) - (b.stars || 9) || byWord(a, b),
    domain: (a, b) => (domainLabel(a.domains[0] || "~")).localeCompare(domainLabel(b.domains[0] || "~")) || byWord(a, b),
  };
  shown = [...out].sort(sorters[state.sort]);
}

function renderRows() {
  const list = els.vlist;
  const top = list.scrollTop;
  const height = list.clientHeight || 600;
  const start = Math.max(0, Math.floor(top / ROW_H) - 8);
  const end = Math.min(shown.length, Math.ceil((top + height) / ROW_H) + 8);
  els.inner.style.height = `${shown.length * ROW_H}px`;
  const frag = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const w = shown[i];
    const row = h(`div.row${w.id === state.selectedId ? ".sel" : ""}`, {
      style: { top: `${i * ROW_H}px` }, "data-id": w.id, "aria-current": w.id === state.selectedId ? "true" : null,
    },
      h("span.row-word", w.word),
      h("span.row-side",
        w.known ? h("span.known-dot", { title: "Known" }) : null,
        w.stars ? h("span", { style: { color: "var(--gilt)", fontSize: "12px" } }, "★".repeat(w.stars)) : null,
        w.core_pos ? h("span", { style: { fontSize: "11px", color: "var(--muted)" } }, abbrevPos(w.core_pos)) : null),
      h("span.row-def", w.def || "—"));
    frag.append(row);
  }
  els.inner.replaceChildren(frag);
  if (!shown.length && words.length) {
    els.inner.append(h("p.muted.no-match", "No words match. Try fewer letters, or clear the filters."));
  }
  els.meta.textContent = `${shown.length.toLocaleString()} of ${words.length.toLocaleString()} words`;
}

function abbrevPos(p) {
  return ({ noun: "n.", verb: "v.", adjective: "adj.", adverb: "adv.", preposition: "prep.", conjunction: "conj." })[p.toLowerCase()] || p;
}

function refreshList({ keepScroll = false } = {}) {
  applyFilters();
  if (!keepScroll) els.vlist.scrollTop = 0;
  renderRows();
  paintAz();
}

function paintAz() {
  const letters = new Set(shown.map(w => nw(w)[0]));
  els.az.querySelectorAll("button").forEach(b => (b.disabled = !letters.has(b.dataset.l)));
}

function jumpTo(letter) {
  if (state.sort !== "alpha" || state.q) {
    state.sort = "alpha"; state.q = ""; els.search.value = ""; els.sort.value = "alpha";
    applyFilters();
  }
  const i = shown.findIndex(w => nw(w)[0] >= letter);
  if (i >= 0) {
    els.vlist.scrollTop = i * ROW_H;
    renderRows();
    select(shown[i].id, { scroll: false });
  }
}

const narrow = () => matchMedia("(max-width: 900px)").matches;

/** Show a word. `reveal`: picked by the user, so on a narrow screen (list
 * above, entry below) bring the entry into view. */
async function select(id, { scroll = true, reveal = false } = {}) {
  if (!live()) return;   // Browse was left before this ran
  state.selectedId = id;
  detail = null;  // keyboard actions wait for the new entry
  history.replaceState(null, "", `#browse/${id}`);
  const i = shown.findIndex(w => w.id === id);
  if (scroll && i >= 0) {
    const top = i * ROW_H, list = els.vlist;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + ROW_H > list.scrollTop + list.clientHeight) list.scrollTop = top + ROW_H - list.clientHeight;
  }
  renderRows();
  let w;
  try { w = await api.get(`/api/words/${id}`); } catch (e) { return showError(e); }
  if (state.selectedId !== id || !live()) return;
  detail = w;
  w.list_actions = listActions(w);
  const back = h("button.btn.btn-quiet.back-to-list", { type: "button",
    on: { click: () => els.vlist.scrollIntoView({ block: "center", behavior: scrollBehavior() }) } }, "← List");
  els.detail.replaceChildren(back, renderEntry(w, { onChange: () => { syncCached(w); renderRows(); } }));
  els.detail.scrollTop = 0;
  if (reveal && narrow()) els.detail.scrollIntoView({ block: "start" });
}

function syncCached(w) {
  const c = words.find(x => x.id === w.id);
  if (c) { c.stars = w.stars; c.known = w.known; }
}

function listActions(w) {
  const btn = h("button.btn", { type: "button", title: "Add to one of your lists · L", "aria-keyshortcuts": "L" }, icon("plus"), "Add to list");
  const chips = h("span", { style: { display: "contents" } }, (w.lists || []).map(l => h("a.chip", { href: `#lists/${l.id}` }, l.name)));
  btn.addEventListener("click", () => addToList(w, chips).catch(showError));
  return h("span", { style: { display: "contents" } }, btn, chips);
}

async function addToList(w, chips) {
  if (!lists.length) lists = (await api.get("/api/lists")).lists;
  let last = "";
  try { last = localStorage.getItem("lexi-last-list") || ""; } catch (e) { /* unavailable */ }
  const start = lists.some(l => String(l.id) === last) ? last : lists[0] ? String(lists[0].id) : "new";
  const v = await formDialog({
    title: `Add “${w.word}” to a list`,
    fields: [
      { id: "list", label: "List", type: "select", options: [...lists.map(l => [String(l.id), l.name]), ["new", "New list…"]], value: start },
      { id: "name", label: "New list name", placeholder: "e.g. Words I confuse", maxlength: 60, showIf: ["list", "new"] },
      { id: "note", label: "Note (optional)", placeholder: "Why this word belongs here" },
    ],
    submit: "Add",
    onSubmit: async v => {
      let listId = v.list;
      if (listId === "new") {
        if (!v.name.trim()) throw new Error("Give the new list a name.");
        const created = await api.post("/api/lists", { name: v.name.trim() });
        lists.push({ ...created, count: 0 });
        listId = created.id;
      }
      const res = await api.post(`/api/lists/${listId}/words`, { word_id: w.id, note: v.note });
      return { id: listId, name: lists.find(l => String(l.id) === String(listId)).name, added: res.added !== false };
    },
  });
  if (!v) return;
  try { localStorage.setItem("lexi-last-list", String(v.id)); } catch (e) { /* unavailable */ }
  if (v.added) {
    w.lists = [...(w.lists || []), { id: v.id, name: v.name }];
    if (chips.isConnected) chips.append(h("a.chip", { href: `#lists/${v.id}` }, v.name));
  }
  toast(v.added ? `Added to “${v.name}”` : `Already in “${v.name}”`, { action: ["Open list", () => { location.hash = `#lists/${v.id}`; }] });
}

function move(delta) {
  if (!shown.length) return;
  let i = shown.findIndex(w => w.id === state.selectedId);
  i = i < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, i + delta));
  select(shown[i].id);
}

export async function render(root, { param, view, live: isLive }) {
  live = isLive || (() => true);
  view.classList.add("flush");
  detail = null;
  // The word list is kept up to date as you rate and mark words, so it's
  // fetched once, not on every visit.
  [words, { lists }] = await Promise.all([allWords(), api.get("/api/lists")]);
  const domains = [...new Set(words.flatMap(w => w.domains))].sort((a, b) => domainLabel(a).localeCompare(domainLabel(b)));

  els.search = h("input.input#browse-search", { type: "search", placeholder: "Search words or meanings  ( / )", autocomplete: "off", spellcheck: false });
  els.search.value = state.q;
  let t;
  els.search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = els.search.value; refreshList(); }, 60); });
  els.search.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); els.search.blur(); move(state.selectedId ? 1 : 0); }
    if (e.key === "Enter" && shown[0]) { e.preventDefault(); els.search.blur(); select(shown[0].id, { reveal: true }); }
    if (e.key === "Escape") els.search.blur();
  });

  els.sort = h("select.input#browse-sort", { "aria-label": "Sort" },
    [["alpha", "A–Z"], ["freq", "Most frequent first"], ["stars", "Most stars"], ["stars_low", "Fewest stars"], ["domain", "Domain"]]
      .map(([v, l]) => h("option", { value: v }, l)));
  els.sort.value = state.sort;
  els.sort.addEventListener("change", () => { state.sort = els.sort.value; refreshList(); });
  const dom = h("select.input#browse-domain", { "aria-label": "Domain" }, h("option", { value: "" }, "All domains"),
    domainOptions(domains));
  dom.value = state.domain;
  dom.addEventListener("change", () => { state.domain = dom.value; refreshList(); });
  const stars = h("select.input#browse-stars", { "aria-label": "Rating" },
    [["", "Any rating"], ["0", "Unrated"], ["1", "★1"], ["2", "★2"], ["3", "★3"], ["4", "★4"], ["5", "★5"]].map(([v, l]) => h("option", { value: v }, l)));
  stars.value = state.stars;
  stars.addEventListener("change", () => { state.stars = stars.value; refreshList(); });
  const known = h("select.input#browse-known", { "aria-label": "Known" },
    [["", "Known & unknown"], ["unknown", "Not yet known"], ["known", "Known"]].map(([v, l]) => h("option", { value: v }, l)));
  known.value = state.known;
  known.addEventListener("change", () => { state.known = known.value; refreshList(); });

  // Browse is for looking up: every level by default, whatever you study.
  const level = h("select.input#browse-level", { "aria-label": "Word level" }, h("option", { value: "" }, "All levels"),
    LEVELS.map(([n, label]) => h("option", { value: n }, `Level ${n} · ${label}`)));
  level.value = state.level;
  level.addEventListener("change", () => { state.level = level.value; refreshList(); });

  els.az = h("nav.az", { "aria-label": "Jump to letter" },
    "abcdefghijklmnopqrstuvwxyz".split("").map(l => h("button", { type: "button", "data-l": l, on: { click: () => jumpTo(l) } }, l.toUpperCase())));
  els.inner = h("div.vlist-inner");
  els.vlist = h("div.vlist", { "aria-label": "Words (use the arrow keys to move through them)", tabindex: "0" }, els.inner);
  let frame = 0;
  els.vlist.addEventListener("scroll", () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderRows(); }); }, { passive: true });
  els.vlist.addEventListener("click", e => { const r = e.target.closest(".row"); if (r) select(Number(r.dataset.id), { scroll: false, reveal: true }); });
  els.meta = h("div.list-meta.tnum");
  els.detail = h("div.detail-col");

  // The A–Z strip and word list collapse, so an entry can use the full width.
  const browse = h("div.browse");
  const hideBtn = h("button.icon-btn.list-toggle", { type: "button", title: "Hide the word list",
    "aria-label": "Hide the word list", "aria-controls": "browse-list" }, icon("sidebar"));
  const showBtn = h("button.btn.show-list", { type: "button", "aria-controls": "browse-list" },
    icon("sidebar"), "Show word list");
  const setList = collapsed => {
    browse.classList.toggle("list-collapsed", collapsed);
    hideBtn.setAttribute("aria-expanded", String(!collapsed));
    showBtn.setAttribute("aria-expanded", String(!collapsed));
    try { localStorage.setItem("lexi-browse-list", collapsed ? "collapsed" : ""); } catch (e) { /* storage unavailable */ }
  };
  hideBtn.addEventListener("click", () => { setList(true); showBtn.focus(); });
  showBtn.addEventListener("click", () => { setList(false); renderRows(); els.search.focus(); });

  browse.append(
    els.az,
    h("div.list-col#browse-list",
      h("div.search-row", h("div.search", icon("search"), els.search), hideBtn),
      // On a phone the filters fold away, so the results come first.
      h("details.filters-fold", { open: !narrow() }, h("summary", "Sort & filter"), h("div.list-filters", els.sort, dom, level, stars, known)),
      els.meta,
      els.vlist),
    h("div.detail-wrap", showBtn, els.detail));
  root.append(h("h1.sr-only", "Browse"), browse);   // the page heading, for screen readers (the entry is h2)
  try { setList(localStorage.getItem("lexi-browse-list") === "collapsed"); } catch (e) { setList(false); }

  if (!words.length) {
    els.detail.append(h("div.panel.empty", h("h2", "No words yet"), h("p", "Run build_dataset.py to build the lexicon, then reload this page.")));
  }
  refreshList({ keepScroll: true });
  // On a phone (list above, entry below) nothing is opened until you pick a word.
  const want = Number(param) || state.selectedId || (!narrow() && shown[0] && shown[0].id);
  if (want) {
    const i = shown.findIndex(w => w.id === want);
    if (i >= 0) els.vlist.scrollTop = Math.max(0, i * ROW_H - 120);
    // Opened from a link (a related word, a search result): on a phone, show it.
    select(want, { reveal: !!Number(param) });
  }
  const onResize = () => renderRows();
  addEventListener("resize", onResize);
  return () => removeEventListener("resize", onResize);
}

export async function onKey(e) {
  if (e.key === "/") { e.preventDefault(); els.search.focus(); els.search.select(); return; }
  if (!detail || detail.id !== state.selectedId) return;
  if (e.key === " ") { e.preventDefault(); playWord(detail, els.detail.querySelector(".play")); }
  else if (e.key === "l" || e.key === "L") { e.preventDefault(); els.detail.querySelector(".entry-actions .btn:not(.known-toggle)")?.click(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
  else if (/^[1-5]$/.test(e.key)) {
    const v = Number(e.key) === detail.stars ? 0 : Number(e.key);
    try { await setStars(detail, v); } catch (err) { return showError(err); }
    syncCached(detail);
    els.detail.querySelector(".stars").repaint();
    renderRows();
    refreshDueCount();
  } else if (e.key === "m" || e.key === "M") {
    try { await setKnown(detail, !detail.known); } catch (err) { return showError(err); }
    syncCached(detail);
    const b = els.detail.querySelector(".known-toggle");
    b.setAttribute("aria-pressed", String(detail.known));
    b.lastChild.textContent = detail.known ? "Known" : "Know it";
    renderRows();
  }
}
