// About: who made LexiMaster and why.

import { h, pageHead } from "../ui.js";

export async function render(root) {
  root.append(
    pageHead("About LexiMaster"),
    h("div.panel.about",
      h("p", "I'm Fisseha, a non-native English speaker who works in data science and AI. I studied civil " +
        "engineering, then earned a master's in environmental science at the University of Connecticut and a " +
        "master's and PhD in atmospheric physics at Johns Hopkins University, before moving into data science. " +
        "Theology has been a parallel path: I hold a master's in theology from Agora University and am now " +
        "pursuing a ThD there, with a particular love for philosophy and Christian mysticism."),
      h("p", "That mix means I need English in several registers at once: precise technical language at work, " +
        "the vocabulary of philosophical and theological dialogue, and the easy idioms of everyday American " +
        "conversation. Knowing a word when I read it isn't enough. I want the words and ideas I care about in " +
        "my ", h("em", "active"), " memory, ready when I speak or write."),
      h("p", "So I built LexiMaster: a few minutes a day of spaced review, with American pronunciation, careful " +
        "definitions, real examples, and notes on how each word is actually used. It covers advanced and " +
        "professional vocabulary, data science and AI, mathematics, philosophy and theology, the Bible (with " +
        "Orthodox, Catholic and Protestant perspectives), and everyday American English."),
      h("p", "If it's useful to you too, you're welcome to use it. Your progress stays in your own browser."),
      h("p.muted.about-sign", "Fisseha"),
      window.LEXI_STATIC ? h("p", h("a", { href: "credits.html" }, "Sources & credits")) : null));
}
