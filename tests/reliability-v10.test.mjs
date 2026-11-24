import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pipeline=fs.readFileSync(new URL('../src/image-pipeline.js',import.meta.url),'utf8');
const take=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
test('cancelled thumbnail promises cannot poison subsequent requests',async()=>{
 const jobs=[],art={file:{},requestedEdge:384};
 let version=1;const env={getVersion:()=>version,THUMB_EDGE:500,thumbnailQueue:jobs,queueImageTask:t=>jobs.push(t),thumbCache:new Map()};
 vm.createContext(env);vm.runInContext(take(pipeline,'function scheduleThumbnail(','function schedulePreview(')+'globalThis.schedule=scheduleThumbnail',env);
 const old=env.schedule(art);assert.equal(jobs[0].edge,384);
 art.thumbPromise=null;version++;
 const fresh=env.schedule(art);jobs[0].resolve(null);await old;await Promise.resolve();
 assert.equal(art.thumbPromise,fresh);jobs[1].resolve('blob:new');assert.equal(await fresh,'blob:new');await Promise.resolve();assert.equal(art.thumbPromise,null);
});
test('inspector does not toggle already focused poster',()=>assert.match(take(html,'function syncInspectorSelection(','const inspectorController='),/if\(active!==id\)select\(id\)/));
test('local thumbnails have size-specific cache identity',()=>assert.match(pipeline,/['"]lod1:['"]\+task\.edge/));
