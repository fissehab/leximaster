// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Settings → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "20261104155312";
const SHELL = `lexi-shell-${VERSION}`;
const DATA = "lexi-data-8e23e2e5";   // changes only when the published word data does
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
"static/js/games.js",
"static/js/gameui.js",
"static/js/local/idb.js",
"static/js/local/server.js",
"static/js/mouth.js",
"static/js/mri.gen.js",
"static/js/phonemes.js",
"static/js/recorder.js",
"static/js/say-pairs.js",
"static/js/say-strings.js",
"static/js/say.js",
"static/js/shared.gen.js",
"static/js/state.js",
"static/js/tabs/about.js",
"static/js/tabs/browse.js",
"static/js/tabs/flashcards.js",
"static/js/tabs/games.js",
"static/js/tabs/home.js",
"static/js/tabs/listen.js",
"static/js/tabs/lists.js",
"static/js/tabs/matching.js",
"static/js/tabs/more.js",
"static/js/tabs/practice.js",
"static/js/tabs/pronounce.js",
"static/js/tabs/quiz.js",
"static/js/tabs/review.js",
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
"data/detail/00.json": "32f6ed8a854e0e1e",
"data/detail/01.json": "a33da94a4d1585e3",
"data/detail/02.json": "c0d59520fce95dbd",
"data/detail/03.json": "dc3a863ae20eb366",
"data/detail/04.json": "fc8b6c886b4020ef",
"data/detail/05.json": "eaf9f72f0b257b7c",
"data/detail/06.json": "92b6f48ef3acdbd6",
"data/detail/07.json": "1037603823b23d70",
"data/detail/08.json": "249622d917c78d03",
"data/detail/09.json": "7f2d61ec08e415f1",
"data/detail/10.json": "446a17bcd7881b97",
"data/detail/11.json": "2fcf247fe639e8ad",
"data/detail/12.json": "e8ab80b43c85ca1b",
"data/detail/13.json": "826178e9586b06b7",
"data/detail/14.json": "f7a13da9a130d9c8",
"data/detail/15.json": "510166f868559fd8",
"data/detail/16.json": "4d1e692eb96d6ce2",
"data/detail/17.json": "d84188434c5a226e",
"data/detail/18.json": "4d0bfa041aca5bd2",
"data/detail/19.json": "76660fe79b56c87b",
"data/detail/20.json": "1f1beaf0ccded1b3",
"data/detail/21.json": "7268dcaac7d939d6",
"data/detail/22.json": "0c294e7f63847843",
"data/detail/23.json": "2dd8f89ff2061730",
"data/detail/24.json": "0c6b0e5f89846ce4",
"data/detail/25.json": "363efea0a7c8c400",
"data/detail/26.json": "6c9960077c6696de",
"data/detail/27.json": "c1890eca0f4574d0",
"data/detail/28.json": "fce9d14a84cf52ab",
"data/detail/29.json": "48e4a422b5dce168",
"data/detail/30.json": "6c8a82331c245312",
"data/detail/31.json": "1817284f4215878a",
"data/detail/32.json": "5acaa80614ce6a7d",
"data/detail/33.json": "f696668dc28f6cf4",
"data/detail/34.json": "d16e170ceeeb35f2",
"data/detail/35.json": "6be3ed3b8b0176f8",
"data/detail/36.json": "a13479ba8a391187",
"data/detail/37.json": "0f43a794f1b3519d",
"data/detail/38.json": "aa406f4f25ce0f1e",
"data/detail/39.json": "f7cce0ae71ea6780",
"data/detail/40.json": "05b1a0c0e8b06032",
"data/detail/41.json": "6b417475c08b2b37",
"data/detail/42.json": "206d908f58cae1b8",
"data/detail/43.json": "1b7da0b3943014cb",
"data/detail/44.json": "a7505d3ec0428423",
"data/detail/45.json": "664e8d0e1b1e4a37",
"data/detail/46.json": "3e79b3c6552236d3",
"data/detail/47.json": "29a7072662dbc63a",
"data/detail/48.json": "5b5f3dd5d4879c01",
"data/detail/49.json": "bf1ec7852a8d20f7",
"data/detail/50.json": "31d02f54e19c1965",
"data/detail/51.json": "7a4ff1fa7c18706f",
"data/detail/52.json": "fc9d10714d8a6c4a",
"data/detail/53.json": "5115405906d749bf",
"data/detail/54.json": "2a563a750cbb56ae",
"data/detail/55.json": "320a60f7cf5d0316",
"data/detail/56.json": "3b7656504f7029c5",
"data/detail/57.json": "4e408906dcd1a1a3",
"data/detail/58.json": "adaf82a6ef79cd96",
"data/detail/59.json": "32ef757a307ef357",
"data/detail/60.json": "235008ce06634e80",
"data/detail/61.json": "fd39b470c6128a05",
"data/detail/62.json": "da578448d6d8afbb",
"data/detail/63.json": "38293fa8dd81948c",
"data/gloss/00.json": "6ce70ec0b36bb4ab",
"data/gloss/01.json": "e77c7c8aea929aa5",
"data/gloss/02.json": "8a022b45fc9abcfd",
"data/gloss/03.json": "e2655ba059184c05",
"data/gloss/04.json": "c5868808ea9b94b1",
"data/gloss/05.json": "7c794e645455df89",
"data/gloss/06.json": "c32eb6a932f8b7d4",
"data/gloss/07.json": "2c17ba995718813f",
"data/gloss/08.json": "b62e53f1ff55e8fd",
"data/gloss/09.json": "c532a8a89f7ca319",
"data/gloss/10.json": "8b3b034b913377da",
"data/gloss/11.json": "884202ce0737806c",
"data/gloss/12.json": "8219c2e447351f95",
"data/gloss/13.json": "adaca2c25834fef5",
"data/gloss/14.json": "eebd2dbbef2e2aad",
"data/gloss/15.json": "cdb99588229a3375"
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
  if (e.request.mode === "navigate" && /\/(index\.html)?$/.test(path)) {
    // The app's page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, { ignoreSearch: true }))
    .then(hit => hit || fetch(e.request)));
});
