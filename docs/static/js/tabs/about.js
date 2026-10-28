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
        "pursuing a Doctor of Theology (ThD) there, with a particular love for philosophy and Christian mysticism."),
      h("p", "That mix means I need English in several registers at once: precise technical language at work, " +
        "the vocabulary of philosophical and theological dialogue, and the easy idioms of everyday American " +
        "conversation. Knowing a word when I read it isn't enough. I want the words and ideas I care about in " +
        "my ", h("em", "active"), " memory, ready when I speak or write."),
      h("p", "So I built LexiMaster: a few minutes a day of spaced review, with American pronunciation, careful " +
        "definitions, real examples, and notes on how each word is actually used. It covers advanced and " +
        "professional vocabulary, data science and AI, mathematics, philosophy and theology, the Bible (with " +
        "Orthodox, Catholic and Protestant perspectives), and everyday American English."),
      h("p", "I also included words of every difficulty, from the most common everyday words to rare ones, so " +
        "that others can use it too, whatever their level of English. Words are grouped into five levels, from " +
        "1 (most common) to 5 (rare). Choose the levels you want to study from the ", h("b", "Word levels"),
        " dropdown in Review (it's also in Stats → Study settings). Tick one level or several, and change them " +
        "any time; every word still opens from links and search."),
      h("p", "To help with the sounds of English, each word page has ", h("b", "How to say it"), ": a drawing of the " +
        "mouth for each sound in the word, with a short tip. Practice → ", h("b", "Sounds"), " has the hardest sounds, " +
        "words to try and a listening game. The real-mouth clips come from the USC 75-Speaker Speech MRI Database " +
        "(CC BY 4.0)."),
      h("p", "If it's useful to you too, you're welcome to use it. Your progress stays in your own browser.")));
}
