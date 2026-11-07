import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workerSource=fs.readFileSync(path.join(root,'thumbnail-worker.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('worker script parses and is deployed as a local asset',()=>{
  new vm.Script(workerSource);
  assert.match(html,/new Worker\(new URL\('\.\/thumbnail-worker\.js',document\.baseURI\)\)/);
  assert.match(workerSource,/new OffscreenCanvas\(/);
  assert.match(workerSource,/bitmap\?\.close\?\.\(\)/);
});

test('worker sends compressed thumbnail and preserves bounds',async()=>{
  const posts=[];let closed=false;let renderedSize=null;
  class FakeCanvas{
    constructor(width,height){renderedSize={width,height}}
    getContext(){return {drawImage(){}}}
    async convertToBlob(){return {size:420,type:'image/webp'}}
  }
  const sandbox={
    self:{onmessage:null,postMessage(message){posts.push(message)}},
    createImageBitmap:async()=>({width:350,height:700,close(){closed=true}}),
    OffscreenCanvas:FakeCanvas,
    Error,Math
  };
  vm.runInNewContext(workerSource,sandbox,{timeout:1000});
  await sandbox.self.onmessage({data:{id:13,file:{name:'portrait.jpg'},maxEdge:500}});
  assert.equal(posts.length,1);
  assert.equal(posts[0].id,13);
  assert.equal(posts[0].blob.type,'image/webp');
  assert.deepEqual(renderedSize,{width:250,height:500});
  assert.ok(closed);
});

test('worker reports decoding failures without throwing',async()=>{
  const posts=[];
  const sandbox={self:{postMessage(message){posts.push(message)}},createImageBitmap:async()=>{throw new Error('decode failed')},OffscreenCanvas:class {},Error,Math};
  vm.runInNewContext(workerSource,sandbox,{timeout:1000});
  await sandbox.self.onmessage({data:{id:3,file:{name:'broken.jpg'},maxEdge:500}});
  assert.equal(posts[0].id,3);assert.equal(posts[0].error,'decode failed');
});

test('import cancel and restored folder require an explicit user action',()=>{
  assert.match(html,/id="importCancel"/);
  assert.match(html,/function cancelImport\(/);
  assert.match(html,/if\(!alive\(task\)\)return false/);
  assert.match(html,/id="recentBtn" hidden/);
  assert.match(html,/await handle\.requestPermission\(\{mode:'read'\}\)/);
  assert.match(html,/new Promise\(\(resolve,reject\)=>\{\s*const request=db\.transaction\('folders','readonly'\)/);
});

test('cache maintains a count and a compressed-byte budget',()=>{
  assert.match(html,/MAX_THUMB_CACHE=260/);
  assert.match(html,/MAX_THUMB_BYTES=32\*1024\*1024/);
  assert.match(html,/thumbCacheBytes\+=bytes/);
  assert.match(html,/thumbCacheBytes-=art\.thumbBytes\|\|0/);
});
