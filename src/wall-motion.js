/* Independent motion utilities for the NOEMA poster wall.
 * Geometry and camera animation are intentionally kept separate:
 * the wall does not change zoom just because a poster was selected.
 */
(function(root) {
 'use strict';
 const STIFFNESS=300, DAMPING=34, CAMERA_DURATION=.42;
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

 // Exact damped oscillator solution with a stable timestep. Unlike explicit
 // Euler updates, its motion does not depend on how a display subdivides time.
 function springAxis(value,velocity,target,seconds,reducedMotion=false){
  if(reducedMotion||!Number.isFinite(value)||!Number.isFinite(velocity)){
   return {value:target,velocity:0,moving:false};
  }
  const displacement=value-target;
  if(Math.abs(displacement)<.025&&Math.abs(velocity)<.04){
   return {value:target,velocity:0,moving:false};
  }
  const dt=clamp(seconds,0,.064);
  const decayRate=DAMPING/2;
  const angular=Math.sqrt(STIFFNESS-decayRate*decayRate);
  const decay=Math.exp(-decayRate*dt);
  const sine=Math.sin(angular*dt),cosine=Math.cos(angular*dt);
  const nextDisplacement=decay*(displacement*cosine+
   (velocity+decayRate*displacement)/angular*sine);
  const nextVelocity=decay*(velocity*cosine-
   (decayRate*velocity+STIFFNESS*displacement)/angular*sine);
  if(Math.abs(nextDisplacement)<.025&&Math.abs(nextVelocity)<.04){
   return {value:target,velocity:0,moving:false};
  }
  return {value:target+nextDisplacement,velocity:nextVelocity,moving:true};
 }

 function focusCamera(rect,current,viewport){
  const s=current.s;
  return {x:viewport.w*.5-(rect.x+rect.w*.5)*s,
          y:viewport.h*.5-(rect.y+rect.h*.5)*s,s};
 }

 function cubicBezier(position){
  const p=clamp(position,0,1);
  if(p===0||p===1)return p;
  // Ease 0.22,1,0.36,1: solve the x coordinate by binary search.
  const cubic=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  let lo=0,hi=1;
  for(let i=0;i<16;i++){
   const mid=(lo+hi)/2;
   if(cubic(mid,.22,.36)<p)lo=mid;else hi=mid;
  }
  return cubic((lo+hi)/2,1,1);
 }

 function panFrame(start,end,elapsed,reducedMotion=false){
  const progress=reducedMotion?1:clamp(elapsed/CAMERA_DURATION,0,1);
  const eased=cubicBezier(progress);
  return {camera:{
    x:start.x+(end.x-start.x)*eased,
    y:start.y+(end.y-start.y)*eased,
    s:start.s+(end.s-start.s)*eased
   },done:progress>=1};
 }

 root.NOEMAWallMotion=Object.freeze({
  springAxis,focusCamera,panFrame,CAMERA_DURATION
 });
})(typeof window==='undefined'?globalThis:window);
