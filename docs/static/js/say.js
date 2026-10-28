// "How to say it": the open panel on a word page, the Sounds page's cards,
// the listening game and the MRI clip. Loaded only when first needed (the
// row on a word page is built by ui.js from phonemes.js alone).
//
// A word's sounds come from its IPA. "Watch the word" plays the recording at
// half speed with the drawing moving along: where each sound is in the
// recording is read from the recording itself (align.js), and the mouth moves
// into each sound just before it is heard, as a speaker's does. "Slow motion"
// walks the drawing through the sounds slowly, without sound.

import { allWords } from "./api.js";
import { alignTokens, weight } from "./align.js";
import { playbackRunning, playbackSpeed, playbackTime, playWord, speedButton, stopAudio } from "./audio.js";
import { DIPHTHONGS, mouthDiagram } from "./mouth.js";
import { CLIPS } from "./mri.gen.js";
import { decodeAudio } from "./recorder.js";
import { hardestIndex, isVowel, keyWord, label, PRIORITY, tokenize } from "./phonemes.js";
import { CARDS, MRI, MRI_TEXT, PAIRS, UI } from "./say-strings.js";
import { h } from "./ui.js";

const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';

// The tip for each sound with one, and the Sounds card it belongs to.
const TIPS = {};
for (const c of CARDS) {
  for (const p of c.parts || [c]) {
    for (const sym of [p.sym, ...(c.also || [])]) TIPS[sym] = { short: p.short, full: p.full, card: c.id, voice: c.voice };
  }
}
const titleOf = sym => UI.as(label(sym), keyWord(sym));

/** The walk through a word: [{ sym, ms, index }], ending at rest. 600 ms a
 * part at 1× (less for a long word, so it stays near 6 s), longer when the
 * playback speed is slower. */
