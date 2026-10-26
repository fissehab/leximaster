// Minimal IndexedDB key-value helpers for the static build: "state" holds the
// learner's progress, "recordings" their pronunciation recordings (Blobs).

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

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const idbGet = (store, key) => tx(store, "readonly", s => s.get(key)).catch(() => undefined);
export const idbPut = (store, key, value) => tx(store, "readwrite", s => s.put(value, key));
export const idbDelete = (store, key) => tx(store, "readwrite", s => s.delete(key)).catch(() => undefined);
