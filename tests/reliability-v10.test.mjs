import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const take=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
test('cancelled thumbnail promises cannot poison subsequent requests',async()=>{
 const jobs=[],art={file:{},requestedEdge:384};
 const env={collectionVersion:1,THUMB_EDGE:500,thumbnailQueue:jobs,queueImageTask:t=>jobs.push(t),thumbCache:new Map()};
 vm.createContext(env);vm.runInContext(take('function scheduleThumbnail(','function schedulePreview(')+'globalThis.schedule=scheduleThumbnail',env);
 const old=env.schedule(art);assert.equal(jobs[0].edge,384);
 art.thumbPromise=null;env.collectionVersion++;
 const fresh=env.schedule(art);jobs[0].resolve(null);await old;await Promise.resolve();
 assert.equal(art.thumbPromise,fresh);jobs[1].resolve('blob:new');assert.equal(await fresh,'blob:new');await Promise.resolve();assert.equal(art.thumbPromise,null);
});
test('inspector does not toggle already focused poster',()=>assert.match(take('function loadInspectorIndex(','function openInspector('),/if\(active!==id\)select\(id\)/));
test('local thumbnails have size-specific cache identity',()=>assert.match(html,/['"]lod1:['"]\+task\.edge/));
