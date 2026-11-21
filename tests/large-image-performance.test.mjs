import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(script,'inline gallery code exists');

const take=(start,end)=>{
 const a=script.indexOf(start),b=script.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'code region exists: '+start);
 return script.slice(a,b);
};

test('thumbnail priority favors currently visible center pictures over overscan',()=>{
 const source=take('function thumbnailPriority(m){','function queueImageTask(task){');
 const env={
  camera:{x:0,y:0,s:1},viewport:{w:800,h:600},
  canvasCore:{viewportBounds:()=>({x:0,y:0,w:800,h:600})},
  intersects:(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,
  Math
 };
 vm.createContext(env);
 vm.runInContext(source+'globalThis.calculate=thumbnailPriority;',env);
 const tile=(x,y)=>({rect:{x,y,w:200,h:160}});
 const center=env.calculate(tile(300,230)),corner=env.calculate(tile(0,0));
 const outside=env.calculate(tile(1200,200));
 assert.ok(center>corner,'center tiles are requested first');
 assert.ok(corner>outside,'actual viewport outranks overscan');
});

test('preview requests jump ahead of queued thumbnail prefetch',()=>{
 const source=take('function queueImageTask(task){','function scheduleThumbnail(');
 const tasks=[],env={thumbnailQueue:tasks,pumpThumbnails:()=>{},Math};
 vm.createContext(env);
 vm.runInContext(source+'globalThis.enqueue=queueImageTask;',env);
 env.enqueue({id:'overscan',priority:-500});
 env.enqueue({id:'center',priority:100000});
 env.enqueue({id:'preview',preview:true,priority:Infinity});
 assert.deepEqual(tasks.map(x=>x.id),['preview','center','overscan']);
});

test('a clicked local tile loads a bounded preview rather than full-resolution original',()=>{
 const wallLoader=take('function loadOriginal(m){','function clearMotionUnderlays(){');
 assert.match(wallLoader,/schedulePreview\(m\.art\)/);
 assert.doesNotMatch(wallLoader,/createObjectURL\(m\.art\.file\)/);
 assert.match(script,/const PREVIEW_EDGE=Math\.min\(1600/);
 assert.match(script,/const THUMB_EDGE=Math\.min\(1024/);
 assert.match(script,/const previewCache=new Map\(\),MAX_PREVIEW_CACHE=3/);
 assert.match(script,/activePreviewToken\+\+/);
 assert.match(script,/thumbnailWorkers<\(workerDisabled\|\|location\.protocol==='file:'/);
 assert.match(script,/task\.art\.file\.size<=8\*1024\*1024/);
});

test('full-resolution inspector displays a preview then the original image',()=>{
 assert.match(html,/id="inspectorPreview"/);
 assert.match(script,/function setInspectorPreview\(blob,token\)/);
 assert.match(script,/const cached=previewCache\.get\(art\)/);
 assert.match(script,/if\(art\.thumbUrl\)\{inspectorPreview\.src=art\.thumbUrl/);
 assert.match(script,/inspectorOriginalLoaded=true;clearInspectorPreview\(\)/);
 assert.match(script,/inspectorUrl=URL\.createObjectURL\(art\.file\)/);
 assert.match(script,/token!==inspectorToken\|\|inspector\.hidden\|\|inspectorOriginalLoaded/);
 assert.match(script,/clearInspectorPreview\(\);[\s\S]*?stage\.inert=false/);
});
