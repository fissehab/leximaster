// The English course (tabs/course.js): grammar lessons for learners of
// American English, from the syllabus a panel of teachers wrote (a high-school
// ESL teacher, a professor of English grammar, a professor of applied
// linguistics). Hand-written; every sentence has a recording (static/js/
// course-audio.js, made by tools/course_audio.py) and is checked by
// tests/test_course.py.
//
// A lesson: `key` (the one idea to remember), `rule` (2–4 short paragraphs),
// `compare` (a table), `examples`, `mistakes` (✗ and ✓ sentences, each said
// aloud), an optional `note` (American usage) and `myth` (a "rule" that isn't
// one), and `checks` (questions; `say` makes one a listening question, its
// sentence played aloud). In text, **word** is the point of the example and
// *word* an English word or phrase being talked about. A sentence object's
// `say` is what the voice reads when the written form would be read wrong
// ("9:00", "March 3").
//
// Rules say "usually" where a rule has exceptions and give one; nothing that
// educated Americans say or write is marked wrong.
//
// These are the first 15 lessons. static/js/course-more.js adds to each an
// introduction, what you will learn, grouped examples, a conversation, a tip,
// a fun fact and more questions, and course-extra.js more questions. The other
// lessons are written whole in course-b2/b3.js (beginner), course-i2…i8.js
// (intermediate) and course-a1…a6.js (advanced). LESSONS is all of them,
// in the order of ORDER below.

import { ADDED as A1 } from "./course-a1.js";
import { ADDED as A2 } from "./course-a2.js";
import { ADDED as A3 } from "./course-a3.js";
import { ADDED as A4 } from "./course-a4.js";
import { ADDED as A5 } from "./course-a5.js";
import { ADDED as A6 } from "./course-a6.js";
import { ADDED as B2 } from "./course-b2.js";
import { ADDED as B3 } from "./course-b3.js";
import { EXTRA } from "./course-extra.js";
import { ADDED as I2 } from "./course-i2.js";
import { ADDED as I3 } from "./course-i3.js";
import { ADDED as I4 } from "./course-i4.js";
import { ADDED as I5 } from "./course-i5.js";
import { ADDED as I6 } from "./course-i6.js";
import { ADDED as I7 } from "./course-i7.js";
import { ADDED as I8 } from "./course-i8.js";
import { MORE } from "./course-more.js";

export const LEVELS = [
  { id: "beginner", name: "Beginner", cefr: "A1–A2",
    goal: "Understand and make simple sentences and questions about yourself, your routines, past events and plans." },
  { id: "intermediate", name: "Intermediate", cefr: "B1",
    goal: "Talk about experiences, give advice and opinions, and connect ideas at home and at work." },
  { id: "advanced", name: "Advanced", cefr: "B2–C1",
    goal: "Express nuance, report and soften what you say, and choose the right style for work and study." },
];

