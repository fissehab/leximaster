// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Settings → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "20261128020946";
const SHELL = `lexi-shell-${VERSION}`;
const DATA = "lexi-data-124b2af2";   // changes only when the published word data does
// Recording names carry a hash of their content (media/audio/<word>.<hash>.m4a),
// so a corrected recording has a new URL: the media cache can outlive deploys.
const MEDIA = "lexi-media-v2";
// The real-mouth (MRI) clips of "How to say it", cached when first played;
// their names carry a hash of their content too.
const MOUTH = "lexi-mouth-v1";
const SHELL_FILES = [
"./",
"index.html",
"manifest.webmanifest",
"credits.html",
"static/css/app.css",
"static/css/tokens.css",
"static/fonts/-haris-cyrillic-ext-opwj-kv3l-s-q8govxvklebjdjrxq1auxkvscq.woff2",
"static/fonts/-haris-cyrillic-ext-opwk-kv3l-s-q8govxvknpdsyxr1tnyuzw.woff2",
"static/fonts/-haris-cyrillic-opwj-kv3l-s-q8govxvklebjdj1xq1auxkvscq.woff2",
"static/fonts/-haris-cyrillic-opwk-kv3l-s-q8govxvknpnsyxr1tnyuzw.woff2",
"static/fonts/-haris-latin-ext-opwj-kv3l-s-q8govxvklebjdjdxq1auxkvscq.woff2",
"static/fonts/-haris-latin-ext-opwk-kv3l-s-q8govxvknppsyxr1tnyuzw.woff2",
"static/fonts/-haris-latin-opwj-kv3l-s-q8govxvklebjdjlxq1auxks.woff2",
"static/fonts/-haris-latin-opwk-kv3l-s-q8govxvknp3syxr1tnw.woff2",
"static/fonts/-haris-vietnamese-opwj-kv3l-s-q8govxvklebjdjzxq1auxkvscq.woff2",
"static/fonts/-haris-vietnamese-opwk-kv3l-s-q8govxvknplsyxr1tnyuzw.woff2",
"static/fonts/-iterata-latin-ext-or3pq6p12-ijxaigla78dkttaodhk0ovpak3ylanflhppf2tbli4j-wtekvt8m1ow.woff2",
"static/fonts/-iterata-latin-or3pq6p12-ijxaigla78dkttaodhk0ovpak3ylanflhppf2tbli4j-hwtekvt8k.woff2",
"static/fonts/-lex-ans-latin-ext-zyxzkvelmyyaje8bplhncwdkr932-g7dytd-dmu1syxqkybsb4zhrnu.woff2",
"static/fonts/-lex-ans-latin-zyxzkvelmyyaje8bplhncwdkr932-g7dytd-dmu1syxekybsb4zh.woff2",
"static/fonts/fonts.css",
"static/fonts/literata-italic-var-latin-ext.woff2",
"static/fonts/literata-italic-var-latin.woff2",
"static/icons/icon-180.png",
"static/icons/icon-192.png",
"static/icons/icon-512.png",
"static/js/align.js",
"static/js/api.js",
"static/js/app.js",
"static/js/audio.js",
"static/js/course-a1.js",
"static/js/course-a2.js",
"static/js/course-a3.js",
"static/js/course-a4.js",
"static/js/course-a5.js",
"static/js/course-a6.js",
"static/js/course-audio.js",
"static/js/course-b2.js",
"static/js/course-b3.js",
"static/js/course-extra.js",
"static/js/course-i2.js",
"static/js/course-i3.js",
"static/js/course-i4.js",
"static/js/course-i5.js",
"static/js/course-i6.js",
"static/js/course-i7.js",
"static/js/course-i8.js",
"static/js/course-lessons.js",
"static/js/course-more.js",
"static/js/course-text.js",
"static/js/course-visual.js",
"static/js/course-visuals-a.js",
"static/js/course-visuals-b.js",
"static/js/course-visuals-i.js",
"static/js/course-visuals.js",
"static/js/games.js",
"static/js/gameui.js",
"static/js/local/idb.js",
"static/js/local/server.js",
"static/js/local/srs.js",
"static/js/mouth.js",
"static/js/mri.gen.js",
"static/js/phonemes.js",
"static/js/phrase-match.js",
"static/js/recorder.js",
"static/js/say-pairs.js",
"static/js/say-strings.js",
"static/js/say.js",
"static/js/shared.gen.js",
"static/js/state.js",
"static/js/tabs/about.js",
"static/js/tabs/browse.js",
"static/js/tabs/course.js",
"static/js/tabs/flashcards.js",
"static/js/tabs/home.js",
"static/js/tabs/listen.js",
"static/js/tabs/lists.js",
"static/js/tabs/matching.js",
"static/js/tabs/practice.js",
"static/js/tabs/pronounce.js",
"static/js/tabs/quiz.js",
"static/js/tabs/rush.js",
"static/js/tabs/settings.js",
"static/js/tabs/shooter.js",
"static/js/tabs/sounds.js",
"static/js/tabs/stats.js",
"static/js/tabs/typeit.js",
"static/js/ui.js",
"static/vendor/sql-wasm.js",
"static/vendor/sql-wasm.wasm"
];
// Content hash (SHA-256, first 16 hex digits) of each word-detail and glossary file in this
// build: an offline download made under an earlier version keeps the files
// that haven't changed.
const DETAIL_HASHES = {
"data/detail/00.json": "4bc7422be14b7aa4",
"data/detail/01.json": "417c0d1fa838364e",
"data/detail/02.json": "e3713fd1cad8943d",
"data/detail/03.json": "bc565680c2f6dd63",
"data/detail/04.json": "3a2bcd03b8f0baae",
"data/detail/05.json": "421a13ad50386fb0",
"data/detail/06.json": "3d140ee0e4e0dc4f",
"data/detail/07.json": "e9d2ed0a71a06ea6",
"data/detail/08.json": "fe3e911c674ea1a7",
"data/detail/09.json": "ba36ac7b7bbb7de9",
"data/detail/10.json": "4ec138ad405e6e26",
"data/detail/11.json": "899fac52bb242166",
"data/detail/12.json": "bb44b4f607d83fd7",
"data/detail/13.json": "c82cf54b4154e1b7",
"data/detail/14.json": "d6bab99474b1c377",
"data/detail/15.json": "261c6f2c8419005e",
"data/detail/16.json": "8ac3d2f959c8831a",
"data/detail/17.json": "c703feb2b2a4ced5",
"data/detail/18.json": "c99f0eab9d0e67b0",
"data/detail/19.json": "c8a48a37944201ec",
"data/detail/20.json": "283e731a66546cce",
"data/detail/21.json": "2d0e3f341f673550",
"data/detail/22.json": "16aaeaebdd6baa40",
"data/detail/23.json": "730c8966baad4189",
"data/detail/24.json": "b981b76c9d743d1a",
"data/detail/25.json": "95f277bda9ceee05",
"data/detail/26.json": "e4dd3bfe5fdcef92",
"data/detail/27.json": "ceab6f5430716850",
"data/detail/28.json": "f106ca419960b709",
"data/detail/29.json": "681c12dbd9911c05",
"data/detail/30.json": "81df4d97cc6ad751",
"data/detail/31.json": "d94f5e0b43bcab7f",
"data/detail/32.json": "ad7cbf6a83209b4b",
"data/detail/33.json": "c122d86ab737d9c1",
"data/detail/34.json": "a06a3b99cc7fffd4",
"data/detail/35.json": "c5f8cf8ddb60d6f4",
"data/detail/36.json": "3c626e15ff1a2a09",
"data/detail/37.json": "dd677ddbebbe5b08",
"data/detail/38.json": "3bdbe97ec3da0e61",
"data/detail/39.json": "8766b7bb3c76386f",
"data/detail/40.json": "0e2ce06bf23cd98b",
"data/detail/41.json": "40fa6cd77f268ba0",
"data/detail/42.json": "74f1101ca1f4b54a",
"data/detail/43.json": "d45f9a26e3d35e9d",
"data/detail/44.json": "0b8f868b08dfd0e0",
"data/detail/45.json": "cc835b538e2a3288",
"data/detail/46.json": "7ccfd83db78f5c54",
"data/detail/47.json": "7b498aa19bcf33fa",
"data/detail/48.json": "64d648c3b1c2ab95",
"data/detail/49.json": "c4967a554893b428",
"data/detail/50.json": "e07c2ea5bce74296",
"data/detail/51.json": "0c176f17fedd83fc",
"data/detail/52.json": "e56cc99f193631ae",
"data/detail/53.json": "0e8d2097b0c4282a",
"data/detail/54.json": "1d92a35e9f8a8f3a",
"data/detail/55.json": "b1b4bcbf7ad34176",
"data/detail/56.json": "528cce5efe3ae99e",
"data/detail/57.json": "ed2698afbdc6e9f2",
"data/detail/58.json": "77906ee1ea8586aa",
"data/detail/59.json": "fcea01f60626bad9",
"data/detail/60.json": "f6e8505bf7b47ab6",
"data/detail/61.json": "2d3e47f356e9fe67",
"data/detail/62.json": "105383a4b4dbb621",
"data/detail/63.json": "63aa0a66fd300513",
"data/gloss/00.json": "49b4b712966b69ca",
"data/gloss/01.json": "a7939bb1949a8a66",
"data/gloss/02.json": "7df2d0404d6566a3",
"data/gloss/03.json": "9e7d3e17d9668d43",
"data/gloss/04.json": "c9345b6eb64093c9",
"data/gloss/05.json": "db7bfbc54ae33bbe",
"data/gloss/06.json": "5e28d1cc88da6e8d",
"data/gloss/07.json": "b68d95ee8742dd35",
"data/gloss/08.json": "3d0f55cce2cc1ade",
"data/gloss/09.json": "c559d48327455b89",
"data/gloss/10.json": "f4843fced77a3bdb",
"data/gloss/11.json": "ce0d3a93de642170",
"data/gloss/12.json": "b13e648a26caa4f3",
"data/gloss/13.json": "0d8d63c520a522d6",
"data/gloss/14.json": "b3e7500774c44436",
"data/gloss/15.json": "de81b93f88620538"
};
// Caches of this app from before the "lexi-" prefix.
const LEGACY = /^(shell-\d{14}|data-[0-9a-f]{8}|media-v1)$/;

