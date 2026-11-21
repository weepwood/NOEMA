import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'src/wall-motion.js'),'utf8'),sandbox);
const motion=sandbox.window.NOEMAWallMotion;

const near=(a,b,tolerance=.005)=>Math.abs(a-b)<=tolerance;

test('focus flight keeps the original camera zoom at desktop and mobile sizes',()=>{
 for(const viewport of [{w:1440,h:900},{w:390,h:844},{w:800,h:600}]){
  for(const scale of [.4,.52,.76,1.4]){
   const current={x:-190,y:230,s:scale},rect={x:500,y:180,w:756,h:756};
   const goal=motion.focusCamera(rect,current,viewport);
   assert.equal(goal.s,scale);
   assert.ok(near(goal.x+(rect.x+rect.w/2)*scale,viewport.w/2));
   assert.ok(near(goal.y+(rect.y+rect.h/2)*scale,viewport.h/2));
   const first=motion.panFrame(current,goal,0);
   const middle=motion.panFrame(current,goal,.21);
   const end=motion.panFrame(current,goal,.42);
   assert.ok(near(first.camera.x,current.x,.01));
   assert.ok(middle.camera.x>Math.min(current.x,goal.x)&&middle.camera.x<Math.max(current.x,goal.x));
   assert.equal(middle.camera.s,scale);
   assert.ok(end.done);
   assert.ok(near(end.camera.x,goal.x));
   assert.ok(near(end.camera.y,goal.y));
  }
 }
});

test('the damped spring is frame-rate independent and retains velocity across retargeting',()=>{
 function run(rate,seconds,retarget=false){
  let state={value:120,velocity:0,moving:true};
  for(let frame=0;frame<Math.round(rate*seconds);frame++){
   state=motion.springAxis(state.value,state.velocity,retarget&&frame>=Math.round(rate*.18)?60:760,1/rate);
  }
  return state;
 }
 const a=run(60,.5),b=run(120,.5),c=run(144,.5);
 assert.ok(near(a.value,b.value,.03));
 assert.ok(near(a.value,c.value,.03));
 assert.ok(a.value>700);
 const switched=run(60,.5,true);
 assert.ok(switched.value<300,'the interrupted spring follows its newest target');
 const reduced=motion.springAxis(120,100,760,1/60,true);
 assert.equal(reduced.value,760);
 assert.equal(reduced.velocity,0);
 assert.equal(reduced.moving,false);
});

test('no forced zoom and no mid-transition tile culling regressions in application',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/<script src="\.\/src\/wall-motion\.js"><\/script>/);
 assert.match(html,/function flyToFocus\(rect\)/);
 assert.match(html,/wallMotion\.focusCamera\(rect,camera,viewport\)/);
 assert.match(html,/wallMotion\.springAxis\(before,m\.vel\[key\],m\.goal\[key\],dt,motion\.matches\)/);
 assert.match(html,/motionUnderlays\.has\(\x60\$\{m\.bx\}:\$\{m\.by\}\x60\)/);
 assert.match(html,/\.focus-underlay\{position:absolute;z-index:1;overflow:hidden;pointer-events:none;opacity:1\}/);
 assert.match(html,/const complete=!localMode\|\|TEMPLATE\.every/);
 assert.doesNotMatch(html,/function focusCameraFor\(rect\)\{[\s\S]{0,250}Math\.min\(camera\.s,/);
});
