import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=name=>{
 const text=fs.readFileSync(path.join(root,'src',name),'utf8');
 const context={window:{},setTimeout,Date,Math,performance};
 vm.runInNewContext(text,context,{timeout:1000});
 return context.window;
};
const canvas=load('canvas-core.js').NOEMACanvasCore;
const search=load('search-core.js').NOEMASearchCore;
const scanner=load('directory-scanner.js').NOEMADirectoryScanner;
const monitors=load('performance-monitor.js').NOEMAPerformanceMonitor;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('camera zoom preserves the exact world point beneath the pointer',()=>{
 const camera={x:92,y:-145,s:.7},px=550,py=210;
 const worldX=(px-camera.x)/camera.s,worldY=(py-camera.y)/camera.s;
 const next=canvas.anchoredZoom(camera,1.7,px,py);
 assert.ok(Math.abs((px-next.x)/next.s-worldX)<1e-8);
 assert.ok(Math.abs((py-next.y)/next.s-worldY)<1e-8);
 assert.equal(next.s,1.19);
 const minimum=canvas.anchoredZoom(camera,.01,px,py);
 assert.equal(minimum.s,.40);
});

test('culling always prioritizes actually visible tiles over nearby overscan',()=>{
 const actual={x:0,y:0,w:500,h:500};
 const candidates=Array.from({length:400},(_,i)=>({id:'off-'+i,rect:{x:560+i,y:0,w:30,h:30}}));
 const visible=Array.from({length:40},(_,i)=>({id:'on-'+i,rect:{x:i*10,y:10,w:9,h:10}}));
 const {selected,visibleCount}=canvas.prioritizeVisible([...candidates,...visible],actual,10,50);
 assert.equal(visibleCount,40);
 assert.equal(selected.length,40);
 assert.ok(selected.slice(0,40).every(c=>c.onScreen));
 assert.equal(new Set(selected.map(c=>c.id)).size,40);
});

test('search supports multi-token case-folded queries and exact-first ranking',()=>{
 const list=Array.from({length:100},(_,i)=>({title:`Photo ${i}`,desc:`City/Evening/${i}.png`,category:'LANDSCAPE'}));
 list[98]={title:'朝光',desc:'Japan/Tokyo/朝.jpg',category:'人物'};
 list[99]={title:'Photo',desc:'City/Evening/99.png',category:'PORTRAIT'};
 const a=search.search(list,'PHOTO',10);
 assert.equal(a.found[0].index,99);
 const b=search.search(list,'city evening',15);
 assert.equal(b.total,99);
 assert.equal(search.search(list,'朝光').found[0].index,98);
 assert.equal(search.filter(list,'portrait').length,1);
});

test('directory scan skips non-images and never exceeds bounded parallel file reads',async()=>{
 let active=0,peak=0;const count=120;
 const entries=Array.from({length:count},(_,i)=>({
  kind:'file',name:i%5===0?`notes${i}.txt`:`img-${i}.png`,
  async getFile(){active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return {name:this.name,size:100}}
 }));
 const rootHandle={async *values(){for(const item of entries)yield item}};
 const progress=[];
 const result=await scanner.scan(rootHandle,{concurrency:3,yieldEvery:9,onProgress:x=>progress.push(x)});
 assert.equal(result.files.length,96);
 assert.equal(result.stats.ignored,24);
 assert.ok(peak<=3);
 assert.ok(progress.length>1);
 assert.ok(result.files.every(f=>f.name.endsWith('.png')));
});

test('cancelled scans publish no partial result into the gallery',async()=>{
 let cancel=false;
 const items=Array.from({length:100},(_,i)=>({kind:'file',name:`image${i}.jpg`,async getFile(){return {name:this.name}}}));
 const directory={async *values(){for(const item of items)yield item}};
 const result=await scanner.scan(directory,{yieldEvery:4,isCancelled:()=>cancel,onProgress:x=>{if(x.visited>=4)cancel=true}});
 assert.ok(result.cancelled);
 assert.equal(result.files.length,0);
});

test('metrics monitor only schedules frames while enabled and stops on request',()=>{
 let queued=[],cancelled=[],read=0,updates=[];
 const raf=cb=>{queued.push(cb);return queued.length};
 const mon=monitors.create({requestFrame:raf,cancelFrame:id=>cancelled.push(id),snapshot:()=>({tiles:5}),onSample:s=>updates.push(s)});
 mon.start();assert.equal(queued.length,1);
 for(const time of [100,200,400,800,1300]){const cb=queued.shift();cb(time)}
 assert.equal(updates.length,1);assert.equal(updates[0].tiles,5);
 mon.stop();assert.equal(mon.enabled,false);assert.ok(cancelled.length>0);
});

test('filter is reversible and new external modules load before the inline application',()=>{
 for(const name of ['canvas-core','search-core','directory-scanner','performance-monitor']){
  const filename=`src/${name}.js`;
  assert.match(html,new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
 assert.match(html,/id="filterBanner" hidden/);
 assert.match(html,/id="searchFilterBtn"/);
 assert.match(html,/allLocalArtworks=artworks/);
 assert.match(html,/function clearLocalFilter\(/);
 assert.match(html,/function toggleMetrics\(/);
});
