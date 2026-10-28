// Mouth diagrams for "How to say it": the mouth seen from the front, as a
// learner sees it in a mirror: how wide it opens, whether the lips are
// spread, rounded or closed, the teeth, and the tongue where it shows (between
// the teeth for th, up behind the top teeth for l). One typical position per
// American English sound, drawn from a few numbers so one sound glides into
// the next.
//
// SOUNDS keeps each sound's full position as seen from the side (checked by a
// phonetician): the front view is read from it (jaw opening, lip rounding and
// closing, tongue height), with the few things only the front shows added.

const NS = "http://www.w3.org/2000/svg";
const PIVOT = [190, 110];          // the jaw hinge

// A point that rides on the lower jaw: given closed, rotated by the opening.
const J = (x, y) => ({ j: [x, y] });

// Each position: jaw (degrees open), round (0 spread .. 1 rounded, pushed
// forward), lipToTeeth (lower lip up under the top teeth: f, v), lipClose
// (lips shut: p, b, m), velum (0 raised: air through the mouth; 1 lowered:
// through the nose), voiced, lips (the front view), and the tongue's upper
// surface as six points from the tip back to the root: [x, y] fixed to the
// head, J(x, y) riding on the jaw. `focus` is the point the gold ring marks
// (dashed: the place the tongue comes near but does not touch).
// Landmarks: upper incisor edge (78, 150); the underside of the roof of the
// mouth: lowest at y 141, x 98 (the bump behind the teeth), then 134 at
// x 118 and 132 from x 140 back to the soft palate at 166; throat wall x = 203. Vowels, r, w, j,
// s and z keep at least 3 units clear of the roof; l, the stops and ŋ touch.
const REST_TONGUE = [J(92, 160), J(104, 150), [124, 144], [152, 142], [178, 152], [186, 190]];
const TIP_UP = [[90, 139], [100, 141], [122, 147], [150, 145], [178, 154], [186, 190]];      // t d n
const GROOVE = [[93, 145], [102, 145], [122, 147], [150, 145], [178, 154], [186, 190]];      // s z
const POST = [[97, 147], [106, 140], [122, 138], [150, 142], [178, 154], [186, 190]];        // ʃ ʒ
const POST_STOP = [[96, 145], [104, 139], [122, 137], [150, 142], [178, 154], [186, 190]];   // tʃ dʒ
const BACK_UP = [J(92, 162), J(104, 155), [130, 145], [162, 132], [184, 146], [190, 191]];   // k g ŋ
const BUNCHED = [[108, 154], [120, 144], [140, 137], [162, 138], [192, 162], [198, 192]];    // r, er
const LIGHT_L = [[90, 137], [100, 142], [124, 150], [152, 146], [182, 150], [188, 190]];
const DARK_L = [[90, 137], [100, 142], [124, 150], [152, 146], [188, 148], [196, 192]];
const TEETH_TIP = [[66, 151], [84, 153], [118, 146], [150, 142], [178, 154], [186, 190]];    // θ ð

const P = (o) => Object.freeze({ jaw: 3, round: 0, lipToTeeth: 0, lipClose: 0, velum: 0, voiced: true,
                                  lips: "neutral", tongue: REST_TONGUE, ...o });
