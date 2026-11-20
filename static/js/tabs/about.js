// About: who made LexiMaster and why.

import { LESSONS } from "../course-lessons.js";
import { h, pageHead } from "../ui.js";

const QUESTIONS = LESSONS.reduce((n, l) => n + l.checks.length, 0);

const REPO = "https://github.com/fissehab/leximaster";
const GUIDE = "guide/LexiMaster-Install-Guide.pdf";   // docs/guide/, kept across site builds

export async function render(root) {
  root.append(h("div.about-page",
    pageHead("About LexiMaster"),
    h("div.about-grid",
      card("Who I am",
        h("p", "I'm Fisseha, a non-native English speaker who works in data science and artificial intelligence (AI). I studied civil " +
          "engineering, then earned a master's in environmental science at the University of Connecticut and a " +
          "master's and PhD in atmospheric physics at Johns Hopkins University, before moving into data science. " +
          "Theology has been a parallel path: I hold a master's in theology from Agora University and am now " +
          "pursuing a Doctor of Theology (ThD) there, with a particular love for philosophy and Christian asceticism and mysticism.")),
      card("Why I built it",
        h("p", "That mix means I need English in several registers at once: precise technical language at work, " +
          "the vocabulary of philosophical and theological dialogue, and the easy idioms of everyday American " +
          "conversation. Knowing a word when I read it isn't enough. I want the words and ideas I care about in " +
          "my ", h("em", "active"), " memory, ready when I speak or write.")),
      card("What's inside",
        h("p", "So I built LexiMaster: a few minutes a day of practice that brings each word back just before you'd forget it, with American pronunciation, careful " +
          "definitions, real examples, and notes on how each word is actually used. It covers advanced and " +
          "professional vocabulary, data science and AI, mathematics, philosophy and theology, the Bible (with " +
          "Orthodox, Catholic and Protestant perspectives), and everyday American English.")),
      card("For every level",
        h("p", "I also included words of every difficulty, from the most common everyday words to rare ones, so " +
          "that others can use it too, whatever their level of English. Words are grouped into five levels, from " +
          "1 (most common) to 5 (rare). Choose the levels you want to practice under ", h("b", "Word difficulty"),
          " in Settings. Tick one level or several, and change them " +
          "any time; every word still opens from links and search.")),
      wideCard("Free for everyone",
        h("div.about-cols", h("p", "A large vocabulary is only part of knowing a language, so I added a complete ", h("b", "English course"),
          " for anyone who wants to learn English or strengthen it, wherever they are starting from. It has " +
          `${LESSONS.length} short lessons in three levels, from beginner to advanced, covering grammar, punctuation, ` +
          "spelling, vocabulary, pronunciation and writing, from the parts of speech to paragraphs and essays."),
        h("p", "Each lesson explains one idea in plain language and shows it in a picture. You can hear every example " +
          "and conversation, then check yourself with questions, more than " +
          `${(Math.floor(QUESTIONS / 100) * 100).toLocaleString("en-US")} across the course. Together with the ` +
          "dictionary and the practice activities, LexiMaster brings the words, the grammar and the sounds of " +
          "English into one place.")),
        h("p", "You're welcome to use all of it. Your progress stays in your own browser."),
        h("p", h("a.btn", { href: "#course" }, "Start the course"))),
      card("How to say it",
        h("p", "To help with the sounds of English, each word page has ", h("b", "How to say it"), ": a drawing of the " +
          "mouth for each sound in the word, with a short tip. Practice → ", h("b", "Hard sounds"), " has the hardest sounds, " +
          "words to try and a listening game. The real-mouth clips come from the USC 75-Speaker Speech MRI Database " +
          "(CC BY 4.0).")),
      window.LEXI_STATIC ? card("Install it",
        h("p", "LexiMaster installs like an app on a phone, tablet or computer, with no app store and no sign-up, " +
          "and then works offline. The illustrated guide shows each step for iPhone, Android, Mac and Windows."),
        h("p", h("a.btn", { href: GUIDE, target: "_blank", rel: "noopener" },
          "Install guide (PDF)", h("span.sr-only", " (opens in a new tab)")))) : null,
      card("The code",
        h("p", "All of LexiMaster's code is open on GitHub. You can read it, and see how each part works."),
        h("p", h("a.btn", { href: REPO, target: "_blank", rel: "noopener noreferrer" },
          "See the code on GitHub", h("span.sr-only", " (opens in a new tab)")))))));
}

// One topic: a heading over its paragraph.
const card = (title, ...text) => h("section.panel.about", h("h2", title), text);
// A longer topic across the whole page, its paragraphs side by side on a wide screen.
const wideCard = (title, ...text) => h("section.panel.about.about-wide", h("h2", title), text);
