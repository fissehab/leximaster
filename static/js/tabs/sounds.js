// Hard sounds: the listening game first (Listen and choose: hear a word, pick it
// from two that differ in one sound), then a card for each sound learners of
// English find hard: how the mouth makes it, words to try, and that sound's
// game. #sounds/<card> opens on one.

import { CARDS, UI } from "../say-strings.js";
import { CONTRASTS, drill, pairsOf, soundCard, wordsBySpelling } from "../say.js";
import { h, pageHead } from "../ui.js";

const TOP_ROUNDS = 10;
const PICK_KEY = "lexi-sounds-pick";
const stored = () => { try { return localStorage.getItem(PICK_KEY) || ""; } catch (e) { return ""; } };

export async function render(root, { param } = {}) {
  const words = await wordsBySpelling();
  const group = (title, cards) => [h("h2.sound-group-title", title), h("div.sound-cards", cards.map(c => soundCard(c, words)))];
  root.append(pageHead(UI.sounds, UI.soundsLead), game(words),
    h("div.page-head.sounds-head", h("div", h("h2", UI.tutorial), h("p.sub", UI.soundsSub))), h("p.muted", UI.ends),
    ...group(UI.consonants, CARDS.filter(c => !c.vowels)),
    ...group(UI.vowels, CARDS.filter(c => c.vowels)));
  const card = param && root.querySelector(`#sound-${CSS.escape(param)}`);
  if (card) requestAnimationFrame(() => { card.scrollIntoView({ block: "start" }); card.focus({ preventScroll: true }); });
}

/** The game at the top: all sounds mixed, or one pair of sounds. It waits
 * for Start, since a browser plays sound only after a tap. */
function game(words) {
  const playable = c => pairsOf(c).filter(([a, b]) => words.get(a) && words.get(b)).length;
  const total = CONTRASTS.reduce((n, c) => n + playable(c), 0);
  let pick = CONTRASTS.includes(stored()) ? stored() : "";
  const select = h("select.input#sound-game-pick", { on: { change: e => {
    pick = e.target.value;
    try { localStorage.setItem(PICK_KEY, pick); } catch (err) { /* unavailable */ }
    if (started) play();
  } } },
    h("option", { value: "" }, UI.gameAll),
    CONTRASTS.map(c => {
      const [a, b] = pairsOf(c)[0];
      return h("option", { value: c }, `${UI.contrasts[c] || c}: ${a} / ${b} (${playable(c)})`);
    }));
  select.value = pick;
  const stage = h("div.sound-game-stage");
  let started = false;
  const play = () => {
    started = true;
    const d = drill(pick ? [pick] : CONTRASTS, words, { rounds: TOP_ROUNDS });
    stage.replaceChildren(d);
    d.querySelector("button.pick")?.focus({ preventScroll: true });
  };
  stage.append(h("button.btn.btn-primary.btn-lg", { type: "button", on: { click: play } }, UI.gameStart));
  return h("section.panel.sound-game", { "aria-labelledby": "sound-game-title" },
    h("h2#sound-game-title", UI.game),
    h("p", UI.gameSub),
    h("div.sound-game-bar", h("label", { for: "sound-game-pick" }, UI.gamePick), select),
    h("p.muted", UI.gameCount(total, TOP_ROUNDS)),
    stage);
}
