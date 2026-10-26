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
// Serialize the entire read/advance/write cycle, including reports from other tabs.
let memoryQueue = Promise.resolve();
async function change(transform) {
  const db = await open();
  if (!db) {
    const task=memoryQueue.then(()=>{memory=transform(memory);return structuredClone(memory);});
    memoryQueue=task.catch(()=>{});return task;
  }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),read=store.get(KEY);
    let result;
    read.onsuccess=()=>{try{const previous=read.result;result=transform(previous);if(JSON.stringify(previous)!==JSON.stringify(result))store.put(result,KEY);}catch(error){tx.abort();reject(error);}};
    tx.oncomplete=()=>{memory=result;resolve(structuredClone(result));};
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Operation transaction aborted'));
  });
}
const current=(stored,now)=>stored?.version===1?advance(stored,now):createOperation(now);
export async function getOperation(now=Date.now()){return change(stored=>current(stored,now));}
export async function reportLive(live,now=Date.now()){
  return change(stored=>{
    const op=current(stored,now);
    // An active feed owns one lease. A second tab cannot replace its combat state.
    if(live.session&&op.liveSession&&live.session!==op.liveSession&&now<op.liveUntil)return op;
    return applyLive(op,live,now);
  });
}
export async function releaseLive(session,now=Date.now()){
  return change(stored=>{const op=current(stored,now);if(op.liveSession===session)op.liveUntil=now;return op;});
}