export function walkSteps(tokens) {
  const steps = positions(tokens).map((p, index) => ({ ...p, index, w: weight(tokens[index]) }));
  steps.push({ sym: "rest", index: -1, w: .8 });
  const total = steps.reduce((a, s) => a + s.w, 0);
  const base = (total * 600 > 6000 ? Math.max(400, 6000 / total) : 600) / playbackSpeed();
  return steps.map(s => ({ sym: s.sym, index: s.index, ms: s.w * base }));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
// The recording is slowed to this for "Watch the word" (pitch kept).
const TOGETHER_RATE = .5;
/** Each sound's place in the recording (align.js): [{ sym, index, t0, t1 }]. */
async function syncSteps(tokens, url) {
  let times = null;
  try {
    const audio = await decodeAudio(url);
    const found = alignTokens(tokens, audio.getChannelData(0), audio.sampleRate);
    times = found && found.times;
  } catch (e) { /* can't be decoded: shared out below */ }
  if (!times) {
    const ws = tokens.map(weight), total = ws.reduce((a, x) => a + x, 0);
    let t = .15;
    times = ws.map(x => { const t0 = t; t += .6 * x / total; return [t0, t]; });
  }
  const pos = positions(tokens);
  return tokens.map((tok, index) => ({ ...pos[index], index, t0: times[index][0], t1: times[index][1] }));
}
/** Where the recording is, in seconds: its own clock, carried on between
 * the browser's updates of it (some update it only a few times a second). */
function recordingClock(rate) {
  let last = -1, at = 0, started = false;
  return () => {
    // Until this recording plays, the player may still hold the last one's time.
    if (!started && !(started = playbackRunning())) return -1;
    const v = playbackTime(), now = performance.now();
    if (v !== last) { last = v; at = now; return v; }
    return playbackRunning() ? v + Math.min(.12, (now - at) / 1000 * rate) : v;
  };
}
/** Where the mouth is for each token: h takes the next sound's position
 * (without voice), and the gap between two words holds the last one. */
function positions(tokens) {
  const last = sym => DIPHTHONGS[sym] ? DIPHTHONGS[sym][1] : sym;
  const first = sym => DIPHTHONGS[sym] ? DIPHTHONGS[sym][0] : sym;
  return tokens.map((t, k) => {
    if (t.sym === "h") {
      const next = tokens.slice(k + 1).find(x => !x.gap && x.sym !== "h");
      return { sym: next ? first(next.sym) : "ə", h: true };
    }
    if (t.gap) {
      const prev = tokens.slice(0, k).reverse().find(x => !x.gap);
      return { sym: prev ? last(prev.sym) : "rest" };
    }
    return { sym: t.sym };
  });
}

function figure(sym) {
  const svg = mouthDiagram({ label: describe(sym) });
  const badge = h("p.voice-badge");
  const fig = h("div.say-fig", svg, badge);
  fig.svg = svg;
  // The label and Voice ON/OFF follow the sound.
  fig.set = (s, opts) => {
    svg.setAttribute("aria-label", describe(s));
    const voiced = TIPS[s] && TIPS[s].voice !== undefined ? TIPS[s].voice : null;
    badge.textContent = voiced === null ? "" : voiced ? UI.voiceOn : UI.voiceOff;
    badge.classList.toggle("on", !!voiced);
    return svg.show(s, opts);
  };
  fig.set(sym);
  return fig;
}
function describe(sym) {
  const t = TIPS[sym];
  return `${titleOf(sym)}${t ? ": " + t.short : ""}`;
}

/** The word page panel, built into `body` (the open <details>). */
export function fillPanel(body, w, tokens = tokenize(w.phonetic)) {
  if (!tokens) return;
  let selected = hardestIndex(tokens);
  const status = h("p.say-status", { "aria-live": "polite" });
  const fig = figure(tokens[selected].sym);
  const title = h("p.say-title");
  const tip = h("p.say-tip");
  const more = h("a.say-more");
  const mriSlot = h("div");
  const mriBtn = h("button.btn.btn-quiet", { type: "button" });
  const buttons = tokens.map((t, k) => t.gap ? h("span.say-snd.gap", { "aria-hidden": "true" }) :
    h(`button.say-snd${PRIORITY.has(t.sym) ? ".dot" : ""}`, {
      type: "button", "aria-pressed": "false", "aria-label": titleOf(t.sym),
      on: { click: () => { stopWatch(); select(k, true); } },
    }, label(t.sym), h("small", t.ipa)));
  const select = (k, glide) => {
    selected = k;
    const sym = tokens[k].sym;
    buttons.forEach((b, i) => b.setAttribute && b.setAttribute("aria-pressed", String(i === k)));
    title.replaceChildren(titleOf(sym), h("span.ipa", tokens[k].ipa));
    const t = TIPS[sym];
    tip.textContent = t ? t.short : "";
    tip.hidden = !t;
    more.hidden = !t;
    if (t) { more.textContent = UI.more(label(sym)); more.href = `#sounds/${t.card}`; }
    mriSlot.replaceChildren();
    mriBtn.hidden = !MRI[sym] || !CLIPS[MRI[sym].file];
    mriBtn.textContent = UI.mri;
    fig.set(sym, { glide: glide ? 400 : 0 });
  };
  mriBtn.addEventListener("click", () => {
    if (mriSlot.firstChild) { mriSlot.replaceChildren(); mriBtn.textContent = UI.mri; return; }
    mriSlot.append(mriViewer(tokens[selected].sym));
    mriBtn.textContent = UI.mriHide;
  });

  // Watch the word (the recording at half speed, the drawing along with it)
  // and Slow motion (the drawing alone, slowly). One runs at a time.
  let watching = 0;
  const url = w.audio_url || w.tts_url;
  const watchBtn = h("button.btn.btn-primary", { type: "button" });
  const slowBtn = h("button.btn", { type: "button" });
  const showWatch = (on, which) => {
    watchBtn.replaceChildren(h("span", { html: on && which === watchBtn ? "" : PLAY_SVG, style: { display: "contents" } }),
      on && which === watchBtn ? UI.stop : UI.watch);
    slowBtn.textContent = on && which === slowBtn ? UI.stop : UI.slow;
    watchBtn.hidden = !url || (on && which !== watchBtn);
    slowBtn.hidden = on && which !== slowBtn;
  };
  const mark = (k, label) => {
    buttons.forEach((b, i) => b.classList.toggle("now", i === k));
    status.textContent = k >= 0 ? `${label} · ${titleOf(tokens[k].sym)}` : label;
  };
  const stopWatch = () => {
    if (!watching) return;
    watching = 0;
    stopAudio();
    fig.svg.stop();
    buttons.forEach(b => b.classList.remove("now"));
    status.textContent = "";
    showWatch(false);
  };
  const finish = () => {
    watching = 0;
    buttons.forEach(b => b.classList.remove("now"));
    status.textContent = "";
    showWatch(false);
    select(selected, true);
  };
  watchBtn.addEventListener("click", async () => {
    if (watching) { stopWatch(); select(selected, false); return; }
    const mine = watching = Date.now();
    const live = () => watching === mine && body.isConnected;
    showWatch(true, watchBtn);
    const steps = await syncSteps(tokens, url);
    if (!live()) return;
    let ended = false;
    const audio = playWord(w, null, { rate: TOGETHER_RATE }).then(() => { ended = true; });
    const clock = recordingClock(TOGETHER_RATE);
    await fig.svg.follow(steps, () => ended ? null : clock(), k => mark(k, UI.together));
    await audio;
    if (live()) finish();
  });
  slowBtn.addEventListener("click", async () => {
    if (watching) { stopWatch(); select(selected, false); return; }
    const mine = watching = Date.now();
    showWatch(true, slowBtn);
    status.textContent = UI.slow;
    const done = await fig.svg.walk(walkSteps(tokens), k => mark(k, UI.slow));
    if (done && watching === mine && body.isConnected) finish();
  });
  showWatch(false);

  // Stop when the panel closes or scrolls away.
  const details = body.closest("details");
  if (details) details.addEventListener("toggle", () => { if (!details.open) stopWatch(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) stopWatch(); })).observe(fig);
  }

  body.replaceChildren(
    h("div.say-sounds", { role: "group", "aria-label": UI.sounds_in_word }, buttons),
    h("div.say-main", fig,
      h("div.say-text", title, tip,
        h("div.say-actions", watchBtn, slowBtn, speedButton()), status,
        h("div.say-actions", mriBtn), mriSlot, more)));
  select(selected, false);
}

