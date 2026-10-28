// Mouth diagrams for "How to say it": a side view of the head (facing left,
// cut down the middle) showing where the tongue, lips, teeth, jaw and soft
// palate are for each American English sound, drawn from a few numbers per
// sound so one sound can glide into the next. Schematic, like a pronunciation
// textbook: one typical position per sound, not a measurement of any speaker.
// Also a small front view of the lips (lipIcon).

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
// mouth: y 138 at x 94 (the bump behind the teeth), 134 at x 118, 132 from
// x 140 back to the soft palate at 166; throat wall x = 203. Vowels, r, w, j,
// s and z keep at least 3 units clear of the roof; l, the stops and ŋ touch.
const REST_TONGUE = [J(92, 160), J(104, 150), [124, 144], [152, 142], [178, 152], [186, 190]];
const TIP_UP = [[90, 138], [100, 139], [122, 146], [150, 145], [178, 154], [186, 190]];      // t d n
const GROOVE = [[93, 142], [102, 141], [122, 145], [150, 144], [178, 154], [186, 190]];      // s z
const POST = [[97, 147], [106, 140], [122, 138], [150, 142], [178, 154], [186, 190]];        // ʃ ʒ
const POST_STOP = [[95, 143], [104, 137], [122, 137], [150, 142], [178, 154], [186, 190]];   // tʃ dʒ
const BACK_UP = [J(92, 162), J(104, 154), [126, 148], [150, 138], [168, 132], [186, 190]];   // k g ŋ
const BUNCHED = [[108, 154], [120, 143], [140, 136], [162, 137], [192, 162], [198, 192]];    // r, er
const LIGHT_L = [[90, 136], [100, 142], [124, 150], [152, 146], [182, 150], [188, 190]];
const DARK_L = [[90, 136], [100, 142], [124, 150], [152, 146], [188, 148], [196, 192]];
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
  s: P({ jaw: 2, voiced: false, lips: "spread", tongue: GROOVE }),
  z: P({ jaw: 2, lips: "spread", focus: [96, 140], near: true, tongue: GROOVE }),
  l: P({ jaw: 4, focus: [91, 137], tongue: LIGHT_L }),
  ɫ: P({ jaw: 4, focus: [91, 137], tongue: DARK_L }),
  ʃ: P({ jaw: 3, round: .45, voiced: false, lips: "forward", focus: [104, 139], near: true, tongue: POST }),
  ʒ: P({ jaw: 3, round: .45, lips: "forward", tongue: POST }),
  tʃ: P({ jaw: 3, round: .4, voiced: false, lips: "forward", tongue: POST_STOP }),
  dʒ: P({ jaw: 3, round: .4, lips: "forward", tongue: POST_STOP }),
  ɹ: P({ jaw: 4, round: .3, lips: "forward", focus: [108, 149], near: true, back: true, tongue: BUNCHED }),
  ɚ: P({ jaw: 4, round: .3, lips: "forward", focus: [108, 149], near: true, back: true, tongue: BUNCHED }),
  j: P({ jaw: 2, lips: "spread", tongue: [J(90, 158), J(100, 147), [116, 137], [138, 136], [170, 150], [182, 192]] }),
  // Back of the tongue
  k: P({ jaw: 3, voiced: false, tongue: BACK_UP }),
  ɡ: P({ jaw: 3, tongue: BACK_UP }),
  ŋ: P({ jaw: 3, velum: 1, focus: [165, 133], tongue: BACK_UP }),
  h: P({ jaw: 6, voiced: false, tongue: [J(92, 162), J(104, 154), [126, 148], [154, 146], [180, 156], [188, 194]] }),
  // Vowels: front (i ɪ e ɛ æ), low (a ɑ), back and rounded (ɔ o ʊ u), middle (ʌ ə)
  i: P({ jaw: 3, lips: "spread", tongue: [J(90, 158), J(100, 148), [116, 137], [138, 135], [170, 150], [182, 192]] }),
  ɪ: P({ jaw: 5, focus: J(118, 140), tongue: [J(90, 160), J(102, 150), [118, 137], [140, 135], [172, 150], [182, 192]] }),
  e: P({ jaw: 6, lips: "spread", tongue: [J(90, 161), J(101, 152), [120, 141], [142, 139], [172, 152], [184, 192]] }),
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
// Which part a label points at, besides the tongue.
const KEY_PART = { θ: "teeth", ð: "teeth", f: "teeth", v: "teeth", p: "lips", b: "lips", m: "lips", w: "lips",
                   u: "lips", ʊ: "lips", ʃ: "lips", ŋ: "nose" };

