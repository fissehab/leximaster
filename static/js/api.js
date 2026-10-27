// Thin JSON client for the FastAPI backend, or, on the static GitHub Pages
// build (window.LEXI_STATIC), for the same API running in the browser.

// A fetch that fails outright (no network) throws a TypeError.
const OFFLINE = "You're offline, and this part isn't saved on this device yet. " +
  "Stats → Download for offline use makes all of LexiMaster work offline.";

async function request(method, url, body) {
  if (window.LEXI_STATIC) {
    const { handle } = await import("./local/server.js");
    try {
      return await handle(method, url, body);
    } catch (e) {
      throw e instanceof TypeError && !navigator.onLine ? new Error(OFFLINE) : e;
    }
  }
  const opts = { method, headers: {} };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) msg = typeof data.detail === "string" ? data.detail : data.detail.map(d => d.msg).join("; ");
    } catch (e) { /* not JSON */ }
    throw new Error(msg);
  }
  return res.json();
}

const qs = params => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const api = {
  get: (url, params) => request("GET", url + qs(params)),
  post: (url, body) => request("POST", url, body),
  patch: (url, body) => request("PATCH", url, body),
  del: url => request("DELETE", url),
};

// Word list cache shared by Browse, Lists and the typeahead.
// One request at a time: callers that arrive while it loads share it.
let wordsCache = null;
let wordsLoading = null;
export function allWords(force = false) {
  if (wordsCache && !force) return Promise.resolve(wordsCache);
  if (!wordsLoading) {
    wordsLoading = api.get("/api/words")
      .then(res => (wordsCache = res.words))
      .finally(() => { wordsLoading = null; });
  }
  return wordsLoading;
}
/** The word list if it's already loaded, else null (no request). */
export const cachedWords = () => wordsCache;
export function patchCachedWord(id, fields) {
  const w = wordsCache && wordsCache.find(x => x.id === id);
  if (w) Object.assign(w, fields);
}
export function invalidateWords() { wordsCache = null; }
