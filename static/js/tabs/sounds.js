// Sounds: a card for each sound learners of English find hard: how the mouth
// makes it, words to try, and a listening game. #sounds/<card> opens on one.

import { CARDS, UI } from "../say-strings.js";
import { soundCard, wordsBySpelling } from "../say.js";
import { h, pageHead } from "../ui.js";

export async function render(root, { param } = {}) {
  const words = await wordsBySpelling();
  const group = (title, cards) => [h("h2.sound-group-title", title), h("div.sound-cards", cards.map(c => soundCard(c, words)))];
  root.append(pageHead(UI.sounds, UI.soundsSub), h("p.muted", UI.ends),
    ...group(UI.consonants, CARDS.filter(c => !c.vowels)),
    ...group(UI.vowels, CARDS.filter(c => c.vowels)));
  const card = param && root.querySelector(`#sound-${CSS.escape(param)}`);
  if (card) requestAnimationFrame(() => { card.scrollIntoView({ block: "start" }); card.focus({ preventScroll: true }); });
}
