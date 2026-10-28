// Words for "How to say it" and the Sounds page, in one place so they can be
// translated later. Plain English (CEFR A2): one action per sentence,
// everyday body words. Every Try, Compare and listening word has an American
// recording by a person.

export const UI = {
  row: "How to say it",
  watch: "Watch the word",
  together: "Half speed, with the sound",
  stop: "Stop",
  slow: "Slow motion",
  voiceOn: "Voice ON",
  voiceOff: "Voice OFF (only air)",
  lips: "Lips",
  mri: "See a real mouth (MRI)",
  mriHide: "Hide the real mouth",
  more: s => `More about ${s} →`,
  as: (s, w) => `${s}, as in ${w}`,
  try: "Try:",
  compare: "Compare:",
  listen: "Listen and choose",
  which: "Which word did you hear?",
  again: "Play again",
  next: "Next",
  right: "Yes! That's right.",
  wrong: w => `Not this time. You heard: ${w}.`,
  done: (n, of) => `You got ${n} of ${of}. Try another round any time.`,
  sounds: "Sounds",
  soundsSub: "See how the mouth makes the sounds that are hard in English. Tap a word to hear it.",
  ends: "Sounds at the end of words, like in street and film: listen and say them. A picture cannot show these.",
  consonants: "Consonants",
  vowels: "Vowel pairs",
  sounds_in_word: "Sounds in this word",
};

