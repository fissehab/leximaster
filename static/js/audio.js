// Pronunciation playback: an American English recording when available,
// otherwise the browser's speech synthesis with an American (en-US) voice.

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

function pickVoice() {
  const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  // Only American voices; macOS ships Samantha, Ava, Allison, Tom and others.
  const us = voices.filter(v => v.lang.replace("_", "-") === LANG);
  const pref = ["Ava", "Samantha", "Allison", "Zoe", "Tom", "Evan", "Nathan", "Alex", "Google US English"];
  for (const name of pref) {
    const v = us.find(x => x.name.includes(name));
    if (v) return v;
  }
  return us.find(v => v.localService) || us[0] || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

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

/** Play a word: recorded audio if it has one, else speech synthesis. */
export function playWord(word, btn) {
  stop();
  if (!word) return Promise.resolve();
  if (word.audio_url) {
    return new Promise(resolve => {
      const a = new Audio(word.audio_url);
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
