// Minimal IndexedDB helpers for the static build: "state" holds the learner's
// progress (a snapshot, a revision number and one key per logged answer),
// "recordings" their pronunciation recordings (Blobs, keyed by word key).
// Reads of "state" fail loudly: treating a failed read as "no progress" would
// let the next save overwrite real progress.

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("leximaster", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("state");
        req.result.createObjectStore("recordings");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(e => {
      dbPromise = null;
      throw new Error(`This browser can't save progress (${e && e.message || "storage unavailable"}).`);
    });
  }
  return dbPromise;
}

/** Run fn(store) in one transaction; resolves with fn's return value (a
 * request's result, or a plain value) once the transaction has committed. */
export async function idbTx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = t.onabort = () => reject(t.error || new Error("storage transaction failed"));
  });
}

const prefixRange = prefix => IDBKeyRange.bound(prefix, prefix + "￿");

export const idbGet = (store, key) => idbTx(store, "readonly", s => s.get(key));
export const idbPut = (store, key, value) => idbTx(store, "readwrite", s => s.put(value, key));
export const idbDelete = (store, key) => idbTx(store, "readwrite", s => s.delete(key)).catch(() => undefined);
export const idbKeys = store => idbTx(store, "readonly", s => s.getAllKeys());
/** All [key, value] pairs whose key starts with prefix. */
export async function idbEntries(store, prefix) {
  let keys, values;
  await idbTx(store, "readonly", s => {
    s.getAllKeys(prefixRange(prefix)).onsuccess = e => { keys = e.target.result; };
    s.getAll(prefixRange(prefix)).onsuccess = e => { values = e.target.result; };
  });
  return keys.map((k, i) => [k, values[i]]);
}
