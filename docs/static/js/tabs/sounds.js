// Sounds: the listening game first, then a card for each sound learners of
// English find hard: how the mouth makes it, words to try, and that sound's
// game. #sounds/<card> opens on one.

import { CARDS, PAIRS, UI } from "../say-strings.js";
import { DRILL_ROUNDS, soundCard, wordsBySpelling } from "../say.js";
import { h } from "../ui.js";

export async function render(root, { param } = {}) {
  const words = await wordsBySpelling();
  const group = (title, cards) => [h("h2.sound-group-title", title), h("div.sound-cards", cards.map(c => soundCard(c, words)))];
  root.append(gameIntro(root),
    h("div.page-head.sounds-head", h("div", h("h2", UI.sounds), h("p.sub", UI.soundsSub))), h("p.muted", UI.ends),
    ...group(UI.consonants, CARDS.filter(c => !c.vowels)),
    ...group(UI.vowels, CARDS.filter(c => c.vowels)));
  const card = param && root.querySelector(`#sound-${CSS.escape(param)}`);
  if (card) requestAnimationFrame(() => { card.scrollIntoView({ block: "start" }); card.focus({ preventScroll: true }); });
}

/** What the listening game is, with a way into each card's game: it opens
 * under the card, and the page scrolls to it. Cards that share a game (r
 * and l) get one button. */
function gameIntro(root) {
  const pairs = Object.values(PAIRS).reduce((n, ps) => n + ps.length, 0);
  const open = card => {
    const el = root.querySelector(`#sound-${CSS.escape(card.id)}`);
    if (!el) return;
    if (!el.querySelector(".drill")) [...el.querySelectorAll(".say-actions button")].find(b => b.textContent === UI.listen)?.click();
    const drill = el.querySelector(".drill") || el;
    drill.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    drill.querySelector("button.pick")?.focus({ preventScroll: true });
  };
  return h("section.panel.sound-game", { "aria-labelledby": "sound-game-title" },
    h("h1#sound-game-title", UI.game),
    h("p", UI.gameWhy),
    h("p", UI.gameHow(pairs, DRILL_ROUNDS)),
    h("p.muted", UI.gamePick),
    h("div.sound-game-pairs", CARDS.filter(c => (c.drill || []).some(d => PAIRS[d]))
      .filter((c, i, all) => all.findIndex(x => x.drill.join() === c.drill.join()) === i).map(c => {
      const [a, b] = PAIRS[c.drill.find(d => PAIRS[d])][0];
      return h("button.word-play", { type: "button", "aria-label": UI.gameOpen(a, b), on: { click: () => open(c) } }, `${a} / ${b}`);
    })));
}
