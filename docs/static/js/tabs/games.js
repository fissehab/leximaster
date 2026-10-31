// Games (phone): the timed games as large links.

import { pageHead } from "../ui.js";
import { hubTiles } from "./practice.js";

export async function render(root) {
  root.append(pageHead("Games", "Play against the clock. A word you miss comes back in today's review."), hubTiles("games"));
}