// ------------------------------------------------------------ MRI clip

/** A real mouth: the clip opens paused where the sound is made, with the
 * tongue (and for th and v the top teeth) outlined; it plays once, slowly. */
export function mriViewer(sym) {
  const m = MRI[sym], clip = m && CLIPS[m.file];
  if (!clip) return null;
  const video = document.createElement("video");
  for (const a of ["playsinline", "muted"]) video.setAttribute(a, "");
  video.muted = true;
  video.preload = "none";
  video.poster = clip.poster;
  video.src = clip.src;
  video.setAttribute("aria-label", MRI_TEXT.title(label(sym), m.word));
  const overlay = h("span", { style: { display: "contents" }, html:
    `<svg viewBox="0 0 240 240" aria-hidden="true">${clip.tongue ? `<path class="mri-tongue" d="${clip.tongue}"/>` : ""}` +
    `${m.teeth && clip.teeth ? `<path class="mri-teeth" d="${clip.teeth}"/>` : ""}</svg>` }).firstChild;
  const frame = h("div.mri-frame", video, overlay);
  const btn = h("button.btn", { type: "button" }, h("span", { html: PLAY_SVG, style: { display: "contents" } }), MRI_TEXT.play);
  const rest = () => { frame.classList.remove("playing"); btn.disabled = false; try { video.currentTime = clip.at; } catch (e) { /* not loaded */ } };
  video.addEventListener("ended", rest);
  btn.addEventListener("click", async () => {
    stopAudio();
    document.querySelectorAll(".mri-frame video").forEach(v => { if (v !== video) v.pause(); });
    frame.classList.add("playing");
    btn.disabled = true;
    video.currentTime = 0;
    video.playbackRate = video.defaultPlaybackRate = .5;
    try { await video.play(); } catch (e) { rest(); }
  });
  return h("div.mri", frame, btn,
    h("p", h("b", MRI_TEXT.title(label(sym), m.word))),
    h("p", MRI_TEXT.all),
    h("p", m.drill ? MRI_TEXT.drill : MRI_TEXT.word(m.word)),
    sym === "ɹ" ? h("p", MRI_TEXT.r) : null,
    sym === "θ" ? h("p", MRI_TEXT.th) : null,
    m.teeth ? h("p", MRI_TEXT.teeth) : null,
    h("p.mri-credit", MRI_TEXT.credit));
}

// ------------------------------------------------------------ Sounds page

/** One word to tap and hear. */
function wordButton(word, words) {
  const w = words.get(word);
  const btn = h("button.word-play", { type: "button", html: PLAY_SVG });
  btn.append(word);
  btn.addEventListener("click", () => playWord(w || { word }, btn));
  return btn;
}

