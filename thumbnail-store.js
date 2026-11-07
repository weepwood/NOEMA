/* NOEMA v6 — local-only, bounded, best-effort persistent thumbnail cache.
   Original image files and directory handles are never stored here. */
(() => {
  'use strict';
  const DB_NAME = 'noema-thumbnails-v1';
  const STORE = 'thumbnails';
  const VERSION = 1;
  const MAX_ITEMS = 1200;
  const MAX_BYTES = 96 * 1024 * 1024;
  const FINGERPRINT_BYTES = 16384;
  const TOUCH_INTERVAL = 6 * 60 * 60 * 1000;
  let dbPromise = null;
  let disabled = false;
  let mutations = Promise.resolve();
  let writesSincePrune = 0;
  const metrics = {hits:0, misses:0, writes:0, errors:0};

  function openDB() {
    if (disabled || !('indexedDB' in window)) return Promise.resolve(null);
    if (!dbPromise) dbPromise = new Promise((resolve) => {
      let request;
      try { request = indexedDB.open(DB_NAME, VERSION); }
      catch { disabled = true; resolve(null); return; }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, {keyPath:'key'});
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => {disabled = true; resolve(null)};
      request.onblocked = () => {disabled = true; resolve(null)};
    });
    return dbPromise;
  }
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }
  function mutate(job) {
    const next = mutations.then(job, job);
    mutations = next.catch(() => {});
    return next;
  }
  async function get(key) {
    if (!key) return null;
    const db = await openDB();
    if (!db) return null;
    try {
      const record = await requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
      if (!record || !(record.blob instanceof Blob) || record.blob.size === 0) {metrics.misses++; return null}
      metrics.hits++;
      if (Date.now() - (record.lastUsed || 0) > TOUCH_INTERVAL) {
        void mutate(async () => {
          const currentDB = await openDB();
          if (!currentDB) return;
          const tx = currentDB.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          const value = await requestResult(store.get(key));
          if (value) {value.lastUsed = Date.now(); store.put(value)}
        });
      }
      return record.blob;
    } catch {metrics.errors++; return null}
  }
  async function keyFor(file, relativePath = '') {
    const name = relativePath || file.webkitRelativePath || file.name || '';
    // Fingerprint metadata and small content samples, without persisting names/paths.
    // This is a cache identity, not a cryptographic proof that entire files match.
    const metadata = new TextEncoder().encode(JSON.stringify([2,name,file.size,file.lastModified || 0]));
    const head = new Uint8Array(await file.slice(0, FINGERPRINT_BYTES).arrayBuffer());
    const tail = file.size > FINGERPRINT_BYTES
      ? new Uint8Array(await file.slice(-FINGERPRINT_BYTES).arrayBuffer()) : new Uint8Array();
    const data = new Uint8Array(metadata.length + head.length + tail.length);
    data.set(metadata,0);data.set(head,metadata.length);data.set(tail,metadata.length+head.length);
    if (globalThis.crypto?.subtle) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      return 't2:'+Array.from(digest, n => n.toString(16).padStart(2,'0')).join('');
    }
    // Stable 64-bit fallback when SubtleCrypto is unavailable (e.g. file://).
    let hash = 14695981039346656037n;
    for (const byte of data) hash = BigInt.asUintN(64,(hash ^ BigInt(byte))*1099511628211n);
    return 't2:'+hash.toString(16).padStart(16,'0');
  }
  async function write(key, blob) {
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({key, blob, bytes:blob.size, lastUsed:Date.now()});
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('Thumbnail cache write failed'));
        tx.onabort = () => reject(tx.error || new Error('Thumbnail cache aborted'));
      } catch (error) {reject(error)}
    });
  }
  async function allRecords() {
    const db = await openDB();
    if (!db) return [];
    return requestResult(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  }
  async function prune(aggressive = false) {
    const records = await allRecords();
    let count = records.length;
    let bytes = records.reduce((sum,r) => sum + (r.bytes || r.blob?.size || 0), 0);
    const targetCount = aggressive ? Math.floor(MAX_ITEMS / 2) : MAX_ITEMS;
    const targetBytes = aggressive ? Math.floor(MAX_BYTES / 2) : MAX_BYTES;
    if (count <= targetCount && bytes <= targetBytes) return {count,bytes,deleted:0};
    records.sort((a,b)=>(a.lastUsed||0)-(b.lastUsed||0));
    const keys=[];
    for (const r of records) {
      if (count <= targetCount && bytes <= targetBytes) break;
      keys.push(r.key);count--;bytes -= r.bytes || r.blob?.size || 0;
    }
    const db = await openDB();
    if (!db) return {count,bytes,deleted:0};
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const key of keys) tx.objectStore(STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Cache prune failed'));
      tx.onabort = () => reject(tx.error || new Error('Cache prune aborted'));
    });
    return {count,bytes,deleted:keys.length};
  }
  function put(key, blob) {
    if (!key || !(blob instanceof Blob) || blob.size > 2*1024*1024) return Promise.resolve(false);
    return mutate(async () => {
      try {
        if (!(await write(key,blob))) return false;
      } catch (error) {
        if (error?.name !== 'QuotaExceededError') {metrics.errors++; return false}
        try {await prune(true);if (!(await write(key,blob))) return false} catch {metrics.errors++;return false}
      }
      metrics.writes++;
      if (++writesSincePrune >= 12) {writesSincePrune=0;try {await prune()} catch {metrics.errors++}}
      return true;
    });
  }
  function clear() {
    return mutate(async()=>{
      const db=await openDB();
      if(!db)return false;
      return new Promise(resolve=>{
        try {
          const tx=db.transaction(STORE,'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete=()=>resolve(true);
          tx.onerror=()=>resolve(false);
          tx.onabort=()=>resolve(false);
        }catch {resolve(false)}
      });
    });
  }
  async function stats() {
    try {
      await mutations;
      const records=await allRecords();
      return {available: Boolean(await openDB()),count:records.length,
        bytes:records.reduce((sum,r)=>sum+(r.bytes||r.blob?.size||0),0),...metrics};
    } catch {return {available:false,count:0,bytes:0,...metrics}}
  }
  window.NOEMAThumbStore = Object.freeze({get,put,clear,stats,keyFor,whenIdle:()=>mutations,limits:{items:MAX_ITEMS,bytes:MAX_BYTES}});
})();