const FOREHEAD = "M112,8 C104,40 96,58 92,70 C84,84 66,96 56,106 C52,110 54,116 60,118 C64,120 70,120 72,121";

const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const lerp = (a, b, t) => a + (b - a) * t;
const f1 = n => n.toFixed(1);
const pt = p => p.map(f1).join(",");
const ease = t => t * t * (3 - 2 * t);

function rotate([x, y], deg) {
  const a = -deg * Math.PI / 180, [cx, cy] = PIVOT, dx = x - cx, dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}
/** A sound's position as plain numbers, ready to mix. */
export function pose(sym) {
  const s = SOUNDS[sym] || SOUNDS.rest;
  const at = p => (p.j ? rotate(p.j, s.jaw) : p);
  let focus = null;
  if (s.focus === "gap") { const low = rotate([82, 153], s.jaw); focus = [(79 + low[0]) / 2, (150 + low[1]) / 2]; }
  else if (s.focus) focus = at(s.focus);
  return { jaw: s.jaw, round: s.round, velum: s.velum, lipToTeeth: s.lipToTeeth, lipClose: s.lipClose,
           tongue: s.tongue.map(at), focus, near: !!s.near, back: !!s.back, voiced: s.voiced, sym };
}
function mix(a, b, t) {
  return {
    jaw: lerp(a.jaw, b.jaw, t), round: lerp(a.round, b.round, t), velum: lerp(a.velum, b.velum, t),
    lipToTeeth: lerp(a.lipToTeeth, b.lipToTeeth, t), lipClose: lerp(a.lipClose, b.lipClose, t),
    tongue: a.tongue.map((p, i) => [lerp(p[0], b.tongue[i][0], t), lerp(p[1], b.tongue[i][1], t)]),
    focus: t < 1 ? null : b.focus, near: b.near, back: t < 1 ? false : b.back, voiced: t < .5 ? a.voiced : b.voiced, sym: b.sym,
  };
}

// A smooth curve through points (Catmull-Rom as cubic Béziers); `move`
// starts a new path, otherwise it continues one.
function smooth(pts, move = true) {
  let d = move ? `M${pt(pts[0])}` : `L${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ` +
         `${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${pt(p2)}`;
  }
  return d;
}

