/* LOD policy: bounded resolution tiers, conservative per-tile pixel allowance.
 * Estimates are not measured browser process or GPU memory. */
(function(root){
 'use strict';
 const TIERS=[192,384,768,1024],PIXEL_BUDGET=128*1024*1024;
 function edgeFor(rect,scale,dpr,count){
  const pixels=Math.max(rect.w,rect.h)*scale*Math.min(2,Math.max(1,dpr));
  const budget=Math.sqrt(PIXEL_BUDGET/(4*Math.max(1,count)));
  const desired=TIERS.find(t=>t>=pixels)||TIERS.at(-1);
  const allowed=TIERS.filter(t=>t<=budget).at(-1)||TIERS[0];
  return Math.min(desired,allowed);
 }
 function estimateMiB(arts){
  return (arts.reduce((sum,art)=>{const edge=art.thumbEdge||0,ratio=Number(art.ratio)||1;return sum+edge*edge*4*Math.min(ratio,1/ratio)},0)/1048576).toFixed(1);
 }
 root.NOEMAImageLOD=Object.freeze({edgeFor,estimateMiB,TIERS});
})(typeof window==='undefined'?globalThis:window);
