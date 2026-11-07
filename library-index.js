/* NOEMA v7 — private, best-effort aspect-ratio index.
   Stores opaque metadata keys and dimensions, never images or plaintext paths.
   The browser may evict this data and file permissions always require user consent. */
(() => {
  'use strict';
  const DATABASE = 'noema-library-index-v1';
  const STORE = 'aspects';
  const MAX_ITEMS = 40000;
  const TARGET_ITEMS = 32000;
  const metrics = {hits:0,misses:0,writes:0,errors:0};
  let databasePromise = null;
  let pendingWrites = Promise.resolve();
  let writesSincePrune = 0;
  let unavailable = false;

  function requestResult(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('IndexedDB request failed'));
    });
  }
  function openDB(){
    if(unavailable||!('indexedDB' in window))return Promise.resolve(null);
    if(databasePromise)return databasePromise;
    databasePromise=new Promise(resolve=>{
      let request;
      try{request=indexedDB.open(DATABASE,1)}catch{unavailable=true;resolve(null);return}
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});
      };
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();databasePromise=null};
        resolve(db);
      };
      request.onerror=()=>{unavailable=true;resolve(null)};
      request.onblocked=()=>{unavailable=true;resolve(null)};
    });
    return databasePromise;
  }
  function enqueue(job){
    const work=pendingWrites.then(job,job);
    pendingWrites=work.catch(()=>{});
    return work;
  }
  // A metadata identity, not a cryptographic guarantee against a file whose bytes
  // changed without its size or modified timestamp changing.
  async function keyFor(file,namespace='LOCAL COLLECTION'){
    if(!file)return null;
    const path=file.__noemaPath||file.webkitRelativePath||file.name||'';
    const descriptor=JSON.stringify([1,namespace,path,file.size||0,file.lastModified||0,file.type||'']);
    if(globalThis.crypto?.subtle){
      const bytes=new TextEncoder().encode(descriptor);
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      return 'i1:'+Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
    }
    // Stable fallback for file:// and non-secure contexts.
    let a=2166136261,b=2246822519;
    for(let i=0;i<descriptor.length;i++){
      const value=descriptor.charCodeAt(i);
      a=Math.imul(a^value,16777619)>>>0;
      b=Math.imul(b+value,3266489917)>>>0;
    }
    return 'i1:'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
  }
  async function getRatio(file,namespace){
    const db=await openDB();
    if(!db)return null;
    try{
      const key=await keyFor(file,namespace);
      const record=await requestResult(db.transaction(STORE,'readonly').objectStore(STORE).get(key));
      if(record&&Number.isFinite(record.ratio)&&record.ratio>.005&&record.ratio<200){
        metrics.hits++;return record.ratio;
      }
      metrics.misses++;return null;
    }catch{metrics.errors++;return null}
  }
  async function prune(){
    const db=await openDB();
    if(!db)return 0;
    const all=await requestResult(db.transaction(STORE,'readonly').objectStore(STORE).getAll());
    if(all.length<=MAX_ITEMS)return 0;
    all.sort((a,b)=>(a.accessed||0)-(b.accessed||0));
    const victims=all.slice(0,all.length-TARGET_ITEMS);
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      for(const victim of victims)tx.objectStore(STORE).delete(victim.key);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Index prune failed'));
      tx.onabort=()=>reject(tx.error||new Error('Index prune aborted'));
    });
    return victims.length;
  }
  function putRatio(file,namespace,ratio){
    if(!file||!Number.isFinite(ratio)||ratio<=.005||ratio>=200)return Promise.resolve(false);
    return enqueue(async()=>{
      const db=await openDB();
      if(!db)return false;
      try{
        const key=await keyFor(file,namespace);
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(STORE,'readwrite');
          tx.objectStore(STORE).put({key,ratio,accessed:Date.now()});
          tx.oncomplete=()=>resolve();
          tx.onerror=()=>reject(tx.error||new Error('Index write failed'));
          tx.onabort=()=>reject(tx.error||new Error('Index write aborted'));
        });
        metrics.writes++;
        if(++writesSincePrune>=256){writesSincePrune=0;await prune()}
        return true;
      }catch{metrics.errors++;return false}
    });
  }
  function clear(){
    return enqueue(async()=>{
      const db=await openDB();
      if(!db)return false;
      return new Promise(resolve=>{
        try{
          const tx=db.transaction(STORE,'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete=()=>resolve(true);
          tx.onerror=()=>resolve(false);
          tx.onabort=()=>resolve(false);
        }catch{resolve(false)}
      });
    });
  }
  async function stats(){
    await pendingWrites;
    const db=await openDB();
    if(!db)return {available:false,count:0,...metrics};
    try{
      const count=await requestResult(db.transaction(STORE,'readonly').objectStore(STORE).count());
      return {available:true,count,...metrics};
    }catch{return {available:false,count:0,...metrics}}
  }
  window.NOEMALibraryIndex=Object.freeze({keyFor,getRatio,putRatio,clear,stats,whenIdle:()=>pendingWrites,limits:{items:MAX_ITEMS}});
})();
