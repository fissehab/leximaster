// Pictures for the intermediate lessons (see course-visuals.js for the kinds).
export const VISUALS_I = {
  "perfect-continuous": [
    { kind: "timeline", title: "Still going, just stopped, or counted?", caption: "*have been* + *-ing* is about the activity and how long. Counting finished things takes *have* + past participle.",
      rows: [
        { t: "I**'ve been waiting** for an hour.", note: "started in the past, still going", span: [-1.2, 0], open: true },
        { t: "You're out of breath. **Have you been running**?", note: "just stopped, and you can see the signs", span: [-1.4, -0.2], points: [{ at: 0, label: "signs" }] },
        { t: "I**'ve written** three emails.", note: "present perfect simple: how many finished", points: [{ at: -1.8 }, { at: -1.1 }, { at: -0.4 }] },
      ] },
    { kind: "flow", title: "*I've been writing* or *I've written*?", caption: "Stop at the first *yes*.",
      steps: [
        { q: "Is it about the result: finished, or how many?", yes: "present perfect simple", ex: "I**'ve written** six pages." },
        { q: "Is it a state verb, like *know*, *own* or *believe*?", yes: "present perfect simple", ex: "I**'ve known** her for years." },
      ],
      else: "present perfect continuous", elseEx: "I**'ve been writing** all afternoon." },
  ],

  "past-continuous": [
    { kind: "timeline", title: "The scene and what happens in it", caption: "The past continuous is already playing; the past simple is the event that happens.",
      rows: [
        { t: "I **was cooking** when the phone **rang**.", note: "a longer action, cut by a short event", span: [-2.6, -0.8], points: [{ at: -1.6, label: "rang" }] },
        { t: "When I **arrived**, they **were eating**.", note: "they started before I arrived", span: [-2.6, -1], points: [{ at: -1.8, label: "arrived" }] },
        { t: "When I **arrived**, they **ate**.", note: "they started after I arrived", span: [-1.6, -0.8], points: [{ at: -2.2, label: "arrived" }] },
        { t: "She **got up**, **took** a shower and **left**.", note: "events in a row: all past simple", points: [{ at: -2.4 }, { at: -1.7 }, { at: -1 }] },
      ] },
  ],

  "used-to": [
    { kind: "timeline", title: "*used to*: true then, not now", caption: "*used to* + verb always points to a past that has ended.",
      rows: [
        { t: "I **used to live** in Miami.", note: "a past state", span: [-3, -1.2] },
        { t: "We **used to** (or **would**) swim every summer.", note: "a past habit, repeated", span: [-3, -1.2], repeat: true },
        { t: "Now I **live** in Chicago.", note: "the present is different", span: [-1.2, 0], open: true },
      ] },
    { kind: "flow", title: "*used to*, *be used to* or *get used to*?", caption: "Only *used to* takes a base verb; the other two take a noun or verb-*ing*.",
      steps: [
        { q: "Is it a past habit or state that isn't true now?", yes: "*used to* + verb", ex: "I **used to** drink coffee." },
        { q: "Is it still new, but getting easier?", yes: "*get used to* + noun / *-ing*", ex: "I**'m getting used to** the cold." },
      ],
      else: "*be used to* + noun / *-ing*: it feels normal", elseEx: "I**'m used to** getting up early." },
  ],

  "word-jobs": [
    { kind: "tiles", title: "The stress shows the job", caption: "In many two-syllable pairs, the stress tells you the job. Some pairs keep the same stress.",
      items: [
        { big: "PREsent", head: "noun: stress on the first syllable", words: ["REcord", "INcrease", "OBject", "PERmit", "CONflict"] },
        { big: "preSENT", head: "verb: stress on the second syllable", words: ["reCORD", "inCREASE", "obJECT", "perMIT", "conFLICT"] },
        { big: "rePLY", head: "no change: same stress for both", words: ["control", "respect", "answer", "promise"] },
      ] },
    { kind: "flow", title: "Noun or verb?", caption: "The word just before it usually gives the job away.",
      steps: [
        { q: "Is there *a*, *the*, *my* or *your* just before it?", yes: "a noun", ex: "Give me **a call**. She set **a record**." },
        { q: "Is there *will*, *can*, a subject or *to* (as in *want to*) just before it?", yes: "a verb", ex: "I'll **call** you. They **record** at night." },
      ],
      else: "look at the whole sentence", elseEx: "Prices **increase** every year. (an action: a verb)" },
  ],

  "ed-ing-adjectives": [
    { kind: "tiles", title: "Does it feel, or make someone feel?", caption: "Things and situations usually take *-ing*. People can take both, but the meaning changes.",
      items: [
        { big: "-ing", head: "the cause: it makes you feel", words: ["a boring movie", "surprising news", "a tiring trip"] },
        { big: "-ed", head: "the feeling: you feel it", words: ["bored viewers", "surprised readers", "tired travelers"] },
        { big: "both", head: "people: careful!", words: ["He's bored. (he feels it)", "He's boring. (we feel it)"] },
      ] },
  ],

  "quantifiers": [
    { kind: "scale", title: "From nothing to a lot", from: "nothing", to: "a lot", caption: "A rough order, not exact amounts. *a few* feels like enough; *few* feels like not enough.",
      items: [
        { at: 2, label: "no books, no money", ex: "There's no milk." },
        { at: 22, label: "few books, little money", ex: "not enough: Few people came." },
        { at: 44, label: "a few books, a little money", ex: "a small amount, but enough" },
        { at: 64, label: "some books, some money", ex: "I bought some apples." },
        { at: 92, label: "a lot of books, a lot of money", ex: "We have a lot of time." },
      ] },
    { kind: "flow", title: "*some* or *any*?", caption: "*some* is the “yes” word; *any* is the “no or not sure” word.",
      steps: [
        { q: "Does it mean “it doesn't matter which”?", yes: "*any*", ex: "Take **any** seat you like." },
        { q: "Is the sentence negative?", yes: "*any*", ex: "I didn't buy **any** bread." },
        { q: "Is it an offer or a request, expecting *yes*?", yes: "*some*", ex: "Would you like **some** tea?" },
        { q: "Is it another kind of question?", yes: "*any*", ex: "Do you have **any** questions?" },
      ],
      else: "*some*", elseEx: "We need **some** eggs." },
  ],

  "modals-ability": [
    { kind: "flow", title: "*can*, *could* or *be able to*?", caption: "When *can* doesn't fit the grammar, *be able to* takes its place.",
      steps: [
        { q: "Does it come after *will*, *to* or *have*?", yes: "*be able to*", ex: "I**'ll be able to** help tomorrow." },
        { q: "Is it one success, one time, in the past?", yes: "*was able to* / *managed to*", ex: "We **managed to** find a taxi." },
        { q: "Is it a general ability in the past?", yes: "*could*", ex: "She **could** read when she was four." },
      ],
      else: "*can*", elseEx: "He **can** play the piano." },
    { kind: "scale", title: "Asking someone to do something", from: "casual", to: "very polite", caption: "Positions are a rough guide. Answer *Would you mind…?* with *No, not at all* or *Sure*.",
      items: [
        { at: 10, label: "Can you pass the salt?", ex: "friends and family" },
        { at: 52, label: "Could you / Would you send me the file?", ex: "coworkers, people you don't know well" },
        { at: 90, label: "Would you mind closing the door?", ex: "*mind* + *-ing*: very polite" },
      ] },
  ],

  "must-have-to": [
    { kind: "scale", title: "From “don't” to “you must”", from: "not allowed", to: "necessary", caption: "A rough guide. *don't have to* sits in the middle: it's your choice, not a ban.",
      items: [
        { at: 3, label: "You must not / can't park here.", ex: "it isn't allowed" },
        { at: 25, label: "You shouldn't stay up so late.", ex: "a bad idea" },
        { at: 50, label: "You don't have to bring anything.", ex: "not necessary: you choose" },
        { at: 72, label: "You should try the soup.", ex: "advice: a good idea" },
        { at: 84, label: "You'd better hurry.", ex: "strong advice, or there's a problem" },
        { at: 98, label: "You have to / must wear a seat belt.", ex: "necessary" },
      ] },
    { kind: "timeline", title: "*must* has no past or future", caption: "*have to* works at every time, so use it for the past and the future.",
      rows: [
        { t: "I **had to** wait an hour.", note: "past", points: [{ at: -1.8, label: "yesterday" }] },
        { t: "I **have to** / **must** leave now.", note: "now", points: [{ at: 0 }] },
        { t: "You**'ll have to** show your ID.", note: "future", points: [{ at: 1.8, label: "tomorrow" }] },
      ] },
  ],

  "set-prepositions": [
    { kind: "tiles", title: "Learn the word with its preposition", caption: "The meaning won't tell you the preposition, so learn each pair as one unit.",
      items: [
        { big: "in", head: "interested in", words: ["believe in", "succeed in"] },
        { big: "at", head: "good at", words: ["bad at", "surprised at"] },
        { big: "on", head: "depend on", words: ["rely on", "count on"] },
        { big: "to", head: "listen to", words: ["belong to", "married to"] },
        { big: "of", head: "afraid of", words: ["proud of", "tired of"] },
        { big: "for", head: "wait for", words: ["look for", "pay for"] },
      ] },
    { kind: "formula", title: "What comes after the preposition?", caption: "A verb after a preposition takes *-ing*. And some verbs take no preposition at all.",
      lines: [
        { name: "word + preposition", parts: ["interested in", "+", "noun or verb-*ing*"], ex: "I'm interested in **learning** Spanish." },
        { name: "no preposition", parts: ["discuss, enter, marry, call", "+", "object"], ex: "We **discussed the plan**. She **married** a doctor." },
      ] },
  ],

  "gerund-infinitive": [
    { kind: "timeline", title: "Same verb, different meaning", caption: "*remember doing* looks back at a memory; *remember to do* looks ahead to a task.",
      rows: [
        { t: "I **remember locking** the door.", note: "a memory: the locking came first", points: [{ at: -1.8, label: "lock" }, { at: 0, label: "remember" }] },
        { t: "**Remember to lock** the door.", note: "a task: the locking comes later", points: [{ at: 0, label: "remember" }, { at: 1.6, label: "lock" }] },
        { t: "He **stopped smoking**.", note: "quit the action", span: [-3, -1.2], points: [{ at: -1.2, label: "stop" }] },
        { t: "He **stopped to rest**.", note: "stopped walking, in order to rest", span: [-2.8, -1.6], points: [{ at: -1.6, label: "stop" }, { at: -0.8, label: "rest" }] },
      ] },
  ],

  "phrasal-verbs": [
    { kind: "strip", title: "Where does the object go?", caption: "A noun can go in the middle or after. A pronoun goes in the middle: *turn it off*.",
      slots: [
        { label: "verb", sub: "turn" }, { label: "object in the middle", sub: "the TV or it" },
        { label: "particle", sub: "off" }, { label: "object after", sub: "the TV, never it" },
      ],
      sentences: [
        [["Turn ", 0], ["the TV ", 1], ["off.", 2]],
        [["Turn ", 0], ["off ", 2], ["the TV.", 3]],
        [["Turn ", 0], ["it ", 1], ["off.", 2]],
      ] },
    { kind: "flow", title: "Where does *it* go?", caption: "A learner's dictionary shows the pattern: *turn something off* vs. *look after someone*.",
      steps: [
        { q: "Is it a three-word verb, like *run out of*?", yes: "after all three words", ex: "We ran out of **it**." },
        { q: "Is it separable, like *turn something off*?", yes: "in the middle", ex: "Turn **it** off." },
      ],
      else: "after the whole verb", elseEx: "I'll look after **her**." },
  ],

  "make-do": [
    { kind: "flow", title: "*make* or *do*?", caption: "Fixed pairs break the pattern: *make the bed* is a chore, but it takes *make*. So check the pairs you know first.",
      steps: [
        { q: "Is it a fixed pair you've learned (*make the bed, make a decision, do your best, do someone a favor*)?", yes: "use the pair", ex: "**make** the bed, **do** me a favor" },
        { q: "Are you creating something: food, a list, a noise?", yes: "*make*", ex: "**make** dinner, **make** a plan" },
        { q: "Is it a task, a chore or a job?", yes: "*do*", ex: "**do** the dishes, **do** your homework" },
      ],
      else: "*do*: an activity you don't name", elseEx: "What are you **doing**?" },
    { kind: "tiles", title: "Fixed pairs to learn by heart", caption: "These follow no clear rule. Learn the whole phrase.",
      items: [
        { big: "make", head: "goes with", words: ["a decision", "a mistake", "a phone call", "friends", "money", "the bed"] },
        { big: "do", head: "goes with", words: ["your best", "someone a favor", "business", "research", "your taxes"] },
      ] },
  ],

  "subject-questions": [
    { kind: "strip", title: "*Who* takes the place of the word it asks about", caption: "When *who* replaces the subject, the order stays the same and there's no *do*.",
      slots: [
        { label: "subject", sub: "Ana" }, { label: "*did* / *does*", sub: "only for the object" },
        { label: "verb", sub: "called" }, { label: "object", sub: "Sam" },
      ],
      sentences: [
        [["Ana ", 0], ["called ", 2], ["Sam.", 3]],
        [["Who ", 0], ["called ", 2], ["Sam?", 3], ["  (Ana)", null]],
        [["Who ", 3], ["did ", 1], ["Ana ", 0], ["call?", 2], ["  (Sam)", null]],
      ] },
    { kind: "formula", title: "Two question patterns", caption: "Answer it in your head: *Who called? → Ana called.* No *do* needed.",
      lines: [
        { name: "Asking about the subject", parts: ["*Who* / *What*", "+", "verb", "+", "the rest"], ex: "**What happened**? **Who wants** coffee?" },
        { name: "Asking about the object", parts: ["*Who* / *What*", "+", "*did* / *does*", "+", "subject", "+", "base verb"], ex: "**Who did** you **call**? **What does** she **want**?" },
      ] },
  ],

  "relative-clauses": [
    { kind: "strip", title: "The clause tells you which one", caption: "No commas: the clause is part of the description.",
      slots: [
        { label: "the noun", sub: "the woman" }, { label: "the link", sub: "who, that, which" },
        { label: "the clause", sub: "which one?" }, { label: "the rest", sub: "the main sentence" },
      ],
      sentences: [
        [["The woman ", 0], ["who ", 1], ["lives next door ", 2], ["is a nurse.", 3]],
        [["The book ", 0], ["(that) ", 1], ["I lent you ", 2], ["is really good.", 3]],
      ] },
    { kind: "flow", title: "Can I leave out *who* or *that*?", caption: "Look at the next word: a subject means you can drop it; a verb means keep it.",
      steps: [
        { q: "Is it *whose* or *where*?", yes: "keep it", ex: "the man **whose** car broke down" },
        { q: "Does a verb come right after it?", yes: "keep it: it's the subject", ex: "the car **that broke** down" },
      ],
      else: "you can leave it out", elseEx: "the car (that) **she drives**" },
  ],
};
