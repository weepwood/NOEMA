/* NOEMA diagnostics: on-demand frame sampler; no background monitoring when hidden. */
(function(root){
 'use strict';
 function create({requestFrame, cancelFrame, now, onSample, snapshot}){
  let enabled=false, frameId=0,last=0,windowStart=0,frames=0,total=0,worst=0;
  function tick(t){
   if(!enabled)return;
   if(last){const dt=t-last;frames++;total+=dt;worst=Math.max(worst,dt)}
   last=t;
   if(!windowStart)windowStart=t;
   if(t-windowStart>=1000){
    const avg=frames?total/frames:0;
    onSample({...snapshot(),fps:avg?Math.round(1000/avg):0,longestFrameMs:Math.round(worst),durationMs:Math.round(t-windowStart)});
    windowStart=t;frames=0;total=0;worst=0;
   }
   frameId=requestFrame(tick);
  }
  return {
   start(){if(enabled)return;enabled=true;last=0;windowStart=0;frames=0;total=0;worst=0;frameId=requestFrame(tick)},
   stop(){enabled=false;if(frameId)cancelFrame(frameId);frameId=0},
   get enabled(){return enabled}
  };
 }
 root.NOEMAPerformanceMonitor=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
