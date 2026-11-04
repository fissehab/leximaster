// LexiMaster offline support. The app shell and word index are cached on
// install (the index in the data cache, so a code-only update doesn't fetch it
// again); word details and recordings are cached the first time they load
// (or all at once from Settings → "Download for offline use").
// A new version installs in the background and takes over only when the
// page asks (on Home, Browse and other calm screens, never mid-session).
// Every cache name starts with "lexi-": the site shares its origin
// (fissehab.github.io) with other projects, whose caches are left alone.
const VERSION = "20261103212520";
const SHELL = `lexi-shell-${VERSION}`;
const DATA = "lexi-data-64148d94";   // changes only when the published word data does
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
"data/detail/00.json": "abb05929bd655541",
"data/detail/01.json": "0a1659dc59a3d61d",
"data/detail/02.json": "a420d50083f29081",
"data/detail/03.json": "b7f8d088424cfac8",
"data/detail/04.json": "284ae33bfd08c8e1",
"data/detail/05.json": "83753640c12f67f7",
"data/detail/06.json": "3f6fe204bdffe43a",
"data/detail/07.json": "ff3136958f24b8b9",
"data/detail/08.json": "5d4e1ea06801b57a",
"data/detail/09.json": "d52b894517b3b2b6",
"data/detail/10.json": "965915ff74e7cc96",
"data/detail/11.json": "af247f37ff4b71b5",
"data/detail/12.json": "4c34276aa589f887",
"data/detail/13.json": "b178b36d956f0d04",
"data/detail/14.json": "8dba3235c0974eeb",
"data/detail/15.json": "f15f41ebe8c28757",
"data/detail/16.json": "fab53daf8630f13f",
"data/detail/17.json": "adc7faf5bfc29c7e",
"data/detail/18.json": "73179c2aea259877",
"data/detail/19.json": "361b0156b364ec07",
"data/detail/20.json": "2614ca076f4123d4",
"data/detail/21.json": "10661797148105bc",
"data/detail/22.json": "edf178e9a1371411",
"data/detail/23.json": "00f831e675bdfabf",
"data/detail/24.json": "1e2fed9defebdb37",
"data/detail/25.json": "48c8dd8db145c523",
"data/detail/26.json": "9d92b1c5ed3cb628",
"data/detail/27.json": "c1db892ca66ea491",
"data/detail/28.json": "ae85dad9847650e6",
"data/detail/29.json": "6794db649e944be3",
"data/detail/30.json": "270aceeb7d06da1a",
"data/detail/31.json": "5c3895b1dd7082fe",
"data/detail/32.json": "82fb655d74528780",
"data/detail/33.json": "d9bec686b5a84872",
"data/detail/34.json": "b572b078f98846be",
"data/detail/35.json": "67e0bfd4c54d37da",
"data/detail/36.json": "40674a56ac83369f",
"data/detail/37.json": "97f05798aec26a28",
"data/detail/38.json": "d29520c5959d7416",
"data/detail/39.json": "d355cb4e2a2ef614",
"data/detail/40.json": "395ff310435c9e8c",
"data/detail/41.json": "b33960cee6c3b4bd",
"data/detail/42.json": "59b0920607ed36b8",
"data/detail/43.json": "b15a20f7b4907897",
"data/detail/44.json": "22009ad9f3aff072",
"data/detail/45.json": "389fbfea77a63ab6",
"data/detail/46.json": "bb49152b14fa9639",
"data/detail/47.json": "50b0783d05f2f822",
"data/detail/48.json": "0e9d5725d341fa2c",
"data/detail/49.json": "10dd24e90abdfea0",
"data/detail/50.json": "d1bf5d9f896bd642",
"data/detail/51.json": "6ca0dd4644b5f027",
"data/detail/52.json": "8728266f5ef802b4",
"data/detail/53.json": "b0bed35fb34f24df",
"data/detail/54.json": "a8fccd5f2e1155c2",
"data/detail/55.json": "00a3561a34a13643",
"data/detail/56.json": "f00eac6f1587e9ec",
"data/detail/57.json": "8b8a593f83a866d0",
"data/detail/58.json": "17b0f97852abf287",
"data/detail/59.json": "524792ca2a57c41d",
"data/detail/60.json": "f3f338cb2c047fdc",
"data/detail/61.json": "fa54994bf6016d07",
"data/detail/62.json": "3dcdf29e3ff3f8ac",
"data/detail/63.json": "e6ccd070b7af9a13",
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
