import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source);
const raw=source.match(/const TEMPLATE=\[([\s\S]*?)\];/)?.[1];
assert.ok(raw);
const template=vm.runInNewContext('['+raw+']');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'src/posterwall-layout.js'),'utf8'),context);
const layout=context.window.NOEMAPosterWallLayout;
const gap=6,pitch=127,bw=12*pitch,bh=8*pitch;
const rect=(bx,by,slot)=>{
 const t=layout.orient(template,bx,by)[slot];
 return{x:bx*bw+t.x*pitch,y:by*bh+t.y*pitch,w:t.w*pitch-gap,h:t.h*pitch-gap};
};
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('the NOEMA twelve-poster base template fills every cell in its 12x8 block',()=>{
 assert.equal(template.length,12);
 assert.ok(template.some(t=>t.h>=t.w*1.5));
 assert.ok(template.some(t=>t.w>=t.h*1.5));
 for(const [bx,by] of [[0,0],[1,0],[0,1],[-1,-2],[3,4]]){
  assert.equal(layout.exactCover(layout.orient(template,bx,by)),true);
 }
});

test('each of twelve expanded slots exact-covers the same fixed block at every orientation',()=>{
 for(const [bx,by] of [[0,0],[1,0],[0,1],[-1,-2],[3,4]]){
  for(let focus=0;focus<template.length;focus++){
   const grown=layout.reflow(template,bx,by,focus);
   assert.equal(grown.length,12);
   assert.equal(layout.exactCover(grown),true,`block ${bx},${by}, focus ${focus}`);
   assert.equal(grown[focus].w,6);assert.equal(grown[focus].h,6);
   const original=layout.orient(template,bx,by);
   assert.ok(grown.some((s,i)=>i!==focus&&(s.x!==original[i].x||s.y!==original[i].y||s.w!==original[i].w||s.h!==original[i].h)),
     'surrounding posters must actually reflow');
   const rectangles=grown.map(s=>({x:bx*bw+s.x*pitch,y:by*bh+s.y*pitch,w:s.w*pitch-gap,h:s.h*pitch-gap}));
   for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){
    assert.ok(!overlaps(rectangles[i],rectangles[j]),`collision ${bx},${by}, focus ${focus}`);
   }
  }
 }
});

test('re-gearing stays within its own block and the other blocks retain their seats',()=>{
 assert.match(source,/blockReflowRect\(m\.bx,m\.by,activeReflow\[m\.slot\]\)/);
 assert.match(source,/m\.bx===chosen\.bx&&m\.by===chosen\.by/);
 assert.match(source,/ensureFocusBlock\(m\)/);
 assert.match(source,/posterWallLayout\.reflow\(TEMPLATE,m\.bx,m\.by,m\.slot\)/);
 assert.doesNotMatch(source,/resolveReflow|focusParallax/);
 for(const index of [0,3,5,11]){
  const before=rect(1,1,index);
  const after=rect(1,1,index);
  assert.deepEqual(after,before);
 }
});

test('a solid opaque reflow occluder prevents old image content leaking through moving gaps',()=>{
 assert.match(source,/function holdMotionUnderlay\(chosen\)/);
 assert.match(source,/function settleMotionUnderlays\(\)/);
 assert.match(source,/function clearMotionUnderlays\(\)/);
 assert.match(source,/world\.prepend\(layer\)/);
 assert.match(source,/layer\.setAttribute\('aria-hidden','true'\)/);
 assert.match(source,/if\(motionUnderlays\.size\)settleMotionUnderlays\(\)/);
 // The opaque layer must be above other tiles and below reflowed tiles.
 assert.match(html,/\.focus-underlay\{position:absolute;z-index:4;[^}]*background:#070707;opacity:1\}/);
 assert.match(html,/\.m-tile\{position:absolute;z-index:2/);
 assert.match(html,/\.m-tile\.is-reflowing\{z-index:6\}/);
 assert.match(source,/classList\.toggle\('is-reflowing'/);
 // Until the selected block closes, its opaque mask cannot be released.
 assert.match(source,/selected&&selected\.bx===entry\.bx&&selected\.by===entry\.by/);
 // No stale image or cell screenshot can appear behind the moving tiles.
 assert.doesNotMatch(source,/ghost-cell|ghost\.appendChild|layer\.appendChild\(ghost\)/);
 assert.doesNotMatch(html,/\.focus-underlay \.ghost-cell/);
});

test('20k local images map to 20k distinct slots without wrapping',()=>{
 const code=source.slice(source.indexOf('let localColumns=1,localRows=0;'),source.indexOf('const BW=12*PITCH'));
 assert.ok(code.includes('function localArtIndex'));
 const expression='const TEMPLATE='+JSON.stringify(template)+'; const BW='+bw+',BH='+bh+';let artworks=Array.from({length:20000},(_,i)=>({ratio:i%2?.5:2.4}));'+code+';configureLocalAtlas(); const ids=[];for(let y=0;y<localRows;y++)for(let x=0;x<localColumns;x++)for(let i=0;i<TEMPLATE.length;i++){const n=localArtIndex(x,y,i);if(n>=0)ids.push(n)};[ids.length,new Set(ids).size,localArtIndex(-1,0,0)]';
 const [total,unique,outside]=vm.runInNewContext(expression,{},{timeout:5000});
 assert.equal(total,20000);assert.equal(unique,20000);assert.equal(outside,-1);
});

test('full image viewer retains natural aspect ratio and original scale',()=>{
 assert.match(html,/id="inspector"[^>]*role="dialog"/);
 assert.match(source,/inspectorImage\.naturalWidth/);
 assert.match(source,/inspectorImage\.naturalHeight/);
 assert.match(source,/inspectorZoomAt\(1,/);
 assert.match(html,/id="inspectorNext"/);
});