const BASE = [
  {
    id: "parts-of-speech", level: "beginner", unit: "Words and their jobs",
    title: "Parts of speech",
    key: "Every word has a job. A noun names something, a verb tells what happens, an adjective describes a noun, and an adverb tells how, when or where.",
    rule: [
      "**Nouns** name people, things, places and ideas: *teacher, phone, city, idea*. A noun can usually follow *the* or *a*.",
      "**Verbs** say what happens or what something is: *run, eat, be, have, seem*. A verb changes for time: *walk, walked*.",
      "**Adjectives** describe nouns: *a red car*, *The car is red*. **Adverbs** describe verbs, adjectives and whole sentences: *drive slowly*, *very tall*, *Luckily, …*",
      "Some words can be more than one part of speech. In *a fast car*, *fast* is an adjective; in *She drives fast*, it is an adverb.",
      "**Interjections** show a feeling and stand apart from the rest of the sentence: *Wow! Oh, I see. Ouch, that hurts.* Put a comma or an exclamation point after them.",
    ],
    compare: {
      head: ["Part of speech", "What it does", "Quick test (usually works)", "Example"],
      rows: [
        ["Noun", "names a person, thing, place or idea", "Does it fit *the ___ is…*?", "the **book**, an **idea**"],
        ["Verb", "says what happens or what is", "Can it change for the past (*-ed*, *went*) or follow *will*?", "She **works**. It **rained**."],
        ["Adjective", "describes a noun", "Does it fit *It is very ___*?", "a **cold** day"],
        ["Adverb", "describes a verb, an adjective or a sentence", "Does it answer *how, when, where* or *how much*?", "She speaks **slowly**."],
      ],
    },
    examples: [
      { t: "She **works** in a hospital.", note: "verb" },
      { t: "I need a new **job**.", note: "noun" },
      { t: "It's a **fast** car.", note: "adjective: describes the car" },
      { t: "She drives **fast**.", note: "adverb: describes how she drives" },
      { t: "We had a **quiet** dinner.", note: "adjective" },
    ],
    mistakes: [
      { bad: "She is beauty.", good: "She is beautiful.", note: "*Beauty* is a noun. To describe her, use the adjective *beautiful*." },
      { bad: "He drives very careful.", good: "He drives very carefully.", note: "*Carefully* is the adverb: it tells how he drives." },
      { bad: "I am agree.", good: "I agree.", note: "*Agree* is a verb, so it doesn't need *am*." },
    ],
    note: "Other parts of speech come in later lessons: pronouns (*she, it*), prepositions (*in, on*), conjunctions (*and, but*), and the little words before nouns (*a, the, my*), which grammar books call determiners.",
    checks: [
      { q: "In “She answered quickly,” what is *quickly*?", choices: ["noun", "verb", "adjective", "adverb"], answer: 3, why: "It tells how she answered." },
      { q: "In “I have an idea,” what is *idea*?", choices: ["noun", "verb", "adjective", "adverb"], answer: 0, why: "It follows *an* and names a thing." },
      { q: "In “The soup smells good,” what is *smells*?", choices: ["noun", "verb", "adjective", "adverb"], answer: 1, why: "It says what the soup does, and it can change to *smelled*." },
      { q: "Which word is an adjective? “The old man walked home.”", choices: ["old", "man", "walked", "home"], answer: 0, why: "*Old* describes the man." },
      { q: "In “Wow, that's a big dog!” what is *wow*?", choices: ["a noun", "an interjection", "an adverb"], answer: 1, why: "*Wow* shows a feeling and stands apart from the sentence: an interjection." },
    ],
    words: ["noun", "verb", "adjective", "adverb"],
  },

  {
    id: "subject-verb", level: "beginner", unit: "Words and their jobs",
    title: "Subject + verb: a sentence needs both",
    key: "An English sentence needs a subject and a verb, even when the subject is only *it* or *there*.",
    rule: [
      "Almost every English sentence has a **subject** (who or what) and a **verb**: *She works. The bus is late.*",
      "When there is no real subject, English uses **it** or **there**: *It is raining. It's five o'clock. There is a problem.*",
      "Don't leave out **be**: *My brother is tall*, not *My brother tall*. Commands are the exception: they leave out *you*: *Sit down, please.*",
    ],
    compare: {
      head: ["Missing a part", "Complete sentence", "What was missing"],
      rows: [
        ["Is raining.", "**It** is raining.", "the subject *it*"],
        ["My brother very tall.", "My brother **is** very tall.", "the verb *is*"],
        ["Is a good idea.", "**It** is a good idea.", "the subject *it*"],
        ["Have many people here.", "**There are** many people here.", "*there are*"],
      ],
    },
    examples: [
      { t: "**It** is cold today.", note: "weather: it" },
      { t: "**There is** a bank near my house.", note: "something exists: there is" },
      { t: "My phone **is** in the car." },
      { t: "**It's** too late to call." },
      { t: "Close the door, please.", note: "a command: no subject" },
    ],
    mistakes: [
      { bad: "Is very hot today.", good: "It is very hot today.", note: "Weather and time need *it*." },
      { bad: "She very happy.", good: "She is very happy.", note: "An adjective after the subject needs a verb, usually *be*." },
      { bad: "In my city have many parks.", good: "There are many parks in my city.", note: "To say that something exists, use *there is* or *there are*." },
    ],
    checks: [
      { q: "Choose the complete sentence.", choices: ["Is late.", "It is late.", "Late now."], answer: 1, why: "*It* is the subject and *is* is the verb." },
      { q: "___ a good restaurant near here?", choices: ["Is there", "Is", "There"], answer: 0, why: "A question about what exists uses *Is there*." },
      { q: "My parents ___ at home.", choices: ["is", "are", "(nothing)"], answer: 1, why: "*My parents* is plural, so *are*. The verb can't be left out." },
      { q: "Listen. What is the first word?", say: "It's raining again.", choices: ["It's", "Is", "This"], answer: 0, why: "Weather sentences start with *it*: *It's raining.*" },
    ],
    words: ["subject", "verb"],
  },

  {
    id: "pronouns", level: "beginner", unit: "Words and their jobs",
    title: "Pronouns: I / me, he / she, they / them",
    key: "Use *I, he, she, we, they* as the subject (usually before the verb). Use *me, him, her, us, them* after a verb or a preposition.",
    rule: [
      "**Subject pronouns** do the action and come before the verb: *I, you, he, she, it, we, they*.",
      "**Object pronouns** come after a verb or a preposition: *me, you, him, her, it, us, them*. *She called me. This is for them.*",
      "Use **he** for a man or a boy, **she** for a woman or a girl, and **it** for a thing or an animal (people often call a pet *he* or *she*).",
      "Use **they** for two or more people or things. You can also use *they* for one person when you don't know if the person is a man or a woman, or when someone asks to be called *they*.",
      "**My, his, her, their** match the owner, not the thing: *Maria and her brother*, *Tom and his car*.",
    ],
    compare: {
      head: ["Subject", "Object", "Possessive"],
      rows: [
        ["I", "me", "my"], ["you", "you", "your"], ["he", "him", "his"], ["she", "her", "her"],
        ["it", "it", "its"], ["we", "us", "our"], ["they", "them", "their"],
      ],
    },
    examples: [
      { t: "**She** lives in Chicago, and I visit **her** every summer." },
      { t: "Give **it** to **me**, please." },
      { t: "**We** invited **them** to dinner." },
      { t: "Someone left **their** umbrella here.", note: "one person, not known: their" },
      { t: "Who's there? It's **me**.", note: "normal in everyday English" },
    ],
    mistakes: [
      { bad: "He saw she at the party.", good: "He saw her at the party.", note: "After a verb, use the object form." },
      { bad: "My mother is a teacher. He works at a school.", good: "My mother is a teacher. She works at a school.", note: "Use *she* for a woman and *he* for a man." },
      { bad: "My sister lost his phone.", good: "My sister lost her phone.", note: "*His* or *her* matches the owner (my sister), not the thing." },
      { bad: "Him and me went to the store.", good: "He and I went to the store.", note: "They do the action, so use subject pronouns. *Me and him* is heard in casual speech; write *he and I*." },
    ],
    checks: [
      { q: "Tom and Anna are late. ___ missed the bus.", choices: ["They", "Them", "Their"], answer: 0, why: "They do the action: subject pronoun." },
      { q: "Can you help ___?", choices: ["I", "me", "my"], answer: 1, why: "After the verb *help*: object pronoun." },
      { q: "Maria called. ___ wants to talk to you.", choices: ["He", "She", "Her"], answer: 1, why: "Maria is a woman, and she does the action." },
      { q: "Listen. Which word do you hear?", say: "I gave her the keys.", choices: ["her", "him", "them"], answer: 0, why: "*Her*: a woman." },
      { q: "Which is correct?", choices: ["Him and me are friends.", "He and I are friends."], answer: 1, why: "The subject takes *he* and *I*." },
    ],
    words: ["pronoun", "they"],
  },

  {
    id: "adjectives-adverbs", level: "beginner", unit: "Words and their jobs",
    title: "Adjectives vs. adverbs",
    key: "Adjectives describe people and things. Adverbs describe how, when, where or how much.",
    rule: [
      "An **adjective** describes a noun. It goes before the noun (*a quick answer*) or after *be, seem, look, feel, taste* (*The answer was quick*).",
      "An **adverb** describes a verb, an adjective or a whole sentence: *She answered quickly. It's very cold. Luckily, we were on time.*",
      "Many adverbs are an adjective + **-ly** (*quick, quickly*), but not all of them: *fast, hard, late, well* and *often* are adverbs too, and *friendly* and *lovely* are adjectives.",
    ],
    compare: {
      head: ["Adjective (describes a noun)", "Adverb (describes an action)"],
      rows: [
        ["a **quick** answer", "answer **quickly**"],
        ["a **careful** driver", "drive **carefully**"],
        ["a **good** singer", "sing **well**"],
        ["a **fast** runner", "run **fast**"],
        ["a **hard** worker", "work **hard**"],
      ],
    },
    examples: [
      { t: "She is a **careful** driver.", note: "adjective" },
      { t: "She drives **carefully**.", note: "adverb" },
      { t: "The soup tastes **good**.", note: "after taste, smell, look, feel when they describe the subject: an adjective" },
      { t: "You did **well** on the test.", note: "adverb of good" },
      { t: "He works **hard**.", note: "not hardly: that means almost not" },
    ],
    mistakes: [
      { bad: "She sings beautiful.", good: "She sings beautifully.", note: "*Beautifully* tells how she sings." },
      { bad: "He speaks English very good.", good: "He speaks English very well.", note: "*Well* is the adverb of *good*." },
      { bad: "She works very hardly.", good: "She works very hard.", note: "*Hard* is already an adverb. *Hardly* means “almost not”." },
    ],
    note: "In American English, “I'm good” is the normal answer to “How are you?” There, *good* is an adjective after *be*.",
    checks: [
      { q: "Please drive ___. The road is icy.", choices: ["careful", "carefully"], answer: 1, why: "It tells how to drive: adverb." },
      { q: "This coffee smells ___.", choices: ["good", "well"], answer: 0, why: "After *smell*, describe the coffee: adjective." },
      { q: "He runs very ___.", choices: ["fast", "fastly"], answer: 0, why: "*Fast* is both an adjective and an adverb. *Fastly* is not a word." },
      { q: "Which word is an adjective?", choices: ["quickly", "friendly", "slowly"], answer: 1, why: "*Friendly* ends in -ly, but it describes a person." },
      { q: "Listen. Which word do you hear?", say: "She did really well on the exam.", choices: ["well", "good"], answer: 0, why: "*Did well*: the adverb." },
    ],
    words: ["adjective", "adverb"],
  },

  {
    id: "count-noncount", level: "beginner", unit: "Little words before nouns",
    title: "Count vs. non-count nouns",
    key: "Count nouns have a plural and can take *a* or *an*. Non-count nouns have no plural and no *a* or *an*.",
    rule: [
      "**Count nouns** are things you can count one by one: *a book, two books; an idea, many ideas*.",
      "**Non-count nouns** are seen as a mass or an idea: *water, rice, money, advice, information, furniture, homework*. They have no plural and no *a* or *an*. To count them, use a unit: *a piece of advice, a glass of water*.",
      "Some nouns are both, with a change in meaning: *coffee* (the drink) and *a coffee* (a cup of it); *paper* and *a paper* (a newspaper or an essay).",
    ],
    compare: {
      head: ["", "Count: book", "Non-count: water"],
      rows: [
        ["a / some", "a book", "some water"],
        ["a large amount", "many books, a lot of books", "a lot of water"],
        ["question", "How many books?", "How much water?"],
        ["a small amount", "a few books", "a little water"],
      ],
    },
    examples: [
      { t: "Can I give you some **advice**?" },
      { t: "I have two **questions**." },
      { t: "We don't have **much** time.", note: "much: questions and negatives" },
      { t: "There were **a lot of** people at the party." },
      { t: "We need some new **furniture** for the office." },
    ],
    mistakes: [
      { bad: "Can you give me some informations?", good: "Can you give me some information?", note: "*Information* is non-count: no -s." },
      { bad: "She gave me a good advice.", good: "She gave me some good advice.", note: "*Advice* is non-count: no *a*. You can say *a piece of advice*." },
      { bad: "How much people came?", good: "How many people came?", note: "*People* is a plural count noun: *many*." },
    ],
    note: "In questions and negatives, *much* is normal: *How much time do we have?* In positive sentences, Americans usually say *a lot of*: *We have a lot of time.*",
    checks: [
      { q: "How ___ money do you need?", choices: ["much", "many"], answer: 0, why: "*Money* is non-count." },
      { q: "I need ___ about the trip.", choices: ["an information", "some information", "some informations"], answer: 1, why: "Non-count: no *an*, no -s." },
      { q: "There isn't much ___ in the fridge.", choices: ["milk", "eggs"], answer: 0, why: "*Much* goes with non-count nouns like *milk*." },
      { q: "Listen. Which word do you hear?", say: "How many chairs do we need?", choices: ["much", "many"], answer: 1, why: "*Chairs* can be counted: *many*." },
      { q: "Which is correct?", choices: ["We have a lot of homeworks.", "We have a lot of homework."], answer: 1, why: "*Homework* is non-count." },
    ],
    words: ["advice", "information", "furniture"],
  },

  {
    id: "articles", level: "beginner", unit: "Little words before nouns",
    title: "a, an, the, or no article",
    key: "Use *a* or *an* when the listener doesn't know which one yet, *the* when the listener knows which one, and no article for plural or non-count nouns in general.",
    rule: [
      "Use **a** or **an** with one count noun when it is one of many, or new to the listener: *I saw a dog.*",
      "Use **the** when the listener can tell which one you mean: you mentioned it before (*The dog was huge*), there is only one (*the sun*), or the situation shows it (*Close the door*).",
      "Use **no article** for plural and non-count nouns in general: *Dogs are loyal. Water is important.*",
      "Choose *a* or *an* by the first **sound**, not the first letter: *an hour* (the h is silent), *a university* (it starts with a y sound).",
      "**Names** of people, cities, states and most countries take no article: *Maria lives in Chicago.* (A few place names take *the*; see “Articles II”.)",
    ],
    compare: {
      head: ["", "One (count)", "More than one", "Non-count"],
      rows: [
        ["new, or one of many", "**a** dog", "(some) dogs", "(some) water"],
        ["the listener knows which", "**the** dog", "**the** dogs", "**the** water"],
        ["in general", "**A** dog is a loyal animal.", "Dogs are loyal.", "Water is important."],
      ],
    },
    examples: [
      { t: "I'm reading **a** good book." },
      { t: "**The** book you gave me is great.", note: "we know which book" },
      { t: "She is **an** engineer.", note: "after be, a job usually takes a or an" },
      { t: "**The** moon is bright tonight.", note: "there is only one" },
      { t: "I love **music**.", note: "in general: no article" },
      { t: "It takes **an** hour.", note: "hour starts with a vowel sound" },
      { t: "**Kenji** works in **Seattle**.", note: "names: no article" },
    ],
    mistakes: [
      { bad: "I am teacher.", good: "I am a teacher.", note: "After *be*, a job usually takes *a* or *an*." },
      { bad: "The life is beautiful.", good: "Life is beautiful.", note: "In general: no article." },
      { bad: "We waited for a hour.", good: "We waited for an hour.", note: "*Hour* starts with a vowel sound." },
    ],
    checks: [
      { q: "She works as ___ nurse.", choices: ["a", "an", "the", "(nothing)"], answer: 0, why: "A job: *a*, and *nurse* starts with a consonant sound." },
      { q: "Where's Mom? She's in ___ kitchen.", choices: ["a", "the"], answer: 1, why: "A home has one kitchen, so both people know which one." },
      { q: "That's ___ honest answer.", choices: ["a", "an"], answer: 1, why: "*Honest* starts with a vowel sound: the h is silent." },
      { q: "I like ___ coffee, but not tea.", choices: ["the", "a", "(nothing)"], answer: 2, why: "Coffee in general: no article." },
      { q: "Listen. What comes before “hour”?", say: "I'll be there in an hour.", choices: ["a", "an", "the"], answer: 1, why: "*An hour*: a vowel sound follows." },
      { q: "My cousin Omar moved to ___ Denver last year.", choices: ["the", "a", "(nothing)"], answer: 2, why: "The name of a city: no article." },
    ],
    words: ["article", "the"],
  },

  {
    id: "present-simple", level: "beginner", unit: "Verbs: now, then, next",
    title: "Present simple: I work, she works",
    key: "With *he, she, it*, or one person or thing, a present simple verb ends in *-s*.",
    rule: [
      "Use the **present simple** for habits, facts and things that are always true: *I work in an office. Water boils at 212 degrees Fahrenheit.*",
      "After **he, she, it** (or one person or thing), add **-s**: *She works. My phone rings.* Add **-es** after *s, z, sh, ch* and *x*: *watches, fixes*. *Go* and *do* become *goes* and *does*. A consonant + *y* becomes **-ies**: *study, studies*. *Have* becomes **has**.",
      "Questions and negatives use **does** or **doesn't**, and then the verb has no -s: *Does she work? She doesn't work.*",
      "The -s has three sounds: *s* in *works*, *z* in *lives*, and an extra syllable, *iz*, in *watches*.",
    ],
    compare: {
      head: ["I / you / we / they", "he / she / it"],
      rows: [
        ["I **work**.", "She **works**."],
        ["You **watch**.", "He **watches**."],
        ["We **study**.", "She **studies**."],
        ["They **have** a car.", "He **has** a car."],
        ["**Do** they work?", "**Does** she work?"],
        ["They **don't** work.", "She **doesn't** work."],
      ],
    },
    examples: [
      { t: "My brother **lives** in Texas.", note: "-s sounds like z" },
      { t: "She **teaches** math.", note: "-es sounds like iz" },
      { t: "The store **opens** at nine." },
      { t: "He **doesn't** drink coffee." },
      { t: "**Does** your sister speak Spanish?" },
    ],
    mistakes: [
      { bad: "She work in a bank.", good: "She works in a bank.", note: "*She*: add -s." },
      { bad: "Does he works here?", good: "Does he work here?", note: "*Does* already has the -s, so the verb has none." },
      { bad: "My father have a car.", good: "My father has a car.", note: "*Have* becomes *has*." },
    ],
    note: "You may hear *he don't* in casual American speech. It is not standard: say and write *he doesn't*.",
    checks: [
      { q: "My mother ___ in a hospital.", choices: ["work", "works"], answer: 1, why: "One person: add -s." },
      { q: "___ he play soccer?", choices: ["Do", "Does"], answer: 1, why: "*He*: *does*." },
      { q: "She doesn't ___ meat.", choices: ["eat", "eats"], answer: 0, why: "After *doesn't*, no -s." },
      { q: "The baby ___ a lot at night.", choices: ["cry", "crys", "cries"], answer: 2, why: "Consonant + y: -ies." },
      { q: "Listen. Which verb do you hear?", say: "He watches the news every night.", choices: ["watch", "watches"], answer: 1, why: "You hear an extra syllable at the end: *watches*." },
    ],
    words: ["present", "habit"],
  },

  {
    id: "simple-continuous", level: "beginner", unit: "Verbs: now, then, next",
    title: "Present simple vs. present continuous",
    key: "Use the present simple for habits and facts. Use *am, is* or *are* + *-ing* for what is happening now or for a short time.",
    rule: [
      "**Present simple**: things you do regularly and things that are true: *I walk to work every day.*",
      "**Present continuous** (*am, is, are* + verb-*ing*): something happening now, or for a limited time: *I'm walking to work this week because my car is broken.*",
      "Verbs for states, like **know, want, need, believe, own** and **understand**, usually stay in the simple form: *I know him*, not *I'm knowing him*. Some of them take -ing when they mean an action: *I'm thinking about it. We're having dinner.*",
    ],
    compare: {
      head: ["Present simple", "Present continuous"],
      rows: [
        ["habits and facts", "now, or for a limited time"],
        ["I **work** from home.", "I'm **working** from home today."],
        ["She **speaks** three languages.", "She's **speaking** French right now."],
        ["every day, usually, often, never", "now, right now, today, this week"],
      ],
    },
    examples: [
      { t: "He **plays** tennis on Saturdays.", note: "a habit" },
      { t: "Look! **It's snowing**.", note: "right now" },
      { t: "**I'm staying** with friends this month.", note: "for a limited time" },
      { t: "I don't **understand** this word.", note: "a state verb" },
      { t: "What **are you doing**?" },
    ],
    mistakes: [
      { bad: "I am go to the store now.", good: "I'm going to the store now.", note: "*Be* + verb-*ing*." },
      { bad: "Listen! The baby cries.", good: "Listen! The baby is crying.", note: "It is happening now: continuous." },
      { bad: "I am knowing the answer.", good: "I know the answer.", note: "*Know* is a state verb." },
    ],
    note: "“I'm loving this!” is common in everyday American English, even though *love* is usually a state verb. It means “I'm enjoying this a lot right now.”",
    checks: [
      { q: "Shh! I ___ on the phone.", choices: ["talk", "am talking"], answer: 1, why: "It is happening now." },
      { q: "She usually ___ the bus to work.", choices: ["takes", "is taking"], answer: 0, why: "*Usually*: a habit." },
      { q: "I ___ what you mean.", choices: ["understand", "am understanding"], answer: 0, why: "*Understand* is a state verb." },
      { q: "Where's Tom? He ___ a shower.", choices: ["takes", "is taking"], answer: 1, why: "It is happening now." },
      { q: "Listen. What do you hear?", say: "They're watching a movie.", choices: ["They watch a movie.", "They're watching a movie."], answer: 1, why: "*They're watching*: happening now." },
    ],
    words: ["continuous"],
  },

  {
    id: "questions-negatives", level: "beginner", unit: "Verbs: now, then, next",
    title: "Questions and negatives: be or do, can / can't",
    key: "With *be* and helpers like *can, will* and *should*, put that word first: *Is she…? Can you…?* With other verbs, add *do* or *does*: *Do you…?*",
    rule: [
      "With **be**, put *am, is* or *are* before the subject: *She is ready. Is she ready?* For a negative, add *not*: *She isn't ready.*",
      "With other verbs, use **do** or **does**: *Do you work here? Does he drive? I don't know.* In the past, use *did* (see “Past simple”).",
      "With **can, will** and **should**, put that word first: *Can you swim? I can't swim.* A question word goes at the start: *Where do you live?*",
      "In American speech, *can* before a verb is short and quiet, like “kn”: *I can swim*. *Can't* is longer and louder and rhymes with *ant*; its t is often hard to hear. Listen for the vowel, not the t. (At the end, *can* is full: *Yes, I can.*)",
    ],
    compare: {
      head: ["Statement", "Question", "Negative"],
      rows: [
        ["She **is** tired.", "**Is** she tired?", "She **isn't** tired."],
        ["They live here.", "**Do** they live here?", "They **don't** live here."],
        ["He works late.", "**Does** he work late?", "He **doesn't** work late."],
        ["You **can** come.", "**Can** you come?", "You **can't** come."],
      ],
    },
    examples: [
      { t: "**Are** you hungry?" },
      { t: "**Do** you like spicy food?" },
      { t: "Where **does** she work?" },
      { t: "I **can** swim, but I **can't** dive.", note: "hear the two vowels" },
      { t: "We **don't** have a car." },
      { t: "Do you like it? **Yes, I do.**", note: "a short answer" },
    ],
    mistakes: [
      { bad: "Do you are hungry?", good: "Are you hungry?", note: "With *be*, no *do*." },
      { bad: "Where you live?", good: "Where do you live?", note: "Questions with other verbs need *do* or *does*." },
      { bad: "He can swims.", good: "He can swim.", note: "After *can*, the plain verb: no -s." },
    ],
    checks: [
      { q: "___ your brother at home?", choices: ["Is", "Does"], answer: 0, why: "There is no other verb, so the verb is *be*: *Is he at home?*" },
      { q: "___ they speak English?", choices: ["Are", "Do"], answer: 1, why: "*Speak* is not *be*: use *do*." },
      { q: "What time ___ the store close?", choices: ["do", "does", "is"], answer: 1, why: "*The store* is one thing: *does*." },
      { q: "Listen. Can the speaker come?", say: "I can come tomorrow.", choices: ["Yes: can", "No: can't"], answer: 0, why: "*Can* is short and quiet here." },
      { q: "Listen. Can the speaker come?", say: "I can't come tomorrow.", choices: ["Yes: can", "No: can't"], answer: 1, why: "*Can't* has a full, longer vowel." },
    ],
    words: ["question", "negative"],
  },

  {
    id: "past-simple", level: "beginner", unit: "Verbs: now, then, next",
    title: "Past simple: -ed sounds and irregular verbs",
    key: "Most verbs add *-ed* for the past, many common ones are irregular, and questions and negatives use *did* with the plain verb.",
    rule: [
      "Use the **past simple** for finished actions at a past time: *I called her yesterday.*",
      "Regular verbs add **-ed**: *work, worked; play, played; want, wanted*. The -ed has three sounds: *t* after sounds like p, k, f, s, sh, ch and x (*worked, laughed, fixed*), an extra syllable, *id*, after t and d (*wanted, needed*), and *d* after other sounds (*played*).",
      "Many common verbs are **irregular**: *go, went; have, had; see, saw; buy, bought; take, took*. Questions and negatives use **did** with the plain verb: *Did you go? I didn't go.*",
    ],
    compare: {
      head: ["Verb", "Past", "Ending"],
      rows: [
        ["walk", "walk**ed**", "t"],
        ["play", "play**ed**", "d"],
        ["need", "need**ed**", "id (extra syllable)"],
        ["go", "**went**", "irregular"],
        ["buy", "**bought**", "irregular"],
        ["eat", "**ate**", "irregular"],
      ],
    },
    examples: [
      { t: "We **watched** a movie last night.", note: "-ed sounds like t" },
      { t: "She **visited** her parents.", note: "-ed sounds like id" },
      { t: "They **moved** to Denver in 2020.", note: "-ed sounds like d", say: "They moved to Denver in twenty twenty." },
      { t: "I **went** to bed early.", note: "go, went" },
      { t: "**Did** you see the game?" },
    ],
    mistakes: [
      { bad: "I didn't went to work.", good: "I didn't go to work.", note: "After *didn't*, the plain verb." },
      { bad: "Yesterday I go to the bank.", good: "Yesterday I went to the bank.", note: "A finished time: the past form." },
      { bad: "Did you saw it?", good: "Did you see it?", note: "*Did* already shows the past." },
    ],
    checks: [
      { q: "She ___ me last week.", choices: ["calls", "called"], answer: 1, why: "*Last week*: the past." },
      { q: "Did you ___ the email?", choices: ["get", "got"], answer: 0, why: "After *did*, the plain verb." },
      { q: "We ___ pizza for dinner.", choices: ["eated", "ate"], answer: 1, why: "*Eat* is irregular: *ate*." },
      { q: "Listen. How does the ending of “stopped” sound?", say: "We stopped at the store.", choices: ["t", "d", "id (extra syllable)"], answer: 0, why: "After a p sound, -ed sounds like *t*." },
      { q: "Listen. How does the ending of “started” sound?", say: "She started a new job.", choices: ["t", "d", "id (extra syllable)"], answer: 2, why: "After a t sound, -ed is an extra syllable: *id*." },
    ],
    words: ["past", "irregular"],
  },

  {
    id: "future", level: "beginner", unit: "Verbs: now, then, next",
    title: "Talking about the future",
    key: "English has several ways to talk about the future: *going to* for plans, *will* for decisions and predictions, *-ing* for arrangements, and the present simple for timetables.",
    rule: [
      "**be going to** + verb: a plan you already have, or a prediction from what you can see: *I'm going to visit my aunt. Look at those clouds. It's going to rain.*",
      "**will** + verb: a decision you make as you speak, an offer or a promise, or a prediction: *I'll get the door. I'll help you. I think she'll like it.*",
      "**am, is, are** + verb-*ing*: an arrangement, usually with a time and other people: *I'm meeting Sam at six.*",
      "**Present simple** for timetables and schedules: *The train leaves at 6:15. The movie starts at eight.*",
      "In fast American speech, *going to* often sounds like *gonna*. Write *going to*.",
    ],
    compare: {
      head: ["Form", "Use it for", "Example"],
      rows: [
        ["going to", "a plan; a prediction from what you see", "We're **going to** buy a house."],
        ["will", "a decision now; an offer or promise; a prediction", "I**'ll** have the soup, please."],
        ["am / is / are + -ing", "an arrangement", "She's **flying** to Miami on Friday."],
        ["present simple", "a timetable or schedule", "Our flight **leaves** at noon tomorrow."],
      ],
    },
    examples: [
      { t: "**I'm going to** study tonight.", note: "a plan" },
      { t: "The phone's ringing. **I'll** get it.", note: "a decision now" },
      { t: "**We're having** a party on Saturday.", note: "an arrangement" },
      { t: "**It's going to** be hot tomorrow.", note: "a prediction" },
      { t: "**I won't** tell anyone.", note: "won't = will not: a promise" },
      { t: "The game **starts** at eight tonight.", note: "a schedule" },
    ],
    mistakes: [
      { bad: "I will to call you.", good: "I'll call you.", note: "After *will*, the plain verb, no *to*." },
      { bad: "I go to call you tomorrow.", good: "I'm going to call you tomorrow.", note: "A plan: *am going to*." },
      { bad: "Tomorrow I am go to the doctor.", good: "Tomorrow I'm going to the doctor.", note: "An arrangement: *am going*." },
    ],
    checks: [
      { q: "The phone is ringing. “OK, ___ answer it.”", choices: ["I'll", "I'm going to"], answer: 0, why: "A decision you make as you speak: *will*." },
      { q: "Which sentence is about a plan you already made?", choices: ["We're going to visit Japan in May. We booked the flights.", "It's raining? I'll drive you."], answer: 0, why: "A plan you already made: *going to*. *I'll drive you* is a decision made as you speak." },
      { q: "Which sentence is a prediction from what you can see?", choices: ["Look at that ladder! It's going to fall.", "I'll have a coffee, please."], answer: 0, why: "You can see it is about to happen: *going to*." },
      { q: "Listen. Is this an arrangement or a decision made now?", say: "I'm meeting my boss on Friday.", choices: ["an arrangement", "a decision made now"], answer: 0, why: "*I'm meeting* + a day: it is already arranged." },
      { q: "Hurry up! The concert ___ in ten minutes.", choices: ["start", "starts", "will to start"], answer: 1, why: "A schedule: the present simple, with *-s* after *the concert*." },
    ],
    words: ["future", "will"],
  },

  {
    id: "time-prepositions", level: "beginner", unit: "Time, place, comparing",
    title: "in / on / at for time",
    key: "Use *at* for a clock time, *on* for a day or a date, and *in* for longer periods. Use no preposition before *next, last, this* or *every*.",
    rule: [
      "Use **at** for an exact time (*at seven, at noon*) and in the phrase *at night*.",
      "Use **on** for a day or a date: *on Monday, on July 4th, on my birthday*.",
      "Use **in** for longer times: months, years, seasons and parts of the day: *in May, in 2024, in the summer, in the morning*. But use **on** for a particular day or part of a day: *on Monday morning, on a cold night*.",
      "**in** + an amount of time means that much time from now: *I'll be there in ten minutes.*",
      "Use no preposition before **next, last, this** and **every**: *See you next week.*",
    ],
    compare: {
      head: ["Word", "Used for", "Examples"],
      rows: [
        ["**at**", "clock times and a few set phrases", "at 7:30, at noon, at night"],
        ["**on**", "days and dates", "on Monday, on July 4th, on the weekend"],
        ["**in**", "months, years, seasons, parts of the day", "in May, in 2024, in the morning"],
      ],
    },
    examples: [
      { t: "The meeting starts **at** 9:00.", say: "The meeting starts at nine." },
      { t: "I was born **on** March 3rd.", say: "I was born on March third." },
      { t: "We moved here **in** 2019.", say: "We moved here in twenty nineteen." },
      { t: "She runs **in** the morning and reads **at** night." },
      { t: "Most stores are closed **on** Thanksgiving." },
    ],
    mistakes: [
      { bad: "I'll see you at next week.", good: "I'll see you next week.", note: "No preposition before *next, last, this, every*." },
      { bad: "We have class on the morning.", good: "We have class in the morning.", note: "Parts of the day: *in*. But a particular morning takes *on*: *on Monday morning*." },
      { bad: "I'll be there after ten minutes.", good: "I'll be there in ten minutes.", note: "*In* + an amount of time = that much time from now." },
      { bad: "My birthday is in May 3rd.", good: "My birthday is on May 3rd.", note: "A date: *on*.", sayBad: "My birthday is in May third.", sayGood: "My birthday is on May third." },
    ],
    note: "Americans say *on the weekend*. British English says *at the weekend*.",
    checks: [
      { q: "I'll call you ___ Friday.", choices: ["in", "on", "at"], answer: 1, why: "A day: *on*." },
      { q: "The train leaves ___ 6:15.", choices: ["in", "on", "at"], answer: 2, why: "A clock time: *at*." },
      { q: "It snows a lot here ___ January.", choices: ["in", "on", "at"], answer: 0, why: "A month: *in*." },
      { q: "We met ___ a cold night in December.", choices: ["in", "on", "at"], answer: 1, why: "A particular night: *on*." },
      { q: "Which is correct?", choices: ["See you next Tuesday.", "See you on next Tuesday."], answer: 0, why: "No preposition before *next*." },
      { q: "Listen. Which word do you hear?", say: "The class starts at eight.", choices: ["in", "on", "at"], answer: 2, why: "A clock time: *at eight*." },
    ],
    words: ["at", "on", "in"],
  },

  {
    id: "place-prepositions", level: "beginner", unit: "Time, place, comparing",
    title: "in / on / at for place, and movement",
    key: "Use *in* for inside, *on* for on top of or touching a surface (and for streets), *at* for a point or a place where you do something, and *to* for going toward a place.",
    rule: [
      "**in**: inside something or an area: *in the box, in the kitchen, in Chicago*.",
      "**on**: on a surface or a line: *on the table, on the wall, on the second floor, on Main Street*.",
      "**at**: a point, or a place where an activity happens: *at the door, at the bus stop, at work, at school, at 25 Oak Street*.",
      "For movement, use **to** (*go to work*) or **into** (*walk into the room*). With **home**, use no preposition: *go home, come home*.",
    ],
    compare: {
      head: ["in", "on", "at"],
      rows: [
        ["in the room", "on the floor", "at the door"],
        ["in New York", "on Fifth Avenue", "at 350 Fifth Avenue"],
        ["in the car, in a taxi", "on the bus, on the train", "at the bus stop"],
        ["in bed", "on the sofa", "at home"],
      ],
    },
    examples: [
      { t: "My keys are **in** my bag." },
      { t: "There's a picture **on** the wall." },
      { t: "I'll meet you **at** the entrance." },
      { t: "She lives **on** Elm Street.", note: "American English: on a street" },
      { t: "Let's go **home**.", note: "no to before home" },
      { t: "He got **on** the train." },
      { t: "The bank is **next to** the post office, **across from** the park.", note: "more place words: next to, across from, between, under" },
    ],
    mistakes: [
      { bad: "I'm in the bus.", good: "I'm on the bus.", note: "Buses, trains and planes: *on*. Cars and taxis: *in*." },
      { bad: "Let's go to home.", good: "Let's go home.", note: "No *to* before *home*." },
      { bad: "She arrived to the airport.", good: "She arrived at the airport.", note: "*Arrive at* a place, *arrive in* a city or country." },
    ],
    note: "Americans say *on Main Street*; British English often says *in Main Street*. In the US, the *first floor* is at street level; in Britain that is the *ground floor*.",
    checks: [
      { q: "The milk is ___ the fridge.", choices: ["in", "on", "at"], answer: 0, why: "Inside: *in*." },
      { q: "Wait for me ___ the bus stop.", choices: ["in", "on", "at"], answer: 2, why: "A point: *at*." },
      { q: "Our apartment is ___ the third floor.", choices: ["in", "on", "at"], answer: 1, why: "Floors: *on*." },
      { q: "I usually go ___ after work.", choices: ["home", "to home"], answer: 0, why: "No *to* before *home*." },
      { q: "Listen. Which word do you hear?", say: "I left my phone on the table.", choices: ["in", "on", "at"], answer: 1, why: "A surface: *on the table*." },
    ],
    words: ["into", "home"],
  },

  {
    id: "present-perfect", level: "intermediate", unit: "Time that connects",
    title: "Present perfect vs. past simple", tag: "A2–B1",
    key: "Use the past simple for a finished time (*yesterday, in 2019*). Use *have* or *has* + past participle when no finished time is given, or the past connects to now.",
    rule: [
      "**Past simple**: an action at a finished time that you say or that both people know: *I saw that movie last week.*",
      "Use the **present perfect** (*have* or *has* + past participle) for: (1) life experience: *I've seen that movie*; (2) a past action with a result now: *She's lost her keys*; (3) something that started in the past and is still true: *We've lived here for ten years.*",
      "Irregular verbs have a third form, the past participle: *see, saw, seen; go, went, gone; eat, ate, eaten; write, wrote, written*.",
      "Use **for** with a length of time (*for ten years*) and **since** with a starting point (*since 2015*).",
      "**already, just, yet**: *already* (sooner than expected) and *just* (a short time ago) usually go before the past participle: *I've already eaten. She's just left.* *Yet* goes at the end of questions and negatives: *Have you finished yet? I haven't called him yet.*",
      "**been to** or **gone to**? *Been to* = went and came back: *She's been to Japan twice.* *Gone to* = went and is still there: *She's gone to Japan; she's back in May.*",
    ],
    compare: {
      head: ["Past simple", "Present perfect"],
      rows: [
        ["a finished time", "no time given, or up to now"],
        ["I **lived** in Boston in 2015.", "I**'ve lived** in Boston since 2015."],
        ["She **went** to Japan last year.", "She**'s been** to Japan twice."],
        ["often with: yesterday, last week, in 2010, ago", "often with: ever, never, for, since, so far"],
      ],
    },
    examples: [
      { t: "**Have** you ever **been** to Mexico?", note: "life experience" },
      { t: "**I've never tried** sushi." },
      { t: "She **graduated** in 2021.", note: "a finished time", say: "She graduated in twenty twenty-one." },
      { t: "**We've known** each other **for** years.", note: "from the past until now" },
      { t: "**I've lost** my wallet. I can't pay.", note: "a result now" },
    ],
    mistakes: [
      { bad: "I have seen him yesterday.", good: "I saw him yesterday.", note: "*Yesterday* is a finished time." },
      { bad: "I live here since 2019.", good: "I've lived here since 2019.", note: "From the past until now: present perfect.", sayBad: "I live here since twenty nineteen.", sayGood: "I've lived here since twenty nineteen." },
      { bad: "She has wrote three books.", good: "She has written three books.", note: "After *have* or *has*, the past participle: *write, wrote, written*." },
      { bad: "We've been friends since three years.", good: "We've been friends for three years.", note: "*For* + a length of time." },
    ],
    note: "With *just, already* and *yet*, Americans often use the past simple: *Did you eat yet?* and *Have you eaten yet?* are both correct in American English.",
    checks: [
      { q: "I ___ to London in 2018.", choices: ["went", "have gone"], answer: 0, why: "*In 2018* is a finished time." },
      { q: "She ___ in this office since March.", choices: ["worked", "has worked"], answer: 1, why: "*Since*: from the past until now." },
      { q: "She has worked here ___ 2020.", choices: ["for", "since"], answer: 1, why: "A starting point: *since*." },
      { q: "They ___ married for 25 years, and they're still very happy.", choices: ["were", "have been"], answer: 1, why: "From the past until now." },
      { q: "Listen. What do you hear?", say: "She has finished her homework.", choices: ["She finished her homework.", "She has finished her homework."], answer: 1, why: "You hear *has* before *finished*: the present perfect." },
    ],
    words: ["experience", "since"],
  },

  {
    id: "set-prepositions", level: "intermediate", unit: "Verb patterns and prepositions",
    title: "Words that take a set preposition",
    key: "Many verbs and adjectives usually take the same preposition for a given meaning. Learn them as pairs, the way you learn a word.",
    rule: [
      "Some words go with one preposition, and the meaning doesn't tell you which one: *interested in, good at, depend on, listen to, afraid of*. Learn each pair as one unit.",
      "Some verbs take **no** preposition before their object: *discuss something, enter a room, marry someone, call someone*.",
      "After a preposition, use a noun or a verb + **-ing**: *I'm interested in learning Spanish.*",
    ],
    compare: {
      head: ["Word", "Preposition", "Example"],
      rows: [
        ["interested", "**in**", "She's interested in art."],
        ["good", "**at**", "He's good at math."],
        ["depend", "**on**", "It depends on the weather."],
        ["listen", "**to**", "Listen to me."],
        ["afraid", "**of**", "I'm afraid of dogs."],
        ["wait", "**for**", "We waited for the bus."],
        ["married", "**to**", "She's married to a doctor."],
        ["different", "**from** (US also *than*)", "This one is different from that one."],
      ],
    },
    examples: [
      { t: "I'm **good at** cooking." },
      { t: "**Listen to** this song." },
      { t: "It **depends on** the price." },
      { t: "She's **worried about** her exam." },
      { t: "**Thank you for** your help." },
    ],
    mistakes: [
      { bad: "We discussed about the plan.", good: "We discussed the plan.", note: "*Discuss* takes no preposition. (You can have *a discussion about* something.)" },
      { bad: "She is married with a doctor.", good: "She is married to a doctor.", note: "*Married to* someone." },
      { bad: "It depends of the weather.", good: "It depends on the weather.", note: "*Depend on*." },
      { bad: "Can you explain me this word?", good: "Can you explain this word to me?", note: "*Explain* something *to* someone." },
      { bad: "I'm waiting the bus.", good: "I'm waiting for the bus.", note: "*Wait for* someone or something." },
    ],
    myth: "Ending a sentence with a preposition is fine: *What are you afraid of? Who are you waiting for?* The “rule” against it is a myth.",
    note: "*Different from* and *different than* are both common in American English.",
    checks: [
      { q: "I'm not very good ___ sports.", choices: ["in", "at", "on"], answer: 1, why: "*Good at*." },
      { q: "Are you afraid ___ spiders?", choices: ["of", "from"], answer: 0, why: "*Afraid of*." },
      { q: "Let's discuss ___ your idea.", choices: ["about", "(nothing)"], answer: 1, why: "*Discuss* takes no preposition." },
      { q: "She's interested ___ history.", choices: ["in", "on", "for"], answer: 0, why: "*Interested in*." },
      { q: "Listen. Which word do you hear?", say: "We're waiting for the bus.", choices: ["to", "for", "on"], answer: 1, why: "*Wait for*: here *for* is short, almost “fer”." },
    ],
    words: ["preposition", "depend"],
  },
];