/** Draw one position into the diagram's moving parts. */
function draw(parts, s) {
  const jw = p => rotate(p, s.jaw);
  const t = s.tongue;
  // Tongue: the surface, down the root, then back along the floor of the mouth.
  const floor = [[t[5][0] - 4, 222], jw([146, 202]), jw([116, 190]), jw([94, 180]), [t[0][0] + 2, t[0][1] + 6]];
  parts.tongue.setAttribute("d", smooth(t) + " " + smooth(floor, false) + " Z");
  // The airway: lips to throat, above and behind the tongue; when the tip is
  // drawn back (r, l) it also fills the space under the tip.
  const back = [...t].reverse();
  const under = t[0][0] > 96 ? [[t[0][0] + 2, t[0][1] + 6], jw([96, 180]), jw([93, 176])].map(q => `L${pt(q)}`).join(" ") : "";
  const lipX = lerp(lerp(66, 74, s.lipToTeeth), 80, s.lipClose);
  parts.air.setAttribute("d", `M${f1(lipX)},150 L80,148 C86,140 90,137 94,138 C104,132 130,131 166,132 ` +
    `C182,${f1(134 + s.velum * 8)} 196,${f1(132 + s.velum * 22)} 202,128 L203,262 L${f1(t[5][0] - 2)},262 ` +
    smooth(back, false) + ` ${under} L${pt(jw([84, 154]))} L${pt(jw([lipX, 151]))} Z`);
  // Lower jaw: incisor, lip, chin.
  const tooth = [[79, 153], [85, 152], [93, 177], [87, 179]].map(jw);
  parts.lowerTooth.setAttribute("d", "M" + tooth.map(pt).join(" L") + " Z");
  const r = s.round, c = s.lipClose;
  // Lips: the outer line is part of the face's profile; the inner side lies
  // against the teeth. Rounding pushes them forward and narrows the opening;
  // for f and v the lower lip comes up under the top teeth; for p, b and m
  // the lips close.
  const upOuter = [[72, 121], [65 - r * 4, 129], [61 - r * 8, 137], [66 - r * 7, 146 - r * 2 + c * 1.5], [76, 148 + c]];
  parts.upperLip.setAttribute("d", smooth(upOuter) + " C79,146 81,136 80,126 Z");
  const lowOpen = [[68 - r * 6, 151 + r], [62 - r * 8, 158], [65 - r * 4, 167], [72, 171]].map(jw);
  lowOpen[0] = [lerp(lowOpen[0][0], 66 - r * 7, c), lerp(lowOpen[0][1], 148.5 - r * 2, c)];
  const lowTeeth = [[77, 151], [69, 155], [68, 164], [72, 170]].map((p, i) => i < 3 ? p : jw(p));
  const lowOuter = lowOpen.map((p, i) => [lerp(p[0], lowTeeth[i][0], s.lipToTeeth), lerp(p[1], lowTeeth[i][1], s.lipToTeeth)]);
  const lowInner = [[84, 168], [84, 154]].map(jw);
  lowInner[1] = [lerp(lerp(lowInner[1][0], 80, s.lipToTeeth), 78, c), lerp(lerp(lowInner[1][1], 152, s.lipToTeeth), 149.5, c)];
  parts.lowerLip.setAttribute("d", smooth([...lowOuter, lowInner[0]]) + ` C${pt(lowInner[0])} ${pt(lowInner[1])} ${pt(lowInner[1])} Z`);
  const chin = [[66, 190], [80, 210], [120, 222], [150, 232]].map(jw);
  parts.chin.setAttribute("d", smooth([lowOuter[3], ...chin]) + " L160,290");
  // The head's shading follows the same profile: nose, lips, chin, neck.
  parts.head.setAttribute("d", FOREHEAD + " " + smooth(upOuter, false) + " " + smooth(lowOuter, false) + " " +
    smooth([lowOuter[3], ...chin], false) + " L160,290 L230,290 L230,8 Z");
  parts.face.setAttribute("d", FOREHEAD);
  // Soft palate: up against the throat wall, or hanging (air through the nose).
  const v = s.velum;
  parts.velum.setAttribute("d", `M164,123 C178,${f1(120 + v * 4)} 192,${f1(116 + v * 16)} ${f1(201 - v * 10)},${f1(120 + v * 30)} ` +
    `C${f1(203 - v * 10)},${f1(126 + v * 32)} ${f1(196 - v * 10)},${f1(130 + v * 32)} ${f1(190 - v * 8)},${f1(129 + v * 26)} ` +
    `C182,${f1(131 + v * 12)} 174,${f1(133 + v * 4)} 164,132 Z`);
  // The gold ring where it matters; an arrow when the tongue pulls back (r).
  const f = s.focus;
  parts.ring.style.display = f ? "" : "none";
  if (f) {
    parts.ring.setAttribute("cx", f1(f[0]));
    parts.ring.setAttribute("cy", f1(f[1]));
    parts.ring.classList.toggle("near", s.near);
  }
  parts.arrow.style.display = s.back ? "" : "none";
  parts.voice.style.display = s.voiced ? "" : "none";
}

