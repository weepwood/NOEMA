import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
const templateSource=script.match(/const TEMPLATE=\[([\s\S]*?)\];/)?.[1];
assert.ok(templateSource&&script);

const pick=(start,end)=>{
 const a=script.indexOf(start),b=script.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'expected function '+start);
 return script.slice(a,b);
};
const interactions=pick('function updateGoals(){','function syncVisible(')
 +pick('function select(id){','function close(){')
 +pick('function close(){','function spring(');
const template=vm.runInNewContext('['+templateSource+']');
const PITCH=127,GAP=6,BW=12*PITCH,BH=8*PITCH;
const rectFromSlot=(bx,by,slot)=>({
 x:bx*BW+slot.x*PITCH,y:by*BH+slot.y*PITCH,
 w:slot.w*PITCH-GAP,h:slot.h*PITCH-GAP
});
const sameRect=(a,b)=>['x','y','w','h'].every(k=>Math.abs(a[k]-b[k])<1e-6);
const intersect=(a,b)=>a.x<b.x+b.w&&a.y<b.y+b.h&&a.x+a.w>b.x&&a.y+a.h>b.y;

function runLocalCase(totalImages,focusIndex) {
 const env={window:{}};
 vm.createContext(env);
 vm.runInContext(fs.readFileSync(path.join(root,'src/posterwall-layout.js'),'utf8'),env);
 const layout=env.window.NOEMAPosterWallLayout;
 const images=Array.from({length:totalImages},(_,i)=>({title:'Local '+i}));
 const nodes=new Map();
 const blockFor=i=>Math.floor(i/12);
 const columns=totalImages<=12?1:2;
 for(let i=0;i<totalImages;i++){
  const b=blockFor(i),bx=b%columns,by=Math.floor(b/columns),slot=i%12;
  const r=rectFromSlot(bx,by,layout.orient(template,bx,by)[slot]);
  const classes=new Set();
  const attrs=new Map();
  const button={
   classList:{toggle:(k,yes)=>yes?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},
   setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),
   focus(){}
  };
  nodes.set('local:'+i,{id:'local:'+i,bx,by,slot,rect:r,goal:r,
   art:images[i],button});
 }
 const selection={add(){},remove(){}};
 Object.assign(env,{
  localMode:true,nodes,active:null,activeReflow:null,TEMPLATE:template,
  posterWallLayout:layout,artworks:images,motionUnderlays:new Map(),
  ensureFocusBlock(){},holdMotionUnderlay(){},releaseFullImage(){},
  loadOriginal(){},focusRestore:null,
  blockReflowRect:rectFromSlot,flyToFocus(rect){env.cameraDestination=rect},
  stage:{classList:selection,focus(){}},document:{getElementById(){return {tabIndex:-1}}},
  counter:{innerHTML:''},sceneStatus:{textContent:''},start(){}
 });
 vm.runInContext(interactions,env,{timeout:2000});
 const selected=nodes.get('local:'+focusIndex);
 const blockMembers=[...nodes.values()].filter(m=>m.bx===selected.bx&&m.by===selected.by);
 env.select(selected.id);
 assert.equal(env.active,selected.id);
 assert.ok(Array.isArray(env.activeReflow),'local selection always uses the shared reflow');
 assert.equal(layout.exactCover(env.activeReflow),true);
 const goal=rectFromSlot(selected.bx,selected.by,env.activeReflow[selected.slot]);
 assert.ok(sameRect(selected.goal,goal),'focus should match the same exact 6x6 plan as demo');
 assert.equal(selected.goal.w,6*PITCH-GAP);
 assert.equal(selected.goal.h,6*PITCH-GAP);
 assert.ok(sameRect(env.cameraDestination,goal),'camera targets the same 6x6 focus rect');
 for(const a of blockMembers){
  assert.ok(a.button.classList.contains('is-reflowing'),'every real neighbor participates');
  const expected=rectFromSlot(a.bx,a.by,env.activeReflow[a.slot]);
  assert.ok(sameRect(a.goal,expected),'real local images use exact base-slot mapping');
  for(const b of blockMembers){
   if(a===b)continue;
   assert.equal(intersect(a.goal,b.goal),false,'expanded tile goals never overlap');
  }
 }
 if(blockMembers.length>1)assert.ok(blockMembers.some(m=>m!==selected&&!sameRect(m.rect,m.goal)),
  'neighboring local images must also move/resize in sparse blocks');
 for(const outside of nodes.values()){
  if(outside.bx!==selected.bx||outside.by!==selected.by)
   assert.ok(sameRect(outside.goal,outside.rect),'other blocks stay still');
 }
 env.close();
 assert.equal(env.active,null);
 assert.equal(env.activeReflow,null);
 for(const tile of nodes.values())assert.ok(sameRect(tile.goal,tile.rect),'closing restores every base tile');
}

test('local folders with 1, 5, 11, 12, 13 or 20 images share demo expansion geometry',()=>{
 for(const [count,index] of [[1,0],[5,0],[5,4],[11,3],[12,11],[13,12],[20,15]])
  runLocalCase(count,index);
});

test('local selected state restores the demo contrast but idle gallery keeps quiet metadata',()=>{
 assert.match(html,/\.local-collection \.m-tile:not\(\.is-active\) \.tile-shade\{opacity:\.30/);
 assert.match(html,/\.local-collection \.stage\.has-selection \.m-tile:not\(\.is-active\) \.tile-shade\{opacity:1\}/);
 assert.match(html,/\.stage\.has-selection \.m-tile:not\(\.is-active\) \.tile-dimmer\{opacity:\.30\}/);
 assert.doesNotMatch(interactions,/const complete=!localMode/);
 assert.doesNotMatch(interactions,/activeFocusRect/);
});
