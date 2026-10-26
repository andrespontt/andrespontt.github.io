import { advance, applyLive, createOperation } from './city-ops.mjs';

// The Kestrel Falls operation lives in the browser's IndexedDB ('bunker' database, 'operations' store),
// so it persists between visits and keeps running off-screen. Falls back to memory when storage is
// unavailable (private windows, blocked site data).
const DB = 'bunker', STORE = 'operations', KEY = 'kestrel-falls';
let memory = null, dbPromise = null;

function open() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  dbPromise ??= new Promise(resolve => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
async function read() {
  const db = await open();
  if (!db) return memory;
  return new Promise(resolve => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ?? memory);
      request.onerror = () => resolve(memory);
    } catch { resolve(memory); }
  });
}
async function write(op) {
  memory = op;
  const db = await open();
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(op, KEY); } catch {}
}

// Current state of the operation, caught up to now (and created on first use).
export async function getOperation(now = Date.now()) {
  const stored = await read();
  const op = stored?.version === 1 ? advance(stored, now) : createOperation(now);
  await write(op);
  return op;
}

// The live scene's view of the fight replaces the simulated one while the drone feed is open.
export async function reportLive(live, now = Date.now()) {
  const op = applyLive(await getOperation(now), live, now);
  await write(op);
  return op;
}
