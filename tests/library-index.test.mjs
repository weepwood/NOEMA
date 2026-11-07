import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const code=fs.readFileSync(path.join(root,'library-index.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function createFakeDB(){
 const records=new Map();let ready=false;
 const db={objectStoreNames:{contains:()=>ready},createObjectStore(){ready=true},close(){},transaction(){
  const tx={oncomplete:null,onerror:null,onabort:null};let scheduled=false;
  function complete(){if(!scheduled){scheduled=true;setTimeout(()=>tx.oncomplete?.(),10)}}
  const api={
   get(key){return request(()=>records.get(key))},
   getAll(){return request(()=>Array.from(records.values()))},
   count(){return request(()=>records.size)},
   put(value){records.set(value.key,value);complete();return request(()=>value.key)},
   delete(key){records.delete(key);complete();return request(()=>undefined)},
   clear(){records.clear();complete();return request(()=>undefined)}
  };
  tx.objectStore=()=>api;return tx;
 }};
 function request(fn){
  const req={onsuccess:null,onerror:null,result:null,error:null};
  setTimeout(()=>{try{req.result=fn();req.onsuccess?.()}catch(error){req.error=error;req.onerror?.()}},0);
  return req;
 }
 return {records,indexedDB:{open(){
  const req={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};
  setTimeout(()=>{if(!ready)req.onupgradeneeded?.();req.onsuccess?.()},0);
  return req;
 }}};
}
function instance(db){
 const window={indexedDB:db?.indexedDB};
 vm.runInNewContext(code,{window,indexedDB:db?.indexedDB,crypto:webcrypto,TextEncoder,Math,Date,Error,setTimeout,clearTimeout},{timeout:1000});
 return window.NOEMALibraryIndex;
}
const img=(name='portrait.jpg',mtime=1770000000000,size=9981,filePath='my-album/portrait.jpg')=>({name,lastModified:mtime,size,type:'image/jpeg',__noemaPath:filePath});

test('metadata identity is stable across visits and does not contain plaintext paths',async()=>{
 const db=createFakeDB();const a=instance(db),b=instance(db);
 const key=await a.keyFor(img(),'My album');
 assert.equal(key,await b.keyFor(img(),'My album'));
 assert.match(key,/^i1:[a-f0-9]{64}$/);
 assert.ok(!key.includes('my-album'));
 assert.notEqual(key,await b.keyFor(img('portrait.jpg',1770000000001),'My album'));
 assert.notEqual(key,await b.keyFor(img(),'Another album'));
 assert.notEqual(key,await b.keyFor(img('portrait.jpg',1770000000000,9982),'My album'));
});

test('stored aspect ratio is reused across independent instances and can be cleared',async()=>{
 const db=createFakeDB(),a=instance(db),file=img();
 assert.equal(await a.getRatio(file,'ALBUM'),null);
 assert.equal(await a.putRatio(file,'ALBUM',.625),true);
 await a.whenIdle();
 const b=instance(db);
 assert.equal(await b.getRatio(file,'ALBUM'),.625);
 assert.equal(await b.getRatio(img('portrait.jpg',1770000000002),'ALBUM'),null);
 const stats=await b.stats();
 assert.equal(stats.hits,1);assert.equal(stats.misses,1);assert.equal(stats.count,1);
 assert.equal(await b.clear(),true);
 assert.equal((await b.stats()).count,0);
 assert.equal(await a.getRatio(file,'ALBUM'),null);
});

test('invalid ratios are rejected and blocked storage does not break imports',async()=>{
 const db=createFakeDB(),a=instance(db);
 assert.equal(await a.putRatio(img(),'ALBUM',NaN),false);
 assert.equal(await a.putRatio(img(),'ALBUM',-0.5),false);
 assert.equal((await a.stats()).count,0);
 const noDb=instance(null);
 assert.equal(await noDb.getRatio(img(),'ALBUM'),null);
 assert.equal(await noDb.putRatio(img(),'ALBUM',2),false);
 assert.equal((await noDb.stats()).available,false);
});

test('search remains bounded to forty results for a 20k-file collection',()=>{
 assert.ok(inline,'Inline gallery script is missing');
 const normalization=inline.match(/const normalizeQuery=value=>[^\n]+/);
 const finder=inline.match(/function findArtworks\(query,limit=40\)\{[\s\S]*?\n\}/);
 assert.ok(normalization&&finder,'Search implementation is not found');
 const items=Array.from({length:20000},(_,i)=>({title:'photo-'+String(i).padStart(5,'0'),desc:'folder/sub/'+i+'.jpg',category:'LOCAL'}));
 const context={artworks:items};
 const run=vm.runInNewContext(normalization[0]+'\n'+finder[0]+'\nfindArtworks;',context);
 const broad=run('photo');
 assert.equal(broad.total,20000);assert.equal(broad.found.length,40);
 const exact=run('PHOTO-01998');
 assert.equal(exact.total,1);assert.equal(exact.found[0].index,1998);
});

test('index is separate from thumbnail cache, and search overlay respects keyboard focus',()=>{
 assert.match(html,/<script src="\.\/library-index\.js"><\/script>/);
 assert.match(html,/id="searchOverlay"[^>]*aria-modal="true"/);
 assert.match(html,/id="searchInput" type="search"/);
 assert.match(html,/document\.getElementById\('clearIndexBtn'\)/);
 assert.match(html,/searchInput\.addEventListener\('input'/);
 assert.match(html,/makeTile\(target\.id,target\.rect,index\)/);
 assert.match(html,/cachedAspect\(file,displayName\)/);
});
