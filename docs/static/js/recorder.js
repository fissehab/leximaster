// Record yourself saying a word and compare it with the reference: the
// Pronounce tab and the "Say it yourself" section of a word page. Your
// latest take of each word is saved (one per word) and comes back next time.

import { api } from "./api.js";
import { playUrl, playWord, speak } from "./audio.js";
import { h, showError, toast } from "./ui.js";

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
      return { vals: trimmed, secs: trimmed.length / 100, from: a / 100, to: (b + 1) / 100 };
    })().catch(e => { envelopes.delete(url); throw e; }));
  }
  return envelopes.get(url);
}

/** Where the speech is in a recording: { from, to } in seconds, the silence
 * before and after left out. */
export const speechSpan = url => envelope(url).then(e => ({ from: e.from, to: e.to }));

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

/**
 * The reference and your recording side by side, for the full word `w`
 * (with audio_url/tts_url and recording_url). Returns the element, with
 * .toggle() (start or stop recording), .playReference() and .stop().
 */
export function recordCompare(w) {
  let myUrl = w.recording_url ? fresh(w.recording_url) : null;
  let recorder = null, chunks = [], stream = null, starting = false, recTimer = null, stopped = false;
  const status = h("p.sr-only", { role: "status" });
  const say = msg => { status.textContent = msg; };
  const refWave = waveCanvas(); refWave.dataset.color = "ref";
  const myWave = waveCanvas(); myWave.dataset.color = "mine";
  const recBtn = h("button.rec-btn", { type: "button", "aria-pressed": "false", on: { click: () => box.toggle() } },
    h("span.dot", { "aria-hidden": "true" }), h("span", "Record"));
  const playMine = h("button.btn", { type: "button", disabled: !myUrl, on: { click: e => myUrl && playUrl(myUrl, e.currentTarget) } }, "Play mine");
  const playBoth = async () => {
    await playWord(w);
    await new Promise(r => setTimeout(r, 350));
    if (myUrl) await playUrl(myUrl);
  };
  const both = h("button.btn.btn-primary", { type: "button", disabled: !myUrl, on: { click: playBoth } }, "Reference, then mine");
  const box = h("div.pron-grid", status,
    h("div.panel.pron-box",
      h("h3", w.audio_url ? "Reference · US recording" : w.tts_url ? "Reference · natural synthesized voice" : "Reference · your device's voice"),
      refWave,
      h("div.toolbar",
        h("button.btn", { type: "button", on: { click: e => playWord(w, e.currentTarget) } }, "Play reference"),
        h("button.btn.btn-quiet", { type: "button", on: { click: () => speak(w.word) } }, "Device voice"))),
    h("div.panel.pron-box",
      h("h3", "Your recording"),
      myWave,
      h("div.toolbar", recBtn, playMine, both)));
  const live = () => !stopped && box.isConnected;
  const redraw = () => drawWaves([[refWave, w.audio_url || w.tts_url], [myWave, myUrl]]);

  const stopRecording = () => {
    clearTimeout(recTimer);
    if (recorder && recorder.state === "recording") recorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    recBtn.classList.remove("on");
    recBtn.setAttribute("aria-pressed", "false");
    recBtn.lastChild.textContent = "Record again";
  };
  const save = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    recorder = null;
    if (!blob.size) return;
    const fd = new FormData();
    fd.append("file", blob, "recording");
    try {
      const res = await api.post(`/api/recordings/${w.id}`, fd);
      w.recording_url = res.url;
      if (!live()) return;   // saved either way
      myUrl = fresh(res.url);
      playMine.disabled = both.disabled = false;
      redraw();
      say("Saved. Playing the reference, then yours.");
      await playBoth();
    } catch (e) { if (live()) showError(e); }
  };
  box.toggle = async () => {
    if (recorder && recorder.state === "recording") return stopRecording();
    if (starting) return;
    starting = true;
    recBtn.lastChild.textContent = "Waiting for the microphone…";
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
      if (!(recorder && recorder.state === "recording")) recBtn.lastChild.textContent = "Record";
    }
    if (!live()) {   // left the word while the browser asked
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      return;
    }
    chunks = [];
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = save;
    recorder.start();
    recBtn.classList.add("on");
    recBtn.setAttribute("aria-pressed", "true");
    recBtn.lastChild.textContent = "Stop";
    say("Recording, up to 8 seconds. Press again to stop.");
    clearTimeout(recTimer);
    recTimer = setTimeout(() => recorder && recorder.state === "recording" && stopRecording(), 8000);
  };
  box.playReference = () => playWord(w);
  box.stop = () => { stopRecording(); stopped = true; };
  redraw();
  return box;
}
