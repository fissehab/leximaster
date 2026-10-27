// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Stats → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "20261026225826";
const SHELL = `lexi-shell-${VERSION}`;
const DATA = "lexi-data-45ce399e";   // changes only when the published word data does
// Recording names carry a hash of their content (media/audio/<word>.<hash>.m4a),
// so a corrected recording has a new URL: the media cache can outlive deploys.
const MEDIA = "lexi-media-v2";
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
"static/js/api.js",
"static/js/app.js",
"static/js/audio.js",
"static/js/local/idb.js",
"static/js/local/server.js",
"static/js/shared.gen.js",
"static/js/state.js",
"static/js/tabs/about.js",
"static/js/tabs/browse.js",
"static/js/tabs/flashcards.js",
"static/js/tabs/home.js",
"static/js/tabs/listen.js",
"static/js/tabs/lists.js",
"static/js/tabs/matching.js",
"static/js/tabs/more.js",
"static/js/tabs/practice.js",
"static/js/tabs/pronounce.js",
"static/js/tabs/quiz.js",
"static/js/tabs/review.js",
"static/js/tabs/stats.js",
"static/js/ui.js",
"static/vendor/sql-wasm.js",
"static/vendor/sql-wasm.wasm"
];
// Content hash (SHA-256, first 16 hex digits) of each word-detail file in this
// build: an offline download made under an earlier version keeps the files
// that haven't changed.
const DETAIL_HASHES = {
"data/detail/00.json": "548c770d5bf89da3",
"data/detail/01.json": "b3748a124700632c",
"data/detail/02.json": "cf8e7452208df78c",
"data/detail/03.json": "cb27b743cab27d0a",
"data/detail/04.json": "67b193ddb01de0cf",
"data/detail/05.json": "2939407fa37fa5e0",
"data/detail/06.json": "129566591ca42ee3",
"data/detail/07.json": "ce98bed312c5d0d3",
"data/detail/08.json": "6e4948faead7a753",
"data/detail/09.json": "e1e6599e93944a3a",
"data/detail/10.json": "7fce20017a142853",
"data/detail/11.json": "d2f094b0177b2227",
"data/detail/12.json": "a6eec8637f5a15cc",
"data/detail/13.json": "536805853029cb32",
"data/detail/14.json": "bf06dc9b7ea2efca",
"data/detail/15.json": "4f80fd0888bfcffd",
"data/detail/16.json": "a5d5dbe85b7bd68e",
"data/detail/17.json": "bc598679214b90d3",
"data/detail/18.json": "77a5f99aee8cea74",
"data/detail/19.json": "b13775d9140d8c80",
"data/detail/20.json": "5a9f0cde00c64219",
"data/detail/21.json": "9a67f07c419de55a",
"data/detail/22.json": "ae3b8348e6ee33fc",
"data/detail/23.json": "d5fa2ff79a435d19",
"data/detail/24.json": "0f88e162d8c3700e",
"data/detail/25.json": "d1eb666bfd2f39fa",
"data/detail/26.json": "263ccd8776c1b2ce",
"data/detail/27.json": "fdb5186ffd44575d",
"data/detail/28.json": "80cc68cbf5c04658",
"data/detail/29.json": "be298dbc9c4ff9ca",
"data/detail/30.json": "c6ac5d78b8b7dec1",
"data/detail/31.json": "dfc902e8e03586c6",
"data/detail/32.json": "4b499cc76dab669c",
"data/detail/33.json": "951a5a78322fcb20",
"data/detail/34.json": "979eba8c3c1ac68c",
"data/detail/35.json": "519478c748e3f8e1",
"data/detail/36.json": "0db5a9799f57772b",
"data/detail/37.json": "d3512a242e5e0ba7",
"data/detail/38.json": "80d63f296d505496",
"data/detail/39.json": "276d8bc6da324e0f",
"data/detail/40.json": "0f6cdc6b59d8ceb8",
"data/detail/41.json": "a3bc3a27e44d96ec",
"data/detail/42.json": "ae550f7ace8a8c23",
"data/detail/43.json": "9c081c0e8d1df505",
"data/detail/44.json": "b8f268ca9514e3de",
"data/detail/45.json": "f4f0489e3aa7052c",
"data/detail/46.json": "1d46c4227ff71fba",
"data/detail/47.json": "3b15f7c4be7376e4",
"data/detail/48.json": "5eaeb9b37bfc1044",
"data/detail/49.json": "ba94b305ccc10814",
"data/detail/50.json": "4f483b61585c7acf",
"data/detail/51.json": "4c1764c71a484d33",
"data/detail/52.json": "d179ecad8711c868",
"data/detail/53.json": "534d4b2e8250f449",
"data/detail/54.json": "e9feb4bc4ed97170",
"data/detail/55.json": "f71b9ac4816c05d0",
"data/detail/56.json": "8bbcd96ef5ad645c",
"data/detail/57.json": "18f9fd03bb2f7a8f",
"data/detail/58.json": "c378dabb11679ac5",
"data/detail/59.json": "cb14d4190f162a79",
"data/detail/60.json": "17eb5fa84c481cea",
"data/detail/61.json": "82381e4b77f0e849",
"data/detail/62.json": "3ceb7bc8ac3f1a38",
"data/detail/63.json": "e7d2737681d066c7"
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
      const path = new URL(req.url).pathname.replace(/^.*\/(data\/detail\/[^/]+)$/, "$1");
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
    await Promise.all(ours.filter(k => ![SHELL, DATA, MEDIA].includes(k)).map(k => caches.delete(k)));
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

async function media(req) {
  const cache = await caches.open(MEDIA);
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
  if (path.includes("/data/detail/") || path.endsWith("/data/index.json")) { e.respondWith(cacheFirst(e.request, DATA)); return; }
  if (e.request.mode === "navigate" && /\/(index\.html)?$/.test(path)) {
    // The app's page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, { ignoreSearch: true }))
    .then(hit => hit || fetch(e.request)));
});
