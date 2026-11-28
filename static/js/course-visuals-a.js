// Pictures for the advanced lessons (see course-visuals.js for the kinds).
export const VISUALS_A = {
  "past-conditionals": [
    { kind: "timeline", title: "Which time are you imagining?", caption: "The tense shows the time: past perfect for a different past, past simple for a different now.",
      rows: [
        { t: "If you **had told** me, I **would have helped**.", note: "past condition, past result: neither happened", points: [{ at: -2.2, label: "telling" }, { at: -1.2, label: "helping" }] },
        { t: "If I **had taken** that job, I**'d be** in Denver now.", note: "mixed: a past condition, a present result", span: [-2, 0], points: [{ at: -2, label: "the offer" }, { at: 0 }] },
        { t: "I wish I **hadn't said** that.", note: "a regret about the past", points: [{ at: -1.5 }] },
        { t: "I wish I **knew** the answer.", note: "a wish about now", points: [{ at: 0 }] },
      ] },
    { kind: "flow", title: "Which *wish*?", caption: "One step back in tense: past simple for now, past perfect for the past.",
      steps: [
        { q: "Is it a regret about the past?", yes: "*wish* + past perfect", ex: "I wish I **had saved** more money." },
        { q: "Do you want someone else to change what they do?", yes: "*wish* + *would*", ex: "I wish you **would call** more often." },
      ],
      else: "*wish* + past simple or *were*", elseEx: "I wish I **had** more free time. I wish it **were** Friday." },
  ],

  "modal-perfect": [
    { kind: "scale", title: "How sure are you that it happened?", from: "almost sure it didn't", to: "almost sure it did",
      caption: "The positions are a rough guide. All three look back at the past with *have* + past participle.",
      items: [
        { at: 8, label: "She **can't have seen** us.", ex: "*can't have* / *couldn't have*" },
        { at: 50, label: "They **might have gotten** lost.", ex: "*might have* / *may have* / *could have*" },
        { at: 92, label: "He **must have missed** the bus.", ex: "*must have*" },
      ] },
    { kind: "tiles", title: "Guess, regret or missed chance?", caption: "*Could have* can be a guess (maybe it happened) or a missed chance (it was possible, but it didn't happen).",
      items: [
        { head: "a guess about the past", words: ["must have", "might have", "may have", "can't have"], sub: "The lights are off. They **must have gone** out." },
        { head: "a regret or criticism", words: ["should have", "shouldn't have"], sub: "You **should have told** me." },
        { head: "possible, but it didn't happen", words: ["could have"], sub: "We **could have taken** the train, but we drove." },
      ] },
  ],

  "past-perfect": [
    { kind: "timeline", title: "*had started* or *started*?", caption: "The past perfect points to the earlier of two past events.",
      rows: [
        { t: "When I arrived, the movie **had started**.", note: "the movie started first", points: [{ at: -2.2, label: "movie" }, { at: -1, label: "I arrive" }] },
        { t: "When I arrived, the movie **started**.", note: "I arrived first", points: [{ at: -2.2, label: "I arrive" }, { at: -1, label: "movie" }] },
        { t: "I **had never seen** snow before that winter.", note: "all the time up to a past point", span: [-3, -1], points: [{ at: -1, label: "that winter" }] },
      ] },
  ],

  "future-perfect": [
    { kind: "timeline", title: "Finished by then, or still going?", caption: "*will have done* is finished before the future point; *will be doing* is in the middle of it.",
      rows: [
        { t: "By Friday, I**'ll have finished** the report.", note: "done before the deadline", span: [0.2, 1.4], points: [{ at: 2, label: "Friday" }] },
        { t: "At eight tonight, I**'ll be driving** home.", note: "in progress at that moment", span: [0.5, 1.5], points: [{ at: 1, label: "8 p.m." }] },
        { t: "By June, I**'ll have been working** here for a year.", note: "how long, up to a future point", span: [-1.5, 2], points: [{ at: 2, label: "June" }] },
      ] },
  ],

  "passive": [
    { kind: "flow", title: "Active or passive?", caption: "Most passive sentences have no *by* phrase at all.",
      steps: [
        { q: "Is the doer unknown, obvious or unimportant?", yes: "passive, no *by*", ex: "My bike **was stolen**." },
        { q: "Is the thing done your topic, and the doer new information?", yes: "passive + *by*", ex: "This song? It **was written by** my aunt." },
      ],
      else: "active", elseEx: "My aunt **wrote** a song." },
    { kind: "formula", title: "*be* carries the tense", caption: "The past participle never changes; only *be* moves.",
      lines: [
        { name: "present", parts: ["am / is / are", "+", "past participle"], ex: "The rooms **are cleaned** daily." },
        { name: "past", parts: ["was / were", "+", "past participle"], ex: "The bridge **was built** in 1931." },
        { name: "in progress", parts: ["is being", "+", "past participle"], ex: "The road **is being fixed**." },
        { name: "perfect", parts: ["has been", "+", "past participle"], ex: "The house **has been sold**." },
        { name: "modal", parts: ["will be / can be", "+", "past participle"], ex: "The winner **will be announced** soon." },
      ] },
  ],

  "causative": [
    { kind: "strip", title: "Someone else does the job", caption: "The thing comes before the past participle: *I had my hair cut* means someone else cut it.",
      slots: [
        { label: "subject", sub: "I, we" }, { label: "have / get", sub: "any tense" }, { label: "the thing", sub: "my hair" },
        { label: "past participle", sub: "cut" }, { label: "when", sub: "yesterday" },
      ],
      sentences: [
        [["I ", 0], ["had ", 1], ["my hair ", 2], ["cut ", 3], ["yesterday.", 4]],
        [["We", 0], ["'re having ", 1], ["the kitchen ", 2], ["painted ", 3], ["next week.", 4]],
        [["I ", 0], ["need to get ", 1], ["my eyes ", 2], ["checked.", 3]],
      ] },
    { kind: "formula", title: "Reporting what people believe", caption: "News style: *said, believed, thought, reported* all work the same way.",
      lines: [
        { name: "start with *it*", parts: ["It is said", "+", "that", "+", "clause"], ex: "**It is said that** she is a brilliant cook." },
        { name: "start with the person", parts: ["subject", "+", "is said", "+", "to + verb"], ex: "She **is said to be** a brilliant cook." },
        { name: "about the past", parts: ["subject", "+", "is thought", "+", "to have + past participle"], ex: "The castle **is thought to have been built** in the 1100s." },
      ] },
  ],

  "reported-speech": [
    { kind: "flow", title: "Do I move the verb back?", caption: "When in doubt after *said*, one step back is the safe choice.",
      steps: [
        { q: "Is the reporting verb in the present (*says*)?", yes: "no change", ex: "She says she**'s** tired." },
        { q: "Is it still true, or still ahead?", yes: "backshift is optional", ex: "He said he**'s** moving to Denver in May." },
      ],
      else: "one step back", elseEx: "“I'm busy.” → She said she **was** busy." },
    { kind: "tiles", title: "*say* or *tell*?", caption: "*Tell* needs a person after it; *say* doesn't.",
      items: [
        { head: "*tell* + a person", words: ["told me", "told us to wait", "told her that…"] },
        { head: "*say* + the words", words: ["said that…", "said hello", "said to me"] },
        { head: "*tell* with no person", sub: "fixed phrases", words: ["tell a story", "tell a joke", "tell the truth", "tell a lie"] },
      ] },
  ],

  "indirect-questions": [
    { kind: "strip", title: "Subject first, then the verb", caption: "After the opening, it's statement order: no *do*, no *does*, no *did*.",
      slots: [
        { label: "opening", sub: "Do you know" }, { label: "question word or *if*", sub: "where, if" },
        { label: "subject", sub: "the station" }, { label: "verb", sub: "is" }, { label: "the rest", sub: "open" },
      ],
      sentences: [
        [["Could you tell me ", 0], ["where ", 1], ["the station ", 2], ["is", 3], ["?", null]],
        [["Do you know ", 0], ["what time ", 1], ["the bank ", 2], ["opens", 3], ["?", null]],
        [["I wonder ", 0], ["if ", 1], ["the pool ", 2], ["is ", 3], ["open.", 4]],
      ] },
  ],

  "articles-2": [
    { kind: "flow", title: "*the* with a place name?", caption: "Stop at the first *yes*. Most cities, states, lakes, single mountains and streets need no article.",
      steps: [
        { q: "Is the name plural?", yes: "*the*", ex: "**the** Alps, **the** Great Lakes, **the** Philippines" },
        { q: "Is it a river, ocean, sea or desert?", yes: "*the*", ex: "**the** Mississippi, **the** Pacific, **the** Sahara" },
        { q: "Does it have *of*, *Republic*, *Kingdom* or *States* in it?", yes: "*the*", ex: "**the** United States, **the** Gulf of Mexico" },
      ],
      else: "no article", elseEx: "Japan, Texas, Chicago, Lake Tahoe, Mount Rainier, Main Street" },
    { kind: "tiles", title: "Three ways to talk about a whole class", caption: "In everyday speech, the plural with no article is the safe choice.",
      items: [
        { big: "Dolphins", head: "plural, no article", sub: "the usual way: *Dolphins are smart.*" },
        { big: "A dolphin", head: "any one typical member", sub: "for definitions: *A dolphin is a mammal.*" },
        { big: "The dolphin", head: "the whole class", sub: "formal or scientific: *The dolphin is a social animal.*" },
      ] },
  ],

  "agreement": [
    { kind: "strip", title: "The verb skips the *of* phrase", caption: "Cover the phrase in the middle; the verb agrees with what's left.",
      slots: [{ label: "real subject" }, { label: "extra phrase", sub: "covers it up" }, { label: "verb" }, { label: "the rest" }],
      sentences: [
        [["The list ", 0], ["of names ", 1], ["is ", 2], ["long.", 3]],
        [["One ", 0], ["of my friends ", 1], ["lives ", 2], ["in Rome.", 3]],
        [["The quality ", 0], ["of the photos ", 1], ["is ", 2], ["excellent.", 3]],
      ] },
    { kind: "tiles", title: "Singular or plural verb?", caption: "Look at the meaning, not the last letter: *the news* is one thing.",
      items: [
        { head: "singular verb", words: ["each, every, everyone", "the number of", "the news", "physics", "ten dollars", "the team (US)"] },
        { head: "plural verb", words: ["a number of", "the police", "singular *they*"] },
        { head: "the nearer noun decides", words: ["either … or", "neither … nor"], sub: "Neither Ana nor her sisters **were** home." },
      ] },
  ],

  "nonrestrictive": [
    { kind: "tiles", title: "Two commas change the meaning", caption: "No commas: the clause picks out *which ones*. Commas: it's extra.",
      items: [
        { big: "some", head: "The students who passed got a certificate.", sub: "only the ones who passed" },
        { big: "all", head: "The students, who passed, got a certificate.", sub: "every student passed" },
        { big: "2+ sisters", head: "My sister who lives in Ohio is a nurse.", sub: "the one in Ohio, not another" },
        { big: "1 sister", head: "My sister, who lives in Ohio, is a nurse.", sub: "my only sister" },
      ] },
    { kind: "flow", title: "Commas or not?", caption: "With commas, never *that*, and never drop the pronoun.",
      steps: [
        { q: "Does it comment on the whole idea before it?", yes: "comma + *which*", ex: "She finished early, **which** surprised everyone." },
        { q: "Can you remove it and still know who or what?", yes: "commas: *who*, *which*, *whose*, *where*", ex: "My mother, **who** is a nurse, works nights." },
      ],
      else: "no commas: *who*, *that*, *which*", elseEx: "The car **that** I bought is blue." },
  ],

  "participle-clauses": [
    { kind: "formula", title: "Three participle openings", caption: "The subject after the comma does the action, or has it done.",
      lines: [
        { name: "same time or reason", parts: ["-ing…", "+", "main clause"], ex: "**Feeling** sick, she stayed home." },
        { name: "one action first", parts: ["having + past participle…", "+", "main clause"], ex: "**Having finished** the report, he went home." },
        { name: "passive", parts: ["past participle…", "+", "main clause"], ex: "**Built** in 1890, the house needs repairs." },
      ] },
    { kind: "tiles", title: "Who is walking?", caption: "If the main subject can't do the action, the participle dangles. Change the subject or use a full clause.",
      items: [
        { big: "✗", head: "Walking home, the rain started.", sub: "says the rain was walking" },
        { big: "✓", head: "Walking home, I got caught in the rain.", sub: "I was walking" },
        { big: "✓", head: "While I was walking home, it started to rain.", sub: "a full clause with its own subject" },
      ] },
  ],

  "linking": [
    { kind: "formula", title: "Same contrast, four shapes", caption: "Watch the punctuation: *however* needs a period or a semicolon before it.",
      lines: [
        { name: "conjunction", parts: ["clause", ", but", "clause"], ex: "It was cold, **but** we swam." },
        { name: "linking adverb", parts: ["Clause.", "However,", "clause"], ex: "It was cold. **However**, we swam." },
        { name: "subordinator", parts: ["Although", "clause,", "clause"], ex: "**Although** it was cold, we swam." },
        { name: "preposition", parts: ["Despite", "noun or -ing,", "clause"], ex: "**Despite** the cold, we swam." },
      ] },
    { kind: "flow", title: "Which contrast word?", caption: "Use one connector per contrast: not *Although…, but…*",
      steps: [
        { q: "Is a noun or an *-ing* form next, not a clause?", yes: "*despite* / *in spite of*", ex: "**Despite** the rain, we went out." },
        { q: "Does it come before the first of the two ideas?", yes: "*although* / *even though*", ex: "**Although** it was late, we kept working." },
        { q: "Does it start a second sentence, after a period?", yes: "*however*", ex: "The hotel was nice. **However**, it was loud." },
      ],
      else: "*but* between the clauses", elseEx: "The hotel was nice, **but** it was loud." },
  ],

  "parallel": [
    { kind: "formula", title: "Match the forms on each side", caption: "Whatever comes after the first part, the same kind of word comes after the next.",
      lines: [
        { name: "a list", parts: [["-ing", 0], "+", ["-ing", 0], "+", ["and -ing", 0]], ex: "She likes **hiking**, **swimming** and **cycling**." },
        { name: "*to* once, or every time", parts: [["to + verb", 0], "+", ["verb", 0], "+", ["and verb", 0]], ex: "We need **to plan**, **write** and **edit**." },
        { name: "paired words", parts: [["both / either / not only", 2], "+", ["X", 1], "+", ["and / or / but also", 2], "+", ["X", 1]], ex: "She is **both** smart **and** talented." },
        { name: "comparison", parts: [["-ing", 0], "+", ["than", 2], "+", ["-ing", 0]], ex: "**Walking** is healthier than **driving**." },
      ] },
  ],

  "hedging": [
    { kind: "bars", title: "How strong is the claim?", caption: "A rough guide. One hedge is usually enough; more sounds unsure of your own work.",
      items: [
        { label: "This **proves** the drug works.", value: 100, show: "certain" },
        { label: "It **is likely that** the drug works.", value: 75, show: "probably" },
        { label: "The results **suggest** it **may** work.", value: 50, show: "careful" },
        { label: "It **might possibly perhaps** work.", value: 20, show: "too many hedges" },
      ] },
    { kind: "scale", title: "From direct to very polite", from: "direct", to: "very polite",
      caption: "More distance (past forms, *-ing*, *would*) sounds more polite. Save the longest for big favors.",
      items: [
        { at: 5, label: "Send me the file.", ex: "an order" },
        { at: 30, label: "Can you send me the file?", ex: "fine with friends" },
        { at: 55, label: "Could you send me the file?", ex: "a colleague" },
        { at: 76, label: "Would you mind sending me the file?", ex: "a little more careful" },
        { at: 96, label: "I was wondering if you could send me the file.", ex: "a big favor" },
      ] },
  ],

  "emphasis": [
    { kind: "formula", title: "Frames that put one part in focus", caption: "The focus goes where the stress falls in speech.",
      lines: [
        { name: "it-cleft", parts: ["It + be", "+", "focus", "+", "who / that", "+", "the rest"], ex: "**It was Ana who** planned the party." },
        { name: "what-cleft", parts: ["What + clause", "+", "be", "+", "focus"], ex: "**What I need is** more time." },
        { name: "emphatic *do*", parts: ["do / does / did", "+", "base verb"], ex: "I **did** lock the door!" },
      ] },
    { kind: "strip", title: "Formal inversion: question order after a negative", caption: "Formal and written. In speech, say *I've never seen such a crowd.*",
      slots: [
        { label: "negative word", sub: "never, rarely" }, { label: "helper", sub: "have, does, did" },
        { label: "subject" }, { label: "main verb" }, { label: "the rest" },
      ],
      sentences: [
        [["Never ", 0], ["have ", 1], ["I ", 2], ["seen ", 3], ["such a crowd.", 4]],
        [["Rarely ", 0], ["does ", 1], ["she ", 2], ["complain", 3], [".", null]],
        [["Not only ", 0], ["did ", 1], ["he ", 2], ["apologize", 3], [", but he also paid.", null]],
      ] },
  ],
};
