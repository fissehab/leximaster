// In-memory stand-in for static/js/local/idb.js (same exports), for the
// Node tests of the website's engine (harness.mjs).
const stores = { state: new Map(), recordings: new Map() };
const clone = v => (v === undefined ? v : structuredClone(v));
export async function idbTx(store, mode, fn) {
  const m = stores[store];
  const req = r => { const o = { result: r, onsuccess: null }; queueMicrotask(() => o.onsuccess && o.onsuccess({ target: o })); return o; };
  const s = { get: k => req(clone(m.get(k))), put: (v, k) => { m.set(k, clone(v)); return req(k); }, delete: k => { m.delete(k); return req(); },
    getAllKeys: range => req([...m.keys()].filter(k => !range || (k >= range[0] && k <= range[1])).sort()),
    getAll: range => req([...m.keys()].filter(k => !range || (k >= range[0] && k <= range[1])).sort().map(k => clone(m.get(k)))) };
  const out = fn(s);
  await new Promise(r => setTimeout(r, 0));
  return out && "result" in out && "onsuccess" in out ? out.result : out;
}
export const idbGet = (store, key) => idbTx(store, "readonly", s => s.get(key));
export const idbPut = (store, key, value) => idbTx(store, "readwrite", s => s.put(value, key));
export const idbDelete = (store, key) => idbTx(store, "readwrite", s => s.delete(key));
export const idbKeys = store => idbTx(store, "readonly", s => s.getAllKeys());
export async function idbEntries(store, prefix) {
  const m = stores[store];
  return [...m.keys()].filter(k => String(k).startsWith(prefix)).sort().map(k => [k, clone(m.get(k))]);
}