const REDUCED = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A mouth diagram: an <svg> with
 *   show(sym, { glide })   jump (or glide, ms) to one sound and hold it;
 *   walk(steps, onStep)    glide through [{ sym, ms }] then back to rest; resolves
 *                          true when done, false when stopped;
 *   stop()                 end a glide or walk where it is.
 * Colors come from CSS (see .mouth in app.css). Without motion (the
 * "reduce motion" setting) every change is a step.
 */
export function mouthDiagram({ label = "Side view of the mouth" } = {}) {
  const svg = el("svg", { viewBox: "44 60 176 178", class: "mouth", role: "img", "aria-label": label });
  const head = el("path", { class: "m-head" });
  svg.append(head,
    // Nose cavity, hard palate (bone and the roof of the mouth), throat wall, top teeth.
    el("path", { class: "m-cavity", d: "M70,112 C80,92 120,88 196,94 L204,112 C170,112 130,114 90,124 Z" }),
    el("path", { class: "m-palate", d: "M82,126 C86,126 90,130 94,133 C104,126 130,122 166,123 L166,132 " +
      "C130,131 110,134 98,141 C92,140 88,136 84,134 Z" }),
    el("path", { class: "m-throat", d: "M204,100 C210,140 210,220 206,290" }),
    el("path", { class: "m-teeth", d: "M80,126 L76,150 L82,151 L89,130 Z" }),
  );
  const parts = {
    head,
    air: el("path", { class: "m-air" }),
    velum: el("path", { class: "m-velum" }),
    lowerTooth: el("path", { class: "m-teeth" }),
    tongue: el("path", { class: "m-tongue" }),
    upperLip: el("path", { class: "m-lip" }),
    lowerLip: el("path", { class: "m-lip" }),
    face: el("path", { class: "m-face" }),
    chin: el("path", { class: "m-face" }),
    eye: el("path", { class: "m-eye", d: "M100,76 q6,-5 13,-1 q-6,4 -13,1 Z" }),
    ring: el("circle", { class: "m-ring", r: 7 }),
    arrow: el("path", { class: "m-arrow", d: "M150,152 l16,4 m-6,-6 l6,6 l-7,4" }),
    voice: el("path", { class: "m-voice", d: "M212,198 l4,5 l-4,5 l4,5 l-4,5 l4,5 l-4,5" }),
    tongueText: el("text", { class: "m-label m-in", x: 152, y: 198, "text-anchor": "middle" }),
  };
  parts.tongueText.textContent = "tongue";
  svg.append(...Object.values(parts).filter(p => p !== head));
  head.after(parts.air);                         // the airway lies under the palate and teeth
  const keyLabel = el("text", { class: "m-label", x: 52, y: 186 });
  const keyLead = el("path", { class: "m-lead" });
  svg.append(keyLead, keyLabel);
  const setKey = sym => {
    const part = KEY_PART[sym] || "";
    keyLabel.textContent = part;
    keyLead.setAttribute("d", part === "teeth" ? "M66,180 L77,154" : part === "lips" ? "M58,178 L60,160" :
      part === "nose" ? "M140,104 L150,104" : "");
    if (part === "nose") { keyLabel.setAttribute("x", 112); keyLabel.setAttribute("y", 107); }
    else { keyLabel.setAttribute("x", 52); keyLabel.setAttribute("y", 190); }
  };

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
    setKey(sym);
    glide(pose(DIPHTHONGS[sym] ? DIPHTHONGS[sym][0] : sym), ms, () => halt(true));
  });
  /** steps: [{ sym, ms, index }]; each glides for 60% of its time and holds
   * for the rest; onStep(index) when a step starts. */
  svg.walk = (steps, onStep) => new Promise(resolve => {
    halt(false);
    settle = resolve;
    setKey("");
    const seq = steps.flatMap(s => DIPHTHONGS[s.sym]
      ? DIPHTHONGS[s.sym].map((x, k) => ({ ...s, sym: x, ms: s.ms / 2, first: k === 0 }))
      : [{ ...s, first: true }]);
    let k = 0;
    const next = () => {
      if (!settle) return;
      if (k >= seq.length) { halt(true); return; }
      const s = seq[k++];
      if (s.first && onStep) onStep(s.index);
      const target = pose(s.sym);
      glide(target, s.ms * .6, () => {
        if (!settle) return;
        let start;
        const hold = now => {
          start ??= now;
          if (now - start >= s.ms * (REDUCED() ? 1 : .4)) next();
          else frame = requestAnimationFrame(hold);
        };
        frame = requestAnimationFrame(hold);
      });
    };
    next();
  });
  return svg;
}

