// Pictures for the English course lessons (drawn by static/js/course-visual.js;
// lessons written later carry their own in a `visuals` field),
// by lesson id: each lesson's idea as a timeline, a flowchart, a graph, a
// scale, a formula, a word-order strip, tiles, a funnel or a table. The same
// markup as the lessons (**point**, *word*). Kinds and their fields:
//
//   timeline  rows: [{ t, note?, span?: [from, to], repeat?, open?, points?: [{ at, label? }] }]
//             times run from -3 (long ago) through 0 (now) to 3 (later)
//   flow      steps: [{ q, yes, ex? }], else, elseEx?   (a ladder: each "no" goes down a step)
//   bars      items: [{ label, value (0–100), show?, ex? }]   (a bar graph)
//   scale     from, to, items: [{ at (0–100), label, ex? }]
//   formula   lines: [{ name?, parts: ["have", "+", "past participle"], ex? }]   (a part may be [text, slot] for a set color)
//   strip     slots: [{ label, sub? }], sentences?: [[[text, slot index or null], …], …]
//   tiles     items: [{ head, big?, sub?, words?: [] }]
//   funnel    levels: [{ label, sub }]   (wide to narrow)
//   table     head: [], rows: [[]]
//
// Every picture has a `title` and may have a `caption` (the point to take away).

import { VISUALS_A } from "./course-visuals-a.js";
import { VISUALS_B } from "./course-visuals-b.js";
import { VISUALS_I } from "./course-visuals-i.js";

/** The kinds course-visual.js draws. */
export const VISUAL_KINDS = ["timeline", "flow", "bars", "scale", "formula", "strip", "tiles", "funnel", "table"];

const FIRST = {
  "plural-nouns": [
    { kind: "tiles", title: "Three sounds for one letter *-s*", caption: "Say the word without *-s*. The last sound decides how *-s* sounds.",
      items: [
        { big: "/s/", head: "after p, t, k, f", words: ["cups", "hats", "books", "cliffs"] },
        { big: "/z/", head: "after vowels and other voiced sounds", words: ["days", "dogs", "phones", "trees"] },
        { big: "/ɪz/", head: "after s, z, sh, ch, j sounds", words: ["buses", "boxes", "dishes", "pages"] },
      ] },
  ],

  "time-prepositions": [
    { kind: "funnel", title: "*in*, *on*, *at*: from big to small", caption: "The bigger the stretch of time, the higher it sits: *in* for long periods, *on* for days, *at* for exact times.",
      levels: [
        { label: "in", sub: "years, months, seasons, parts of the day: *in 2020, in May, in the morning*" },
        { label: "on", sub: "days and dates: *on Monday, on July 4th, on my birthday*" },
        { label: "at", sub: "clock times and points: *at 6:30, at noon, at night*" },
      ] },
  ],

  "present-perfect": [
    { kind: "timeline", title: "Finished time or connected to now?", caption: "Past simple sits at a finished point. Present perfect stretches up to now.",
      rows: [
        { t: "I **lived** in Boston in 2015.", note: "past simple: a finished time", points: [{ at: -2, label: "2015" }] },
        { t: "I **have lived** here since 2019.", note: "present perfect: from then up to now", span: [-1.5, 0], open: true },
        { t: "I**'ve been** to Japan three times.", note: "experiences at some time before now", points: [{ at: -2.4 }, { at: -1.4 }, { at: -0.6 }] },
      ] },
  ],

  "articles": [
    { kind: "flow", title: "*a*, *an*, *the* or nothing?", caption: "Ask the questions in order and stop at the first *yes*.",
      steps: [
        { q: "Does the listener know which one you mean?", yes: "*the*", ex: "Close **the** door, please." },
        { q: "Is it one countable thing?", yes: "*a* or *an*", ex: "I need **a** pen. She's **an** engineer." },
      ],
      else: "no article", elseEx: "**Water** is important. I like **dogs**." },
  ],

  "deduction": [
    { kind: "bars", title: "How sure are you?", caption: "The numbers are a rough guide, not exact.",
      items: [
        { label: "It **is** true.", value: 100, show: "certain", ex: "She's at home." },
        { label: "It **must** be true.", value: 90, show: "almost sure", ex: "Her car is here. She must be home." },
        { label: "It **may** / **might** / **could** be true.", value: 50, show: "possible", ex: "She might be at the gym." },
        { label: "It **can't** be true.", value: 8, show: "almost sure it isn't", ex: "She can't be at work. It's Sunday." },
      ] },
  ],

  "word-order": [
    { kind: "strip", title: "Adjectives before a noun go in this order", caption: "Two or three adjectives are plenty; English speakers rarely use more.",
      slots: [
        { label: "opinion", sub: "lovely" }, { label: "size", sub: "big" }, { label: "age", sub: "old" },
        { label: "shape", sub: "round" }, { label: "color", sub: "red" }, { label: "origin", sub: "Italian" },
        { label: "material", sub: "wooden" }, { label: "purpose", sub: "dining" },
      ],
      sentences: [
        [["a ", null], ["lovely ", 0], ["old ", 2], ["Italian ", 5], ["car", null]],
        [["a ", null], ["big ", 1], ["round ", 3], ["wooden ", 6], ["table", null]],
      ] },
  ],

  "conditionals": [
    { kind: "formula", title: "Three *if* patterns", caption: "In these patterns, no *will* in the *if* part.",
      lines: [
        { name: "Zero: always true", parts: ["if + present", "+", "present"], ex: "If you heat ice, it melts." },
        { name: "First: real future", parts: ["if + present", "+", "will + verb"], ex: "If it rains, we'll stay home." },
        { name: "Second: imagined", parts: ["if + past", "+", "would + verb"], ex: "If I had a car, I'd drive to work." },
      ] },
  ],

  "formal-informal": [
    { kind: "scale", title: "From relaxed to formal", from: "with friends", to: "official writing",
      items: [
        { at: 6, label: "Hey, got a sec?", ex: "a text to a friend" },
        { at: 36, label: "Hi Sam, do you have a minute?", ex: "a message to a coworker" },
        { at: 68, label: "Hello Ms. Park, could we talk briefly?", ex: "an email to a manager" },
        { at: 94, label: "Dear Dr. Park, I would appreciate a brief meeting.", ex: "a formal letter" },
      ] },
  ],
};

// The rest, by level: course-visuals-b.js (beginner), -i.js, -a.js.
export const VISUALS = { ...FIRST, ...VISUALS_B, ...VISUALS_I, ...VISUALS_A };
