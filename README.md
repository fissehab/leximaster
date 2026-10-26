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

16,381 entries. 5,823 have an American recording; the rest use your device's American voice.

**Advanced & subjects** (scope "Advanced & subjects", 12,239 entries including the Bible vocabulary):

| Domain | Entries | Domain | Entries |
|---|---|---|---|
| Advanced (GRE/SAT level) | 7,448 | Artificial intelligence | 590 |
| Professional | 1,312 | Software engineering | 483 |
| Literary | 577 | Data science | 425 |
| Academic | 415 | Statistics & probability | 411 |
| Theology | 850 | Mathematics | 600 |
| Philosophy | 720 | Logic | 291 |
| Christian anthropology | 208 | Orthodox mysticism | 143 |

**Everyday English** (scope "Everyday English", 3,211 entries): the words, phrasal verbs and
expressions of daily American life, each with hand-written conversation examples labeled by meaning.

| Domain | Entries | Domain | Entries |
|---|---|---|---|
| Idioms & expressions | 342 | Beach & outdoors | 295 |
| Home & health | 323 | Sports & pop culture | 273 |
| Phrasal verbs | 318 | Dining out | 263 |
| Food & taste | 306 | Meetings | 262 |
| Feelings & reactions | 303 | Getting around | 249 |
| Small talk | 299 | Shopping & errands | 232 |
| | | Phone & video calls | 189 |

**Bible** (3,281 entries), following the Revised Standard Version (RSV), in two parts:

- **Bible · Vocabulary** (2,350): the vocabulary of Scripture and biblical studies (canon and
  versions, names of God, covenant and salvation, worship and offices, Hebrew and Greek terms,
  English expressions from the Bible, the books of the Bible) and the distinctive words of the
  biblical text.
- **Bible · Names** (967): every person and place named five or more times from Genesis to
  Revelation, each labeled Person, Place or People. Names come up in review only on a Bible scope.
  Names that became everyday English words (Goliath, Judas, good Samaritan, raise Cain) are in both
  parts, with the everyday meaning first. The labels live in `seeds/names/bible.txt`
  (`name | kind | everyday meaning`), written by `tools/classify_names.py` and checked by hand.

3,185 entries have an "In the Bible" note citing RSV passages and the Hebrew or Greek word behind
them; the notes were fact-checked (`tools/check_bible.py`). Where Eastern Orthodox, Roman Catholic and
Protestant Christians understand a term differently (419 entries), each tradition's view is given.

**Each entry has** the American IPA and a stress respelling (in-ter-SEED), a pronunciation tip, a
learner's definition with an example, how Americans use the word, how it differs from near-synonyms,
common mistakes and common pairings, more examples (everyday, professional, analytical), the
dictionary's other meanings, register, word family, synonyms, antonyms and origin. See
"The word page" below for the order.

## Use it online

The website version runs entirely in your browser: https://fissehab.github.io/leximaster/

Your progress is saved in that browser on that device, each change as it happens; several open tabs
share it safely (one saves at a time, and the others reload what it saved). Use Stats → Export / Import
to move it between devices, and Stats → "Download for offline use" to study without a connection. On a
phone, use your browser's "Add to Home Screen" to install it like an app.

To rebuild the site after changing the dataset:

```bash
.venv/bin/python tools/build_site.py   # checks the display rules, then writes docs/ (GitHub Pages serves it)
.venv/bin/python tools/parity.py       # the website and the local app give the same answers
```

After you publish, the site updates itself the next time you open Home, Browse, Lists or Stats, in
every open tab. It never reloads in the middle of a review or quiz, and your downloaded offline data is
kept unless the word data changed.

## Using it day to day

1. **Home** shows how many cards are left today and the word of the day. Press **Start daily review**.
2. **Daily review** (10–20 minutes): say the word's meaning aloud, reveal, and grade yourself honestly.
   New words are answered Show again, Got it or Know it; words you've seen before Again, Hard, Good or
   Easy. Choose a scope at the top (Everything, Everyday English, Advanced & subjects, or a Bible scope).
3. **Practice** when you have more time: Flashcards, Matching, Quiz, Listen (including a spelling
   test) and Pronounce. Misses go back into today's review.
4. **Browse** to look up any word, and **My lists** to collect words with your own notes.

- **Stars** (1–5, on any word page or flashcard) say how familiar a word is: 1–2★ words come back
  more often.
- **Know it** takes a word you already know out of your study (press it again to bring it back).
- **Settings** (in Stats): session length, new words per day, and the speed of the synthesized voice.
  Flashcards has its own "Play audio on flip" switch.
- **Your own words:** My lists → "Add my own word" adds a word with your definition and example.
- **Moving between devices:** Stats → Export progress saves a file; Import on the other device.
- **Sources:** Stats → "Sources & credits" (website) lists the dictionaries and the recording
  credits.

## Setup (local app)

The local app needs no API key to run. The key is only for building the dataset (below).

```bash
./setup.sh
```

This creates `.venv/`, installs `requirements.txt`, and creates a `.env` file. Edit `.env`:

| Setting | Why |
|---|---|
| `LEXIMASTER_CONTACT` | A URL or email address. Wikimedia's robot policy requires contact information in the User-Agent and blocks anonymous scripts. |
| `ANTHROPIC_API_KEY` | Building the dataset only: Claude expands the word lists and writes the study notes. Leave it empty to run the app. |

## 1. Build the dataset

