# LexiMaster

A local vocabulary trainer for American English, in two tracks:

- **Advanced and subject vocabulary** (about 10,000 words): advanced GRE/SAT-level words,
  academic, literary and professional vocabulary, and the subjects mathematics, statistics and
  probability, data science, artificial intelligence, software engineering, philosophy, logic,
  theology, Christian anthropology and Orthodox mysticism. The artificial intelligence terms
  (about 560, from AI history to LLMs, agents, safety and governance) also have hand-written
  examples.
- **Everyday English** (about 2,800 entries): the words, phrasal verbs and expressions of daily
  American life, grouped by situation: dining out, food and taste, shopping and errands, beach
  and outdoors, small talk, feelings and reactions, home and health, getting around, sports and
  pop culture, meetings, and phone and video calls, plus general phrasal verbs and idioms. Each
  entry has hand-written conversation examples, labeled by meaning.

- **Bible** (about 3,100 entries), following the Revised Standard Version: the curated vocabulary
  of Scripture and biblical studies (canon and versions, names of God, covenant and salvation,
  worship and offices, Hebrew and Greek terms, English expressions from the Bible), every person
  and place named five or more times from Genesis to Revelation, and the distinctive vocabulary
  of the biblical text. Study notes cite RSV passages, and where Eastern Orthodox, Roman Catholic
  and Protestant Christians understand a term differently, they give each tradition's view.
  It has two parts: **Bible · Vocabulary** (words, expressions, and the books of the Bible) and
  **Bible · Names** (about 980 names, each labeled Person, Place or People). Names come up in
  review only on a Bible names track, and the quiz asks "Who or what is it?". Names that became
  everyday English words (Goliath, Judas, good Samaritan, raise Cain) are in both parts, with the
  everyday meaning first. The labels live in `seeds/names/bible.txt` (`name | kind | everyday
  meaning`), written by `tools/classify_names.py` and checked by hand.

Every entry has American pronunciation (recorded or synthesized), and review is spaced repetition.

## Use it online

The website version runs entirely in your browser: https://fissehab.github.io/leximaster/

Your progress is saved in that browser on that device. Use Stats → Export / Import to move it between
devices, and Stats → "Download for offline use" to study without a connection. On a phone, use your
browser's "Add to Home Screen" to install it like an app.

To rebuild the site after changing the dataset:

```bash
.venv/bin/python tools/build_site.py   # writes docs/, which GitHub Pages serves
```

## Setup

```bash
./setup.sh
```

This creates `.venv/`, installs `requirements.txt`, and creates a `.env` file. Edit `.env`:

| Setting | Why |
|---|---|
| `LEXIMASTER_CONTACT` | A URL or email address. Wikimedia's robot policy requires contact information in the User-Agent and blocks anonymous scripts. |
| `ANTHROPIC_API_KEY` | Used by Claude Haiku 5.5 to expand the word lists and to write the nuance notes. |

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

After an enrichment run, `.venv/bin/python -c "import build_dataset as b; b.check_stress()"` flags entries whose
respelling stresses a different syllable than the IPA; `--stages enrich --retry-failed` then redoes them.
- `--concurrency 8`: number of parallel enrichment requests.
- `--effort low`: Claude effort level for enrichment.

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

Expected cost and time for about 13,400 words (medium effort):

- **Claude cost:** roughly US$10–12 (measured on the full lexicon).
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
| Home | Word of the day, today's queue, streak and time studied. |
| Browse | The full lexicon. It has A–Z jump, instant search across words and meanings, sorting by A–Z, frequency, stars or domain, and filters. Each entry shows the headword, IPA, recorded audio, parts of speech, definitions, and nuance panels: examples, pronunciation tip, register, near-synonyms, collocations, antonyms, analogy, etymology and common mistakes. |
| Flashcards | Word on the front; flip for pronunciation, meaning and examples. You can shuffle, play audio on flip, and filter by stars, list or domain. |
| Daily review | SM-2 spaced repetition, sized to your session length (default 15 minutes). Choose Everything, Everyday English, or Advanced & subjects; "Everything" alternates new words from both. Grade each card Again, Hard, Good or Easy. Shows a progress bar and a "Done for today" state. |
| Quiz | Five question types: word to meaning, meaning to word, fill in the blank, synonyms and antonyms. Misses go back into today's review. |
| Matching | Timed rounds that pair words with meanings or with example sentences, with a score. |
| Listen | Hear a word, then pick it or type it. Also has a spelling test that compares your spelling letter by letter. |
| Pronounce | Play the reference recording, record yourself, and play both back with waveforms. |
| My lists | Named lists with a note on each word, plus your own custom words. |
| Stats | Words mastered, streak, activity heatmap, accuracy by domain, weakest words, test history and reviews due. Also holds the settings and progress export/import. |

### Keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play pronunciation |
| ← → (↑ ↓ in Browse) | Previous / next word |
| 1–5 | Set star rating (Browse, Flashcards) |
| M | Mark known / unknown |
| / | Search (Browse) |
| Enter | Flip card / reveal / next |
| 1–4 | Grade in Daily review; choose an answer in Quiz and Listen |
| R | Record (Pronounce) |
| ? | Show all shortcuts |

### How scheduling works

- **Grades:** Again, Hard, Good and Easy map to SM-2 quality scores 1, 3, 4 and 5. "Again" also puts the
  card back at the end of today's session.
- **Stars:** 1★ and 2★ words never go more than 4 or 7 days between reviews. A word's star rating also
  sets its starting ease (1★ = 2.2 … 5★ = 2.8).
- **Practice misses:** a wrong answer in Quiz, Matching, Listen or the spelling test makes the word due
  today and lowers its ease.
- **New words:** each day introduces up to "New words per day" new words (default 12; set in Stats).
  1–2★ words come first, then unrated words, most frequent first. Words marked known are skipped.
- **Mastered:** a word counts as mastered once its review interval reaches 21 days, or when you mark
  it known.

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
tools/             check_examples.py: checks every everyday entry has examples
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