self.addEventListener("install", e => {
  // cache: "no-cache" revalidates each file with the server, so a fresh deploy
  // can't be stored with files left over from the last one, while files the
  // browser just downloaded (first visit) aren't downloaded a second time.
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: "no-cache" })))),
    caches.open(DATA).then(c => c.match("data/index.json").then(hit => hit || c.add(new Request("data/index.json", { cache: "no-cache" })))),
  ]));
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

async function sha16(res) {
  const buf = await crypto.subtle.digest("SHA-256", await res.arrayBuffer());
  return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}

// Carry the word details an earlier version cached (an offline download) into
// this version's data cache: unchanged files are copied; changed ones are
// downloaded again in the background.
async function migrateDetails(oldNames) {
  const cache = await caches.open(DATA);
  const refetch = new Set();
  for (const name of oldNames) {
    const old = await caches.open(name);
    for (const req of await old.keys()) {
      const path = new URL(req.url).pathname.replace(/^.*\/(data\/(?:detail|gloss)\/[^/]+)$/, "$1");
      const want = DETAIL_HASHES[path];
      if (!want || await cache.match(req, { ignoreSearch: true })) continue;
      const res = await old.match(req);
      if (res && await sha16(res.clone()) === want) await cache.put(req, res);
      else refetch.add(req.url);
    }
  }
  return [...refetch];
}