```bash
.venv/bin/python build_dataset.py --limit 20   # quick end-to-end test on 20 words
.venv/bin/python build_dataset.py              # full build
.venv/bin/python build_dataset.py --status     # show progress
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
- `--budget 18`: stop enrichment once the estimated cost reaches $18 (rerun to continue).
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
- **Synthesized voice:** for words without an American recording, the app uses an installed
  en-US voice such as Ava, Samantha or Allison.

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
| Home | How many cards are left today (the same number as the badge), word of the day, streak and time studied. |
| Daily review | SM-2 spaced repetition, sized to your session length (default 15 minutes). Choose a scope: Everything, Everyday English, Advanced & subjects, or Bible vocabulary, names or both. A new word is answered Show again, Got it or Know it (known words leave the review); a word you've seen before is graded Again, Hard, Good or Easy. The answer shows a short card; "Full entry" opens the whole page. |
| Flashcards | Word on the front; flip for pronunciation, meaning, one example and common pairings. You can shuffle, play audio on flip, rate the word (1–5) or mark it known, and choose a scope, rating or list. |
| Matching | Timed rounds that pair words with meanings or with example sentences, with a score. |
| Quiz | Word to meaning, meaning to word, fill in the blank, synonyms, antonyms, and for Bible names "who or what is it?" or "person, place or people?". Only the question types you pick are asked. Changing a setting starts a new quiz; opening an entry and coming back keeps your place. Misses go back into today's review. |
| Listen | Hear a word, then pick it or type it. Also has a spelling test that compares your spelling letter by letter. |
| Pronounce | Play the reference recording, record yourself, and play both back with waveforms. |
| Browse | The full lexicon. It has A–Z jump, instant search across words and meanings, sorting by A–Z, frequency, stars or domain, and filters. On a phone, tapping a word brings its page into view (← List goes back). |
| My lists | Named lists with a note on each word, plus your own custom words. |
| Stats | Words mastered (and marked known), streak, activity heatmap, accuracy by domain, weakest words, test history and reviews due. Also holds the settings, progress export/import, and on the website "Download for offline use" and the sources. |

The sidebar runs in the order of a study day: Home, Daily review, the Practice group (easiest to
hardest: Flashcards, Matching, Quiz, Listen, Pronounce), the Words group (Browse, My lists), then Stats.
On a phone the bottom bar has five buttons in the same order: Home, Review, Practice, Browse and More
(My lists, Stats). Each practice tab remembers its own settings.

### The word page

Each entry reads from the top down:

1. The word, its sound, IPA and respelling, and one row of labels.
2. The meaning, with one example under it. For a Bible name, what the Bible says about it.
3. **Use it right:** how Americans use it, how it differs from near-synonyms, common mistakes, and
   common pairings.
4. **In the Bible**, and Orthodox, Catholic and Protestant views where they differ.
5. **More examples:** two shown, the rest folded.
6. **More meanings:** the dictionary's other senses, folded, in the dictionary's order.
7. **Pronunciation, register, related words, origin:** folded.
8. Your notes.

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
| / | Search (Browse) |
| Enter | Flip card / reveal / next |
| 1–4 | Answer in Daily review (the buttons are numbered); choose an answer in Quiz and Listen |
| R | Record (Pronounce) |
| ? | Show all shortcuts |

### How scheduling works

- **Grades:** Again, Hard, Good and Easy map to SM-2 quality scores 1, 3, 4 and 5. "Again" also puts the
  card back at the end of today's session, and lowers the word's ease by 0.2 (SM-2's own formula takes
  0.54, which soon pins a word at the minimum).
- **First sight:** Show again brings the word back later in the session and tomorrow, without counting as a
  lapse; Got it is a Good; Know it marks the word known (Undo in the message).
- **Stars:** 1★ and 2★ words never go more than 4 or 7 days between reviews. A word's star rating also
  sets its starting ease (1★ = 2.2 … 5★ = 2.8).
- **Practice misses:** a wrong answer in Quiz, Matching, Listen or the spelling test makes the word due
  today; only a quiz miss (a wrong meaning) lowers its ease. A word you missed before studying it
  counts as one of the day's new words.
- **New words:** each day introduces up to "New words per day" new words (default 12; set in Stats).
  1–2★ words come first, then unrated words, most frequent first (a phrase counts as common as its
  rarest word). With the Everything scope, everyday and advanced words alternate. Words marked known
  are skipped.
- **Mastered:** a word counts as mastered once its review interval reaches 21 days. Words marked known
  are counted separately in Stats.

### Your data

Everything is stored locally:

- `data/leximaster.db` (SQLite) holds your progress.
- `data/recordings/` holds your voice recordings.
- `data/words.json` and `data/audio/` hold the dataset.

**Stats → Export progress** saves a JSON file keyed by word rather than database ids, so it imports
into a rebuilt dataset too.

### Testing on a copy of your data

`LEXIMASTER_DB` points the app at another database file, so you can try things out without
touching your real progress:

```bash
cp data/leximaster.db /tmp/test.db
LEXIMASTER_DB=/tmp/test.db PORT=8766 ./run.sh
```

## Project layout

```
build_dataset.py   dataset builder (resumable)
seeds/             seed word lists, one word or phrase per line
seeds/examples/    hand-written conversation examples for the everyday domains
seeds/fixes/       hand corrections to any field of an entry (see its README.txt)
seeds/drop/        keys left out of the build (not real words, British spellings)
tools/             build_site.py (the website), audit.py (content checks), parity.py (website vs
                   local app), gen_shared.py (constants shared with the browser code),
                   check_examples.py, classify_names.py, check_bible.py (fact-checks the
                   "In the Bible" notes: verse references, Hebrew and Greek words)
app/               FastAPI backend: db.py (schema), srs.py (SM-2), api/ (routes)
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

The palette button at the bottom of the navigation picks a theme: Paper (light), Night (dark),
Mariana (slate blue-gray), or Match system, which follows your system's
light/dark setting. The choice is remembered in this browser.
