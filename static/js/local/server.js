// The LexiMaster API running in the browser, for the static GitHub Pages
// build. It ports the FastAPI routes (app/api/*.py) to JavaScript over the
// same SQLite schema, using sql.js (SQLite compiled to WebAssembly).
//
// Data: data/index.json lists every word (enough for search, filters and
// quiz distractors); each word's full entry is in one of data/detail/NN.json,
// fetched on demand. The learner's progress is saved in IndexedDB in the
// Export format (the answer log as one key per answer) and restored on load
// with the Import logic, so a progress file moves freely between this site
// and the desktop app. See "persistence" for how several open tabs share it.

import { idbDelete, idbEntries, idbGet, idbKeys, idbPut, idbTx } from "./idb.js";
import { BIBLE_TRACKS, EVERYDAY_DOMAINS, FORM_OF } from "../shared.gen.js";

const EVERYDAY_SQL = `EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value IN (${
  EVERYDAY_DOMAINS.map(d => `'${d}'`).join(",")}))`;
const NEW_CARD_SECONDS = 35;
const DEFAULT_REVIEW_SECONDS = 14;
const MASTERED_INTERVAL = 21;
const DEFAULT_SETTINGS = { session_minutes: "15", new_per_day: "12", accent: "us", autoplay: "1", speech_rate: "0.9" };

const SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE words (
  id INTEGER PRIMARY KEY, key TEXT UNIQUE NOT NULL, word TEXT NOT NULL, freq_rank INTEGER, zipf REAL,
  domains TEXT NOT NULL DEFAULT '[]', has_audio INTEGER NOT NULL DEFAULT 0, enriched INTEGER NOT NULL DEFAULT 0,
  has_conv INTEGER NOT NULL DEFAULT 0, is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE user_word (word_id INTEGER PRIMARY KEY, stars INTEGER NOT NULL DEFAULT 0,
  known INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE srs (word_id INTEGER PRIMARY KEY, ease REAL NOT NULL DEFAULT 2.5, interval_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, due_date TEXT NOT NULL, last_reviewed TEXT);
CREATE INDEX srs_due ON srs(due_date);
CREATE TABLE review_log (id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL,
  ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')), mode TEXT NOT NULL, grade INTEGER,
  correct INTEGER NOT NULL, ms_taken INTEGER);
CREATE INDEX review_log_word ON review_log(word_id);
CREATE TABLE test_session (id INTEGER PRIMARY KEY, ts TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  kind TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, duration_s INTEGER NOT NULL DEFAULT 0);
CREATE TABLE daily_activity (date TEXT PRIMARY KEY, seconds INTEGER NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0, new_words INTEGER NOT NULL DEFAULT 0);
CREATE TABLE lists (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')));
CREATE TABLE list_words (list_id INTEGER NOT NULL, word_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
  added_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')), PRIMARY KEY (list_id, word_id));
CREATE TABLE recordings (word_id INTEGER PRIMARY KEY, path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const WORD_COLUMNS = `w.id, w.key, w.word, w.freq_rank, w.zipf, w.domains, w.has_audio, w.enriched, w.is_custom,
  COALESCE(u.stars, 0) AS stars, COALESCE(u.known, 0) AS known, COALESCE(u.notes, '') AS notes,
  s.due_date, s.interval_days, s.reps, s.ease, s.lapses, s.last_reviewed`;
const WORD_FROM = `FROM words w LEFT JOIN user_word u ON u.word_id = w.id LEFT JOIN srs s ON s.word_id = w.id`;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ------------------------------------------------------------------ database

let db = null;
let ready = null;
const INDEX = new Map();     // id -> index entry (short field names, see tools/build_site.py)
const DETAIL = new Map();    // id -> full data (meanings, nuance, examples, ...)
const SHARDS = new Map();    // shard number -> Promise of {key: data}
const recordingUrls = new Map();

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally { stmt.free(); }
}
const get = (sql, params) => all(sql, params)[0];
function run(sql, params = []) {
  db.run(sql, params);
  return { changes: db.getRowsModified(), lastId: get("SELECT last_insert_rowid() AS id").id };
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(503, `Couldn't load ${url} (${res.status}). Check your connection.`);
  return res.json();
}

async function boot() {
  await loadScript("static/vendor/sql-wasm.js");
  const SQL = await window.initSqlJs({ locateFile: f => `static/vendor/${f}` });
  db = new SQL.Database();
  db.exec(SCHEMA);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run("INSERT INTO settings(key, value) VALUES (?, ?)", [k, v]);
  const index = await fetchJson("data/index.json");
  db.exec("BEGIN");
  const stmt = db.prepare("INSERT INTO words(id, key, word, freq_rank, zipf, domains, has_audio, enriched, has_conv) " +
                          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  index.words.forEach((w, i) => {
    const id = i + 1;
    INDEX.set(id, w);
    stmt.run([id, w.k, w.w, w.f ?? null, w.z ?? null, JSON.stringify(w.d || []), w.a ? 1 : 0, w.e ? 1 : 0, w.c ? 1 : 0]);
  });
  stmt.free();
  db.exec("COMMIT");
  await withWriteLock(async () => {
    const state = await readState();
    const migrated = await migrateV1(state);
    rebuild(state);
    if (migrated) await persist();
  });
}

// Detail data for a word: a shard file for dictionary words, memory for custom ones.
async function detail(id) {
  if (DETAIL.has(id)) return DETAIL.get(id);
  const w = INDEX.get(id);
  if (!w) return {};
  if (!SHARDS.has(w.s)) {
    SHARDS.set(w.s, fetchJson(`data/detail/${String(w.s).padStart(2, "0")}.json`).catch(e => {
      SHARDS.delete(w.s);
      throw e;
    }));
  }
  const shard = await SHARDS.get(w.s);
  const data = shard[w.k] || {};
  DETAIL.set(id, data);
  return data;
}

// --------------------------------------------------------------- persistence

// IndexedDB "state" holds a snapshot ("progress": the export without the
// answer log), one "log:…" key per logged answer, and a revision number
// ("rev"). Every change runs under a Web Lock shared by all open tabs: it
// first reloads if another tab saved since (the revision moved), then saves
// before replying, so a reply always means "saved". Other tabs hear about the
// save on a BroadcastChannel and reload before their next request. Saved
// rows for words missing from this build ("orphans") are kept and re-saved.

const FORMAT = 2;
let localRev = 0;
let dirty = false;
let persistedLogId = 0;           // review_log rows up to this id are saved
let orphans = noOrphans();
let askedPersist = false;
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("leximaster") : null;
if (channel) channel.onmessage = e => { if (!e.data || e.data.rev !== localRev) dirty = true; };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") dirty = true; });

function noOrphans() { return { user_word: [], srs: [], list_words: [], review_log: [] }; }
const withWriteLock = fn => navigator.locks ? navigator.locks.request("lexi-write", fn) : fn();
const logSig = r => JSON.stringify([String(r.key), String(r.ts), r.mode, r.grade ?? null, Number(r.correct) ? 1 : 0, r.ms_taken ?? null]);
const newLogKey = ts => `log:${ts}|${Math.random().toString(36).slice(2, 10)}`;

async function readState() {
  try {
    const [rev, saved, log, recordings] = await Promise.all([
      idbGet("state", "rev"), idbGet("state", "progress"), idbEntries("state", "log:"), idbKeys("recordings")]);
    return { rev: rev || 0, saved, log: log.map(([, r]) => r), recordings };
  } catch (e) {
    throw new HttpError(503, "Couldn't read your saved progress, so nothing was changed. Reload the page to try again.");
  }
}

// Progress saved by an earlier version keeps its answer log inside the
// snapshot. Move each answer to its own key (adding only answers not already
// there, so running this twice changes nothing), keep a backup of the old
// snapshot, and continue in the new format. Returns whether it migrated.
async function migrateV1(state) {
  const old = state.saved && (state.saved.progress || state.saved);
  if (!old || state.saved.format === FORMAT) return false;
  const have = new Map();
  for (const r of state.log) have.set(logSig(r), (have.get(logSig(r)) || 0) + 1);
  const add = [];
  for (const r of Array.isArray(old.review_log) ? old.review_log : []) {
    if (!r || typeof r !== "object") continue;
    const sig = logSig(r);
    if (have.get(sig) > 0) have.set(sig, have.get(sig) - 1);
    else add.push({ key: r.key, ts: r.ts, mode: r.mode, grade: r.grade ?? null, correct: r.correct, ms_taken: r.ms_taken ?? null });
  }
  await idbTx("state", "readwrite", s => {
    s.get("progress_v1_backup").onsuccess = e => { if (e.target.result === undefined) s.put(state.saved, "progress_v1_backup"); };
    for (const r of add) s.put(r, newLogKey(r.ts));
  });
  const { review_log, ...rest } = old;
  state.saved = { format: FORMAT, progress: rest, meta: state.saved.meta || [] };
  state.log = state.log.concat(add);
  return true;
}

// Replace everything the learner owns in memory with the saved state.
function rebuild(state) {
  db.exec("BEGIN");
  for (const t of ["user_word", "srs", "review_log", "test_session", "daily_activity", "list_words", "lists", "recordings", "settings"]) {
    db.exec(`DELETE FROM ${t}`);
  }
  db.exec("DELETE FROM meta WHERE key LIKE 'wotd:%'");
  for (const r of all("SELECT id FROM words WHERE is_custom=1")) DETAIL.delete(r.id);
  db.exec("DELETE FROM words WHERE is_custom=1");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run("INSERT INTO settings(key, value) VALUES (?, ?)", [k, v]);
  db.exec("COMMIT");
  orphans = noOrphans();
  const snap = state.saved && (state.saved.progress || state.saved);
  if (snap) importProgress(snap, { restore: true });
  for (const m of (state.saved && state.saved.meta) || []) run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [m.key, m.value]);
  const ids = new Map(all("SELECT id, key FROM words").map(r => [r.key, r.id]));
  db.exec("BEGIN");
  const stmt = db.prepare("INSERT INTO review_log(word_id, ts, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?, ?)");
  for (const r of [...state.log].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))) {
    if (!ids.has(r.key)) { orphans.review_log.push(r); continue; }
    stmt.run([ids.get(r.key), String(r.ts), String(r.mode), r.grade ?? null, Number(r.correct) ? 1 : 0, r.ms_taken ?? null]);
  }
  stmt.free();
  for (const k of state.recordings) {
    if (ids.has(k)) run("INSERT OR REPLACE INTO recordings(word_id, path) VALUES (?, 'idb')", [ids.get(k)]);
  }
  db.exec("COMMIT");
  for (const url of recordingUrls.values()) URL.revokeObjectURL(url);
  recordingUrls.clear();
  persistedLogId = get("SELECT COALESCE(MAX(id), 0) AS n FROM review_log").n;
  localRev = state.rev;
  dirty = false;
}

// Reload from IndexedDB if another tab saved since this one last did.
async function syncIfStale() {
  let rev;
  try { rev = (await idbGet("state", "rev")) || 0; } catch (e) {
    throw new HttpError(503, "Couldn't read your saved progress, so nothing was changed. Reload the page to try again.");
  }
  if (rev !== localRev) {
    const state = await readState();
    const migrated = await migrateV1(state);   // a tab still running the old version saved
    rebuild(state);
    if (migrated) await persist();
  }
  dirty = false;
}

async function persist() {
  const progress = exportProgress({ snapshot: true });
  const meta = all("SELECT key, value FROM meta WHERE key LIKE 'wotd:%'");
  const newLog = all(`SELECT r.id, w.key, r.ts, r.mode, r.grade, r.correct, r.ms_taken FROM review_log r
                      JOIN words w ON w.id = r.word_id WHERE r.id > ? ORDER BY r.id`, [persistedLogId]);
  const rev = localRev + 1;
  await idbTx("state", "readwrite", s => {
    s.put({ format: FORMAT, progress, meta }, "progress");
    for (const { id, ...row } of newLog) s.put(row, newLogKey(row.ts));
    s.put(rev, "rev");
  });
  if (newLog.length) persistedLogId = newLog[newLog.length - 1].id;
  localRev = rev;
  if (channel) channel.postMessage({ rev });
  if (!askedPersist && navigator.storage && navigator.storage.persist) {
    askedPersist = true;
    navigator.storage.persist().catch(() => {});   // ask the browser not to evict progress
  }
}

// ------------------------------------------------------------------- helpers


function coreDefinition(data) {
  const core = (data.nuance || {}).core || {};
  if (core.definition) return [core.pos || "", core.definition];
  let first = null;
  for (const m of data.meanings || []) {
    for (const s of m.senses || []) {
      if (!s.definition) continue;
      if (!FORM_OF.test(s.definition)) return [m.pos || "", s.definition];
      first = first || [m.pos || "", s.definition];
    }
  }
  return first || ["", ""];
}

const audioUrl = file => file ? `media/${file}` : null;

function compact(row) {
  const w = INDEX.get(row.id);
  const d = w ? null : DETAIL.get(row.id) || {};   // custom words live in DETAIL
  const [corePos, def] = w ? [w.cp || "", w.df || ""] : coreDefinition(d);
  return {
    id: row.id, word: row.word,
    phonetic: w ? w.p || "" : d.phonetic || "",
    pos: w ? w.ps || [] : (d.meanings || []).map(m => m.pos).filter(Boolean),
    core_pos: corePos, def,
    domains: JSON.parse(row.domains),
    name_kind: w ? w.nk || "" : d.name_kind || "",
    freq_rank: row.freq_rank, has_audio: !!row.has_audio,
    audio_url: w ? audioUrl(w.a) : null,
    enriched: !!row.enriched, is_custom: !!row.is_custom,
    stars: row.stars, known: !!row.known, due: row.due_date,
  };
}

async function full(row) {
  const data = await detail(row.id);
  const out = compact(row);
  Object.assign(out, {
    audio_accent: out.audio_url ? "us" : "",
    meanings: data.meanings || [], nuance: data.nuance || null,
    synonyms: data.synonyms || [], antonyms: data.antonyms || [],
    etymology: data.etymology || "", variant_of: data.variant_of || "",
    conversation: data.conversation || [], source: data.source || "",
    notes: row.notes,
    srs: row.due_date == null ? null : {
      due: row.due_date, interval: row.interval_days, reps: row.reps, ease: row.ease, lapses: row.lapses,
    },
  });
  return out;
}

const fetchWord = id => get(`SELECT ${WORD_COLUMNS} ${WORD_FROM} WHERE w.id=?`, [id]);

function examplesFor(data) {
  const out = (data.conversation || []).map(e => e.text);
  const ex = (data.nuance || {}).examples || {};
  for (const k of ["everyday", "professional", "analytical"]) if (ex[k]) out.push(ex[k]);
  for (const m of data.meanings || []) for (const s of m.senses || []) if (s.example) out.push(s.example);
  return out;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Endings an inflected form may add (app/common.py SUFFIX).
const SUFFIX = "(?:e|es|ed|ing|er|ers|est|s|d|ly|y|ies|ied|ier|iest|ily)?";
function wordPattern(word, flags = "i") {
  const parts = word.trim().split(/[\s-]+/);
  let stem = parts[parts.length - 1];
  if (stem.length > 4 && /e$/.test(stem)) stem = stem.slice(0, -1);
  if (stem.length > 4 && /y$/.test(stem)) stem = stem.slice(0, -1);
  const head = parts.slice(0, -1).map(escapeRe).join("[\\s-]+");
  const body = (head ? head + "[\\s-]+" : "") + escapeRe(stem) + SUFFIX;
  return new RegExp(`\\b${body}\\b`, flags);
}
// Every use of the word blanked; "a"/"an" before a blank written "a(n)".
function blankSentence(word, sentence) {
  const out = sentence.replace(wordPattern(word, "gi"), "_____");
  return out === sentence ? null : out.replace(/\b([Aa])n? (?=_____)/g, "$1(n) ");
}
function isBaseForm(word, sentence) {
  const m = sentence.match(wordPattern(word));
  const norm = s => s.replace(/[\s-]+/g, " ").toLowerCase();
  return !!m && norm(m[0]) === norm(word.trim());
}

const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoDate(new Date());
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function bumpActivity({ seconds = 0, reviews = 0, newWords = 0 } = {}) {
  run(`INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET seconds=seconds+excluded.seconds, reviews=reviews+excluded.reviews,
       new_words=new_words+excluded.new_words`, [todayIso(), seconds, reviews, newWords]);
}

// Bible names that aren't also vocabulary: studied only when chosen.
const NAMES_ONLY_SQL = "(EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'bible_names') " +
  "AND NOT EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = 'bible_vocab'))";
const SCOPES = ["everyday", "core", ...BIBLE_TRACKS];  // study tracks, usable wherever a domain filter is

function trackClause(track) {
  if (track === "everyday") return EVERYDAY_SQL;
  if (track === "core") return `NOT ${EVERYDAY_SQL} AND NOT ${NAMES_ONLY_SQL}`;
  if (BIBLE_TRACKS.includes(track)) return `EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = '${track}')`;
  return "1=1";
}

function parseFilters(q) {
  const stars = q.stars ? q.stars.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number) : null;
  return { stars: stars && stars.length ? stars : null, list_id: Number(q.list_id) || null, domain: q.domain || null,
           exclude_known: true };
}

function poolIds({ stars = null, list_id = null, domain = null, need_audio = false, need_enriched = false,
                   exclude_known = false } = {}) {
  const where = ["1=1"], args = [];
  let joins = "LEFT JOIN user_word u ON u.word_id = w.id";
  if (stars) { where.push(`COALESCE(u.stars, 0) IN (${stars.map(() => "?").join(",")})`); args.push(...stars); }
  if (list_id) { joins += " JOIN list_words lw ON lw.word_id = w.id AND lw.list_id = ?"; args.unshift(list_id); }
  if (SCOPES.includes(domain)) where.push(trackClause(domain));
  else if (domain) { where.push("EXISTS (SELECT 1 FROM json_each(w.domains) WHERE json_each.value = ?)"); args.push(domain); }
  else if (!list_id) where.push(`NOT ${NAMES_ONLY_SQL}`);  // Bible names only when chosen (or in your own list)
  if (need_audio) where.push("w.has_audio = 1");
  if (need_enriched) where.push("w.enriched = 1");
  if (exclude_known) where.push("COALESCE(u.known, 0) = 0");
  return all(`SELECT w.id FROM words w ${joins} WHERE ${where.join(" AND ")}`, args).map(r => r.id);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const choice = a => a[Math.floor(Math.random() * a.length)];

// Prefer weaker words: low stars and recent misses are drawn more often.
function weightedSample(ids, n) {
  if (ids.length <= n) return shuffle([...ids]);
  const info = new Map(all(
    `SELECT w.id, COALESCE(u.stars, 0) AS stars,
            (SELECT COUNT(*) FROM review_log r WHERE r.word_id = w.id AND r.correct = 0) AS misses
     FROM words w LEFT JOIN user_word u ON u.word_id = w.id`).map(r => [r.id, r]));
  const starW = { 0: 1.0, 1: 2.5, 2: 2.0, 3: 1.2, 4: 0.7, 5: 0.4 };
  const pool = [...ids];
  const weights = pool.map(i => {
    const r = info.get(i);
    return r ? (starW[r.stars] ?? 1.0) * (1 + Math.min(r.misses, 5) * 0.5) : 1.0;
  });
  const chosen = [];
  while (pool.length && chosen.length < n) {
    let x = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while (i < weights.length - 1 && x >= weights[i]) { x -= weights[i]; i++; }
    chosen.push(pool.splice(i, 1)[0]);
    weights.splice(i, 1);
  }
  return chosen;
}

const settingsMap = () => Object.fromEntries(all("SELECT key, value FROM settings").map(r => [r.key, r.value]));

// -------------------------------------------------------------- SM-2 (app/srs.py)

const QUALITY = { 0: 1, 1: 3, 2: 4, 3: 5 };
const MIN_EASE = 1.3;
const STAR_INTERVAL_CAP = { 1: 4, 2: 7 };
const STAR_START_EASE = { 0: 2.5, 1: 2.2, 2: 2.35, 3: 2.5, 4: 2.65, 5: 2.8 };

const LAPSE_EASE = 0.2;
// Python's round(): halves go to the even number, so both apps schedule alike.
function roundHalfEven(x) {
  const f = Math.floor(x);
  if (x - f === 0.5) return f % 2 === 0 ? f : f + 1;   // same doubles as Python, so an exact test matches
  return Math.round(x);
}

const getCard = id => get("SELECT * FROM srs WHERE word_id=?", [id]);
const starsOf = id => (get("SELECT stars FROM user_word WHERE word_id=?", [id]) || { stars: 0 }).stars;

function ensureCard(id) {
  const card = getCard(id);
  if (card) return card;
  run("INSERT INTO srs(word_id, ease, interval_days, reps, lapses, due_date) VALUES (?, ?, 0, 0, 0, ?)",
      [id, STAR_START_EASE[starsOf(id)] ?? 2.5, todayIso()]);
  return getCard(id);
}

function schedule(card, grade, stars) {
  const q = QUALITY[grade];
  let { ease, interval_days: interval, reps, lapses } = card;
  if (q < 3 && reps === 0 && lapses === 0 && !card.last_reviewed) {
    // A new word missed the first time it is seen isn't a lapse: it comes
    // back tomorrow without lowering its ease.
    return { ease, interval_days: 1, reps: 0, lapses: 0, due_date: addDays(1), last_reviewed: todayIso() };
  }
  if (q < 3) {
    reps = 0; lapses += 1; interval = 1;
  } else {
    if (reps === 0) interval = grade === 1 ? 1 : (grade === 3 ? 4 : 1);
    else if (reps === 1) interval = grade === 1 ? 3 : (grade === 2 ? 6 : 8);
    else {
      const factor = { 1: 1.2, 2: ease, 3: ease * 1.3 }[grade];
      interval = Math.max(interval + 1, roundHalfEven(interval * factor));
    }
    reps += 1;
  }
  ease = q < 3 ? Math.max(MIN_EASE, ease - LAPSE_EASE)   // SM-2's own formula takes 0.54
    : Math.max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const cap = STAR_INTERVAL_CAP[stars];
  if (cap) interval = Math.min(interval, cap);
  return { ease: Math.round(ease * 1000) / 1000, interval_days: interval, reps, lapses,
           due_date: addDays(Math.trunc(interval)), last_reviewed: todayIso() };
}

function review(id, grade) {
  const next = schedule(ensureCard(id), grade, starsOf(id));
  run("UPDATE srs SET ease=?, interval_days=?, reps=?, lapses=?, due_date=?, last_reviewed=? WHERE word_id=?",
      [next.ease, next.interval_days, next.reps, next.lapses, next.due_date, next.last_reviewed, id]);
  return next;
}

// Only a quiz miss (a wrong meaning) lowers ease (app/srs.py penalise_miss).
function penaliseMiss(id, firstMissToday, mode = "quiz") {
  const card = ensureCard(id);
  const ease = firstMissToday && card.reps && mode === "quiz" ? Math.max(MIN_EASE, card.ease - 0.2) : card.ease;
  run("UPDATE srs SET due_date=?, ease=?, interval_days=MIN(interval_days, 1) WHERE word_id=?", [todayIso(), ease, id]);
}

function onStarsChanged(id, stars) {
  const card = getCard(id);
  const cap = STAR_INTERVAL_CAP[stars];
  if (!card || !cap) return;
  const latest = addDays(cap);
  if (card.due_date > latest) {
    run("UPDATE srs SET due_date=?, interval_days=? WHERE word_id=?", [latest, Math.min(card.interval_days, cap), id]);
  }
}

// ------------------------------------------------------------- words routes

function needWord(id) {
  if (!get("SELECT 1 AS x FROM words WHERE id=?", [id])) throw new HttpError(404, "Word not found");
}

function listWords() {
  const rows = all(`SELECT ${WORD_COLUMNS} ${WORD_FROM} ORDER BY w.word COLLATE NOCASE`);
  const membership = new Map();
  for (const r of all("SELECT list_id, word_id FROM list_words")) {
    if (!membership.has(r.word_id)) membership.set(r.word_id, []);
    membership.get(r.word_id).push(r.list_id);
  }
  return { words: rows.map(r => ({ ...compact(r), lists: membership.get(r.id) || [] })) };
}

async function wordDetail(id) {
  const row = fetchWord(id);
  if (!row) throw new HttpError(404, "Word not found");
  const out = await full(row);
  const st = get("SELECT COUNT(*) AS n, COALESCE(SUM(correct), 0) AS ok FROM review_log WHERE word_id=? AND mode != 'review'", [id]);
  out.accuracy = { attempts: st.n, correct: st.ok };
  out.lists = all("SELECT l.id, l.name, lw.note FROM list_words lw JOIN lists l ON l.id = lw.list_id WHERE lw.word_id=? ORDER BY l.name", [id]);
  out.recording_url = get("SELECT 1 AS x FROM recordings WHERE word_id=?", [id]) ? await recordingUrl(id) : null;
  return out;
}

function setState(id, body) {
  needWord(id);
  run("INSERT OR IGNORE INTO user_word(word_id) VALUES (?)", [id]);
  if (body.stars != null) {
    const stars = Number(body.stars);
    if (!(stars >= 0 && stars <= 5)) throw new HttpError(422, "Stars must be between 0 and 5.");
    run("UPDATE user_word SET stars=?, updated_at=datetime('now') WHERE word_id=?", [stars, id]);
    onStarsChanged(id, stars);
  }
  if (body.known != null) run("UPDATE user_word SET known=?, updated_at=datetime('now') WHERE word_id=?", [body.known ? 1 : 0, id]);
  if (body.notes != null) run("UPDATE user_word SET notes=?, updated_at=datetime('now') WHERE word_id=?", [String(body.notes), id]);
  const r = get("SELECT stars, known, notes FROM user_word WHERE word_id=?", [id]);
  return { stars: r.stars, known: !!r.known, notes: r.notes };
}

async function addCustomWord(body) {
  const word = String(body.word || "").trim();
  const definition = String(body.definition || "").trim();
  if (!word || word.length > 80 || !definition) throw new HttpError(422, "A word and a definition are required.");
  const key = "custom:" + word.toLowerCase().replace(/ /g, "-");
  const data = {
    phonetic: String(body.phonetic || "").trim(), audio: null,
    meanings: [{ pos: String(body.pos || "").trim() || "word", senses: [
      { definition, example: String(body.example || "").trim(), synonyms: [], antonyms: [] }], synonyms: [], antonyms: [] }],
    nuance: null, source: "custom",
  };
  if (get("SELECT 1 AS x FROM words WHERE key=?", [key])) throw new HttpError(409, `You already added “${word}”.`);
  if (body.list_id && !get("SELECT 1 AS x FROM lists WHERE id=?", [body.list_id])) {
    throw new HttpError(404, "That list no longer exists.");
  }
  const { lastId } = run(`INSERT INTO words(key, word, domains, has_audio, enriched, is_custom) VALUES (?, ?, '["custom"]', 0, 0, 1)`, [key, word]);
  DETAIL.set(lastId, data);
  if (body.notes) run("INSERT INTO user_word(word_id, notes) VALUES (?, ?)", [lastId, String(body.notes)]);
  if (body.list_id) run("INSERT OR IGNORE INTO list_words(list_id, word_id) VALUES (?, ?)", [body.list_id, lastId]);
  return full(fetchWord(lastId));
}

async function deleteCustomWord(id) {
  const row = get("SELECT is_custom FROM words WHERE id=?", [id]);
  if (!row) throw new HttpError(404, "Word not found");
  if (!row.is_custom) throw new HttpError(400, "Only words you added yourself can be deleted.");
  const key = get("SELECT key FROM words WHERE id=?", [id]).key;
  for (const t of ["user_word", "srs", "review_log", "list_words", "recordings"]) run(`DELETE FROM ${t} WHERE word_id=?`, [id]);
  run("DELETE FROM words WHERE id=?", [id]);
  DETAIL.delete(id);
  await idbDelete("recordings", key);
  const logKeys = (await idbEntries("state", "log:")).filter(([, r]) => r.key === key).map(([k]) => k);
  if (logKeys.length) await idbTx("state", "readwrite", s => logKeys.forEach(k => s.delete(k)));
  return { ok: true };
}

async function wordOfTheDay() {
  const today = todayIso();
  const todayKey = `wotd:${today}`;
  const saved = get("SELECT value FROM meta WHERE key=?", [todayKey]);
  if (saved && get("SELECT 1 AS x FROM words WHERE id=?", [Number(saved.value)])) return full(fetchWord(Number(saved.value)));
  const base = "SELECT w.id FROM words w LEFT JOIN user_word u ON u.word_id = w.id LEFT JOIN srs s ON s.word_id = w.id " +
               `WHERE COALESCE(u.known, 0) = 0 AND s.word_id IS NULL AND w.is_custom = 0 AND ${trackClause("core")} `;
  let ids = [];
  for (const extra of ["AND w.enriched = 1 AND w.zipf < 3.5",
                       `AND w.zipf < 3.3 AND w.domains NOT IN ('["academic"]', '["professional"]')`, ""]) {
    ids = all(base + extra + " ORDER BY w.id").map(r => r.id);
    if (ids.length) break;
  }
  if (!ids.length) ids = all("SELECT id FROM words ORDER BY id").map(r => r.id);
  if (!ids.length) throw new HttpError(404, "No words yet.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(today)));
  let h = 0n;
  for (const b of digest) h = (h << 8n) | BigInt(b);
  const id = ids[Number(h % BigInt(ids.length))];
  run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [todayKey, String(id)]);
  return full(fetchWord(id));
}

// --------------------------------------------------------------- lists routes

function cleanListName(name) {
  const v = String(name || "").split(/\s+/).filter(Boolean).join(" ");
  if (!v) throw new HttpError(422, "Give the list a name.");
  if (v.length > 60) throw new HttpError(422, "List names can be at most 60 characters.");
  return v;
}
function nameTaken(name, exceptId = null) {
  const row = get("SELECT id FROM lists WHERE lower(name) = lower(?)", [name]);
  return !!(row && row.id !== exceptId);
}
const allLists = () => ({ lists: all(
  "SELECT l.id, l.name, l.created_at, COUNT(lw.word_id) AS count FROM lists l " +
  "LEFT JOIN list_words lw ON lw.list_id = l.id GROUP BY l.id ORDER BY l.name") });

function createList(body) {
  const name = cleanListName(body.name);
  if (nameTaken(name)) throw new HttpError(409, `A list called “${name}” already exists.`);
  return { id: run("INSERT INTO lists(name) VALUES (?)", [name]).lastId, name, count: 0 };
}
function renameList(id, body) {
  const name = cleanListName(body.name);
  if (nameTaken(name, id)) throw new HttpError(409, `A list called “${name}” already exists.`);
  if (!run("UPDATE lists SET name=? WHERE id=?", [name, id]).changes) throw new HttpError(404, "List not found");
  return { ok: true };
}
function deleteList(id) {
  run("DELETE FROM list_words WHERE list_id=?", [id]);
  run("DELETE FROM lists WHERE id=?", [id]);
  return { ok: true };
}
function listDetail(id) {
  const lst = get("SELECT id, name, created_at FROM lists WHERE id=?", [id]);
  if (!lst) throw new HttpError(404, "List not found");
  const rows = all(`SELECT ${WORD_COLUMNS}, lw.note AS list_note ${WORD_FROM} JOIN list_words lw ON lw.word_id = w.id ` +
                   "AND lw.list_id = ? ORDER BY w.word COLLATE NOCASE", [id]);
  return { ...lst, words: rows.map(r => ({ ...compact(r), list_note: r.list_note })) };
}
function addToList(id, body) {
  if (!get("SELECT 1 AS x FROM lists WHERE id=?", [id])) throw new HttpError(404, "List not found");
  needWord(Number(body.word_id));
  run("INSERT INTO list_words(list_id, word_id, note) VALUES (?, ?, ?) ON CONFLICT(list_id, word_id) DO NOTHING",
      [id, Number(body.word_id), String(body.note || "")]);
  return { ok: true };
}

// ------------------------------------------------------------ practice routes

function avgReviewSeconds() {
  const row = get("SELECT AVG(ms_taken) AS ms FROM (SELECT ms_taken FROM review_log WHERE mode='review' " +
                  "AND ms_taken BETWEEN 1000 AND 120000 ORDER BY id DESC LIMIT 200)");
  return row && row.ms ? row.ms / 1000 + 3 : DEFAULT_REVIEW_SECONDS;
}

function newWords(clause, n) {
  if (n <= 0) return [];
  const then = clause === trackClause("everyday") ? "(w.id * 7919) % 10007" : "w.freq_rank";
  const order = "ORDER BY CASE WHEN COALESCE(u.stars,0) BETWEEN 1 AND 2 THEN 0 " +
                `WHEN COALESCE(u.stars,0) = 0 THEN 1 ELSE 2 END, ${then} ASC LIMIT ?`;
  const base = `SELECT ${WORD_COLUMNS} ${WORD_FROM} WHERE s.word_id IS NULL AND COALESCE(u.known, 0) = 0 AND ${clause} `;
  let rows = all(base + "AND (w.enriched = 1 OR w.is_custom = 1 OR w.has_conv = 1) " + order, [n]);
  if (!rows.length) rows = all(base + order, [n]);
  return rows;
}

async function reviewQueue(q) {
  const extra = Math.max(0, Number(q.extra) || 0);
  const track = q.track || "";
  const tr = trackClause(track);
  const st = settingsMap();
  const budget = Number(st.session_minutes) * 60;
  const perReview = avgReviewSeconds();
  const act = get("SELECT reviews, new_words, seconds FROM daily_activity WHERE date=?", [todayIso()]);
  const due = all(`SELECT ${WORD_COLUMNS} ${WORD_FROM} WHERE s.due_date <= ? AND COALESCE(u.known, 0) = 0 AND ${tr} ` +
                  "ORDER BY s.due_date ASC, COALESCE(u.stars, 0) ASC, s.ease ASC", [todayIso()]);
  let used = 0;
  const rows = [];
  // A card made by a practice miss but never reviewed is still a new word:
  // it takes one of the day's new-word places (app/api/practice.py).
  const isUnseen = r => r.reps === 0 && r.last_reviewed == null;
  for (const r of due.filter(r => !isUnseen(r))) {
    if (used + perReview > budget && rows.length) break;
    rows.push([r, false]);
    used += perReview;
  }
  const remaining = Math.max(0, budget - used);
  const newCap = Math.max(0, Number(st.new_per_day) - (act ? act.new_words : 0)) + extra;
  let nNew = Math.min(newCap, Math.floor(remaining / NEW_CARD_SECONDS) + extra);
  const unseen = due.filter(isUnseen).slice(0, Math.max(0, nNew));
  for (const r of unseen) rows.push([r, true]);
  nNew -= unseen.length;
  if (nNew > 0) {
    let fresh;
    if (track) fresh = newWords(tr, nNew);
    else {
      const a = newWords(trackClause("everyday"), Math.ceil(nNew / 2));
      const b = newWords(trackClause("core"), nNew);
      fresh = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i < a.length) fresh.push(a[i]);
        if (i < b.length) fresh.push(b[i]);
      }
      fresh = fresh.slice(0, nNew);
    }
    for (const r of fresh) rows.push([r, true]);
  }
  if (q.count) {
    // Only the numbers (Home, the nav badge): same selection, no card details.
    const nNewCards = rows.filter(([, isNew]) => isNew).length;
    return { total: rows.length, due: rows.length - nNewCards, new: nNewCards, due_total: due.length,
             est_seconds: rows.length ? Math.round(used + nNewCards * NEW_CARD_SECONDS) : 0,
             done_today: { reviews: act ? act.reviews : 0, new: act ? act.new_words : 0, seconds: act ? act.seconds : 0 } };
  }
  const queue = await Promise.all(rows.map(async ([r, isNew]) => ({ ...(await full(r)), is_new: isNew })));
  return {
    queue, due_total: due.length,
    done_today: { reviews: act ? act.reviews : 0, new: act ? act.new_words : 0, seconds: act ? act.seconds : 0 },
    target_seconds: budget,
    est_seconds: queue.length ? Math.round(used + queue.filter(c => c.is_new).length * NEW_CARD_SECONDS) : 0,
  };
}

function submitReview(id, body) {
  needWord(id);
  const grade = Number(body.grade);
  if (![0, 1, 2, 3].includes(grade)) throw new HttpError(422, "Grade must be 0-3.");
  const result = body.repeat ? (getCard(id) || {}) : review(id, grade);
  run("INSERT INTO review_log(word_id, mode, grade, correct, ms_taken) VALUES (?, 'review', ?, ?, ?)",
      [id, grade, grade >= 1 ? 1 : 0, Number(body.ms) || 0]);
  bumpActivity({ reviews: 1, newWords: body.is_new && !body.repeat ? 1 : 0 });
  return result;
}

function recordAnswer(body) {
  const id = Number(body.word_id);
  if (!/^(quiz|match|listen|spell|flash)$/.test(body.mode || "")) throw new HttpError(422, "Unknown mode.");
  needWord(id);
  run("INSERT INTO review_log(word_id, mode, correct, ms_taken) VALUES (?, ?, ?, ?)",
      [id, body.mode, body.correct ? 1 : 0, Number(body.ms) || 0]);
  if (!body.correct) {
    const n = get("SELECT COUNT(*) AS n FROM review_log WHERE word_id=? AND correct=0 AND mode != 'review' " +
                  "AND date(ts) = date('now', 'localtime')", [id]).n;
    penaliseMiss(id, n <= 1, body.mode);
  }
  return { ok: true };
}

async function flashcards(q) {
  const filters = parseFilters(q);
  const n = Math.min(500, Math.max(1, Number(q.n) || 30));
  const pool = poolIds(filters);
  const ids = q.shuffle === "false" ? pool.slice(0, n) : weightedSample(pool, n);
  return { cards: await Promise.all(ids.map(i => full(fetchWord(i)))), pool: pool.length };
}

const QUIZ_TYPES = ["word_meaning", "meaning_word", "fill_blank", "synonym", "antonym", "name_kind"];
const NAME_KINDS = { person: "A person", place: "A place", people: "A people or nation" };
const mask = (word, text) => text.replace(new RegExp(escapeRe(word), "gi"), "…");
// A definition as a quiz option: masked, without a leading "In statistics,".
function option(word, definition) {
  const text = mask(word, definition).replace(/^In (?!an? )[A-Za-z' -]{1,40}, /, "");   // not "In a clear, careful way"
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// Right answers for a synonym or antonym question; "Compared with" words
// (nuance distinctions) never count as synonyms, even when a dictionary lists them.
function rightsFor(data, kind) {
  const field = kind === "synonym" ? "synonyms" : "antonyms";
  let out = [...(kind === "antonym" ? (data.nuance || {}).antonyms || [] : []), ...(data[field] || [])];
  for (const m of data.meanings || []) out = out.concat(m[field] || []);
  const contrasted = new Set(((data.nuance || {}).distinctions || []).map(d => (d.vs || "").toLowerCase()));
  return [...new Set(out)].filter(r => r && !(kind === "synonym" && contrasted.has(r.toLowerCase())));
}

function defsById(ids) {
  const out = new Map();
  if (!ids.length) return out;
  for (const r of all(`SELECT id, word FROM words WHERE id IN (${ids.map(() => "?").join(",")})`, ids)) {
    const w = INDEX.get(r.id);
    const [pos, d] = w ? [w.cp || "", w.df || ""] : coreDefinition(DETAIL.get(r.id) || {});
    if (d) out.set(r.id, [r.word, pos, d]);
  }
  return out;
}

async function makeQuiz(q) {
  const asked = (q.types || QUIZ_TYPES.join(",")).split(",").filter(t => QUIZ_TYPES.includes(t));
  const types = asked.length ? asked : QUIZ_TYPES;
  const n = Math.min(50, Math.max(1, Number(q.n) || 10));
  const filters = parseFilters(q);
  if (types.length === 1 && types[0] === "name_kind" && !filters.list_id && !BIBLE_TRACKS.includes(filters.domain)) {
    filters.domain = "bible_names";   // only names can be asked "who or what?"
  }
  const pool = poolIds(filters);
  if (pool.length < 4) throw new HttpError(400, "Not enough words match these filters. Choose a wider set.");
  let allIds = all(`SELECT id FROM words w WHERE (enriched = 1 OR is_custom = 1) AND NOT ${NAMES_ONLY_SQL}`).map(r => r.id);
  if (allIds.length < 50) allIds = all("SELECT id FROM words").map(r => r.id);
  const questions = [];
  // Fewer question types fit fewer words: look at more of them.
  const candidates = weightedSample(pool, Math.min(pool.length, n * (types.length > 2 ? 4 : 10)));
  // Load the words' details together rather than one shard at a time.
  const details = new Map(await Promise.all(candidates.slice(0, n * 2).map(async id => [id, await detail(id)])));
  for (const wid of candidates) {
    if (questions.length >= n) break;
    const row = fetchWord(wid);
    const data = details.get(wid) || await detail(wid);
    const [pos, definition] = INDEX.has(wid) ? [INDEX.get(wid).cp || "", INDEX.get(wid).df || ""] : coreDefinition(data);
    const word = row.word;
    const nameKind = INDEX.has(wid) ? INDEX.get(wid).nk || "" : "";
    const domains = JSON.parse(row.domains || "[]");
    const everyday = nameKind ? ["bible_names"] : domains.filter(d => EVERYDAY_DOMAINS.includes(d));
    const distractIds = everyday.length
      ? all("SELECT id FROM words w WHERE id != ? AND EXISTS (SELECT 1 FROM json_each(w.domains) " +
            `WHERE json_each.value IN (${everyday.map(() => "?").join(",")})) ORDER BY random() LIMIT 30`,
            [wid, ...everyday]).map(r => r.id)
      // Other words of the chosen scope ("Statistics", "Bible · Vocabulary"), else any word.
      : shuffle((q.domain && pool.length >= 30 ? pool : allIds).filter(i => i !== wid)).slice(0, 30);
    const nWords = word.split(/\s+/).length;
    // A definition that names its own word would read "the …eans" once masked.
    const others = [...defsById(distractIds).values()]
      .filter(v => v[0].toLowerCase() !== word.toLowerCase() && !new RegExp(`\\b${escapeRe(v[0])}\\b`, "i").test(v[2]))
      .sort((a, b) => ((a[0].split(/\s+/).length !== nWords) - (b[0].split(/\s+/).length !== nWords)) ||
                      ((a[1] !== pos) - (b[1] !== pos)));
    const build = qtype => {
      if (qtype === "name_kind") {
        return { prompt: word, ask: `Who or what is ${word}?`, answer: NAME_KINDS[nameKind], options: Object.values(NAME_KINDS) };
      }
      if (qtype === "word_meaning" && definition && others.length >= 3) {
        return { prompt: word, ask: nameKind ? `Who or what is ${word}?` : "What does this word mean?",
                 answer: option(word, definition),
                 options: [...others.slice(0, 3).map(o => option(o[0], o[2])), option(word, definition)] };
      }
      if (qtype === "meaning_word" && definition && others.length >= 3) {
        return { prompt: mask(word, definition), ask: "Which word fits this meaning?", answer: word,
                 options: [...others.slice(0, 3).map(o => o[0]), word] };
      }
      if (qtype === "fill_blank" && others.length >= 3) {
        const examples = examplesFor(data);
        // Prefer sentences that use the word as the options show it.
        const usable = examples.filter(e => isBaseForm(word, e));
        const sentences = (usable.length ? usable : examples).map(e => blankSentence(word, e)).filter(Boolean);
        if (sentences.length) {
          return { prompt: choice(sentences), ask: "Fill in the blank.", answer: word,
                   options: [...others.slice(0, 3).map(o => o[0]), word] };
        }
      }
      if (qtype === "synonym" || qtype === "antonym") {
        const rights = rightsFor(data, qtype).filter(r => r.toLowerCase() !== word.toLowerCase());
        if (!rights.length) return null;
        const right = choice(rights);
        // Wrong options: other words' synonyms; never this word's own
        // synonyms or antonyms, and for antonyms never from its own subject.
        const own = new Set([...rightsFor(data, "synonym"), ...rightsFor(data, "antonym"), word].map(s => s.toLowerCase()));
        let wrongs = [];
        for (const id of shuffle([...allIds]).slice(0, 80)) {
          const e = INDEX.get(id);
          if (!e || (qtype === "antonym" && (e.d || []).some(d => domains.includes(d)))) continue;
          wrongs = wrongs.concat((e.sy || []).filter(s => !own.has(s.toLowerCase())));
        }
        wrongs = shuffle([...new Set(wrongs)]);
        const size = right.split(/\s+/).length;
        wrongs.sort((a, b) => (a.split(/\s+/).length !== size) - (b.split(/\s+/).length !== size));
        if (wrongs.length >= 3) {
          return { prompt: word, ask: qtype === "synonym" ? "Which is closest in meaning?" : "Which is opposite in meaning?",
                   answer: right, options: [...wrongs.slice(0, 3), right] };
        }
      }
      return null;
    };
    // Only the chosen kinds of question. People are asked "person, place or
    // people?" less often (two in five), or "A person" would be right two times in three.
    let kinds = shuffle([...types]);
    kinds = nameKind
      ? kinds.filter(k => (k === "name_kind" || k === "word_meaning") &&
                          !(k === "name_kind" && nameKind === "person" && Math.random() < 0.6))
      : kinds.filter(k => k !== "name_kind");
    let qn = null, qtype = null;
    for (qtype of kinds) if ((qn = build(qtype))) break;
    if (!qn) continue;
    shuffle(qn.options);
    const everydayEx = (data.nuance && data.nuance.examples || {}).everyday;
    // A name's "everyday" line is about a namesake.
    const example = examplesFor(data).find(e => !(nameKind && e === everydayEx)) || "";
    Object.assign(qn, { type: qtype, word_id: wid, word, definition, example, phonetic: data.phonetic || "",
                        audio_url: INDEX.has(wid) ? audioUrl(INDEX.get(wid).a) : null });
    questions.push(qn);
  }
  return { questions };
}

async function matching(q) {
  const n = Math.min(10, Math.max(3, Number(q.n) || 6));
  const pool = poolIds(parseFilters(q));
  const pairs = [];
  const candidates = weightedSample(pool, Math.min(pool.length, n * 5));
  // Example sentences live in the detail files: load them together.
  if (q.kind === "example") await Promise.all(candidates.slice(0, n * 2).map(id => detail(id)));
  for (const wid of candidates) {
    if (pairs.length >= n) break;
    const row = fetchWord(wid);
    let right;
    if (q.kind === "example") {
      const sentences = examplesFor(await detail(wid)).map(e => blankSentence(row.word, e)).filter(Boolean);
      if (!sentences.length) continue;
      right = choice(sentences);
    } else {
      const [, d] = INDEX.has(wid) ? [0, INDEX.get(wid).df] : coreDefinition(DETAIL.get(wid) || {});
      if (!d) continue;
      right = mask(row.word, d);
    }
    pairs.push({ word_id: wid, word: row.word, match: right });
  }
  if (pairs.length < 3) throw new HttpError(400, "Not enough words with this kind of content. Try another filter.");
  return { pairs };
}

async function listen(q) {
  const n = Math.min(50, Math.max(1, Number(q.n) || 10));
  const filters = parseFilters(q);
  const audioOnly = q.audio_only === "true";
  let pool = poolIds({ ...filters, need_audio: audioOnly });
  let fallback = false;
  if (audioOnly && pool.length < 4) { pool = poolIds(filters); fallback = true; }
  if (pool.length < 4) throw new HttpError(400, "Not enough words match these filters.");
  const items = [];
  for (const wid of weightedSample(pool, n)) {
    const item = await full(fetchWord(wid));
    const w = item.word;
    const spaces = (w.match(/ /g) || []).length;
    const words = all("SELECT word FROM words WHERE length(word) - length(replace(word, ' ', '')) = ? " +
                      "AND lower(word) != lower(?) ORDER BY random() LIMIT 200", [spaces, w]).map(r => r.word);
    if (words.length < 3) {
      words.push(...all("SELECT word FROM words WHERE lower(word) != lower(?) ORDER BY random() LIMIT 200", [w]).map(r => r.word));
    }
    words.sort((a, b) => ((a[0].toLowerCase() !== w[0].toLowerCase()) - (b[0].toLowerCase() !== w[0].toLowerCase())) ||
                         (Math.abs(a.length - w.length) - Math.abs(b.length - w.length)));
    item.options = shuffle([...words.slice(0, 3), w]);
    items.push(item);
  }
  return { items, fallback };
}

async function practiceWords(q) {
  const n = Math.min(500, Math.max(1, Number(q.n) || 40));
  return { words: weightedSample(poolIds(parseFilters(q)), n).map(i => compact(fetchWord(i))) };
}

// Recordings: blobs in IndexedDB, keyed by word key so they survive rebuilds.
const wordKey = id => (get("SELECT key FROM words WHERE id=?", [id]) || {}).key;

async function recordingUrl(id) {
  if (recordingUrls.has(id)) return recordingUrls.get(id);
  const blob = await idbGet("recordings", wordKey(id)).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  recordingUrls.set(id, url);
  return url;
}

async function saveRecording(id, body) {
  const file = body instanceof FormData ? body.get("file") : null;
  if (!file) throw new HttpError(422, "No recording received.");
  if (file.size > 5_000_000) throw new HttpError(413, "Recording is too long; keep it under a minute.");
  needWord(id);
  await idbPut("recordings", wordKey(id), file);
  if (recordingUrls.has(id)) URL.revokeObjectURL(recordingUrls.get(id));
  recordingUrls.delete(id);
  run("INSERT OR REPLACE INTO recordings(word_id, path, created_at) VALUES (?, 'idb', datetime('now','localtime'))", [id]);
  return { url: await recordingUrl(id) };
}

// --------------------------------------------------------------- stats routes

function streak() {
  const active = new Set(all("SELECT date FROM daily_activity WHERE reviews > 0 OR seconds >= 300").map(r => r.date));
  for (const r of all("SELECT DISTINCT date(ts) AS d FROM review_log")) active.add(r.d);
  const d = new Date();
  if (!active.has(isoDate(d))) d.setDate(d.getDate() - 1);
  let current = 0;
  while (active.has(isoDate(d))) { current++; d.setDate(d.getDate() - 1); }
  let best = 0, run_ = 0, prev = null;
  for (const day of [...active].sort()) {
    const dd = new Date(day + "T12:00:00");
    run_ = prev && Math.round((dd - prev) / 86400000) === 1 ? run_ + 1 : 1;
    best = Math.max(best, run_);
    prev = dd;
  }
  return { current, best, today_done: active.has(todayIso()) };
}

const STUDIED = "FROM srs s LEFT JOIN user_word u ON u.word_id=s.word_id WHERE COALESCE(u.known,0)=0";

function stats() {
  const one = sql => get(sql).n;
  const byDomain = new Map();
  for (const r of all("SELECT w.domains, r.correct FROM review_log r JOIN words w ON w.id = r.word_id")) {
    for (const d of JSON.parse(r.domains)) {
      const agg = byDomain.get(d) || [0, 0];
      agg[0]++; agg[1] += r.correct;
      byDomain.set(d, agg);
    }
  }
  const act = new Map(all("SELECT * FROM daily_activity WHERE date >= ?", [addDays(-83)]).map(r => [r.date, r]));
  const days = [];
  for (let i = 83; i >= 0; i--) {
    const date = addDays(-i);
    const a = act.get(date) || {};
    days.push({ date, reviews: a.reviews || 0, seconds: a.seconds || 0 });
  }
  const overall = get("SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS ok FROM review_log");
  return {
    words: {
      total: one("SELECT COUNT(*) AS n FROM words"),
      enriched: one("SELECT COUNT(*) AS n FROM words WHERE enriched=1"),
      with_audio: one("SELECT COUNT(*) AS n FROM words WHERE has_audio=1"),
      // Words marked known are counted apart (app/api/stats.py).
      mastered: get(`SELECT COUNT(*) AS n ${STUDIED} AND s.interval_days >= ?`, [MASTERED_INTERVAL]).n,
      learning: get(`SELECT COUNT(*) AS n ${STUDIED} AND s.interval_days < ?`, [MASTERED_INTERVAL]).n,
      due: get(`SELECT COUNT(*) AS n ${STUDIED} AND s.due_date <= ? AND NOT (s.reps = 0 AND s.last_reviewed IS NULL)`, [todayIso()]).n,
      known: get("SELECT COUNT(*) AS n FROM user_word WHERE known=1").n,
      stars: Object.fromEntries(all("SELECT stars, COUNT(*) AS n FROM user_word WHERE stars > 0 GROUP BY stars").map(r => [r.stars, r.n])),
    },
    accuracy: { attempts: overall.n, correct: overall.ok },
    streak: streak(),
    by_domain: [...byDomain].map(([domain, [a, k]]) => ({ domain, attempts: a, correct: k, accuracy: k / a }))
      .sort((x, y) => x.accuracy - y.accuracy),
    weakest: all("SELECT w.id, w.word, COUNT(*) AS attempts, SUM(r.correct) AS correct, " +
                 "ROUND(1.0 * SUM(r.correct) / COUNT(*), 3) AS accuracy, SUM(CASE WHEN r.correct = 0 THEN 1 ELSE 0 END) AS misses " +
                 "FROM review_log r JOIN words w ON w.id = r.word_id GROUP BY w.id " +
                 "HAVING attempts >= 2 AND misses > 0 ORDER BY accuracy ASC, misses DESC, attempts DESC LIMIT 25"),
    days,
    tests: all("SELECT id, ts, kind, score, total, duration_s FROM test_session ORDER BY id DESC LIMIT 40"),
    forecast: all("SELECT due_date AS date, COUNT(*) AS n FROM srs WHERE due_date > ? AND due_date <= ? " +
                  "GROUP BY due_date ORDER BY due_date", [todayIso(), addDays(14)]),
  };
}

function saveSettings(values) {
  for (const [k, v] of Object.entries(values)) {
    const s = v === true ? "1" : v === false ? "0" : String(v);
    run("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", [k, s]);
  }
}

function updateSettings(body) {
  const values = {};
  for (const k of ["session_minutes", "new_per_day", "autoplay", "speech_rate"]) if (body[k] != null) values[k] = body[k];
  const num = k => Number(values[k]);
  if ("session_minutes" in values && !(num("session_minutes") >= 5 && num("session_minutes") <= 60)) {
    throw new HttpError(400, "Session length must be between 5 and 60 minutes.");
  }
  if ("new_per_day" in values && !(num("new_per_day") >= 0 && num("new_per_day") <= 100)) {
    throw new HttpError(400, "New words per day must be between 0 and 100.");
  }
  if ("speech_rate" in values && !(num("speech_rate") >= 0.5 && num("speech_rate") <= 2)) {
    throw new HttpError(400, "Voice speed must be between 0.5 and 2.");
  }
  for (const k of ["session_minutes", "new_per_day"]) if (k in values) values[k] = Math.trunc(num(k));
  if ("speech_rate" in values) values.speech_rate = num("speech_rate");
  if ("autoplay" in values) values.autoplay = !!values.autoplay && values.autoplay !== "0";
  saveSettings(values);
  return settingsMap();
}

// -------------------------------------------------------------- export/import

// The export file; with snapshot, the copy saved in IndexedDB: no answer log
// (saved as its own keys), list and custom-word ids kept so links and saved
// filters stay valid, and rows for words missing from this build kept apart.
function exportProgress({ snapshot = false } = {}) {
  const withOrphans = (name, rows) => snapshot ? rows : rows.concat(orphans[name]);
  const out = {
    app: "LexiMaster", version: 1, exported_at: todayIso(),
    user_word: withOrphans("user_word", all("SELECT w.key, u.stars, u.known, u.notes, u.updated_at FROM user_word u JOIN words w ON w.id=u.word_id")),
    srs: withOrphans("srs", all("SELECT w.key, s.ease, s.interval_days, s.reps, s.lapses, s.due_date, s.last_reviewed FROM srs s JOIN words w ON w.id=s.word_id")),
    list_words: withOrphans("list_words", all("SELECT l.name AS list, w.key, lw.note, lw.added_at FROM list_words lw JOIN lists l ON l.id=lw.list_id " +
                    "JOIN words w ON w.id=lw.word_id")),
    lists: all(`SELECT ${snapshot ? "id, " : ""}name, created_at FROM lists`),
    custom_words: all("SELECT id, key, word, domains FROM words WHERE is_custom=1")
      .map(r => ({ ...(snapshot ? { id: r.id } : {}), key: r.key, word: r.word, domains: r.domains,
                   data: JSON.stringify(DETAIL.get(r.id) || {}) })),
    test_session: all("SELECT ts, kind, score, total, duration_s FROM test_session"),
    daily_activity: all("SELECT * FROM daily_activity"),
    settings: settingsMap(),
  };
  if (snapshot) out.orphans = { user_word: orphans.user_word, srs: orphans.srs, list_words: orphans.list_words };
  else out.review_log = all("SELECT w.key, r.ts, r.mode, r.grade, r.correct, r.ms_taken FROM review_log r JOIN words w ON w.id=r.word_id")
    .concat(orphans.review_log);
  return out;
}

function clamp(v, lo, hi, dflt, isInt = Number.isInteger(dflt)) {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || Number.isNaN(n)) return dflt;
  const x = Math.min(hi, Math.max(lo, n));
  return isInt ? Math.trunc(x) : x;
}

// A custom word's saved fields, made safe to use: anything malformed becomes
// empty rather than breaking every page that lists words. Null when unusable.
function cleanCustomWord(cw) {
  if (typeof cw.key !== "string" || !cw.key.startsWith("custom:") || typeof cw.word !== "string" || !cw.word.trim()) return null;
  let data;
  try { data = typeof cw.data === "string" ? JSON.parse(cw.data) : cw.data; } catch (e) { data = null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  data.meanings = Array.isArray(data.meanings) ? data.meanings.filter(m => m && typeof m === "object") : [];
  for (const m of data.meanings) m.senses = Array.isArray(m.senses) ? m.senses.filter(s => s && typeof s === "object") : [];
  if (data.nuance !== null && (typeof data.nuance !== "object" || Array.isArray(data.nuance))) data.nuance = null;
  let domains;
  try { domains = JSON.parse(cw.domains); } catch (e) { domains = null; }
  if (!Array.isArray(domains) || !domains.every(d => typeof d === "string")) domains = ["custom"];
  return { key: cw.key, word: cw.word.trim().slice(0, 80), domains: JSON.stringify(domains), data };
}

// Merge an export into the database (app/api/stats.py import_progress).
// restore: reloading this site's own saved snapshot, so keep ids, keep every
// row as it is (no merging of identical rows), and keep rows for words this
// build doesn't have as orphans instead of dropping them.
function importProgress(data, { restore = false } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data) || data.app !== "LexiMaster") {
    throw new HttpError(400, "That file isn't a LexiMaster progress export.");
  }
  const saved = restore && data.orphans && typeof data.orphans === "object" ? data.orphans : {};
  const rows = name => (Array.isArray(data[name]) ? data[name] : []).concat(Array.isArray(saved[name]) ? saved[name] : [])
    .filter(r => r && typeof r === "object");
  const counts = {};
  let skipped = 0;
  db.exec("BEGIN");
  try {
    for (const raw of rows("custom_words")) {
      const cw = cleanCustomWord(raw);
      if (!cw) { skipped++; continue; }
      if (get("SELECT 1 AS x FROM words WHERE key=?", [cw.key])) continue;
      const keepId = restore && Number.isInteger(raw.id) && !get("SELECT 1 AS x FROM words WHERE id=?", [raw.id]);
      const { lastId } = keepId
        ? run("INSERT INTO words(id, key, word, domains, is_custom) VALUES (?, ?, ?, ?, 1)", [raw.id, cw.key, cw.word, cw.domains])
        : run("INSERT INTO words(key, word, domains, is_custom) VALUES (?, ?, ?, 1)", [cw.key, cw.word, cw.domains]);
      DETAIL.set(keepId ? raw.id : lastId, cw.data);
    }
    if (skipped) counts["damaged custom words skipped"] = skipped;
    const ids = new Map(all("SELECT id, key FROM words").map(r => [r.key, r.id]));
    const orphan = (name, r) => { if (restore) orphans[name].push(r); };
    let n = 0;
    for (const u of rows("user_word")) {
      if (!ids.has(u.key)) { orphan("user_word", u); continue; }
      run("INSERT OR REPLACE INTO user_word(word_id, stars, known, notes, updated_at) VALUES (?, ?, ?, ?, ?)",
          [ids.get(u.key), clamp(u.stars, 0, 5, 0), clamp(u.known, 0, 1, 0), String(u.notes || ""), String(u.updated_at || "")]);
      n++;
    }
    counts["word states"] = n;
    n = 0;
    for (const s of rows("srs")) {
      if (!s.due_date) continue;
      if (!ids.has(s.key)) { orphan("srs", s); continue; }
      run("INSERT OR REPLACE INTO srs(word_id, ease, interval_days, reps, lapses, due_date, last_reviewed) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [ids.get(s.key), clamp(s.ease, 1.3, 5.0, 2.5, false), clamp(s.interval_days, 0, 36500, 0, false),
           clamp(s.reps, 0, 10000, 0), clamp(s.lapses, 0, 10000, 0), String(s.due_date).slice(0, 10), s.last_reviewed ?? null]);
      n++;
    }
    counts["review cards"] = n;
    const seen = new Set(all("SELECT word_id, ts, mode, grade, correct, ms_taken FROM review_log").map(r => JSON.stringify(Object.values(r))));
    n = 0;
    for (const r of rows("review_log")) {
      if (!ids.has(r.key) || !["review", "quiz", "match", "listen", "spell", "flash"].includes(r.mode)) continue;
      const row = [ids.get(r.key), String(r.ts), r.mode, r.grade ?? null, clamp(r.correct, 0, 1, 0), r.ms_taken ?? null];
      const sig = JSON.stringify(row);
      if (seen.has(sig) && !restore) continue;
      run("INSERT INTO review_log(word_id, ts, mode, grade, correct, ms_taken) VALUES (?, ?, ?, ?, ?, ?)", row);
      seen.add(sig);
      n++;
    }
    counts.answers = n;
    for (const l of rows("lists")) {
      const name = String(l.name || "").split(/\s+/).filter(Boolean).join(" ").slice(0, 60);
      if (name && !get("SELECT 1 AS x FROM lists WHERE lower(name)=lower(?)", [name])) {
        if (restore && Number.isInteger(l.id) && !get("SELECT 1 AS x FROM lists WHERE id=?", [l.id])) {
          run("INSERT INTO lists(id, name, created_at) VALUES (?, ?, ?)", [l.id, name, l.created_at || ""]);
        } else run("INSERT INTO lists(name, created_at) VALUES (?, ?)", [name, l.created_at || ""]);
      }
    }
    const listIds = new Map(all("SELECT id, name FROM lists").map(r => [r.name.toLowerCase(), r.id]));
    n = 0;
    for (const lw of rows("list_words")) {
      const lid = listIds.get(String(lw.list || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase());
      if (!lid) continue;
      if (!ids.has(lw.key)) { orphan("list_words", lw); continue; }
      run("INSERT OR IGNORE INTO list_words(list_id, word_id, note, added_at) VALUES (?, ?, ?, ?)",
          [lid, ids.get(lw.key), String(lw.note || ""), lw.added_at || ""]);
      n++;
    }
    counts["list entries"] = n;
    const seenTests = new Set(all("SELECT ts, kind, score, total, duration_s FROM test_session").map(r => JSON.stringify(Object.values(r))));
    for (const t of rows("test_session")) {
      const row = [String(t.ts), String(t.kind).slice(0, 40), clamp(t.score, 0, 1e6, 0), clamp(t.total, 0, 1e6, 0),
                   clamp(t.duration_s, 0, 1e7, 0)];
      if (restore || !seenTests.has(JSON.stringify(row))) run("INSERT INTO test_session(ts, kind, score, total, duration_s) VALUES (?, ?, ?, ?, ?)", row);
    }
    for (const a of rows("daily_activity")) {
      if (!a.date) continue;
      run(`INSERT INTO daily_activity(date, seconds, reviews, new_words) VALUES (?, ?, ?, ?)
           ON CONFLICT(date) DO UPDATE SET seconds=MAX(seconds, excluded.seconds), reviews=MAX(reviews, excluded.reviews),
           new_words=MAX(new_words, excluded.new_words)`,
          [String(a.date).slice(0, 10), clamp(a.seconds, 0, 86400, 0), clamp(a.reviews, 0, 100000, 0), clamp(a.new_words, 0, 100000, 0)]);
    }
    const st = data.settings && typeof data.settings === "object" ? data.settings : {};
    const clean = {};
    if ("session_minutes" in st) clean.session_minutes = clamp(st.session_minutes, 5, 60, 15);
    if ("new_per_day" in st) clean.new_per_day = clamp(st.new_per_day, 0, 100, 12);
    if ("speech_rate" in st) clean.speech_rate = clamp(st.speech_rate, 0.5, 2, 0.9, false);
    if ("autoplay" in st) clean.autoplay = ["1", "True", "true"].includes(String(st.autoplay));
    saveSettings(clean);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e instanceof HttpError ? e : new HttpError(400, `That export file is damaged (${e.message}).`);
  }
  return { imported: counts };
}

async function importFile(body) {
  const file = body instanceof FormData ? body.get("file") : null;
  if (!file) throw new HttpError(422, "No file received.");
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { throw new HttpError(400, "That file isn't valid JSON."); }
  return importProgress(data);
}

// Fetch every detail file so the whole lexicon works offline.
async function downloadForOffline() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const shards = [...new Set([...INDEX.values()].map(w => w.s))];
  await Promise.all(shards.map(s => {
    if (!SHARDS.has(s)) SHARDS.set(s, fetchJson(`data/detail/${String(s).padStart(2, "0")}.json`));
    return SHARDS.get(s);
  }));
  return { ok: true, files: shards.length };
}

// -------------------------------------------------------------------- router

const ROUTES = [
  ["GET", /^\/api\/health$/, () => ({ ok: true, words: get("SELECT COUNT(*) AS n FROM words").n })],
  ["GET", /^\/api\/words$/, () => listWords()],
  ["GET", /^\/api\/words\/(\d+)$/, (m) => wordDetail(+m[1])],
  ["PATCH", /^\/api\/words\/(\d+)\/state$/, (m, q, b) => setState(+m[1], b)],
  ["POST", /^\/api\/words$/, (m, q, b) => addCustomWord(b)],
  ["DELETE", /^\/api\/words\/(\d+)$/, (m) => deleteCustomWord(+m[1])],
  ["GET", /^\/api\/wotd$/, () => wordOfTheDay()],
  ["GET", /^\/api\/lists$/, () => allLists()],
  ["POST", /^\/api\/lists$/, (m, q, b) => createList(b)],
  ["PATCH", /^\/api\/lists\/(\d+)$/, (m, q, b) => renameList(+m[1], b)],
  ["DELETE", /^\/api\/lists\/(\d+)$/, (m) => deleteList(+m[1])],
  ["GET", /^\/api\/lists\/(\d+)$/, (m) => listDetail(+m[1])],
  ["POST", /^\/api\/lists\/(\d+)\/words$/, (m, q, b) => addToList(+m[1], b)],
  ["PATCH", /^\/api\/lists\/(\d+)\/words\/(\d+)$/, (m, q, b) => {
    run("UPDATE list_words SET note=? WHERE list_id=? AND word_id=?", [String(b.note || ""), +m[1], +m[2]]);
    return { ok: true };
  }],
  ["DELETE", /^\/api\/lists\/(\d+)\/words\/(\d+)$/, (m) => {
    run("DELETE FROM list_words WHERE list_id=? AND word_id=?", [+m[1], +m[2]]);
    return { ok: true };
  }],
  ["GET", /^\/api\/review\/queue$/, (m, q) => reviewQueue(q)],
  ["POST", /^\/api\/review\/(\d+)$/, (m, q, b) => submitReview(+m[1], b)],
  ["POST", /^\/api\/answer$/, (m, q, b) => recordAnswer(b)],
  ["POST", /^\/api\/sessions$/, (m, q, b) => {
    run("INSERT INTO test_session(kind, score, total, duration_s) VALUES (?, ?, ?, ?)",
        [String(b.kind || "").slice(0, 40), Number(b.score) || 0, Number(b.total) || 0, Number(b.duration_s) || 0]);
    return { ok: true };
  }],
  ["POST", /^\/api\/activity$/, (m, q, b) => {
    const seconds = Number(b.seconds);
    if (!(seconds >= 0 && seconds <= 600)) throw new HttpError(422, "seconds must be 0-600");
    bumpActivity({ seconds: Math.trunc(seconds) });
    return { ok: true };
  }],
  ["GET", /^\/api\/flashcards$/, (m, q) => flashcards(q)],
  ["GET", /^\/api\/quiz$/, (m, q) => makeQuiz(q)],
  ["GET", /^\/api\/matching$/, (m, q) => matching(q)],
  ["GET", /^\/api\/listen$/, (m, q) => listen(q)],
  ["POST", /^\/api\/recordings\/(\d+)$/, (m, q, b) => saveRecording(+m[1], b)],
  ["GET", /^\/api\/practice\/words$/, (m, q) => practiceWords(q)],
  ["GET", /^\/api\/stats$/, () => stats()],
  ["GET", /^\/api\/settings$/, () => settingsMap()],
  ["PATCH", /^\/api\/settings$/, (m, q, b) => updateSettings(b)],
  ["GET", /^\/api\/export$/, () => exportProgress()],
  ["POST", /^\/api\/import$/, (m, q, b) => importFile(b)],
  ["POST", /^\/api\/offline$/, () => downloadForOffline()],
];
const READ_ONLY = new Set(["/api/health", "/api/words", "/api/lists", "/api/stats", "/api/settings", "/api/export",
                           "/api/quiz", "/api/matching", "/api/listen", "/api/flashcards", "/api/practice/words",
                           "/api/review/queue", "/api/offline"]);

export async function handle(method, url, body) {
  if (!ready) ready = boot();
  try {
    await ready;
  } catch (e) {
    ready = null;   // try again on the next request (e.g. after a network hiccup)
    throw e;
  }
  const u = new URL(url, location.href);
  const query = Object.fromEntries(u.searchParams);
  for (const [verb, pattern, fn] of ROUTES) {
    if (verb !== method) continue;
    const m = u.pathname.replace(/^.*?(\/api\/)/, "$1").match(pattern);
    if (!m) continue;
    const path = m[0];
    const reads = method === "GET" && (READ_ONLY.has(path) || /^\/api\/(words|lists)\/\d+$/.test(path));
    if (reads) {
      if (dirty) await withWriteLock(syncIfStale);
      return fn(m, query, body);
    }
    return withWriteLock(async () => {
      await syncIfStale();
      const result = await fn(m, query, body);
      try {
        await persist();
      } catch (e) {
        localRev = -1;   // memory now differs from what is saved: reload it before anything else
        dirty = true;
        throw new HttpError(507, `Couldn't save, so that change wasn't kept (${e && e.message || "storage error"}).`);
      }
      return result;
    });
  }
  throw new HttpError(404, `No such endpoint: ${method} ${u.pathname}`);
}
