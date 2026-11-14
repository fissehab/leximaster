// Practice (phone): the practice tabs as large links. Games and More use
// the same tiles.

import { TABS } from "../app.js";
import { h, icon, pageHead } from "../ui.js";

export function hubTiles(group) {
  return h("nav.hub-tiles", { "aria-label": TABS.find(t => t.id === group).label }, TABS.filter(t => t.under === group).map(t =>
    h("a.hub-tile", { href: `#${t.id}` }, icon(t.icon), h("strong", t.label), h("span", t.note))));
}

export async function render(root) {
  root.append(pageHead("Practice", "Pick one way to learn."), hubTiles("practice"));
}