export const SOUNDS = Object.freeze({
  rest: P({ jaw: 2, round: .2, lipClose: 1, velum: 1, voiced: false, lips: "closed",
            tongue: [J(92, 160), J(104, 150), [124, 144], [152, 142], [178, 152], [186, 190]] }),
  // Lips
  p: P({ jaw: 1, lipClose: 1, voiced: false, lips: "closed", focus: [66, 150] }),
  b: P({ jaw: 1, lipClose: 1, lips: "closed", focus: [66, 150] }),
  m: P({ jaw: 1, lipClose: 1, velum: 1, lips: "closed", focus: [66, 150] }),
  f: P({ jaw: 2, lipToTeeth: 1, voiced: false, lips: "teeth", focus: [77, 152] }),
  v: P({ jaw: 2, lipToTeeth: 1, lips: "teeth", focus: [77, 152] }),
  w: P({ jaw: 2, round: 1, lips: "round", focus: [62, 150],
         tongue: [J(92, 162), J(106, 156), [130, 146], [160, 136], [184, 148], [188, 190]] }),
  // Tongue tip
  θ: P({ jaw: 6, voiced: false, lips: "tongue", focus: [70, 151], tongue: TEETH_TIP }),
  ð: P({ jaw: 6, lips: "tongue", focus: [70, 151], tongue: TEETH_TIP }),
  t: P({ jaw: 3, voiced: false, tongue: TIP_UP }),
  d: P({ jaw: 3, tongue: TIP_UP }),
  n: P({ jaw: 3, velum: 1, tongue: TIP_UP }),
  s: P({ jaw: 2, voiced: false, tongue: GROOVE }),
  z: P({ jaw: 2, focus: [96, 140], near: true, tongue: GROOVE }),
  l: P({ jaw: 4, focus: [91, 137], tongue: LIGHT_L }),
  ɫ: P({ jaw: 4, focus: [91, 137], tongue: DARK_L }),
  ʃ: P({ jaw: 3, round: .45, voiced: false, lips: "forward", focus: [104, 139], near: true, tongue: POST }),
  ʒ: P({ jaw: 3, round: .45, lips: "forward", tongue: POST }),
  tʃ: P({ jaw: 3, round: .4, voiced: false, lips: "forward", tongue: POST_STOP }),
  dʒ: P({ jaw: 3, round: .4, lips: "forward", tongue: POST_STOP }),
  ɹ: P({ jaw: 4, round: .3, lips: "forward", focus: [108, 149], near: true, back: true, tongue: BUNCHED }),
  ɚ: P({ jaw: 4, round: .3, lips: "forward", focus: [108, 149], near: true, back: true, tongue: BUNCHED }),
  j: P({ jaw: 2, lips: "spread", tongue: [J(90, 158), J(100, 148), [116, 139], [138, 137], [170, 150], [182, 192]] }),
  // Back of the tongue
  k: P({ jaw: 3, voiced: false, tongue: BACK_UP }),
  ɡ: P({ jaw: 3, tongue: BACK_UP }),
  ŋ: P({ jaw: 3, velum: 1, focus: [165, 133], tongue: BACK_UP }),
  h: P({ jaw: 6, voiced: false, tongue: [J(92, 162), J(104, 154), [126, 148], [154, 146], [180, 156], [188, 194]] }),
  // Vowels: front (i ɪ e ɛ æ), low (a ɑ), back and rounded (ɔ o ʊ u), middle (ʌ ə)
  i: P({ jaw: 3, lips: "spread", tongue: [J(90, 158), J(100, 148), [116, 139], [138, 137], [170, 150], [182, 192]] }),
  ɪ: P({ jaw: 5, focus: J(118, 142), tongue: [J(90, 160), J(102, 151), [120, 141], [144, 140], [172, 152], [184, 192]] }),
  e: P({ jaw: 6, lips: "spread", tongue: [J(90, 161), J(101, 152), [120, 143], [144, 142], [172, 153], [184, 192]] }),
  ɛ: P({ jaw: 8, tongue: [J(90, 162), J(100, 154), [120, 146], [146, 144], [174, 154], [184, 194]] }),
  æ: P({ jaw: 12, lips: "spread", focus: "gap", tongue: [J(88, 162), J(98, 154), [122, 156], [150, 160], [180, 168], [188, 198]] }),
  a: P({ jaw: 13, tongue: [J(90, 164), J(102, 160), [126, 162], [154, 162], [182, 168], [190, 198]] }),
  ɑ: P({ jaw: 13, tongue: [J(92, 164), J(104, 162), [128, 164], [156, 160], [184, 164], [194, 200]] }),
  ɔ: P({ jaw: 10, round: .6, lips: "round", tongue: [J(92, 164), J(104, 160), [128, 158], [158, 150], [184, 156], [194, 198]] }),
  o: P({ jaw: 7, round: .7, lips: "round", tongue: [J(92, 163), J(104, 158), [128, 150], [158, 141], [182, 150], [190, 194]] }),
  ʊ: P({ jaw: 5, round: .55, lips: "round", focus: [158, 141], tongue: [J(92, 162), J(104, 157), [128, 147], [158, 138], [182, 150], [188, 192]] }),
  u: P({ jaw: 3, round: 1, lips: "round", tongue: [J(92, 162), J(106, 157), [130, 147], [160, 136], [184, 149], [188, 191]] }),
  ʌ: P({ jaw: 8, focus: J(128, 155), tongue: [J(92, 163), J(104, 157), [128, 152], [156, 148], [182, 158], [190, 196]] }),
  ə: P({ jaw: 5, tongue: [J(92, 162), J(104, 154), [126, 147], [154, 145], [180, 155], [188, 194]] }),
});
// A diphthong is two positions: eɪ = e then ɪ.
export const DIPHTHONGS = { eɪ: ["e", "ɪ"], aɪ: ["a", "ɪ"], ɔɪ: ["ɔ", "ɪ"], oʊ: ["o", "ʊ"], aʊ: ["a", "ʊ"] };
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const lerp = (a, b, t) => a + (b - a) * t;
const f1 = n => n.toFixed(1);
const ease = t => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function rotate([x, y], deg) {
  const a = -deg * Math.PI / 180, [cx, cy] = PIVOT, dx = x - cx, dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

// What only the front shows: the tongue tip out between the teeth, or up
// behind the top teeth; and where the gold ring goes.
const TIP_OUT = new Set(["θ", "ð"]);
const TIP_BEHIND = new Set(["l", "ɫ", "t", "d", "n"]);
const RING = { p: "lips", b: "lips", m: "lips", w: "lips", u: "lips", f: "bite", v: "bite", θ: "out", ð: "out",
               l: "up", ɫ: "up" };

/** A sound's front view as plain numbers, ready to mix: w and h the
 * opening's half-width and height, lip how rounded (thicker), bite the top
 * teeth on the lower lip, out and up the tongue tip, level how high the
 * tongue is (0 low .. 1 high). A step marked `h` (the h of "hat") has the
 * next sound's position, without voice or ring. */
const stepPose = s => s.h ? { ...pose(s.sym), voiced: false, ring: null } : pose(s.sym);
export function pose(sym) {
  const s = SOUNDS[sym] || SOUNDS.rest;
  const front = s.tongue[2].j ? rotate(s.tongue[2].j, s.jaw) : s.tongue[2];
  let h = s.lipClose ? 0 : 2 + s.jaw * 2.4;
  if (!s.lipClose && s.round) h = Math.max(h, s.round * 16);     // rounded: a small "o"
  if (!s.lipClose && TIP_BEHIND.has(sym)) h = Math.max(h, 18);   // open enough to see the tip
  if (s.lipToTeeth) h = 3;
  return { w: 40 + (s.lips === "spread" ? 8 : 0) - s.round * 26, h: Math.min(34, h), lip: s.round, bite: s.lipToTeeth,
           out: TIP_OUT.has(sym) ? 1 : 0, up: TIP_BEHIND.has(sym) ? 1 : 0, level: clamp((165 - front[1]) / 28, 0, 1),
           voiced: s.voiced, ring: RING[sym] || null, sym };
}
function mix(a, b, t) {
  const m = { voiced: t < .5 ? a.voiced : b.voiced, ring: t < 1 ? null : b.ring, sym: b.sym };
  for (const k of ["w", "h", "lip", "bite", "out", "up", "level"]) m[k] = lerp(a[k], b[k], t);
  return m;
}

const CX = 100, CY = 74;
/** Draw one position. */
function draw(parts, s) {
  const ht = s.h * .4, hb = s.h * .6, w = s.w, ext = 7 + s.lip * 6;
  const ul = 8 + s.lip * 5, ll = 10 + s.lip * 6, ow = Math.max(w, 26) + ext;   // the lips' outer half-width
  const L = `${f1(CX - w)},${CY}`, R = `${f1(CX + w)},${CY}`;
  const top = `Q${CX},${f1(CY - 2 * ht)}`, bottom = `Q${CX},${f1(CY + 2 * hb)}`;
  parts.inside.setAttribute("d", `M${L} ${top} ${R} ${bottom} ${L} Z`);
  parts.clip.setAttribute("d", `M${L} ${top} ${R} ${bottom} ${L} Z`);
  const lt = CY - ht - ul;
  parts.upperLip.setAttribute("d", `M${f1(CX - ow)},${CY} C${f1(CX - ow * .6)},${f1(lt - ul * .5)} ` +
    `${CX - 9},${f1(lt - ul * .35)} ${CX},${f1(lt)} C${CX + 9},${f1(lt - ul * .35)} ${f1(CX + ow * .6)},${f1(lt - ul * .5)} ` +
    `${f1(CX + ow)},${CY} L${R} ${top} ${L} Z`);
  const lb = CY + hb + ll * 1.9;
  parts.lowerLip.setAttribute("d", `M${f1(CX - ow)},${CY} L${L} ${bottom} ${R} L${f1(CX + ow)},${CY} ` +
    `C${f1(CX + ow * .6)},${f1(lb)} ${f1(CX - ow * .6)},${f1(lb)} ${f1(CX - ow)},${CY} Z`);
  // Teeth: the top ones fixed to the head, the bottom ones moving with the jaw.
  const lowTop = CY + hb * .9 - 3;
  parts.lowTeeth.setAttribute("y", f1(lowTop));
  const tongueTop = lerp(lowTop - 3, CY + 3, s.level);
  // Rounded lips hide the teeth, which sit further back.
  parts.upTeeth.setAttribute("opacity", f1(1 - s.lip * .7));
  parts.lowTeeth.setAttribute("opacity", f1(1 - s.lip * .7));
  parts.tongue.setAttribute("cy", f1(tongueTop + 22));
  parts.tipUp.setAttribute("opacity", f1(s.up));
  parts.tipOut.setAttribute("opacity", f1(s.out));
  parts.bite.setAttribute("opacity", f1(s.bite));
  const ring = { lips: [CX, CY], bite: [CX, CY + 1], out: [CX, CY + 2], up: [CX, CY + 4] }[s.ring];
  parts.ring.style.display = ring ? "" : "none";
  if (ring) { parts.ring.setAttribute("cx", ring[0]); parts.ring.setAttribute("cy", ring[1]); }
}

const REDUCED = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
let clipIds = 0;

/**
 * A mouth diagram: an <svg> with
 *   show(sym, { glide })      jump (or glide, ms) to one sound and hold it;
 *   walk(steps, onStep)       glide through [{ sym, ms }] then back to rest;
 *   follow(steps, clock, …)   move along with a recording (see below);
 *   stop()                    end a glide, walk or follow where it is.
 * walk and follow resolve true when done, false when stopped. Colors come
 * from CSS (see .mouth in app.css). Without motion (the "reduce motion"
 * setting) every change is a step.
 */
export function mouthDiagram({ label = "The mouth, seen from the front" } = {}) {
  const svg = el("svg", { viewBox: "22 20 156 104", class: "mouth", role: "img", "aria-label": label });
  const id = `mouth-clip-${++clipIds}`;
  const clipPath = el("clipPath", { id });
  const parts = {
    clip: el("path"),
    inside: el("path", { class: "m-inside" }),
    tongue: el("ellipse", { class: "m-tongue", cx: CX, rx: 30, ry: 22 }),
    tipUp: el("ellipse", { class: "m-tongue", cx: CX, cy: CY + 1, rx: 11, ry: 8 }),
    upTeeth: el("rect", { class: "m-teeth", x: CX - 27, y: CY - 18, width: 54, height: 19.5, rx: 3 }),
    lowTeeth: el("rect", { class: "m-teeth", x: CX - 23, width: 46, height: 14, rx: 3 }),
    tipOut: el("ellipse", { class: "m-tongue", cx: CX, cy: CY + 2, rx: 15, ry: 5 }),
    upperLip: el("path", { class: "m-lip" }),
    lowerLip: el("path", { class: "m-lip" }),
    bite: el("rect", { class: "m-teeth", x: CX - 22, y: CY - 5, width: 44, height: 8, rx: 2 }),
    ring: el("circle", { class: "m-ring", r: 14 }),
  };
  clipPath.append(parts.clip);
  const inMouth = el("g", { "clip-path": `url(#${id})` });
  inMouth.append(parts.tongue, parts.lowTeeth, parts.tipUp, parts.upTeeth,
    el("path", { class: "m-gap", d: `M${CX},${CY - 18} V${CY + 1.5} M${CX - 13},${CY - 18} V${CY + 1} M${CX + 13},${CY - 18} V${CY + 1}` }),
    parts.tipOut);
  svg.append(el("rect", { class: "m-head", width: 200, height: 140, rx: 14 }),
    el("path", { class: "m-face", d: "M80,26 q20,9 40,0 M93,32 l2,12 M107,32 l-2,12 M74,114 q26,10 52,0" }),
    clipPath, parts.inside, inMouth, parts.upperLip, parts.lowerLip, parts.bite, parts.ring);

  let current = pose("rest"), frame = 0, settle = null;
  draw(parts, current);
  const halt = done => {
    cancelAnimationFrame(frame);
    frame = 0;
    const s = settle;
    settle = null;
    if (s) s(done);
  };
  svg.stop = () => halt(false);
  // Glide from where the drawing is to `target` in `ms`, then call `then`.
  const glide = (target, ms, then) => {
    const from = current;
    if (!ms || REDUCED()) { current = target; draw(parts, current); then(); return; }
    let start;
    const step = now => {
      start ??= now;
      const t = Math.min(1, Math.max(0, now - start) / ms);
      current = mix(from, target, ease(t));
      draw(parts, current);
      if (t < 1) frame = requestAnimationFrame(step);
      else then();
    };
    frame = requestAnimationFrame(step);
  };
  svg.show = (sym, { glide: ms = 0 } = {}) => new Promise(resolve => {
    halt(false);
    settle = resolve;
    glide(pose(DIPHTHONGS[sym] ? DIPHTHONGS[sym][0] : sym), ms, () => halt(true));
  });
  /** steps: [{ sym, ms, index }]; each glides for 60% of its time and holds
   * for the rest; onStep(index) when a step starts. */
  svg.walk = (steps, onStep) => new Promise(resolve => {
    halt(false);
    settle = resolve;
    // A diphthong glides on into its second vowel: 40% of its time to reach
    // the first (and hold briefly), 60% gliding to the second.
    const seq = steps.flatMap(s => DIPHTHONGS[s.sym]
      ? [{ ...s, sym: DIPHTHONGS[s.sym][0], ms: s.ms * .4, first: true },
         { ...s, sym: DIPHTHONGS[s.sym][1], ms: s.ms * .6, glide: 1 }]
      : [{ ...s, first: true }]);
    let k = 0;
    const next = () => {
      if (!settle) return;
      if (k >= seq.length) { halt(true); return; }
      const s = seq[k++];
      if (s.first && onStep) onStep(s.index);
      const target = stepPose(s);
      const g = s.glide || .6;
      glide(target, s.ms * g, () => {
        if (!settle) return;
        let start;
        const hold = now => {
          start ??= now;
          if (now - start >= s.ms * (REDUCED() ? 1 : 1 - g)) next();
          else frame = requestAnimationFrame(hold);
        };
        frame = requestAnimationFrame(hold);
      });
    };
    next();
  });
  /** Follow a recording: steps [{ sym, t0, t1, index }] in seconds of the
   * recording, clock() its current time (null once it has ended). Each sound
   * is reached halfway through its time and held; before the first and
   * after the last the mouth is at rest. onStep(index) when a sound starts. */
  svg.follow = (steps, clock, onStep) => new Promise(resolve => {
    halt(false);
    settle = resolve;
    const seq = steps.flatMap(s => {
      if (!DIPHTHONGS[s.sym]) return [{ ...s, first: true }];
      const mid = s.t0 + (s.t1 - s.t0) * .4;
      return [{ ...s, sym: DIPHTHONGS[s.sym][0], first: true, t1: mid },
              { ...s, sym: DIPHTHONGS[s.sym][1], t0: mid, reach: 1 }];
    });
    const poses = seq.map(stepPose), rest = pose("rest"), end = seq.length ? seq[seq.length - 1].t1 : 0;
    let last = -2;
    const step = () => {
      const t = clock();
      if (t === null) { current = rest; draw(parts, current); halt(true); return; }
      let k = seq.findIndex(s => t < s.t1);
      if (k < 0) k = seq.length;
      else if (t < seq[k].t0 && k === 0) k = -1;
      if (k !== last) {
        last = k;
        if (onStep && seq[k] && seq[k].first) onStep(seq[k].index);
        if (onStep && (k < 0 || k === seq.length)) onStep(-1);
      }
      let from = rest, to = rest, u = 1;
      if (k === seq.length) { from = poses[seq.length - 1] || rest; u = (t - end) / .15; }
      else if (k >= 0) { from = k ? poses[k - 1] : rest; to = poses[k]; u = (t - seq[k].t0) / ((seq[k].reach || .5) * (seq[k].t1 - seq[k].t0)); }
      current = REDUCED() ? to : mix(from, to, ease(Math.min(1, Math.max(0, u))));
      draw(parts, current);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });
  return svg;
}

