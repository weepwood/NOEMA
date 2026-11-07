import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {File} from 'node:buffer';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=fs.readFileSync(path.join(root,'thumbnail-store.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function mockIndexedDB(){
  const rows=new Map();
  let created=false;
  const storeList={contains:()=>created};
  const db={objectStoreNames:storeList,close(){},createObjectStore(){created=true;return {}},transaction(){
    const tx={oncomplete:null,onerror:null,onabort:null};
    tx.objectStore=()=>({
      get(key){return request(()=>rows.get(key))},
      getAll(){return request(()=>Array.from(rows.values()))},
      put(value){rows.set(value.key,value);scheduleComplete();return request(()=>value.key)},
      delete(key){rows.delete(key);scheduleComplete();return request(()=>undefined)},
      clear(){rows.clear();scheduleComplete();return request(()=>undefined)}
    });
    let completion=null;
    function scheduleComplete(){
      if(completion)clearTimeout(completion);
      completion=setTimeout(()=>tx.oncomplete?.(),8);
    }
    return tx;
  }};
  function request(compute){
    const r={onsuccess:null,onerror:null,result:null,error:null};
    setTimeout(()=>{try{r.result=compute();r.onsuccess?.()}catch(e){r.error=e;r.onerror?.()}},0);
    return r;
  }
  return {
    rows,
    indexedDB:{open(){
      const r={result:db,onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null};
      setTimeout(()=>{if(!created)r.onupgradeneeded?.();r.onsuccess?.()},0);
      return r;
    }}
  };
}
function createStore(database){
  const window={indexedDB:database?.indexedDB};
  const context={window,indexedDB:database?.indexedDB,crypto:webcrypto,TextEncoder,Blob,Math,Date,Error,setTimeout,clearTimeout};
  vm.runInNewContext(script,context,{timeout:1000});
  return window.NOEMAThumbStore;
}
function sample(name,content){
  const file=new File([content],name,{type:'image/jpeg',lastModified:1700000000000});
  return file;
}

test('fingerprints remain stable across sessions without revealing filenames',async()=>{
  const db=mockIndexedDB();const first=createStore(db);const second=createStore(db);
  const key1=await first.keyFor(sample('PRIVATE-ALBUM.jpg','A'.repeat(25000)),'family/PRIVATE-ALBUM.jpg');
  const key2=await second.keyFor(sample('PRIVATE-ALBUM.jpg','A'.repeat(25000)),'family/PRIVATE-ALBUM.jpg');
  const changed=await second.keyFor(sample('PRIVATE-ALBUM.jpg','A'.repeat(24999)+'B'),'family/PRIVATE-ALBUM.jpg');
  assert.equal(key1,key2);
  assert.notEqual(key1,changed);
  assert.ok(!key1.includes('PRIVATE-ALBUM'));
  assert.match(key1,/^t2:[a-f0-9]{64}$/);
});

test('thumbnails persist between fresh store instances and can be cleared',async()=>{
  const db=mockIndexedDB();const first=createStore(db);
  const key=await first.keyFor(sample('a.jpg','abc'));
  const thumb=new Blob(['webp-byte-test'],{type:'image/webp'});
  assert.equal(await first.put(key,thumb),true);
  await first.whenIdle();
  const second=createStore(db);
  const loaded=await second.get(key);
  assert.equal(loaded?.size,thumb.size);
  const stats=await second.stats();
  assert.equal(stats.count,1);assert.equal(stats.hits,1);
  assert.equal(await second.clear(),true);
  const cleared=await second.stats();
  assert.equal(cleared.count,0);
  assert.equal(await first.get(key),null);
});

test('the persistent cache prunes oldest records and respects item budget',async()=>{
  const db=mockIndexedDB();const store=createStore(db);
  const small=new Blob(['test'],{type:'image/webp'});
  for(let i=0;i<1200;i++)db.rows.set('seed-'+i,{key:'seed-'+i,blob:small,bytes:small.size,lastUsed:i});
  for(let i=0;i<12;i++)await store.put('new-'+i,small);
  const result=await store.stats();
  assert.ok(result.count<=store.limits.items,result);
  assert.ok(result.bytes<=store.limits.bytes,result);
  assert.equal(db.rows.has('seed-0'),false);
  assert.equal(db.rows.has('new-11'),true);
});

test('unavailable IndexedDB never blocks the viewer',async()=>{
  const store=createStore(null);
  assert.equal(await store.get('anything'),null);
  assert.equal(await store.put('test',new Blob(['x'])),false);
  assert.equal((await store.stats()).available,false);
});

test('help UI offers explicit cache inspection and clearing',()=>{
  assert.match(html,/<script src="\.\/thumbnail-store\.js"><\/script>/);
  assert.match(html,/id="cacheStatus"/);
  assert.match(html,/id="clearCacheBtn"/);
  assert.match(html,/function getPersistentKey\(art\)/);
  assert.match(html,/persistentStore\.get\(key\)/);
  assert.match(html,/persistentStore\.put\(key,blob\)/);
  assert.match(html,/modal\.addEventListener\('keydown'/);
});