/** A Sounds card: the drawing, the tip, words to try, and the listening game. */
export function soundCard(card, words) {
  const parts = card.parts || [card];
  const fig = figure(parts[0].sym);
  const heading = parts.map(p => titleOf(p.sym)).join(" · ");
  const body = [];
  const pick = parts.length > 1 ? parts.map((p, k) => h("button.say-snd.dot", {
    type: "button", "aria-pressed": String(k === 0), "aria-label": titleOf(p.sym),
    on: { click: e => { pick.forEach(b => b.setAttribute("aria-pressed", String(b === e.currentTarget))); fig.set(p.sym, { glide: 400 }); } },
  }, label(p.sym), h("small", p.sym))) : null;
  for (const p of parts) {
    body.push(h("div.say-text",
      parts.length > 1 ? h("p.say-title", titleOf(p.sym)) : null,
      h("p.say-tip", p.full),
      card.help && p === parts[0] ? h("p.help", card.help) : null,
      h("div.try", h("b", UI.try), p.try.map(x => wordButton(x, words)))));
  }
  if (card.compare) body.push(h("div.try", h("b", UI.compare), card.compare.map(([a, b]) => [wordButton(a, words), "–", wordButton(b, words)])));
  const drillSlot = h("div");
  const drills = (card.drill || []).filter(d => PAIRS[d]);
  const extra = [];
  if (drills.length) {
    const b = h("button.btn", { type: "button" }, UI.listen);
    b.addEventListener("click", () => {
      if (drillSlot.firstChild) { drillSlot.replaceChildren(); return; }
      drillSlot.append(drill(drills, words));
    });
    extra.push(b);
  }
  const mriSym = parts.map(p => p.sym).find(s => MRI[s] && CLIPS[MRI[s].file]);
  const mriSlot = h("div");
  if (mriSym) {
    const b = h("button.btn.btn-quiet", { type: "button" }, UI.mri);
    b.addEventListener("click", () => {
      if (mriSlot.firstChild) { mriSlot.replaceChildren(); b.textContent = UI.mri; return; }
      mriSlot.append(mriViewer(mriSym));
      b.textContent = UI.mriHide;
    });
    extra.push(b);
  }
  return h("article.sound-card", { id: `sound-${card.id}`, tabindex: "-1" },
    h("h3", heading),
    pick ? h("div.say-sounds", pick) : null,
    h("div.say-main", fig, h("div.say-text", body)),
    extra.length ? h("div.say-actions", extra) : null, drillSlot, mriSlot);
}

/** Five rounds of "Which word did you hear?" from these contrasts. */
function drill(contrasts, words) {
  const pool = contrasts.flatMap(c => PAIRS[c]).filter(([a, b]) => words.get(a) && words.get(b));
  const box = h("div.drill", { role: "group", "aria-label": UI.listen });
  const ROUNDS = 5;
  let n = 0, right = 0;
  const rate = () => Math.max(.75, playbackSpeed());
  const say = word => playWord(words.get(word), null, { rate: rate() });
  const trial = () => {
    if (n >= ROUNDS) {
      const again = h("button.btn.btn-primary", { type: "button", on: { click: () => { n = right = 0; trial(); } } }, UI.again);
      box.replaceChildren(h("p", UI.done(right, ROUNDS)), again);
      again.focus();
      return;
    }
    const pair = pool[Math.floor(Math.random() * pool.length)];
    const answer = pair[Math.floor(Math.random() * 2)];
    const order = Math.random() < .5 ? pair : [pair[1], pair[0]];
    const note = h("p", { "aria-live": "polite" });
    const replay = h("button.btn", { type: "button", on: { click: () => say(answer) } },
      h("span", { html: PLAY_SVG, style: { display: "contents" } }), UI.again);
    let answered = false;
    const choices = order.map(word => {
      const pickBtn = h("button.pick", { type: "button" }, word);
      const listen = h("button.play.sm", { type: "button", "aria-label": `Play ${word}`, html: PLAY_SVG, on: { click: () => say(word) } });
      const row = h("div.drill-choice", pickBtn, listen);
      pickBtn.addEventListener("click", async () => {
        if (answered) return;
        answered = true;
        const ok = word === answer;
        if (ok) right++;
        row.classList.add(ok ? "right" : "wrong");
        if (!ok) choices.find(c => c.dataset.word === answer).classList.add("right");
        note.textContent = ok ? UI.right : UI.wrong(answer);
        n++;
        box.append(h("button.btn.btn-primary", { type: "button", on: { click: trial } }, UI.next));
        await say(answer);
        await wait(250);
        await say(answer === pair[0] ? pair[1] : pair[0]);
      });
      row.dataset.word = word;
      return row;
    });
    box.replaceChildren(h("p", h("b", `${n + 1} / ${ROUNDS} · `), UI.which), replay, h("div.drill-choices", choices), note);
    say(answer);
  };
  trial();
  return box;
}

/** Words with their recordings, by spelling (for Try, Compare and the game). */
export async function wordsBySpelling() {
  const map = new Map();
  for (const w of await allWords()) {
    const k = w.word.toLowerCase();
    if (w.word === k && (!map.has(k) || (w.audio_url && !map.get(k).audio_url))) map.set(k, w);
  }
  return map;
}
