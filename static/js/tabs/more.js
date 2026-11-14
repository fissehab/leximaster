// More (phone): lists, progress, settings, about, and the app version.

import { h, pageHead } from "../ui.js";
import { hubTiles } from "./practice.js";

export async function render(root) {
  const version = window.LEXI_VERSION;
  const waiting = window.LEXI_SW && window.LEXI_SW.waiting;
  root.append(pageHead("More", "Your lists, your progress, settings, and about LexiMaster."), hubTiles("more"),
    h("p.muted.version-note", version
      ? `Version ${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)} · ${waiting
        ? "an update installs on your next visit to Today" : "up to date"}`
      : "Running from your computer."));
}
