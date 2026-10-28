# LexiMaster

A vocabulary trainer for **American English**, built for an advanced learner who reads, writes and
speaks English at work: precise general vocabulary, the language of everyday American life, the
vocabulary of data science, AI, mathematics, philosophy and theology, and the Bible. Every word has
American pronunciation, a learner's definition and study notes, and you learn it with spaced
repetition and six kinds of practice.

Why it exists, in the words of its author:

> I'm Fisseha, a non-native English speaker working in data science and AI, with a background in civil
> engineering, environmental science (MS, University of Connecticut) and atmospheric physics (MS and
> PhD, Johns Hopkins University). I built LexiMaster to spend a few minutes a day keeping the words
> and ideas I care about in active memory, ready for professional work, writing and everyday
> conversation.

The app's About page (the ⓘ button at the foot of the menu; More → About on a phone) says more.

It runs two ways: as a website (https://fissehab.github.io/leximaster/, nothing to install) or as a
local app on your Mac. Both work the same and share the same progress file format.

## What's in it

43,273 entries. 13,880 have a human American recording; the other 29,393 have a natural synthesized
American recording made for LexiMaster (Kokoro, an open neural voice), spoken from each entry's reviewed
IPA for rare words and names.

**Advanced & subjects** (scope "Advanced & subjects", 34,931 entries including the Bible vocabulary and
linked words; an entry can be in several domains):

| Domain | Entries | Domain | Entries |
|---|---|---|---|
| Advanced (GRE/SAT level) | 7,632 | Artificial intelligence | 861 |
| Professional | 4,157 | Software engineering | 1,360 |
| Literary | 581 | Data science | 1,052 |
| Academic | 765 | Statistics & probability | 907 |
| Theology | 1,807 | Mathematics | 1,554 |
| Philosophy | 1,752 | Logic | 577 |
| Christian anthropology | 293 | Orthodox mysticism | 163 |

**Everyday English** (scope "Everyday English", 7,426 entries, linked words included): the words, phrasal verbs and
expressions of daily American life, each most with hand-written conversation examples labeled by meaning.

| Domain | Entries | Domain | Entries |
|---|---|---|---|
| Idioms & expressions | 1,022 | Beach & outdoors | 864 |
| Home & health | 825 | Sports & pop culture | 770 |
| Phrasal verbs | 806 | Dining out | 600 |
| Food & taste | 1,025 | Meetings | 453 |
| Feelings & reactions | 529 | Getting around | 441 |
| Small talk | 669 | Shopping & errands | 561 |
| | | Phone & video calls | 242 |

**Bible** (4,039 entries), following the Revised Standard Version (RSV), in two parts:

- **Bible · Vocabulary** (3,123): the vocabulary of Scripture and biblical studies (canon and
  versions, names of God, covenant and salvation, worship and offices, Hebrew and Greek terms,
  English expressions from the Bible, the books of the Bible) and the distinctive words of the
  biblical text.
- **Bible · Names** (952): every person and place named five or more times from Genesis to
  Revelation, each labeled Person, Place or People. Names come up in review only on a Bible scope.
  Names that became everyday English words (Goliath, Judas, good Samaritan, raise Cain) are in both
  parts, with the everyday meaning first. The labels live in `seeds/names/bible.txt`
  (`name | kind | everyday meaning`), written by `tools/classify_names.py` and checked by hand.

5,203 entries have an "In the Bible" note citing RSV passages and the Hebrew or Greek word behind
them; the notes were fact-checked (`tools/check_bible.py`). Where Eastern Orthodox, Roman Catholic and
Protestant Christians understand a term differently (900 entries), each tradition's view is given.

**Each entry has** the American IPA and a stress respelling (in-ter-SEED), a pronunciation tip, a
learner's definition with an example, how Americans use the word, how it differs from near-synonyms,
common mistakes and common pairings, more examples (everyday, professional, analytical), the
dictionary's other meanings, register, word family, synonyms, antonyms and origin. See
"The word page" below for the order.

## Use it online

The website version runs entirely in your browser: https://fissehab.github.io/leximaster/

Your progress is saved in that browser on that device, each change as it happens; several open tabs
share it safely (one saves at a time, and the others reload what it saved). Use Settings → Export / Import
to move it between devices, and Settings → "Download for offline use" to study without a connection. On a
phone, use your browser's "Add to Home Screen" to install it like an app.

To rebuild the site after changing the dataset:

```bash
.venv/bin/python tools/glossary.py     # short definitions for related words without an entry (Open English WordNet)
.venv/bin/python tools/build_site.py   # checks the display rules, then writes docs/ (GitHub Pages serves it)
.venv/bin/python tools/parity.py       # the website and the local app give the same answers
```

After you publish, the site updates itself the next time you open Today, Browse, Lists, Stats or Settings, in
every open tab. It never reloads in the middle of a review or quiz, and your downloaded offline data is
kept unless the word data changed.

## Using it day to day

1. **Today** (the home screen) shows how many cards are left today and the word of the day. Press
   **Start today's review**.
2. **Daily review** (10–20 minutes): say the word's meaning aloud, reveal, and grade yourself honestly.
   New words are answered Show again, Got it or Know it; words you've seen before Again, Hard, Good or
   Easy. From a word's third review on, some cards show the meaning (and a sentence with a blank)
   and ask for the word itself: type it or say it, then reveal. Choose a scope at the top
   (Everything, Everyday English, Advanced & subjects, or a Bible scope). "Undo last grade" (or Z)
   takes back a slip, and leaving the tab keeps your place for the day.
3. **Practice** when you have more time: Flashcards, Matching, Quiz, Listen (including a spelling
   test) and Pronounce. Misses go back into today's review.
4. **Browse** to look up any word, and **My lists** to collect words with your own notes.

- **Stars** (1–5, on any word page or flashcard) say how familiar a word is: 1–2★ words come back
  more often.
- **Know it** takes a word you already know out of your study (press it again to bring it back).
- **Settings** (sidebar; under More on a phone): study focus, session length, new words per day, word
  levels, pronunciation speed, the theme, and your data (export, import, offline use).
- **Study focus** (Settings, or the scope menu in Daily review): Everything, Everyday English, Advanced &
  subjects, or the Bible. Daily review, Today's count and word of the day follow it, and every practice
  tab is set to it when it changes (a tab can still pick its own).
- **Pronunciation speed:** the button beside each play button switches between 1×, .75× and .5×
  (pitch stays natural) for every recording and voice; the choice is remembered.
  Flashcards has its own "Play audio on flip" switch.
- **Your own words:** My lists → "Add my own word" adds a word with your definition and example.
- **Moving between devices:** Settings → Export progress saves a file; Import on the other device. Import
  keeps whichever copy of each word is newer, so an old backup never undoes later study.
- **Backups on the website:** progress lives in that browser only. Today reminds you to export once a
  week; on iPhone and iPad, add LexiMaster to the Home Screen, or Safari clears its data after a week
  without a visit.
- **Sources:** Settings → "Sources & credits" (website) lists the dictionaries and the recording
  credits.

## Setup (local app)

The local app needs no API key to run. The key is only for building the dataset (below).

```bash
./setup.sh
```

This creates `.venv/`, installs `requirements-tools.txt` (the app and the build tools; set
`LEXIMASTER_APP_ONLY=1` for the app alone), and creates a `.env` file. Edit `.env`:

| Setting | Why |
|---|---|
| `LEXIMASTER_CONTACT` | A URL or email address. Wikimedia's robot policy requires contact information in the User-Agent and blocks anonymous scripts. |
| `ANTHROPIC_API_KEY` | Building the dataset only: Claude expands the word lists and writes the study notes. Leave it empty to run the app. |

## 1. Build the dataset

```bash
.venv/bin/python build_dataset.py --limit 20   # quick end-to-end test on 20 words (free stages)
.venv/bin/python build_dataset.py              # the free stages: collect, filter, fetch, audio, extras
.venv/bin/python build_dataset.py --paid       # also expand and enrich (Claude; costs money)
.venv/bin/python build_dataset.py --status     # show progress (writes nothing)
```

The build runs seven stages. Each stage is resumable: press Ctrl-C at any time and run the
same command again to continue.

| Stage | What it does |
|---|---|
| `collect` | Merges the seed lists in `seeds/` (GRE and SAT lists, tagged "advanced"; the Academic Word List; domain lists). Each word is tagged with its source lists. |
| `expand` | Asks Claude Haiku 5.5 for more candidates in each category, up to about 19,000. |
| `filter` | Drops everyday words by their `wordfreq` Zipf frequency (`--max-zipf`, default 4.6). Words that appear only on general lists must be rarer. `--target N` caps the number of words (default: no limit). |
| `fetch` | Fetches definitions, parts of speech, IPA and audio URLs. Tries the Free Dictionary API first and uses Wiktionary as a fallback. When the words.json file is built, each word's senses are ranked so its most useful sense comes first. A domain word gets its domain sense first (*hypostasis* → the theology sense). Archaic and narrow technical senses go last. |
| `audio` | Downloads American English recordings to `data/audio/`. WAV and OGG files are converted to small `.m4a` files. Recordings in other accents are never used. Words without an American recording use the browser's American (en-US) voice. |
| `extras` | Pulls synonyms, antonyms, a one-line etymology and usage labels (which rank the senses) from Wiktionary, and downloads the CMU Pronouncing Dictionary. |
| `enrich` | Writes each entry's study notes with Claude Haiku 5.5 (10 words per request): a learner's definition, General American IPA and stress respelling, a pronunciation tip, register and connotation, how Americans use it, word family, near-synonym distinctions, antonyms, collocations, three example sentences, an analogy, etymology and common mistakes. The model sees each word's IPA and corrects it when it's wrong; a corrected IPA is used only when it agrees with the model's own respelling. |

Useful options:

- `--stages fetch,audio`: run only those stages.
- `--retry-failed`: retry words that failed in an earlier run.
- `--only "word1,word2"`: redo the study notes for just these words.
- `--paid`: include the paid stages (expand, enrich); naming them in `--stages` does the same. The
  estimated cost is printed before each paid stage.
- `--budget 18`: stop the paid stages once the estimated cost reaches $18 (default $5; 0 means no
  limit; rerun to continue).
- `--effort low|medium|high`: how carefully Claude works (default medium).
- `--concurrency 8`: number of parallel enrichment requests.

After an enrichment run, `.venv/bin/python -c "import build_dataset as b; b.check_stress()"` flags entries whose
respelling stresses a different syllable than the IPA; `--stages enrich --retry-failed` then redoes them.

Progress is cached in `data/cache/*.jsonl`, which are append-only logs. `data/words.json`
is rebuilt from these caches during and after each stage.

### American English only

Words, meanings, spelling and pronunciation are all American English:
- **Recordings:** only those labelled US on Wiktionary or the Free Dictionary.
- **IPA:** General American transcriptions from Wiktionary. Unlabelled ones are used only when they
  read as American; British (non-rhotic) and other regional transcriptions are skipped. Words still
  without IPA get one from the CMU Pronouncing Dictionary (American English), or hand-written IPA.
  During enrichment Claude checks each transcription and its stress; a corrected IPA replaces the
  original only when it agrees with Claude's own stress respelling.
- **Spelling:** headwords, definitions, notes and examples use American spelling. Besides a fixed
  list (colour → color), British patterns (-our, -ise, -yse, -tre, doubled l) are converted when the
  American CMU dictionary has the American form and lacks the British one. Etymologies keep their
  Latin and Greek forms.
- **Meanings:** senses labeled obsolete, archaic, dialectal or limited to other countries (UK-only,
  Ireland, Australia, India...) are removed, as are inflection-only lines ("simple past of win").
  Words that Claude rates as mainly British (Americans say something else) are left out, except words
  from the GRE/SAT and academic lists.
- **Synthesized recordings:** words without a human American recording have one made with Kokoro, an
  open neural voice (`tools/tts.py`; the model goes in `data/models/`, see the tool's header). Rare
  words and names are spoken from the entry's reviewed American IPA, so they come out as the entry
  says; common words and phrases are read by the model. `tools/tts.py verify` has Whisper transcribe
  every recording to catch bad ones. File names carry a content hash, so a corrected recording
  reaches devices that saved the old one.
- **Even volume:** `tools/audio_norm.py` evens out the human recordings for the website (about −20
  LUFS, peaks limited, clipped ones repaired where possible) and adds a short lead-in so phones don't
  swallow the first sound.
- **Device voice:** only if a recording can't play does the app fall back to the device's own
  American voice, choosing the most natural one installed. For a smoother fallback, download a
  premium voice: on a Mac, System Settings → Accessibility → Spoken Content → System voice → Manage
  Voices → English (US) → Ava (Premium); on an iPhone, Settings → Accessibility → Spoken Content →
  Voices → English → Ava (Premium).

### Claude through Amazon Bedrock

Instead of an Anthropic API key you can use an AWS account with Bedrock access. Set the AWS
profile in `.env` (and leave `ANTHROPIC_API_KEY` empty), log in, and run the stages:

```bash
# .env
LEXIMASTER_AWS_PROFILE=my-aws-profile
LEXIMASTER_AWS_REGION=us-east-1

aws sso login --profile my-aws-profile
.venv/bin/python build_dataset.py --stages expand,filter,fetch,audio,extras,enrich
```

The model becomes `anthropic.claude-haiku-5-5`. If the account has no access to it, add
`--model claude-haiku-4-5`. Before a long run, one tiny request checks the login and model
access, and stops with a clear message if either is missing.

### Without an API key

The nuance notes (register, near-synonym distinctions, collocations, example sentences,
common mistakes) need Claude. Without a key, `expand` and `enrich` are skipped. Every tab still
works on dictionary data: definitions, IPA, recordings, synonyms, antonyms and etymology.
To add the notes later, put the key in `.env` and run:

```bash
.venv/bin/python build_dataset.py --stages enrich
```

Expected cost and time for the full lexicon (about 16,000 words, medium effort):

- **Claude cost:** roughly US$15 (what this lexicon cost, including redoing some notes).
- **Fetch and audio:** a couple of hours, limited by polite request rates.
- **Enrichment:** about 2 hours.

### Network notes

- **TLS-inspecting proxies:** behind a corporate proxy, Python uses the macOS certificate
  store through `truststore`, so no certificate setup is needed.
- **Blocked Free Dictionary API:** `api.dictionaryapi.dev` sits behind Cloudflare and can be
  blocked on corporate networks. When that happens, the script switches to Wiktionary
  automatically. Wiktionary is the source the Free Dictionary API draws from.

## 2. Run the app

```bash
./run.sh
```

This starts the server at http://localhost:8765 and opens it in your browser. Set `PORT=9000 ./run.sh`
to use another port. You can rebuild or extend the dataset while the app is running. The app picks up
a changed `data/words.json` on the next page load, and your progress stays attached to each word.

### Tabs

| Tab | What it's for |
|---|---|
| Today | The home screen. Today's review first: how many cards are left (the same number as the badge) and a button to start, then the day so far (streak, reviews, time, words mastered) and the word of the day. |
| Daily review | SM-2 spaced repetition, sized to your session length (default 15 minutes). Choose a scope: Everything, Everyday English, Advanced & subjects, or Bible vocabulary, names or both. A new word is answered Show again, Got it or Know it (known words leave the review), and gets a second look a few cards later, asked the other way round (meaning → word); a word you've seen before is graded Again, Hard, Good or Easy, and is asked meaning → word every other time from its third review. The answer shows a short card with one "vs" contrast and one common mistake; "Full entry" opens the whole page. The last grade can be undone. |
| Flashcards | Word on the front; flip for pronunciation, meaning, one example and common pairings, then "Missed it" or "Knew it" (a miss brings the word into today's review). Swipe on a phone. You can shuffle, play audio on flip, rate the word (1–5) or mark it known, and choose a scope, rating or list. The deck ends with a summary. |
| Matching | Timed rounds that pair words with meanings or with example sentences, with a score. |
| Quiz | Word to meaning, meaning to word, fill in the blank, synonyms, antonyms, grammar (the preposition a pattern takes: "insist ___ sth"), and for Bible names "who or what is it?" or "person, place or people?". Only the question types you pick are asked. A wrong answer says what the option you chose actually means. A changed setting applies to the next quiz; opening an entry and coming back keeps your place. "Retry the misses" at the end; misses go back into today's review. |
| Listen | Hear a word, then pick it or type it; the wrong choices sound like the word (affect, effect), never exact homophones. Also has a spelling test that compares your spelling letter by letter, and "Where's the stress?", which asks which syllable is strong. "Can't listen now?" shows the pronunciation instead (the answer then isn't scored as heard). |
| Pronounce | Play the reference recording, record yourself, and play both back. The two waveforms are trimmed of silence and drawn on one time scale, so length and stress line up. |
| Sounds | The 16 sounds learners of English find hardest (th, r and l, v and w, short i and ee, …): the mouth drawing, a plain tip, words to try and compare (all recorded by people), a "Which word did you hear?" game with word pairs (right/light, ship/sheep), and the MRI clips. |
| Browse | The full lexicon. It has A–Z jump, instant search across words and meanings, sorting by A–Z, frequency, stars or domain, and filters. On a phone, tapping a word brings its page into view (← List goes back). |
| My lists | Named lists with a note on each word, plus your own custom words. "Practice this list" opens it in Flashcards, Quiz, Matching or Listen. Words in your lists come first among new review words. |
| Stats | Words mastered (and marked known), retention (the share of reviews you recalled, by gap), practice accuracy, streak, activity heatmap, accuracy by domain, weakest words, test history and reviews due. |
| Settings | Study settings (study focus, session length, new words per day, word levels, pronunciation speed), the theme, progress export/import, and on the website "Download for offline use" and the sources. |

The sidebar runs in the order of a study day: Today, Daily review, the Practice group (easiest to
hardest: Flashcards, Matching, Quiz, Listen, Pronounce, Sounds; folded until you click its heading, and a
folded group still shows the practice you're on), the Words group (Browse, My lists), then Stats and Settings.
On a phone the bottom bar has five buttons in the same order: Today, Review, Practice, Browse and More
(My lists, Stats, Settings). Each practice tab remembers its own settings.

### The word page

Each entry reads from the top down:

1. The word, its sound, IPA and respelling, and one row of labels.
   **How to say it** (closed until you open it) has a button for each sound of the word,
   read from its IPA, and opens on the hardest one: a drawing of the mouth seen from the front, as in a
   mirror (how wide it opens, spread, rounded or closed lips, the teeth, the tongue between the teeth
   for th or up behind them for l), with the spot that matters ringed in gold, Voice ON/OFF, and a
   short tip. "Watch the word"
   plays the recording at half speed with the drawing moving along: where each sound is in the
   recording is read from the recording itself (static/js/align.js: voiced stretches, hiss and stop
   bursts, fitted to the word's sounds), and the mouth moves into each sound just before it is heard; "Slow motion"
   walks the drawing through the sounds slowly without sound (slower still at .75× and .5×). Seven
   sounds also have a real MRI clip of a speaker's mouth, behind "See a real mouth". The positions
   behind the drawings were checked by the review panel's phonetician.
2. The meaning, with one example under it, and its synonyms and antonyms. For a Bible name, what the
   Bible says about it.
3. **Word forms:** the tenses of a verb (abides, abided/abode, abiding), a noun's plural, an
   adjective's comparative and superlative, and the related words in other parts of speech
   (analyze: analysis, analyst, analytical). Built by tools/forms.py from lemminflect's lexicon (no
   guessed forms; no plural for uncountable nouns like "information"), the study notes' word family
   and Open English WordNet's derivation links.
4. **Use it right:** the grammar patterns it's used in ("insist on doing sth", "[U] advice on sth"),
   how Americans use it, how it differs from near-synonyms, common mistakes, and common pairings.
5. **In the Bible**, and Orthodox, Catholic and Protestant views where they differ.
6. **More examples:** two shown, the rest folded.
7. **All meanings:** every dictionary sense, open, in the dictionary's order, each with an example
   sentence: the dictionary's own, or one written by the `examples` build stage.
8. **Pronunciation, register, origin:** folded.
9. **Say it yourself:** record yourself saying the word and compare it with the reference (waveforms on
   one time scale, then "Reference, then mine"), as in the Pronounce tab, for any word.
10. Your notes.

Every synonym, antonym, "Compared with" word and related form can be tapped. A word with its own
entry (blue) opens it; a form of one ("kings") opens "king". Any other word (grey, dotted underline)
opens a short definition from Open English WordNet, with similar words (tappable too), a Wiktionary
link and "Add to my words". Phrases WordNet lacks get the Wiktionary link only.

Related words without an entry of their own get one: `tools/glossary.py --seed` lists them in
seeds/reference.txt and the build gives each a full entry. The ones of ordinary commonness (Zipf 1.0–5.5, about 85% of them) become **Linked words**:
studied like the rest, but only after every other word, so the topic lists keep their place. The
very rare and very common ones ("to", "steatopygic") are **look-up only**: they open from any link
but stay out of new-word study, practice, quizzes and the word of the day until you choose one:
star it, add it to a list, or filter by that domain.

Dictionary senses that only restate the meaning in step 2 are marked when the data is built
(`build_dataset.normalize_display`) and listed only under "Dictionary wording" in step 7.
`tools/audit.py --check` verifies these rules, and the site build stops if one is broken.

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play pronunciation (in Quiz, only after you answer) |
| ← → (↑ ↓ in Browse) | Previous / next word |
| 1–5 | Set star rating (Browse, Flashcards) |
| M | Know it: stop studying the word (in Daily review, after the answer; Undo in the message) |
| Z | Undo the last grade (Daily review) |
| K / X | Knew it / Missed it (Flashcards, after the flip) |
| L | Add to list (Browse) |
| / | Search (Browse) |
| Enter | Flip card / reveal / next |
| 1–4 | Answer in Daily review (the buttons are numbered); choose an answer in Quiz and Listen |
| R | Record (Pronounce) |
| ? | Show all shortcuts (single-key shortcuts can be switched off there) |

### How scheduling works

- **Grades:** Again, Hard, Good and Easy map to SM-2 quality scores 1, 3, 4 and 5. "Again" brings the
  card back five cards later in today's session, lowers the word's ease by 0.2 (SM-2's own formula
  takes 0.54, which soon pins a word at the minimum), and keeps a fifth of its interval: the word comes
  back tomorrow, then grows from there rather than from zero. "Good" moves ease a little back toward
  2.5, so it recovers after hard days. A word recalled late gets credit for the extra days it lasted,
  and intervals over three days vary by ±5% so words learned together spread out.
- **First sight:** Show again brings the word back later in the session and tomorrow, without counting as a
  lapse; Got it is a Good; Know it marks the word known (Undo in the message).
- **Stars:** 1★ and 2★ words never go more than 4 or 7 days between reviews. A word's star rating also
  sets its starting ease (1★ = 2.2 … 5★ = 2.8).
- **Practice misses:** a wrong answer in Quiz, Matching, Listen, Flashcards or the spelling test makes the
  word due today, keeping its interval, so a good review picks up where it was. Only a quiz miss (a
  wrong meaning) also halves the interval and lowers ease, once per word per day. A word you missed
  before studying it counts as one of the day's new words.
- **New words:** each day introduces up to "New words per day" new words (default 12; set in Settings).
  Words in your own lists come first, then 1–2★ words, then unrated words, most frequent first (a
  phrase counts as common as its rarest word). With the Everything scope, everyday and advanced words
  alternate. New words are spread through the session, one after every three reviews. Words marked
  known are skipped.
- **Mastered:** a word counts as mastered once you've recalled it (Good or Easy) at a review three or
  more weeks after the one before, and it is still scheduled weeks apart. Words marked known are
  counted separately in Stats.

### Your data

Everything is stored locally:

- `data/leximaster.db` (SQLite) holds your progress.
- `data/recordings/` holds your voice recordings.
- `data/words.json` and `data/audio/` hold the dataset.

**Settings → Export progress** saves a JSON file keyed by word rather than database ids, so it imports
into a rebuilt dataset too. Tick "Include my pronunciation recordings" to add your own recordings (the
file gets larger); importing adds them only for words that have none. The local app also keeps a copy of its database each day in
`data/backups/` (the last 7), and `make backup` copies the database and `data/cache` (the dataset's
costly build caches) into `backups/`.

### Testing on a copy of your data

`LEXIMASTER_DB` points the app at another database file, so you can try things out without
touching your real progress:

```bash
sqlite3 data/leximaster.db ".backup /tmp/test.db"   # a consistent copy, even while the app runs
LEXIMASTER_DB=/tmp/test.db PORT=8766 ./run.sh
```

### Development

`make setup` installs everything (`LEXIMASTER_APP_ONLY=1 ./setup.sh` for just the app); ffmpeg is
needed for audio builds. `requirements.txt` pins what the app needs and `requirements-tools.txt` what
the build tools need. `make test` runs the tests on a temporary database built from
`tests/fixtures/words_sample.json`, never your `data/`; GitHub Actions runs them on every push.
`make parity` checks that the website and the local app give the same answers.

## Project layout

```
build_dataset.py   dataset builder (resumable)
seeds/             seed word lists, one word or phrase per line
seeds/examples/    hand-written conversation examples for the everyday domains
seeds/fixes/       hand corrections to any field of an entry (see its README.txt)
seeds/patterns/    grammar patterns, one word per line (key, then patterns separated by " | ")
seeds/entries/     hand-written entries for words the dictionaries lack (Oriental Orthodox theology and more)
seeds/drop/        entries left out of the build (duplicates, stray seeds)
seeds/drop/        keys left out of the build (not real words, British spellings)
tools/             build_site.py (the website), audit.py (content checks), parity.py (website vs
                   local app), gen_shared.py (constants shared with the browser code),
                   check_examples.py, classify_names.py, check_bible.py (fact-checks the
                   "In the Bible" notes: verse references, Hebrew and Greek words),
                   audio_credits.py (each recording's author and license, for the credits page),
                   tts.py (natural synthesized recordings for words without a human one),
                   audio_norm.py (even loudness and a lead-in for the human recordings),
                   glossary.py (short WordNet definitions for related words without an entry),
                   forms.py (each entry's tenses, plural, comparative and related forms),
                   build_mouth.py (the MRI clips for How to say it, from the USC 75-Speaker
                   Speech MRI Database), pron_audit.py (shown IPA vs the CMU Pronouncing Dictionary;
                   reviewed corrections go in seeds/fixes/pronunciation.txt)
app/               FastAPI backend: db.py (schema, migrations, daily backups), srs.py (SM-2), api/ (routes)
tests/             pytest suite (a 200-word fixture; never touches data/)
static/            single-page app, with no build step: index.html, css/, js/, fonts/
data/              dataset, audio, SQLite database, recordings
```

To add your own seed words, put them in a new `seeds/domain_<name>.txt` file and run:

```bash
.venv/bin/python build_dataset.py
```

Words that are already built are not fetched or enriched again.

### Everyday entries and examples

In a seed file, a line `expression | meaning` defines an everyday expression that no dictionary
lists (`Can we get the check, please? | Asking for the bill at the end of the meal.`). The build
uses that meaning instead of looking it up. The `EVERYDAY_DOMAINS` in `build_dataset.py` skip the
frequency filter, since their words are common on purpose.

Conversation examples live in `seeds/examples/<domain>.txt` (the everyday domains and
`artificial_intelligence`). Meanings for entries that no dictionary lists go in
`seeds/meanings/*.txt`, one `entry | meaning` per line; they are used only when the lookup
finds nothing.

```
pick up
- [collect someone] I'll pick you up at seven, so be ready.
- [buy on the way] Can you pick up some milk on your way home?
```

The bracketed meaning label is optional. After editing, check coverage and rebuild `words.json`:

```bash
.venv/bin/python tools/check_examples.py
.venv/bin/python build_dataset.py --stages collect,filter
```

### Themes

Settings → Theme picks a theme: Paper (light), Night (dark),
Mariana (slate blue-gray), or Match system, which follows your system's
light/dark setting. The choice is remembered in this browser.
