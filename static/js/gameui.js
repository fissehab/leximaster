// The top-scores board the games show (Word Shooter, Word Rush, Type It):
// the 10 best scores of one board on this device, a name for a new score,
// and a way to clear the board. The scores themselves live in games.js.

import { addScore, clearScores, cleanName, playerName, renameScore, setPlayerName, topScores } from "./games.js";
import { confirmDialog, h } from "./ui.js";

const num = n => n.toLocaleString("en-US");
const day = at => {
  const d = new Date(`${at}T12:00:00`);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** The board as a list (hidden while empty); the row with `mine` (an entry
 * id) stands out. `el.redraw()` shows it again after a change. */
export function scoreBoard(board, label, { mine = null, limit = 10 } = {}) {
  const el = h("section.game-board", { "aria-label": `Top scores on this device: ${label}` });
  el.redraw = () => {
    const rows = topScores(board).slice(0, limit);
    el.hidden = !rows.length;
    if (!rows.length) return el.replaceChildren();
    el.replaceChildren(
      h("div.game-board-head", h("p.label", "Top scores on this device"), h("span.muted", label)),
      h("ol.game-board-list", rows.map((e, i) => h(`li${e.id === mine ? ".mine" : ""}`,
        h("span.place.tnum", `${i + 1}`), h("span.who", e.name || "Me"), h("span.pts.tnum", num(e.score)),
        h("span.when.muted", day(e.at))))),
      h("button.btn.btn-quiet.game-board-clear", { type: "button", on: { click: async () => {
        if (!(await confirmDialog("Clear these top scores?", `This removes the ${label} scores on this device. Your words and progress stay.`, "Clear"))) return;
        clearScores(board);
        el.redraw();
      } } }, "Clear scores"));
  };
  el.redraw();
  return el;
}

/** At the end of a game: add the score, say its place, let the player put
 * a name on it, and show the board. */
export function scoreResult(board, label, score) {
  const { place, entry } = addScore(board, score);
  const boardEl = scoreBoard(board, label, { mine: entry && entry.id });
  if (!place) return { place, el: boardEl };
  const input = h("input.input#game-name", { type: "text", maxlength: "20", autocomplete: "nickname", placeholder: "Your name" });
  input.value = playerName() === "Me" ? "" : playerName();
  const saved = h("span.muted", { role: "status" });
  const form = h("form.game-name", { on: { submit: e => {
    e.preventDefault();
    const name = cleanName(input.value) || "Me";
    setPlayerName(name);
    renameScore(board, entry.id, name);
    boardEl.redraw();
    saved.textContent = "Saved.";
  } } }, h("label", { for: "game-name" }, "Name for this score"), input, h("button.btn", { type: "submit" }, "Save"), saved);
  return {
    place,
    el: h("div.game-place", h("p.shoot-best", place === 1 ? "Top score on this device!" : `Number ${place} on this device`),
      form, boardEl),
  };
}
