// Pronunciation practice: hear the reference, record yourself, compare side by side.

import { api } from "../api.js";
import { playUrl, playWord, speak } from "../audio.js";
import { practiceFilter } from "../state.js";
import { filterBar, filterSources, h, pageHead, showError, toast } from "../ui.js";

let words = [];
let current = null;
let recorder = null;
let chunks = [];
let stream = null;
let els = {};
let myUrl = null;
let filter = { ...practiceFilter };
let alive = false;        // false once the tab is left
let starting = false;     // waiting for microphone permission
let recTimer = null;      // auto-stop after 8 seconds
let recWordId = null;     // the word being recorded, fixed when recording starts
let chooseToken = 0;

async function loadWords() {
  try {
    words = (await api.get("/api/practice/words", { ...filter, n: 60 })).words;
  } catch (e) { return showError(e); }
  els.picker.replaceChildren(...words.map(w => {
    const b = h("button", { type: "button", "aria-current": "false", on: { click: () => choose(w.id) } }, w.word, h("small", w.phonetic || " "));
    b.dataset.id = w.id;
    return b;
  }));
  if (words.length) choose(words[0].id);
  else els.stage.replaceChildren(h("div.panel.empty", h("h2", "No words match"), h("p", "Widen the filters to choose words to practise.")));
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
}

// A just-saved recording reuses its URL; bypass the cache (blob: URLs are unique already).
const fresh = url => url.startsWith("blob:") ? url : `${url}?t=${Date.now()}`;

function waveCanvas() { return h("canvas.wave", { width: 600, height: 72 }); }

async function drawWave(canvas, url) {
  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!url) return;
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const audio = await ac.decodeAudioData(buf);
    ac.close();
    const data = audio.getChannelData(0);
    const bars = 120, step = Math.floor(data.length / bars) || 1;
    const color = canvas.dataset.color === "mine" ? styles.getPropertyValue("--madder") : styles.getPropertyValue("--verdigris");
    ctx.fillStyle = color.trim();
    let peak = 0.0001;
    const vals = [];
    for (let b = 0; b < bars; b++) {
      let m = 0;
      for (let k = b * step; k < (b + 1) * step && k < data.length; k++) m = Math.max(m, Math.abs(data[k]));
      vals.push(m); peak = Math.max(peak, m);
    }
    const bw = canvas.width / bars;
    vals.forEach((v, b) => {
      const hgt = Math.max(2, (v / peak) * (canvas.height - 6));
      ctx.fillRect(b * bw + 1, (canvas.height - hgt) / 2, bw - 2, hgt);
    });
  } catch (e) { /* undecodable format: skip the waveform */ }
}

function paint() {
  const w = current;
  const n = w.nuance || {};
  const refWave = waveCanvas(); refWave.dataset.color = "ref";
  const myWave = waveCanvas(); myWave.dataset.color = "mine";
  const recBtn = h("button.rec-btn", { type: "button", on: { click: toggleRecording } }, h("span.dot"), h("span", "Record"));
  els.recBtn = recBtn;
  els.myWave = myWave;
  els.stage.replaceChildren(
    h("div.panel", { style: { padding: "22px", display: "flex", flexDirection: "column", gap: "14px" } },
      h("div.entry-top", h("h2.headword", w.word)),
      h("div.entry-pron", w.phonetic ? h("span.ipa", w.phonetic) : null,
        n.pronunciation && n.pronunciation.respelling ? h("span.respell", n.pronunciation.respelling) : null),
      n.pronunciation && n.pronunciation.tip ? h("p", { style: { fontFamily: "var(--font-body)", maxWidth: "65ch" } }, n.pronunciation.tip) : null),
    h("div.pron-grid", { style: { marginTop: "14px" } },
      h("div.panel.pron-box",
        h("h3", w.audio_url ? "Reference · US recording" : "Reference · US synthesized voice"),
        refWave,
        h("div.toolbar",
          h("button.btn", { type: "button", on: { click: e => playWord(w, e.currentTarget) } }, "Play reference"),
          h("button.btn.btn-quiet", { type: "button", on: { click: () => speak(w.word) } }, "Synthesized voice"))),
      h("div.panel.pron-box",
        h("h3", "Your recording"),
        myWave,
        h("div.toolbar", recBtn,
          h("button.btn#play-mine", { type: "button", disabled: !myUrl, on: { click: e => myUrl && playUrl(myUrl, e.currentTarget) } }, "Play mine"),
          h("button.btn.btn-primary#play-both", { type: "button", disabled: !myUrl, on: { click: playBoth } }, "Reference, then mine")))),
  );
  if (w.audio_url) drawWave(refWave, w.audio_url);
  if (myUrl) drawWave(myWave, myUrl);
}

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
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return toast("Microphone access was blocked. Allow it in the browser's site settings and try again.", { error: true, ms: 5000 });
  } finally {
    starting = false;
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
  els.recBtn.lastChild.textContent = "Stop";
  clearTimeout(recTimer);
  recTimer = setTimeout(() => recorder && recorder.state === "recording" && stopRecording(), 8000);
}

function stopRecording() {
  clearTimeout(recTimer);
  if (recorder && recorder.state === "recording") recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
  if (els.recBtn) { els.recBtn.classList.remove("on"); els.recBtn.lastChild.textContent = "Record again"; }
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
    drawWave(els.myWave, myUrl);
    await playBoth();
  } catch (e) { if (alive) showError(e); }
}

export async function render(root) {
  const src = await filterSources();
  els.picker = h("div.panel.pick-list", { "aria-label": "Words to practise" });
  els.stage = h("div");
  root.append(
    pageHead("Pronunciation", "Listen to the reference, record yourself (up to 8 seconds), then play both back to compare."),
    await filterBar(f => { filter = f; loadWords().catch(showError); }, src),
    h("div.pron-layout", els.picker, els.stage));
  filter = { ...practiceFilter };
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
