// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Stats → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "20261028151349";
const SHELL = `lexi-shell-${VERSION}`;
const DATA = "lexi-data-0203e00e";   // changes only when the published word data does
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
// Content hash (SHA-256, first 16 hex digits) of each word-detail and glossary file in this
// build: an offline download made under an earlier version keeps the files
// that haven't changed.
const DETAIL_HASHES = {
"data/detail/00.json": "519ebb8b96258bc9",
"data/detail/01.json": "f60676eb477db36b",
"data/detail/02.json": "57889381a76e8c53",
"data/detail/03.json": "29a1a4096f219b06",
"data/detail/04.json": "3ec609369a99ee48",
"data/detail/05.json": "dd4e99067322d9c6",
"data/detail/06.json": "e61df3c39be9e787",
"data/detail/07.json": "b5db118b1f5c14d5",
"data/detail/08.json": "9beeda0c55d2ede7",
"data/detail/09.json": "4a937056e0e9ebf1",
"data/detail/10.json": "304adbbd96f4de7f",
"data/detail/11.json": "d3cfacd4bcba9ae4",
"data/detail/12.json": "db98fb5eb4627466",
"data/detail/13.json": "5d8f337a1619db56",
"data/detail/14.json": "ad3a3cf0e41483d3",
"data/detail/15.json": "1ddec550a7b41674",
"data/detail/16.json": "4c78fa0c60a40698",
"data/detail/17.json": "1158b518c6f8cb0b",
"data/detail/18.json": "e8475fa6297f38ec",
"data/detail/19.json": "d0246cc9cad01465",
"data/detail/20.json": "3f7bc6f565eed1c1",
"data/detail/21.json": "1cb610e9cc186b80",
"data/detail/22.json": "f97ab20f2b56207e",
"data/detail/23.json": "738a53eb0df1955f",
"data/detail/24.json": "40ccac2d9af72748",
"data/detail/25.json": "c9dc25fa10808846",
"data/detail/26.json": "5e810741ec32470b",
"data/detail/27.json": "6b492736f8389d50",
"data/detail/28.json": "f192bb0fb1ce748c",
"data/detail/29.json": "eede882c9aec6dc0",
"data/detail/30.json": "6554306b1b9d4358",
"data/detail/31.json": "879d5fcac6e406d4",
"data/detail/32.json": "c83cce381f60c523",
"data/detail/33.json": "de395466885344e3",
"data/detail/34.json": "4c0c5e8af49a39a6",
"data/detail/35.json": "bd77189f5c81379e",
"data/detail/36.json": "b7c103751343bee1",
"data/detail/37.json": "bbe5c9d47757f027",
"data/detail/38.json": "af131cc18edbb513",
"data/detail/39.json": "b272e16071129671",
"data/detail/40.json": "e940399b0360dec2",
"data/detail/41.json": "134425c9c0e56dc5",
"data/detail/42.json": "9de656418947a58c",
"data/detail/43.json": "8eecc4e1c4014f38",
"data/detail/44.json": "553f1bead1ddf143",
"data/detail/45.json": "5c421d390e663905",
"data/detail/46.json": "704a1c3a8cd78fc0",
"data/detail/47.json": "628ab18a7f22ae78",
"data/detail/48.json": "d9ced32111749274",
"data/detail/49.json": "1fd9b39bb427539f",
"data/detail/50.json": "a399f655bc734043",
"data/detail/51.json": "8cc84781fe6adb23",
"data/detail/52.json": "f270c8e301823c3a",
"data/detail/53.json": "1c8e223aa6a0e59d",
"data/detail/54.json": "eaf502852f2abf75",
"data/detail/55.json": "60f8aa661902b832",
"data/detail/56.json": "bda0f06e0768f8ae",
"data/detail/57.json": "587abfd035e932e1",
"data/detail/58.json": "04ea1e393f0c0b5c",
"data/detail/59.json": "3c91a6fde4e9a6bd",
"data/detail/60.json": "26519234bcc1b742",
"data/detail/61.json": "1914c77016202e40",
"data/detail/62.json": "52a95d868cf8bbb0",
"data/detail/63.json": "664313cae949d861",
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
  if (path.includes("/data/detail/") || path.includes("/data/gloss/") || path.endsWith("/data/index.json")) { e.respondWith(cacheFirst(e.request, DATA)); return; }
  if (e.request.mode === "navigate" && /\/(index\.html)?$/.test(path)) {
    // The app's page comes from the same version's cache as its scripts.
    e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(e.request)));
    return;
  }
  e.respondWith(caches.open(SHELL).then(c => c.match(e.request, { ignoreSearch: true }))
    .then(hit => hit || fetch(e.request)));
});
