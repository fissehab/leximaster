// Practice: every way to study, in three groups (Sound first: hearing and
// saying words is what LexiMaster is for; then Meaning; then Games). Each
// activity has its own "Words from" menu and remembers it. On a wide screen
// the sidebar lists the same links.

import { TABS } from "../app.js";
import { h, icon, pageHead } from "../ui.js";

const GROUPS = [
  ["Sound", "Hear and say words"],
  ["Meaning", "Learn what words mean"],
  ["Games", "Play against the clock"],
];

export function hubTiles(parent) {
  const tile = t => h("a.hub-tile", { href: `#${t.id}` }, icon(t.icon), h("strong", t.label), h("span", t.note));
  return h("div.hub-groups", GROUPS.map(([group, note]) => {
    const tabs = TABS.filter(t => t.under === parent && t.group === group);
    const id = `hub-${group.toLowerCase()}`;
    return h("section.hub-group", { "aria-labelledby": id },
      h("h2.hub-heading", { id }, group, h("span.muted", ` · ${note}`)),
      h("nav.hub-tiles", { "aria-label": group }, tabs.map(tile)));
  }));
}

export async function render(root) {
  root.append(
    pageHead("Practice", "Choose an activity, then the words to use: any list, topic or level. " +
      "Every answer helps decide when a word comes back to refresh."),
    hubTiles("practice"));
}
