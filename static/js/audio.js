// Pronunciation playback: an American English recording when available, then
// a natural synthesized recording made for LexiMaster (tts_url), and only as
// a last resort the device's own speech synthesis with its best American voice.

import { settings } from "./state.js";

let current = null;
let currentBtn = null;

function stop() {
  if (current) { current.pause(); current = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (currentBtn) currentBtn.classList.remove("playing");
  currentBtn = null;
}

const LANG = "en-US";

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

export function speak(text, btn) {
  if (!window.speechSynthesis) return Promise.resolve();
  stop();
  return new Promise(resolve => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = LANG;
    const rate = parseFloat(settings.speech_rate);
    u.rate = rate >= 0.5 && rate <= 2 ? rate : 0.9;
    if (btn) { btn.classList.add("playing"); currentBtn = btn; }
    u.onend = u.onerror = () => { if (btn) btn.classList.remove("playing"); resolve(); };
    speechSynthesis.speak(u);
  });
}

/** Play a word: its recording (human, else natural synthesized), else the device's voice. */
export function playWord(word, btn) {
  stop();
  if (!word) return Promise.resolve();
  const url = word.audio_url || word.tts_url;
  if (url) {
    return new Promise(resolve => {
      const a = new Audio(url);
      current = a;
      if (btn) { btn.classList.add("playing"); currentBtn = btn; }
      const done = () => { if (btn) btn.classList.remove("playing"); resolve(); };
      a.onended = done;
      a.onerror = () => { done(); speak(word.word, btn); };
      a.play().catch(() => { done(); speak(word.word, btn); });
    });
  }
  return speak(word.word, btn);
}

export function playUrl(url, btn) {
  stop();
  return new Promise(resolve => {
    const a = new Audio(url);
    current = a;
    if (btn) { btn.classList.add("playing"); currentBtn = btn; }
    a.onended = a.onerror = () => { if (btn) btn.classList.remove("playing"); resolve(); };
    a.play().catch(() => resolve());
  });
}

export { stop as stopAudio };
