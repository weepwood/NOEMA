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
const reflowCode=source.match(/function resolveReflow\(rect,expanded,original\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(reflowCode);
const reflow=vm.runInNewContext('const GAP=6;'+reflowCode+';resolveReflow;');
const gap=6,pitch=127,bw=12*pitch,bh=8*pitch;
const rect=(bx,by,i)=>{
 const t=template[i];return{x:bx*bw+t.x*pitch,y:by*bh+t.y*pitch,w:t.w*pitch-gap,h:t.h*pitch-gap};
};
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

test('portrait and landscape slots coexist in a gap-free 12x8 block',()=>{
 assert.ok(template.some(t=>t.h>=t.w*1.5));
 assert.ok(template.some(t=>t.w>=t.h*1.5));
 const cover=Array.from({length:8},()=>Array(12).fill(0));
 for(const t of template)for(let y=t.y;y<t.y+t.h;y++)for(let x=t.x;x<t.x+t.w;x++)cover[y][x]++;
 assert.ok(cover.every(row=>row.every(x=>x===1)));
});

test('expanding a poster does not collide with any other poster',()=>{
 const all=[];
 for(let by=-2;by<=2;by++)for(let bx=-2;bx<=2;bx++)for(let i=0;i<template.length;i++){
  all.push({id:bx+':'+by+':'+i,...rect(bx,by,i)});
 }
 for(const chosen of all.filter(t=>t.id.startsWith('0:0:'))){
  for(const [dw,dh] of [[200,300],[850,450],[1300,1100]]){
   const expanded={x:chosen.x-dw/2,y:chosen.y-dh/2,w:chosen.w+dw,h:chosen.h+dh};
   const targets=all.map(t=>t.id===chosen.id?expanded:reflow(t,expanded,chosen));
   for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
    assert.ok(!overlap(targets[i],targets[j]),'collision while expanding '+chosen.id);
   }
  }
 }
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
