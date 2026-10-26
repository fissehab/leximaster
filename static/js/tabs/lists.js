// My lists: named lists, words with personal notes, and words of your own.

import { allWords, api, invalidateWords } from "../api.js";
import { confirmDialog, emptyState, formDialog, h, icon, pageHead, playButton, showError, toast } from "../ui.js";

let lists = [];
let activeId = null;
let els = {};

async function loadLists() {
  lists = (await api.get("/api/lists")).lists;
  els.index.replaceChildren(
    ...lists.map(l => h("button", { type: "button", "aria-current": String(l.id === activeId), on: { click: () => open(l.id) } },
      h("span", l.name), h("span.n", l.count))),
    ...(lists.length ? [] : [h("p.muted", { style: { padding: "10px" } }, "No lists yet.")]));
}

async function createList() {
  const l = await formDialog({ title: "New list", submit: "Create",
    fields: [{ id: "name", label: "Name", placeholder: "e.g. Theology, Statistics, Words I confuse", required: true, maxlength: 60 }],
    onSubmit: v => api.post("/api/lists", { name: v.name.trim() }) });
  if (!l) return;
  await loadLists().catch(showError);
  open(l.id);
}

async function open(id) {
  activeId = id;
  history.replaceState(null, "", `#lists/${id}`);
  await loadLists();
  let data;
  try { data = await api.get(`/api/lists/${id}`); } catch (e) { return showError(e); }
  const rows = data.words.map(w => {
    const note = h("input.input", { type: "text", value: w.list_note || "", placeholder: "Add a note", "aria-label": `Note for ${w.word}` });
    let t;
    note.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => api.patch(`/api/lists/${id}/words/${w.id}`, { note: note.value }).catch(showError), 500); });
    return h("div.lw-row",
      h("div", { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 } },
        playButton(w, { small: true }),
        h("button.lw-word", { type: "button", on: { click: () => (location.hash = `#browse/${w.id}`) } }, w.word),
        w.phonetic ? h("span.ipa", { style: { fontSize: "14px" } }, w.phonetic) : null),
      h("div.toolbar",
        w.is_custom ? h("button.btn.btn-quiet", { type: "button", title: "Delete this word you added", on: { click: async () => {
          if (!(await confirmDialog(`Delete “${w.word}”?`, "This removes the word you added, its notes, ratings and review history."))) return;
          try { await api.del(`/api/words/${w.id}`); invalidateWords(); open(id); } catch (e) { showError(e); }
        } } }, "Delete word") : null,
        h("button.btn.btn-quiet", { type: "button", title: "Remove from list", "aria-label": `Remove ${w.word} from this list`, on: { click: async () => {
          try { await api.del(`/api/lists/${id}/words/${w.id}`); open(id); } catch (e) { showError(e); }
        } } }, icon("trash"))),
      h("p.lw-def", w.def),
      h("div.lw-note", note));
  });
  els.detail.replaceChildren(
    h("div.page-head", { style: { marginBottom: "14px" } },
      h("div", h("h2", { style: { font: "600 22px/1.2 var(--font-word)" } }, data.name), h("p.sub", `${data.words.length} word${data.words.length === 1 ? "" : "s"}`)),
      h("div.toolbar",
        h("button.btn", { type: "button", on: { click: () => (practice(id)) } }, "Practice with flashcards"),
        h("button.btn", { type: "button", on: { click: () => rename(data) } }, "Rename"),
        h("button.btn.btn-quiet", { type: "button", on: { click: () => remove(data) } }, icon("trash"), "Delete list"))),
    adder(id),
    data.words.length ? h("div.panel", { style: { marginTop: "14px" } }, rows)
      : h("div.panel.empty", { style: { marginTop: "14px" } }, h("p", "This list is empty. Search above to add words from the lexicon, or add a word of your own.")));
}

function practice(id) {
  import("../state.js").then(({ loadFilter, saveFilter }) => {
    saveFilter("flashcards", { ...loadFilter("flashcards"), list_id: String(id) });
    location.hash = "#flashcards";
  });
}

async function rename(data) {
  const ok = await formDialog({ title: "Rename list",
    fields: [{ id: "name", label: "Name", value: data.name, required: true, maxlength: 60 }],
    onSubmit: v => api.patch(`/api/lists/${data.id}`, { name: v.name.trim() }) });
  if (ok) open(data.id);
}

