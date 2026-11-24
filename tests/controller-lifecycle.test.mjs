import test from 'node:test';import assert from 'node:assert/strict';import '../src/image-lod.js';import '../src/image-queue.js';import '../src/image-pipeline.js';
test('pipeline instances own independent queue and cache state',()=>{
 let v1=0,v2=0;const cfg=(getVersion,invalidateCollection)=>({getVersion,invalidateCollection,getArtworks:()=>[],isLive:()=>false,getPinned:()=>new Set(),persistentStore:null,getPersistentKey:async()=>null,THUMB_EDGE:500,PREVIEW_EDGE:960,MAX_THUMB_CACHE:260,MAX_THUMB_BYTES:32*1024*1024,photo:id=>id});
 const a=globalThis.NOEMAImagePipeline.create(cfg(()=>v1,()=>v1++)),b=globalThis.NOEMAImagePipeline.create(cfg(()=>v2,()=>v2++));a.clear();assert.equal(v1,1);assert.equal(v2,0);assert.equal(a.snapshot().queue,0);assert.equal(b.snapshot().cacheCount,0);
});