// The Sounds page cards. A card has one sound, or two vowels taught as a
// pair (`parts`). `short` is the tip on a word page; `full` the card's.
export const CARDS = [
  { id: "th-think", sym: "θ", voice: false,
    short: "Put your tongue between your teeth. Blow air out.",
    full: "Put your tongue between your teeth. Let the tip come out a little. Blow air out. Voice OFF. Look in a mirror. You can see your tongue.",
    try: ["think", "three", "bath"], compare: [["think", "sink"], ["three", "tree"]], drill: ["θ-s", "θ-t"] },
  { id: "th-this", sym: "ð", voice: true,
    short: "Tongue between your teeth. Turn your voice on.",
    full: "Put your tongue between your teeth, like in think. Turn your voice ON. Put your hand on your throat. You feel a buzz.",
    try: ["this", "that", "mother"] },
  { id: "r", sym: "ɹ", voice: true,
    short: "Pull your tongue back. The tip touches nothing.",
    full: "Pull your tongue back. Press the sides of your tongue on your top back teeth. The tip touches nothing. Hold it: rrrr. Do not round your lips much. That makes w.",
    help: "Hard? Say er, as in bird. Hold it. Then say er-ed: red.",
    try: ["red", "right", "car"], compare: [["right", "light"], ["rock", "lock"]], drill: ["ɹ-l"] },
  { id: "er", sym: "ɚ", voice: true,
    short: "Pull your tongue back. Hold the sound: errr.",
    full: "Pull your tongue back. Press the sides of your tongue on your top back teeth. The tip touches nothing. Hold the sound: errr. Make one sound, not a and then r.",
    try: ["bird", "work", "nurse"] },
  { id: "l", sym: "l", also: ["ɫ"], voice: true,
    short: "Touch the bump behind your top teeth with your tongue tip.",
    full: "Touch the bump behind your top teeth with your tongue tip. Hold it there: llll. At the end of a word, also pull the back of your tongue back. Try that in feel and ball.",
    help: "l: the tip touches. r: the tip touches nothing.",
    try: ["light", "tell", "ball"], drill: ["ɹ-l"] },
  { id: "v", sym: "v", voice: true,
    short: "Top teeth on your bottom lip. Turn your voice on.",
    full: "Put your top teeth on your bottom lip. Turn your voice ON. Your lip buzzes. Do not close your lips. That makes b.",
    help: "v: teeth on lip. w: round lips, no teeth.",
    try: ["very", "voice", "have"], compare: [["vest", "west"], ["vote", "boat"]], drill: ["v-b", "v-w"] },
  { id: "w", sym: "w", voice: true,
    short: "Make your lips small and round. Then open.",
    full: "Make your lips small and round, like a kiss. Your teeth do not touch your lip. Then open into the next sound.",
    try: ["wet", "water", "window"], compare: [["west", "vest"], ["wine", "vine"]], drill: ["v-w"] },
  { id: "f", sym: "f", voice: false,
    short: "Top teeth on your bottom lip. Blow air out.",
    full: "Put your top teeth on your bottom lip. Blow air out. Voice OFF. Do not close your lips. That makes p.",
    try: ["fish", "phone", "off"] },
  { id: "p", sym: "p", voice: false,
    short: "Close your lips. Open them fast with a puff of air.",
    full: "Close your lips. Push air behind them. Open them fast. A puff of air comes out. Hold paper in front of your mouth. The paper moves. For b, do the same with your voice ON.",
    try: ["pen", "paper", "cup"], compare: [["pig", "big"]], drill: ["p-b"] },
  { id: "sh", sym: "ʃ", voice: false,
    short: "Push your lips forward a little. Blow a long, soft air.",
    full: "Push your lips forward a little. Lift your tongue close to the top of your mouth. Blow air out. Voice OFF. Keep the air going. Do not stop it. That makes ch.",
    try: ["ship", "sheet", "wash"], compare: [["ship", "chip"], ["sheet", "seat"]], drill: ["ʃ-tʃ", "ʃ-s"] },
  { id: "ng", sym: "ŋ", voice: true,
    short: "Lift the back of your tongue. Air goes out through your nose.",
    full: "Lift the back of your tongue. Touch the back of the top of your mouth. Air goes out through your nose. Do not add a g at the end.",
    try: ["ring", "long", "thing"] },
  { id: "z", sym: "z", voice: true,
    short: "Like s, with your voice on. It buzzes like a bee.",
    full: "Put your tongue tip near the bump behind your top teeth. Do not touch it. Blow air with your voice ON. You hear a buzz, like a bee. Keep the buzz at the end of a word too.",
    try: ["zoo", "nose", "please"] },
  { id: "ee-i", vowels: true, parts: [
    { sym: "i", short: "Smile. Tongue high. Make it long.", full: "Smile. Lift your tongue high. Make the sound long.", try: ["see", "sheep", "seat"] },
    { sym: "ɪ", short: "Do not smile. Make it short.", full: "Do not smile. Relax your mouth. Your tongue is a little lower than for ee. Make the sound short.", try: ["sit", "ship", "big"] }],
    compare: [["sit", "seat"], ["ship", "sheep"], ["hit", "heat"]], drill: ["ɪ-i"] },
  { id: "e-a", vowels: true, parts: [
    { sym: "ɛ", short: "Open your mouth a little. Make it short.", full: "Open your mouth a little. Keep your tongue in the middle. Make the sound short.", try: ["bed", "men", "head"] },
    { sym: "æ", short: "Open your mouth more than for e. Smile a little.", full: "Open your mouth more than for e in bed. Drop your jaw. Keep your tongue low and forward. Smile a little.", try: ["hat", "bad", "man"] }],
    compare: [["bad", "bed"], ["man", "men"], ["bat", "bet"]], drill: ["æ-ɛ"] },
  { id: "u-o", vowels: true, parts: [
    { sym: "ʌ", short: "Open your mouth a little. Relax. Make it short.", full: "Open your mouth a little. Relax your lips. Keep your tongue in the middle. Make the sound short.", try: ["cup", "but", "luck"] },
    { sym: "ɑ", short: "Open your mouth wide. Do not round your lips.", full: "Open your mouth wide. Drop your jaw. Keep your tongue low and back. Do not round your lips.", try: ["hot", "rock", "lock"] }],
    compare: [["cut", "cot"], ["luck", "lock"]], drill: ["ʌ-ɑ"] },
  { id: "oo", vowels: true, parts: [
    { sym: "u", short: "Small round lips. Make it long.", full: "Make your lips small and round. Push them forward. Make the sound long.", try: ["blue", "school", "soon"] },
    { sym: "ʊ", short: "Lips a little round. Relaxed. Short.", full: "Round your lips a little. Keep them relaxed. Make the sound short.", try: ["book", "good", "put"] }] },
];

