// Pronunciation playback: an American English recording when available, then
// a natural synthesized recording made for LexiMaster (tts_url), and only as
// a last resort the device's own speech synthesis with its best American voice.
//
// One <audio> element serves every play: iOS only lets an element play
// without a fresh tap once a tap has started it, so the first play button
// tapped unlocks it for later automatic plays. Each play gets a sequence number;
// a play that was superseded (stopped, or replaced by a newer one) never
// falls back to the device voice.

import { saveSettings, settings } from "./state.js";

const player = new Audio();
player.preload = "auto";
let seq = 0;               // the newest play
let settle = null;         // resolves the pending play's promise
let currentBtn = null;

function finish() {
  if (currentBtn) currentBtn.classList.remove("playing");
  currentBtn = null;
  const s = settle;
  settle = null;
  if (s) s();
}

function stop() {
  seq++;
  player.pause();
  if (window.speechSynthesis) speechSynthesis.cancel();
  finish();
}

const LANG = "en-US";

// Playback speed (setting speech_rate): 1, 0.75 or 0.5, pitch kept
// natural. Older values ("0.9", Measured) read as 1.
export const SPEEDS = [1, 0.75, 0.5];
export function playbackSpeed() {
  const r = parseFloat(settings.speech_rate);
  return r <= 0.6 ? 0.5 : r <= 0.8 ? 0.75 : 1;
}
// The device's voice at 1 speaks a little slower than its default.
const rate = () => Math.max(0.5, 0.9 * playbackSpeed());
function recordingRate(slow) {
  return slow ? Math.min(0.7, playbackSpeed()) : playbackSpeed();
}
const speedText = s => `${s}×`.replace(/^0\./, ".");

/** A button beside a play button: 1× → .75× → .5×, saved for every word. */
export function speedButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "speed-btn";
  const show = () => {
    const s = playbackSpeed();
    btn.textContent = speedText(s);
    btn.setAttribute("aria-label", `Playback speed ${s} times. Change`);
    btn.title = "Playback speed: tap to slow down (pitch stays natural)";
  };
  show();
  btn.addEventListener("click", async e => {
    e.stopPropagation();
    const next = SPEEDS[(SPEEDS.indexOf(playbackSpeed()) + 1) % SPEEDS.length];
    try { await saveSettings({ speech_rate: next }); } catch (err) { return; }
    if (!player.paused) player.playbackRate = next;   // the word playing now, too
    document.querySelectorAll(".speed-btn").forEach(b => b.dispatchEvent(new Event("lexi-speed")));
  });
  btn.addEventListener("lexi-speed", show);
  return btn;
}

// The smoothest American voice the device has. Neural and downloaded voices
// (Edge's "Natural", Apple's "Premium" and "Enhanced") sound human; the small
// default voices sound robotic; macOS's novelty voices are never used.
const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Fred|Good News|Jester|Junior|Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)\b/;
const NAMES = ["Ava", "Zoe", "Allison", "Samantha", "Evan", "Nathan", "Tom", "Aria", "Jenny", "Guy", "Alex"];
function voiceScore(v) {
  const n = v.name;
  let s = 0;
  if (/Natural|Neural/.test(n)) s += 40;
  if (/Premium/.test(n)) s += 35;
  if (/Enhanced/.test(n)) s += 25;
  if (/^Google US English/.test(n)) s += 20;
  const i = NAMES.findIndex(x => n.includes(x));
  if (i >= 0) s += 10 - i * 0.5;
  return s;
}
let chosen = null;
function pickVoice() {
  if (chosen) return chosen;
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const us = voices.filter(v => v.lang.replace("_", "-") === LANG && !NOVELTY.test(v.name));
  us.sort((a, b) => voiceScore(b) - voiceScore(a));
  chosen = us[0] || null;
  return chosen;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { chosen = null; };

function speakNow(text, btn, mine) {
  if (!window.speechSynthesis) { finish(); return; }
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = LANG;
  u.rate = rate();
  if (btn) { btn.classList.add("playing"); currentBtn = btn; }
  u.onend = u.onerror = () => { if (mine === seq) finish(); };
  speechSynthesis.speak(u);
}

export function speak(text, btn) {
  stop();
  const mine = seq;
  return new Promise(resolve => {
    settle = resolve;
    speakNow(text, btn, mine);
  });
}

function playSrc(url, btn, fallbackText, speed) {
  stop();
  const mine = seq;
  return new Promise(resolve => {
    settle = resolve;
    if (btn) { btn.classList.add("playing"); currentBtn = btn; }
    player.src = url;
    player.preservesPitch = player.webkitPreservesPitch = true;
    player.playbackRate = speed;
    player.defaultPlaybackRate = player.playbackRate;
    const fail = e => {
      if (mine !== seq) return;                       // superseded: stay quiet
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError")) {
        // Aborted, or the browser wants a tap first: not a missing recording.
        if (btn && e.name === "NotAllowedError") btn.classList.add("needs-tap");
        finish();
        return;
      }
      if (fallbackText) { if (btn) btn.classList.remove("playing"); speakNow(fallbackText, btn, mine); }
      else finish();
    };
    player.onended = () => { if (mine === seq) finish(); };
    player.onerror = () => fail(null);
    player.play().then(() => { if (btn) btn.classList.remove("needs-tap"); }, fail);
  });
}

/** Play a word: its recording (human, else natural synthesized), else the
 * device's voice. `rate` overrides the playback speed setting. */
export function playWord(word, btn, { slow = false, rate = null } = {}) {
  if (!word) { stop(); return Promise.resolve(); }
  const url = word.audio_url || word.tts_url;
  if (url) return playSrc(url, btn, word.word, rate || recordingRate(slow));
  return speak(word.word, btn);
}

export function playUrl(url, btn) {
  return playSrc(url, btn, null, 1);   // the learner's own take: as recorded
}

export { stop as stopAudio };
