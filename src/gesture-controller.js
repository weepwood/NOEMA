/* Owns stage input state, pointer capture, drag/pinch transitions and coast animation. */
(function(root){
'use strict';
function create({stage,getCamera,applyCamera,interrupt,selectTile,zoomAt,start,reducedMotion}){
 const pointers=new Map(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
 let drag=null,pinch=null,coastRaf=null,keepPlaying=false;
 function stopCoast(){if(coastRaf){cancelAnimationFrame(coastRaf);coastRaf=null}}
function point(e){const r=stage.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function pinchState(){return window.NOEMAGestureCore.pinch([...pointers.values()],getCamera())}
stage.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;interrupt();stopCoast();const p=point(e);pointers.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);stage.classList.add('is-dragging');keepPlaying=true;
 if(pointers.size===1){drag={id:e.pointerId,point:p,start:p,travel:0,vx:0,vy:0,lastTime:performance.now(),tile:e.target.closest('.m-tile')?.dataset.instance||null};pinch=null}
 else{pinch=pinchState();drag=null}
});
stage.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;const p=point(e),old=pointers.get(e.pointerId);pointers.set(e.pointerId,p);
 if(pointers.size>=2){if(!pinch)pinch=pinchState();const arr=[...pointers.values()],mid={x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2};const targetS=clamp(pinch.scale*dist(arr[0],arr[1])/pinch.dist,.40,1.9);applyCamera({s:targetS,x:mid.x-pinch.world.x*targetS,y:mid.y-pinch.world.y*targetS});return}
 if(drag&&drag.id===e.pointerId){const deltaX=p.x-old.x,deltaY=p.y-old.y;drag.travel=Math.max(drag.travel,dist(p,drag.start));const now=performance.now(),ms=Math.max(8,now-drag.lastTime);drag.vx=(drag.vx||0)*.4+deltaX/ms*.6;drag.vy=(drag.vy||0)*.4+deltaY/ms*.6;drag.lastTime=now;if(drag.travel>5){const c=getCamera();applyCamera({...c,x:c.x+deltaX,y:c.y+deltaY})}}
});
stage.addEventListener('pointerup',e=>{if(!pointers.delete(e.pointerId))return;if(stage.hasPointerCapture?.(e.pointerId))stage.releasePointerCapture(e.pointerId);
 if(pointers.size===1){const [id,p]=pointers.entries().next().value;drag=window.NOEMAGestureCore.resumeDrag(id,p,performance.now());pinch=null;return}
 if(pointers.size>=2){drag=null;pinch=pinchState();return}
 if(pointers.size===0){const wasClick=drag&&drag.travel<5;const d=drag;drag=null;pinch=null;
  if(wasClick&&d.tile){selectTile(d.tile)}
   else if(d&&!reducedMotion()&&performance.now()-d.lastTime<80){let vx=clamp(d.vx||0,-2.5,2.5),vy=clamp(d.vy||0,-2.5,2.5),previous=performance.now();const coast=now=>{const dt=Math.max(0,Math.min(250,now-previous));previous=now;const next=window.NOEMAGestureCore.coast(vx,vy,dt);const c=getCamera();vx=next.vx;vy=next.vy;applyCamera({...c,x:c.x+next.dx,y:c.y+next.dy});coastRaf=Math.hypot(vx,vy)>.025?requestAnimationFrame(coast):null};if(Math.hypot(vx,vy)>.15)coastRaf=requestAnimationFrame(coast)}
   keepPlaying=false;stage.classList.remove('is-dragging');start()}});
function cancelStagePointer(e){if(!pointers.delete(e.pointerId))return;
 if(pointers.size===1){const [id,p]=pointers.entries().next().value;drag=window.NOEMAGestureCore.resumeDrag(id,p,performance.now());pinch=null}
 else if(pointers.size>=2){drag=null;pinch=pinchState()}
 else{drag=null;pinch=null;keepPlaying=false;stage.classList.remove('is-dragging')}
 start();
}
stage.addEventListener('pointercancel',cancelStagePointer);
stage.addEventListener('lostpointercapture',cancelStagePointer);
stage.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?.028:.00135)),p.x,p.y)},{passive:false});
stage.addEventListener('dblclick',e=>{if(e.target.closest('.m-tile'))return;const p=point(e);zoomAt(1.32,p.x,p.y)});

return Object.freeze({stopCoast,get coasting(){return !!coastRaf},get dragging(){return keepPlaying}});
}
root.NOEMAGestureController=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