async function remove(data) {
  if (!(await confirmDialog(`Delete “${data.name}”?`, "The list and its notes are removed. The words stay in the lexicon."))) return;
  try { await api.del(`/api/lists/${data.id}`); } catch (e) { return showError(e); }
  activeId = null;
  history.replaceState(null, "", "#lists");
  await loadLists();
  els.detail.replaceChildren(emptyState("List deleted", "Choose another list or create a new one."));
}

function adder(listId) {
  const input = h("input.input#list-add", { type: "search", "aria-label": "Add a word to this list", placeholder: "Add a word: start typing…", autocomplete: "off" });
  const menu = h("div.typeahead-menu", { hidden: true });
  let matches = [], sel = 0;
  const paint = () => {
    menu.replaceChildren(...matches.map((w, k) => h(`button${k === sel ? ".on" : ""}`, { type: "button", on: { mousedown: e => { e.preventDefault(); add(w); } } },
      h("b", w.word), h("span", w.def.slice(0, 70)))));
    menu.hidden = !matches.length;
  };
  const add = async w => {
    try {
      const res = await api.post(`/api/lists/${listId}/words`, { word_id: w.id });
      toast(res.added === false ? `“${w.word}” is already in this list` : `Added “${w.word}”`);
      input.value = ""; matches = []; paint();
      await open(listId);
      const box = document.querySelector(".typeahead input");
      if (box) box.focus();   // ready for the next word
    } catch (e) { showError(e); }
  };
  input.addEventListener("input", async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { matches = []; return paint(); }
    const words = await allWords();
    matches = words.filter(w => w.word.toLowerCase().startsWith(q)).slice(0, 8);
    if (matches.length < 8) matches.push(...words.filter(w => !w.word.toLowerCase().startsWith(q) && w.word.toLowerCase().includes(q)).slice(0, 8 - matches.length));
    sel = 0; paint();
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, matches.length - 1); paint(); }
    if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === "Enter" && matches[sel]) { e.preventDefault(); add(matches[sel]); }
    if (e.key === "Escape") { matches = []; paint(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { menu.hidden = true; }, 150));
  return h("div.setup-row",
    h("div.typeahead", { style: { flex: "1", minWidth: "220px" } }, input, menu),
    h("button.btn", { type: "button", on: { click: () => addOwnWord(listId) } }, icon("plus"), "Add my own word"));
}

async function addOwnWord(listId) {
  const v = await formDialog({
    title: "Add your own word",
    fields: [
      { id: "word", label: "Word or phrase", required: true, maxlength: 80 },
      { id: "pos", label: "Part of speech", type: "select", options: [["noun", "noun"], ["verb", "verb"], ["adjective", "adjective"], ["adverb", "adverb"], ["phrase", "phrase"]] },
      { id: "definition", label: "Definition", type: "textarea", required: true },
      { id: "example", label: "Example sentence (optional)" },
      { id: "phonetic", label: "IPA (optional)", placeholder: "/ˈwɜːd/" },
      { id: "notes", label: "Personal note (optional)", type: "textarea" },
    ],
    submit: "Add word",
    onSubmit: async v => {
      if (!v.word.trim() || !v.definition.trim()) throw new Error("A word and a definition are required.");
      await api.post("/api/words", { ...v, list_id: listId });
      return v;
    },
  });
  if (!v) return;
  invalidateWords();
  toast(`Added “${v.word.trim()}” to your words`);
  open(listId);
}

export async function render(root, { param }) {
  els.index = h("nav.panel.list-index", { "aria-label": "Your lists" });
  els.detail = h("div");
  root.append(
    pageHead("My lists", "Group words your way, keep notes on each, and add words of your own.",
      h("button.btn.btn-primary", { type: "button", on: { click: createList } }, icon("plus"), "New list")),
    h("div.lists-layout", els.index, els.detail));
  await loadLists();
  const want = Number(param) || (lists[0] && lists[0].id);
  if (want) await open(want);
  else els.detail.replaceChildren(emptyState("No lists yet",
    "Create lists such as “Theology”, “Statistics” or “Words I confuse”, then add words from Browse or here.",
    h("button.btn.btn-primary", { type: "button", on: { click: createList } }, "Create your first list")));
}
