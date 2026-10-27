// Pronunciation practice: hear the reference, record yourself, compare side by side.

import { api } from "../api.js";
import { playUrl, playWord, speak } from "../audio.js";
import { loadFilter } from "../state.js";
import { filterBar, filterSources, h, pageHead, showError, toast } from "../ui.js";

let words = [];
let current = null;
let recorder = null;
let chunks = [];
let stream = null;
let els = {};
let myUrl = null;
let filter = loadFilter("pronounce");
let alive = false;        // false once the tab is left
let starting = false;     // waiting for microphone permission
let recTimer = null;      // auto-stop after 8 seconds
let recWordId = null;     // the word being recorded, fixed when recording starts
let chooseToken = 0;

let wordsToken = 0;
async function loadWords() {
  const mine = ++wordsToken;
  try {
    const res = await api.get("/api/practice/words", { ...filter, n: 60 });
    if (mine !== wordsToken || !alive) return;
    words = res.words;
  } catch (e) { return showError(e); }
  els.picker.replaceChildren(...words.map(w => {
    const b = h("button", { type: "button", "aria-current": "false", on: { click: () => choose(w.id) } }, w.word, h("small", { "aria-hidden": "true" }, w.phonetic || " "));
    b.dataset.id = w.id;
    return b;
  }));
  if (words.length) choose(words[0].id);
  else els.stage.replaceChildren(h("div.panel.empty", h("h2", "No words match"), h("p", "Widen the filters to choose words to practice.")));
}

async function choose(id) {
  stopRecording();
  const token = ++chooseToken;
  let w;
  try { w = await api.get(`/api/words/${id}`); } catch (e) { return showError(e); }
  if (token !== chooseToken || !alive) return;
  current = w;
  myUrl = current.recording_url ? fresh(current.recording_url) : null;
  els.picker.querySelectorAll("button").forEach(b => b.setAttribute("aria-current", String(Number(b.dataset.id) === id)));
  paint();
  // On a phone the list sits below the stage: bring the chosen word into view.
  if (matchMedia("(max-width: 900px)").matches) els.stage.scrollIntoView({ block: "start" });
}

// A just-saved recording reuses its URL; bypass the cache (blob: URLs are unique already).
const fresh = url => url.startsWith("blob:") ? url : `${url}?t=${Date.now()}`;

function waveCanvas() { return h("canvas.wave", { width: 600, height: 72, "aria-hidden": "true" }); }

// Waveforms: silence trimmed from both ends and both drawn on one time
// scale, so the reference and your take line up and their lengths compare.
let audioCtx = null;
const envelopes = new Map();   // url -> Promise of { vals (per 10 ms), secs }
function envelope(url) {
  if (!envelopes.has(url)) {
    envelopes.set(url, (async () => {
      const buf = await (await fetch(url)).arrayBuffer();
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const audio = await audioCtx.decodeAudioData(buf);
      const data = audio.getChannelData(0);
      const step = Math.max(1, Math.round(audio.sampleRate / 100));
      const vals = [];
      for (let i = 0; i < data.length; i += step) {
        let m = 0;
        for (let k = i; k < i + step && k < data.length; k++) m = Math.max(m, Math.abs(data[k]));
        vals.push(m);
      }
      const peak = Math.max(0.0001, ...vals);
      let a = vals.findIndex(v => v > peak * 0.06), b = vals.length - 1;
      while (b > a && vals[b] <= peak * 0.06) b--;
      if (a < 0) a = 0;
      const trimmed = vals.slice(Math.max(0, a - 3), b + 4);
      return { vals: trimmed, secs: trimmed.length / 100 };
    })().catch(e => { envelopes.delete(url); throw e; }));
  }
  return envelopes.get(url);
}

async function drawWaves(pairs) {
  const loaded = await Promise.all(pairs.map(([canvas, url]) => url ? envelope(url).catch(() => null) : null));
  const secs = Math.max(0.5, ...loaded.filter(Boolean).map(e => e.secs));
  const styles = getComputedStyle(document.documentElement);
  pairs.forEach(([canvas], i) => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const env = loaded[i];
    if (!env) return;
    const peak = Math.max(0.0001, ...env.vals);
    const color = canvas.dataset.color === "mine" ? styles.getPropertyValue("--madder") : styles.getPropertyValue("--verdigris");
    ctx.fillStyle = color.trim();
    const bw = canvas.width / (secs * 100) * 2;   // one bar per 20 ms
    for (let b = 0; b * 2 < env.vals.length; b++) {
      const v = Math.max(env.vals[b * 2] || 0, env.vals[b * 2 + 1] || 0);
      const hgt = Math.max(2, (v / peak) * (canvas.height - 6));
      ctx.fillRect(b * bw + 0.5, (canvas.height - hgt) / 2, Math.max(1, bw - 1), hgt);
    }
  });
}