// The listening game: pairs of words that differ in one sound, both
// recorded by a person (data/words.json, has_audio). The first word has
// the card's sound.
export const PAIRS = {
  "θ-s": [["think", "sink"], ["thing", "sing"], ["thick", "sick"], ["thin", "sin"], ["faith", "face"], ["math", "mass"],
          ["worth", "worse"], ["theme", "seem"], ["thumb", "sum"], ["youth", "use"]],
  "θ-t": [["three", "tree"], ["bath", "bat"], ["both", "boat"], ["through", "true"], ["thin", "tin"], ["death", "debt"],
          ["faith", "fate"], ["booth", "boot"], ["math", "mat"], ["thrust", "trust"]],
  "v-b": [["vest", "best"], ["vote", "boat"], ["very", "bury"], ["vent", "bent"], ["marvel", "marble"], ["vow", "bow"],
          ["veil", "bail"], ["vat", "bat"]],
  "v-w": [["vest", "west"], ["vine", "wine"], ["verse", "worse"], ["vow", "wow"], ["veal", "wheel"], ["vile", "while"]],
  "ɹ-l": [["right", "light"], ["rock", "lock"], ["rate", "late"], ["road", "load"], ["rain", "lane"], ["raw", "law"],
          ["ray", "lay"], ["crowd", "cloud"], ["reading", "leading"], ["war", "wall"]],
  "ɪ-i": [["sit", "seat"], ["ship", "sheep"], ["hit", "heat"], ["live", "leave"], ["bit", "beat"], ["rich", "reach"],
          ["still", "steal"], ["fill", "feel"], ["sick", "seek"], ["list", "least"]],
  "æ-ɛ": [["bad", "bed"], ["man", "men"], ["bat", "bet"], ["pan", "pen"], ["sand", "send"], ["mass", "mess"],
          ["bag", "beg"], ["gas", "guess"], ["dad", "dead"], ["latter", "letter"]],
  "ʌ-ɑ": [["cut", "cot"], ["luck", "lock"], ["shut", "shot"], ["bus", "boss"], ["stuck", "stock"], ["nut", "not"],
          ["hut", "hot"], ["duck", "dock"], ["rub", "rob"], ["color", "collar"]],
  "ʃ-tʃ": [["ship", "chip"], ["wash", "watch"], ["wish", "witch"], ["sheet", "cheat"], ["dish", "ditch"], ["shop", "chop"],
           ["mash", "match"], ["marsh", "march"]],
  "ʃ-s": [["sheet", "seat"], ["show", "so"], ["short", "sort"], ["shame", "same"], ["shell", "sell"], ["shine", "sign"],
          ["shy", "sigh"], ["shave", "save"], ["mesh", "mess"], ["clash", "class"]],
  "p-b": [["pig", "big"], ["pay", "bay"], ["push", "bush"], ["pull", "bull"], ["pit", "bit"], ["pat", "bat"],
          ["pair", "bare"], ["punch", "bunch"], ["pace", "base"], ["poll", "bowl"]],
};

// Real-time MRI clips (USC 75-Speaker Speech MRI Database, CC BY 4.0), one
// speaker of American English. `at`: seconds into the clip where the sound
// is made; the clip opens paused there. `tongue` and `teeth` outline the
// paused frame (240 × 240). Files: static/mouth/<file>.
export const MRI = {
  θ: { file: "theta", word: "think", drill: true, teeth: true },
  ɹ: { file: "r", word: "red", drill: true },
  l: { file: "l", word: "light", drill: true },
  v: { file: "v", word: "very", drill: true, teeth: true },
  w: { file: "w", word: "wet", drill: true },
  ɪ: { file: "bit", word: "bit" },
  æ: { file: "bat", word: "bat" },
};
MRI.ɫ = MRI.l;

export const MRI_TEXT = {
  title: (label, word) => `${label}, as in ${word}. A real person. MRI scan.`,
  all: "The face looks left. The tongue is the big grey shape. Dark parts are air.",
  drill: "The person says the sound between two ah sounds.",
  word: w => `The person says the word ${w}.`,
  teeth: "Teeth do not show in a scan. The dashed line shows the top teeth.",
  th: "This person keeps the tongue tip at the edge of the top teeth. Between the teeth is easier and sounds the same.",
  r: "This person lifts the tongue tip. Pressing the sides works the same. Both sound the same.",
  play: "Play slowly",
  credit: "MRI: USC 75-Speaker Speech MRI Database, CC BY 4.0",
};
