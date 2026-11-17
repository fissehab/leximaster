// Pictures for the beginner lessons (see course-visuals.js for the kinds).
export const VISUALS_B = {
  "parts-of-speech": [
    { kind: "strip", title: "Each word in a sentence has a job", caption: "Many simple sentences follow this pattern: a noun, then a verb.",
      slots: [
        { label: "adjective", sub: "describes the noun" }, { label: "noun", sub: "who or what" },
        { label: "verb", sub: "what happens" }, { label: "adverb", sub: "how, when, where" },
      ],
      sentences: [
        [["The ", null], ["little ", 0], ["girl ", 1], ["sings ", 2], ["happily", 3], [".", null]],
        [["My ", null], ["old ", 0], ["car ", 1], ["runs ", 2], ["slowly", 3], [".", null]],
      ] },
    { kind: "tiles", title: "One word, two jobs", caption: "Look at what the word does in the sentence, not only at the word.",
      items: [
        { big: "fast", head: "adjective or adverb", words: ["a **fast** car", "She drives **fast**."] },
        { big: "work", head: "noun or verb", words: ["I love my **work**.", "I **work** at home."] },
        { big: "late", head: "adjective or adverb", words: ["a **late** lunch", "He came **late**."] },
      ] },
  ],

  "subject-verb": [
    { kind: "formula", title: "Every sentence needs a subject and a verb", caption: "No real subject? English still puts *it* or *there* in that place.",
      lines: [
        { name: "The basic pattern", parts: ["subject", "+", "verb"], ex: "She works. The bus is late." },
        { name: "Describing: don't forget *be*", parts: ["subject", "+", "be", "+", "adjective"], ex: "My brother **is** tall." },
        { name: "Weather and time", parts: ["it", "+", "verb"], ex: "**It** is raining. **It**'s five o'clock." },
        { name: "Something exists", parts: ["there", "+", "is / are"], ex: "**There are** many people here." },
      ] },
  ],

  "pronouns": [
    { kind: "strip", title: "The place in the sentence picks the word", caption: "Before the verb: *I, he, she, we, they*. After it: *me, him, her, us, them*.",
      slots: [
        { label: "subject", sub: "I, she, they" }, { label: "verb" }, { label: "object", sub: "me, her, them" },
      ],
      sentences: [
        [["She ", 0], ["called ", 1], ["me", 2], [".", null]],
        [["I ", 0], ["called ", 1], ["her", 2], [".", null]],
        [["They ", 0], ["helped ", 1], ["us", 2], [".", null]],
      ] },
    { kind: "tiles", title: "*he*, *she*, *it* or *they*?",
      items: [
        { big: "he", head: "a man or a boy", words: ["my dad", "Tom"] },
        { big: "she", head: "a woman or a girl", words: ["my mom", "Maria"] },
        { big: "it", head: "a thing or an animal", words: ["the phone", "a bird"] },
        { big: "they", head: "two or more, or one unknown person", words: ["my friends", "someone"] },
      ] },
  ],

  "adjectives-adverbs": [
    { kind: "flow", title: "Adjective or adverb?", caption: "Ask the questions in order and stop at the first *yes*.",
      steps: [
        { q: "Does it go right before a noun?", yes: "adjective", ex: "a **careful** driver" },
        { q: "Does it follow *be, look, feel, seem* or *taste* and describe the subject?", yes: "adjective", ex: "The soup tastes **good**." },
      ],
      else: "adverb: it tells how, when, where or how much", elseEx: "She drives **carefully**. It's **very** cold." },
    { kind: "tiles", title: "Not every *-ly* word is an adverb", caption: "Many adverbs end in *-ly*, but learn these few by heart.",
      items: [
        { head: "adjective + *-ly* = adverb", words: ["quickly", "carefully", "slowly"] },
        { head: "adverbs with no *-ly*", words: ["fast", "hard", "late", "well", "often"] },
        { head: "adjectives that end in *-ly*", words: ["friendly", "lovely"] },
      ] },
  ],

  "count-noncount": [
    { kind: "tiles", title: "Count a non-count noun with a unit", caption: "The unit is what you count: *two glasses of water*, *a piece of advice*.",
      items: [
        { head: "a glass of", words: ["water", "milk", "juice"] },
        { head: "a piece of", words: ["advice", "information", "furniture"] },
        { head: "a cup of", words: ["coffee", "tea"] },
        { head: "a bowl of", words: ["soup", "cereal"] },
        { head: "a slice of", words: ["bread", "cake"] },
        { head: "a bag of", words: ["rice", "sugar"] },
      ] },
    { kind: "table", title: "Same word, two meanings", caption: "Some nouns are both. The meaning changes with *a* or a plural.",
      head: ["Word", "Non-count", "Count"],
      rows: [
        ["coffee", "I like **coffee**.", "Two **coffees**, please."],
        ["paper", "a sheet of **paper**", "I read **a paper**."],
        ["time", "I don't have **time**.", "I called three **times**."],
        ["chicken", "We ate **chicken**.", "**a chicken** on a farm"],
      ] },
  ],

  "possessives-demonstratives": [
    { kind: "table", title: "*this*, *that*, *these*, *those*", caption: "Near or far, one or more: two questions give you the word.",
      head: ["", "one", "more than one"],
      rows: [
        ["near you", "**this** book", "**these** books"],
        ["farther away", "**that** car", "**those** cars"],
      ] },
    { kind: "formula", title: "Showing the owner with *'s*",
      caption: "*its* (no apostrophe) means “belonging to it”; *it's* means *it is* or *it has*.",
      lines: [
        { name: "One owner", parts: ["Maria", "+", "'s"], ex: "**Maria's** bag, my **brother's** car" },
        { name: "Plural ending in *-s*", parts: ["parents", "+", "'"], ex: "my **parents'** house" },
        { name: "Other plurals", parts: ["children", "+", "'s"], ex: "the **children's** toys" },
      ] },
  ],

  "there-is-it-is": [
    { kind: "formula", title: "First *there is*, then *it is*", caption: "*There* brings something new in. *It* or *they* talks about it after that.",
      lines: [
        { name: "First time: it exists", parts: ["there is / are", "+", "a, some or a number + noun"], ex: "**There's** a park near my house." },
        { name: "After that: describe it", parts: ["it is / they are", "+", "more about it"], ex: "**It's** very big." },
      ] },
    { kind: "tiles", title: "*there is* or *there are*?", caption: "In everyday speech, many Americans say *there's* with a plural too. In writing, use *there are*.",
      items: [
        { big: "there is", head: "one thing, or a non-count noun", words: ["a bank", "some milk"] },
        { big: "there are", head: "more than one", words: ["two banks", "some eggs"] },
      ] },
  ],

  "present-simple": [
    { kind: "tiles", title: "*he, she, it*: how to spell the *-s*", caption: "One more: *have* becomes *has*. In questions and negatives, *does* takes the *-s*: *Does she work?*",
      items: [
        { big: "+ s", head: "most verbs", words: ["works", "plays", "lives"] },
        { big: "+ es", head: "after s, z, sh, ch, x, and *go*, *do*", words: ["watches", "fixes", "goes", "does"] },
        { big: "y → ies", head: "consonant + y", words: ["studies", "tries", "cries"] },
      ] },
    { kind: "bars", title: "How often? Words for habits", caption: "A rough guide. These words usually go before the main verb.",
      items: [
        { label: "always", value: 100, show: "every time", ex: "I **always** drink coffee." },
        { label: "usually", value: 80, show: "most times", ex: "She **usually** walks to work." },
        { label: "often", value: 60, show: "many times", ex: "We **often** eat out." },
        { label: "sometimes", value: 35, show: "some times", ex: "He **sometimes** works late." },
        { label: "never", value: 0, show: "not at all", ex: "They **never** watch TV." },
      ] },
  ],

  "simple-continuous": [
    { kind: "timeline", title: "Every day, or just now?", caption: "Simple: again and again, or always true. Continuous: now, or only for a short time.",
      rows: [
        { t: "I **walk** to work every day.", note: "present simple: a habit", span: [-2.8, 2.8], repeat: true },
        { t: "Water **boils** at 212 degrees.", note: "present simple: always true", span: [-3, 3] },
        { t: "I**'m walking** to work this week.", note: "continuous: for a short time", span: [-0.6, 0.6] },
        { t: "She**'s speaking** French right now.", note: "continuous: happening now", points: [{ at: 0 }] },
      ] },
  ],

  "questions-negatives": [
    { kind: "flow", title: "How do I make a question?", caption: "The same helper makes the negative: *isn't, can't, doesn't*.",
      steps: [
        { q: "Is there *can, will* or *should*?", yes: "put that word first", ex: "**Can** you swim? **Will** she be ready?" },
        { q: "Is the verb *am, is, are, was* or *were*?", yes: "put it first", ex: "**Is** she ready?" },
      ],
      else: "add *do*, *does* or *did*", elseEx: "**Do** you work here? **Did** he call?" },
    { kind: "strip", title: "Word order in a question", caption: "A question word goes first. The helper comes before the subject.",
      slots: [
        { label: "question word", sub: "where, when" }, { label: "helper", sub: "do, is, can" },
        { label: "subject" }, { label: "verb" },
      ],
      sentences: [
        [["Where ", 0], ["do ", 1], ["you ", 2], ["live", 3], ["?", null]],
        [["When ", 0], ["does ", 1], ["the bus ", 2], ["leave", 3], ["?", null]],
        [["Can ", 1], ["you ", 2], ["swim", 3], ["?", null]],
      ] },
  ],

  "imperatives": [
    { kind: "formula", title: "Telling people what to do", caption: "No subject, and the verb never changes: the same for one person or many.",
      lines: [
        { name: "Do it", parts: ["base verb", "+", "the rest"], ex: "**Sit** down. **Be** careful." },
        { name: "Don't do it", parts: ["don't", "+", "base verb"], ex: "**Don't** touch that." },
        { name: "We do it", parts: ["let's", "+", "base verb"], ex: "**Let's** eat." },
        { name: "We don't do it", parts: ["let's not", "+", "base verb"], ex: "**Let's not** argue." },
      ] },
    { kind: "scale", title: "Asking a favor: from direct to polite", from: "direct", to: "very polite",
      caption: "For a favor, add *please* or ask a question. Friendly commands like *Come in!* are fine as they are.",
      items: [
        { at: 8, label: "Close the door.", ex: "can sound bossy" },
        { at: 40, label: "Please close the door.", ex: "polite" },
        { at: 66, label: "Can you close the door?", ex: "friendly and polite" },
        { at: 92, label: "Could you close the door, please?", ex: "very polite" },
      ] },
  ],

  "past-simple": [
    { kind: "tiles", title: "Three sounds for *-ed*", caption: "Only after *t* and *d* does *-ed* add a syllable: *want-ed*, *need-ed*.",
      items: [
        { big: "/t/", head: "after p, k, f, s, sh, ch, x", words: ["worked", "laughed", "fixed", "stopped"] },
        { big: "/d/", head: "after other sounds", words: ["played", "called", "lived", "opened"] },
        { big: "/ɪd/", head: "after t and d: an extra syllable", words: ["wanted", "needed", "started"] },
      ] },
    { kind: "formula", title: "*did* does the past work", caption: "After *did*, use the plain verb: *Did you go?*, not *Did you went?*",
      lines: [
        { name: "Question", parts: ["did", "+", "subject", "+", "plain verb"], ex: "**Did** you **go**?" },
        { name: "Negative", parts: ["subject", "+", "didn't", "+", "plain verb"], ex: "I **didn't go**." },
      ] },
  ],

  "future": [
    { kind: "flow", title: "Which future do I use?", caption: "Ask the questions in order and stop at the first *yes*.",
      steps: [
        { q: "Are you deciding right now, offering or promising?", yes: "*will*", ex: "I**'ll** get the door." },
        { q: "Is it an arrangement, with a time and other people?", yes: "*am, is, are* + *-ing*", ex: "I**'m meeting** Sam at six." },
        { q: "Is it a plan you made before?", yes: "*going to*", ex: "I**'m going to** visit my aunt." },
      ],
      else: "a prediction: *will* or *going to*", elseEx: "I think she**'ll** like it. Look at those clouds! It**'s going to** rain." },
  ],

  "place-prepositions": [
    { kind: "funnel", title: "*in*, *on*, *at*: from big to small", caption: "The bigger the place, the higher it sits: *in* a city, *on* a street, *at* an exact address.",
      levels: [
        { label: "in", sub: "countries, cities, rooms: *in the U.S., in New York, in the kitchen*" },
        { label: "on", sub: "streets, floors, surfaces: *on Fifth Avenue, on the second floor*" },
        { label: "at", sub: "an exact point: *at 350 Fifth Avenue, at the door, at the bus stop*" },
      ] },
    { kind: "tiles", title: "Going somewhere", caption: "With *home*, use no preposition: *go home*, not *go to home*.",
      items: [
        { big: "to", head: "toward a place", words: ["go **to** work", "drive **to** Chicago"] },
        { big: "into", head: "from outside to inside", words: ["walk **into** the room"] },
        { big: "no word", head: "with *home*", words: ["go home", "come home"] },
      ] },
  ],

  "comparatives": [
    { kind: "flow", title: "*-er* or *more*?", caption: "Ask the questions in order and stop at the first *yes*.",
      steps: [
        { q: "Is it *good, bad* or *far*?", yes: "irregular", ex: "**better**, **worse**, **farther**" },
        { q: "Is it one syllable?", yes: "add *-er*", ex: "cheap**er**, big**ger**, nice**r**" },
        { q: "Does it have two syllables and end in *y*?", yes: "change *y* to *-ier*", ex: "eas**ier**, happ**ier**" },
      ],
      else: "use *more*", elseEx: "**more** expensive, **more** interesting" },
    { kind: "scale", title: "*too* and *enough*", from: "cold", to: "hot",
      caption: "*Too* goes before the adjective; *enough* comes after it.",
      items: [
        { at: 8, label: "too cold", ex: "It's too cold to swim." },
        { at: 50, label: "warm enough", ex: "It's warm enough. Let's swim!" },
        { at: 92, label: "too hot", ex: "It's too hot to sit outside." },
      ] },
  ],
};
