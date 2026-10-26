// LexiMaster offline support. The app shell and word index are cached on
// install; word details and recordings are cached the first time they load
// (or all at once from Stats → "Download for offline use").
const VERSION = "20261025222658";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const MEDIA = "media-v1";   // recordings never change, so they survive updates
const SHELL_FILES = [
"./",
"index.html",
"manifest.webmanifest",
"data/index.json",
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
"static/fonts/-iterata-latin-ext-or3yq6p12-ijxaiglyt1pls1a-t7pu0abee9kk5a5cl4ooctvng.woff2",
"static/fonts/-iterata-latin-or3pq6p12-ijxaigla78dkttaodhk0ovpak3ylanflhppf2tbli4j-hwtekvt8k.woff2",
"static/fonts/-iterata-latin-or3yq6p12-ijxaiglyt1pls1a-t7pu0abee9kk5u5cl4ooct.woff2",
"static/fonts/-lex-ans-latin-ext-zyxzkvelmyyaje8bplhncwdkr932-g7dytd-dmu1syxqkybsb4zhrnu.woff2",
"static/fonts/-lex-ans-latin-zyxzkvelmyyaje8bplhncwdkr932-g7dytd-dmu1syxekybsb4zh.woff2",
"static/fonts/fonts.css",
"static/icons/icon-180.png",
"static/icons/icon-192.png",
"static/icons/icon-512.png",
"static/js/api.js",
"static/js/app.js",
"static/js/audio.js",
"static/js/local/idb.js",
"static/js/local/server.js",
"static/js/state.js",
"static/js/tabs/browse.js",
"static/js/tabs/flashcards.js",
"static/js/tabs/home.js",
"static/js/tabs/listen.js",
"static/js/tabs/lists.js",
"static/js/tabs/matching.js",
"static/js/tabs/pronounce.js",
"static/js/tabs/quiz.js",
"static/js/tabs/review.js",
"static/js/tabs/stats.js",
"static/js/ui.js",
"static/vendor/sql-wasm.js",
"static/vendor/sql-wasm.wasm"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => ![SHELL, DATA, MEDIA].includes(k)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.includes("/media/")) { e.respondWith(cacheFirst(e.request, MEDIA)); return; }
  if (path.includes("/data/detail/")) { e.respondWith(cacheFirst(e.request, DATA)); return; }
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