// Recordings no word of this version uses (replaced by a corrected one).
async function pruneMedia() {
  const index = await (await caches.open(DATA)).match("data/index.json");
  if (!index) return;
  const used = new Set();
  for (const w of (await index.json()).words) {
    if (w.a) used.add(w.a);
    if (w.t) used.add(w.t);
    for (const f of w.x || []) used.add(f);   // each way a word is said (record: REK-erd, rih-KAWRD)
  }
  const media = await caches.open(MEDIA);
  for (const req of await media.keys()) {
    const m = new URL(req.url).pathname.match(/\/media\/(.+)$/);
    if (m && !used.has(decodeURIComponent(m[1]))) await media.delete(req);
  }
}

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const ours = keys.filter(k => k.startsWith("lexi-") || LEGACY.test(k));
    const oldData = ours.filter(k => k !== DATA && /^(lexi-)?data-/.test(k));
    let refetch = [];
    try { refetch = await migrateDetails(oldData); } catch (err) {}
    await Promise.all(ours.filter(k => ![SHELL, DATA, MEDIA, MOUTH].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
    // In the background: changed detail files of an offline download, and
    // recordings nothing refers to any more.
    (async () => {
      const cache = await caches.open(DATA);
      for (const url of refetch) {
        try {
          const res = await fetch(url, { cache: "no-cache" });
          if (res.ok && res.status === 200) await cache.put(url, res);
        } catch (err) { break; }   // offline: they load when next needed
      }
      await pruneMedia();
    })().catch(() => {});
  })());
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  // no-cache: revalidate with the server, so a file the browser kept from the
  // last deploy is never stored under the new data version.
  const res = await fetch(req, { cache: "no-cache" });
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

// The part of a cached recording a Range request asks for (Safari and some
// players always ask for ranges): 206 with the exact bytes.
async function rangeResponse(full, range) {
  const body = await full.arrayBuffer();
  const size = body.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start, end;
  if (m && m[1] !== "") {
    start = Number(m[1]);
    end = m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  } else if (m && m[2] !== "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  }
  if (start === undefined || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206, statusText: "Partial Content",
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mp4",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function media(req, name = MEDIA) {
  const cache = await caches.open(name);
  const range = req.headers.get("Range");
  let hit = await cache.match(req.url, { ignoreSearch: true });
  if (!hit) {
    // The whole file, without the Range header, so the cache holds a
    // complete 200 that any later range can be cut from.
    const res = await fetch(req.url, { cache: "no-cache" });
    if (!(res.ok && res.status === 200)) return res;
    await cache.put(req.url, res.clone());
    hit = res;
  }
  return range ? rangeResponse(hit, range) : hit;
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.includes("/media/")) { e.respondWith(media(e.request).catch(() => fetch(e.request))); return; }
  if (path.includes("/static/mouth/")) { e.respondWith(media(e.request, MOUTH).catch(() => fetch(e.request))); return; }
  if (path.includes("/data/detail/") || path.includes("/data/gloss/") || /\/data\/(index|mentions)\.json$/.test(path)) { e.respondWith(cacheFirst(e.request, DATA)); return; }
  // Only the app's own page: other pages under the site (guide/, licenses/)
  // come from the network, not the app shell.
  const root = new URL("./", self.registration.scope).pathname;
  if (e.request.mode === "navigate" && (path === root || path === root + "index.html")) {
    // The app's page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, { ignoreSearch: true }))
    .then(hit => hit || fetch(e.request)));
});
