// Practice (phone): the practice tabs as large links.

import { TABS } from "../app.js";
import { h, icon, pageHead } from "../ui.js";

export function hubTiles(group) {
  return h("nav.hub-tiles", TABS.filter(t => t.under === group).map(t =>
    h("a.hub-tile", { href: `#${t.id}` }, icon(t.icon), h("strong", t.label), h("span", t.note))));
}

export async function render(root) {
  root.append(pageHead("Practice", "Pick a way to practice. Each one remembers its own settings."), hubTiles("practice"));
}
