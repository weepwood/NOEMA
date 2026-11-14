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
const focusStart=source.indexOf('function focusParallax(');
const focusEnd=source.indexOf('\nfunction updateGoals()',focusStart);
assert.ok(focusStart>=0&&focusEnd>focusStart);
const focusParallax=vm.runInNewContext(source.slice(focusStart,focusEnd)+';focusParallax;');
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

test('selected poster overlays a continuous stationary mosaic instead of leaving black strips',()=>{
 assert.ok(source.includes('m.goal=mine&&exp?exp:m.rect'))
 assert.ok(html.includes('.m-tile.is-active{z-index:8'))
 assert.ok(html.includes('object-fit:cover'))
 const all=[];
 for(let by=-2;by<=2;by++)for(let bx=-2;bx<=2;bx++)for(let i=0;i<template.length;i++)
  all.push({id:bx+':'+by+':'+i,...rect(bx,by,i)});
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)
  assert.ok(!overlap(all[i],all[j]),'base mosaic must not overlap');
 for(const chosen of all.filter(t=>t.id.startsWith('0:0:'))){
  const expanded={x:chosen.x-250,y:chosen.y-200,w:chosen.w+500,h:chosen.h+400};
  assert.ok(all.some(t=>t.id!==chosen.id&&overlap(expanded,t)), 'focus overlays its neighbors');
 }
});

test('nearby artwork parallax remains inside its tile and distant tiles remain untouched',()=>{
 const expanded={x:0,y:0,w:690,h:530},near={x:680,y:180,w:230,h:190};
 const drift=focusParallax(near,expanded);
 assert.ok(drift);
 assert.ok(Math.abs(drift.x)<=Math.min(9,near.w*.018)+1e-9);
 assert.ok(Math.abs(drift.y)<=Math.min(9,near.h*.018)+1e-9);
 assert.equal(focusParallax({x:5000,y:5000,w:230,h:190},expanded),null);
 assert.ok(html.includes('.stage.has-selection .m-tile.is-near-focus img{'))
 assert.ok(source.includes("style.removeProperty('--focus-dx')"))
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