// The course in teaching order. The other lessons (course-b2.js, -i2, -i3, -i4,
// -a1, -a2, -a3) are written whole; course-extra.js adds questions to these.
const ORDER = [
  // beginner
  "parts-of-speech", "subject-verb", "pronouns", "reflexive-indefinite", "adjectives-adverbs",
  "plural-nouns", "count-noncount", "articles", "possessives-demonstratives", "there-is-it-is", "numbers-dates-time",
  "present-simple", "simple-continuous", "questions-negatives", "question-words", "imperatives", "past-simple", "future",
  "time-prepositions", "place-prepositions", "comparatives",
  "conjunctions-basic", "capitals-punctuation", "spelling-endings",
  // intermediate
  "present-perfect", "perfect-continuous", "past-continuous", "used-to", "tenses-overview",
  "word-jobs", "word-order", "ed-ing-adjectives", "quantifiers", "all-each-other",
  "modals-ability", "must-have-to", "deduction", "preferences",
  "set-prepositions", "gerund-infinitive", "verb-object-infinitive", "phrasal-verbs", "make-do",
  "subject-questions", "question-tags", "relative-clauses", "conditionals", "time-clauses", "purpose-result", "sentence-types",
  "word-building", "roots", "homophones", "sounds", "stress-intonation",
  "fragments-run-ons", "commas", "paragraphs",
  // advanced
  "past-conditionals", "modal-perfect", "past-perfect", "future-perfect", "narrative-tenses",
  "passive", "causative", "reported-speech", "indirect-questions", "noun-clauses",
  "articles-2", "agreement", "clear-reference", "nonrestrictive", "participle-clauses", "subjunctive", "ellipsis-substitution",
  "linking", "parallel", "hedging", "emphasis", "formal-informal", "concise-writing",
  "word-choice", "figurative-language",
  "punctuation-2", "essays-arguments", "summarizing",
];

const ALL = [
  ...BASE.map(l => {
    const m = MORE[l.id] || {};
    return { ...l, ...m, examples: [...l.examples, ...(m.examples || [])],
      checks: [...l.checks, ...(m.checks || []), ...(EXTRA[l.id] || [])] };
  }),
  ...B2, ...B3, ...I2, ...I3, ...I4, ...I5, ...I6, ...I7, ...I8, ...A1, ...A2, ...A3, ...A4, ...A5, ...A6,
];
const byId = new Map(ALL.map(l => [l.id, l]));
if (byId.size !== ORDER.length || ORDER.some(id => !byId.has(id))) throw new Error("course-lessons.js: ORDER and the lessons differ");
export const LESSONS = ORDER.map(id => byId.get(id));

/** Lessons still to be written, by level (none now). */
export const COMING = {};