// The front view: lips spread, neutral, round or closed; top teeth on the
// lower lip (f, v); or the tongue tip between the teeth (th).
export function lipIcon(state = "neutral") {
  const svg = el("svg", { viewBox: "0 0 64 40", class: "lip-icon", "aria-hidden": "true" });
  const shapes = {
    spread: { w: 23, h: 5, teeth: true },
    neutral: { w: 17, h: 7, teeth: true },
    round: { w: 8, h: 8 },
    forward: { w: 11, h: 7 },
    closed: { w: 18, h: 0 },
    teeth: { w: 16, h: 6, teeth: "top", onLip: true },
    tongue: { w: 16, h: 7, teeth: true, tongue: true },
  };
  const s = shapes[state] || shapes.neutral;
  const cx = 32, cy = 20, lip = state === "round" || state === "forward" ? 6 : 4.5;
  const mouth = `M${cx - s.w},${cy} Q${cx},${cy - s.h - 2} ${cx + s.w},${cy} Q${cx},${cy + s.h + 2} ${cx - s.w},${cy} Z`;
  const outer = `M${cx - s.w - lip},${cy} Q${cx},${cy - s.h - lip * 2.2} ${cx + s.w + lip},${cy} ` +
    `Q${cx},${cy + s.h + lip * 2.4} ${cx - s.w - lip},${cy} Z`;
  svg.append(el("path", { class: "li-lip", d: outer }));
  if (s.h > 0) {
    svg.append(el("path", { class: "li-mouth", d: mouth }));
    const clip = `lip-${state}-${Math.random().toString(36).slice(2, 7)}`;
    const cp = el("clipPath", { id: clip });
    cp.append(el("path", { d: mouth }));
    svg.append(cp);
    const g = el("g", { "clip-path": `url(#${clip})` });
    if (s.teeth) g.append(el("rect", { class: "li-teeth", x: cx - 12, y: cy - s.h - 2, width: 24, height: s.h * .55 + 1 }));
    if (s.teeth === true && !s.tongue) g.append(el("rect", { class: "li-teeth", x: cx - 10, y: cy + s.h * .55, width: 20, height: s.h }));
    if (s.tongue) {
      g.append(el("rect", { class: "li-teeth", x: cx - 10, y: cy + 2.5, width: 20, height: 6 }));
      g.append(el("ellipse", { class: "li-tongue", cx, cy: cy + .5, rx: 9, ry: 3 }));
    }
    svg.append(g);
  } else {
    svg.append(el("path", { class: "li-line", d: `M${cx - s.w},${cy} Q${cx},${cy - 1.5} ${cx + s.w},${cy}` }));
  }
  if (s.onLip) svg.append(el("rect", { class: "li-teeth", x: cx - 11, y: cy - 3, width: 22, height: 5, rx: 1 }));
  return svg;
}