function paint() {
  const w = current;
  const n = w.nuance || {};
  const refWave = waveCanvas(); refWave.dataset.color = "ref";
  const myWave = waveCanvas(); myWave.dataset.color = "mine";
  const recBtn = h("button.rec-btn", { type: "button", "aria-pressed": "false", "aria-keyshortcuts": "R", on: { click: toggleRecording } },
    h("span.dot", { "aria-hidden": "true" }), h("span", "Record"));
  els.recBtn = recBtn;
  els.myWave = myWave;
  els.stage.replaceChildren(
    h("div.panel", { style: { padding: "22px", display: "flex", flexDirection: "column", gap: "14px" } },
      h("div.entry-top", h("h2.headword", w.word)),
      h("div.entry-pron", w.phonetic ? h("span.ipa", { lang: "en-fonipa" }, w.phonetic) : null,
        n.pronunciation && n.pronunciation.respelling ? h("span.respell", n.pronunciation.respelling) : null),
      n.pronunciation && n.pronunciation.tip ? h("p", { style: { fontFamily: "var(--font-body)", maxWidth: "65ch" } }, n.pronunciation.tip) : null),
    h("div.pron-grid", { style: { marginTop: "14px" } },
      h("div.panel.pron-box",
        h("h3", w.audio_url ? "Reference · US recording" : w.tts_url ? "Reference · natural synthesized voice" : "Reference · your device's voice"),
        refWave,
        h("div.toolbar",
          h("button.btn", { type: "button", on: { click: e => playWord(w, e.currentTarget) } }, "Play reference"),
          h("button.btn.btn-quiet", { type: "button", on: { click: () => speak(w.word) } }, "Device voice"))),
      h("div.panel.pron-box",
        h("h3", "Your recording"),
        myWave,
        h("div.toolbar", recBtn,
          h("button.btn#play-mine", { type: "button", disabled: !myUrl, on: { click: e => myUrl && playUrl(myUrl, e.currentTarget) } }, "Play mine"),
          h("button.btn.btn-primary#play-both", { type: "button", disabled: !myUrl, on: { click: playBoth } }, "Reference, then mine")))),
  );
  els.refWave = refWave;
  redraw();
}

function redraw() {
  const w = current;
  drawWaves([[els.refWave, w.audio_url || w.tts_url], [els.myWave, myUrl]]);
}
const say = msg => { if (els.status) els.status.textContent = msg; };

async function playBoth() {
  await playWord(current);
  await new Promise(r => setTimeout(r, 350));
  if (myUrl) await playUrl(myUrl);
}

async function toggleRecording() {
  if (recorder && recorder.state === "recording") return stopRecording();
  if (starting || !current) return;
  starting = true;
  const wordId = current.id;
  els.recBtn.lastChild.textContent = "Waiting for the microphone…";
  try {
    say("Waiting for the microphone.");
    // No automatic gain: it flattens the loudness differences that mark stress.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true } });
  } catch (e) {
    const msg = e && e.name === "NotFoundError" ? "No microphone found. Connect one and try again."
      : e && e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's site settings and try again."
      : `The microphone couldn't start (${e && e.message || "unknown error"}).`;
    return toast(msg, { error: true, ms: 5000 });
  } finally {
    starting = false;
    if (els.recBtn && !(recorder && recorder.state === "recording")) els.recBtn.lastChild.textContent = "Record";
  }
  if (!alive || !current || current.id !== wordId) {  // left the tab or switched word while asking
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    return;
  }
  recWordId = wordId;
  chunks = [];
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = save;
  recorder.start();
  els.recBtn.classList.add("on");
  els.recBtn.setAttribute("aria-pressed", "true");
  els.recBtn.lastChild.textContent = "Stop";
  say("Recording, up to 8 seconds. Press again to stop.");
  clearTimeout(recTimer);
  recTimer = setTimeout(() => recorder && recorder.state === "recording" && stopRecording(), 8000);
}

function stopRecording() {
  clearTimeout(recTimer);
  if (recorder && recorder.state === "recording") recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (els.recBtn) {
    els.recBtn.classList.remove("on");
    els.recBtn.setAttribute("aria-pressed", "false");
    els.recBtn.lastChild.textContent = "Record again";
  }
}

async function save() {
  const wordId = recWordId;
  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  recorder = null;
  if (!blob.size || wordId === null) return;
  const fd = new FormData();
  fd.append("file", blob, "recording");
  try {
    const res = await api.post(`/api/recordings/${wordId}`, fd);
    // Saved either way; only update the screen if it still shows this word.
    if (!alive || !current || current.id !== wordId) return;
    myUrl = fresh(res.url);
    const mine = document.getElementById("play-mine");
    const both = document.getElementById("play-both");
    if (mine) mine.disabled = false;
    if (both) both.disabled = false;
    redraw();
    say("Saved. Playing the reference, then yours.");
    await playBoth();
  } catch (e) { if (alive) showError(e); }
}

export async function render(root) {
  const src = await filterSources();
  els.picker = h("div.panel.pick-list", { "aria-label": "Words to practice" });
  els.stage = h("div");
  els.status = h("p.sr-only", { role: "status" });
  root.append(els.status,
    pageHead("Pronunciation", "Listen to the reference, record yourself (up to 8 seconds), then play both back to compare."),
    await filterBar(f => { filter = f; loadWords().catch(showError); }, src, { tab: "pronounce" }),
    h("div.pron-layout", els.picker, els.stage));
  filter = loadFilter("pronounce");
  alive = true;
  current = null;
  await loadWords();
  return () => { alive = false; stopRecording(); };
}

export function onKey(e) {
  if (!current) return;
  if (e.key === " ") { e.preventDefault(); playWord(current); }
  else if (e.key === "r" || e.key === "R") { e.preventDefault(); toggleRecording(); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const k = words.findIndex(w => w.id === current.id) + (e.key === "ArrowDown" ? 1 : -1);
    if (words[k]) choose(words[k].id);
  }
}
