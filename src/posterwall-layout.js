/* NOEMA PosterWall-style block re-gearing.
 * Independent geometry implementation informed by the concept of Folia Major's
 * PosterWall: expand within a fixed 12x8 block, exact-cover its remaining cells,
 * and assign neighboring tiles to the nearest new seats.
 * No code or generated reflow tables are copied from Folia Major.
 */
(function(root){
 'use strict';
 const COLS=12,ROWS=8,FOCUS=6,OTHER_COUNT=11;
 const cache=new Map(),MAX_CACHE=64;
 const bitCount=value=>{let count=0;while(value){value&=value-1;count++}return count};
 const center=slot=>({x:slot.x+slot.w/2,y:slot.y+slot.h/2});
 function orientation(bx,by){
  let value=Math.imul(bx,0x9e3779b1)^Math.imul(by,0x85ebca6b);
  value=Math.imul(value^(value>>>16),0x7feb352d);
  return (value^(value>>>15))&3;
 }
 function orient(template,bx,by){
  const flags=orientation(bx,by);
  return template.map(slot=>({
   x:flags&1?COLS-slot.x-slot.w:slot.x,
   y:flags&2?ROWS-slot.y-slot.h:slot.y,
   w:slot.w,h:slot.h
  }));
 }
 // A 6x6 focus always leaves two 3x8/6x8 side regions and one 6x2 strip.
 // Their eleven independently filled rectangles form an exact partition.
 function remainingSlots(fx,fy){
  const pieces=[];
  const add=(x,y,w,h)=>pieces.push({x,y,w,h});
  const stripY=fy===0?6:0;
  for(let x=fx===0?0:fx===6?6:3;x<(fx===3?9:fx===0?6:12);x+=2){
   // Only the uncovered six-by-two band, not the expanded card.
   add(x,stripY,2,2);
  }
  if(fx===3){
   for(const x of [0,9])for(let y=0;y<8;y+=2)add(x,y,3,2);
  }else{
   const sideX=fx===0?6:0;
   add(sideX,0,3,4);add(sideX+3,0,3,4);
   for(let y=4;y<8;y+=2)for(let x=sideX;x<sideX+6;x+=2)add(x,y,2,2);
  }
  return pieces;
 }
 function cost(original,target){
  const a=center(original),b=center(target);
  const movement=Math.hypot(a.x-b.x,a.y-b.y);
  const area=Math.abs(Math.log((target.w*target.h)/(original.w*original.h)));
  const aspect=Math.abs(Math.log((target.w/target.h)/(original.w/original.h)));
  return movement*2.4+area*1.4+aspect*.8;
 }
 function assign(source,focusIndex,focusSlot,targets){
  const originals=source.map((_,index)=>index).filter(index=>index!==focusIndex);
  const full=(1<<OTHER_COUNT)-1;
  const dp=new Float64Array(full+1);dp.fill(Infinity);dp[0]=0;
  const prevMask=new Int16Array(full+1),prevPick=new Int8Array(full+1);
  const scores=targets.map(target=>originals.map(index=>cost(source[index],target)));
  const counts=new Uint8Array(full+1);
  for(let mask=1;mask<=full;mask++)counts[mask]=counts[mask>>1]+(mask&1);
  for(let mask=0;mask<full;mask++){
   if(!Number.isFinite(dp[mask]))continue;
   const place=counts[mask];
   for(let pick=0;pick<OTHER_COUNT;pick++){
    const bit=1<<pick;if(mask&bit)continue;
    const next=mask|bit;
    const score=dp[mask]+scores[place][pick];
    if(score<dp[next]){
     dp[next]=score;prevMask[next]=mask;prevPick[next]=pick;
    }
   }
  }
  const output=Array(source.length);output[focusIndex]=focusSlot;
  let mask=full;
  for(let place=OTHER_COUNT-1;place>=0;place--){
   const pick=prevPick[mask];
   output[originals[pick]]=targets[place];
   mask=prevMask[mask];
  }
  return {slots:output,score:dp[full]};
 }
 function exactCover(slots){
  if(slots.length!==12)return false;
  const cells=new Uint8Array(COLS*ROWS);
  for(const slot of slots){
   if(!slot||slot.w<=0||slot.h<=0||slot.x<0||slot.y<0||slot.x+slot.w>COLS||slot.y+slot.h>ROWS)return false;
   for(let y=slot.y;y<slot.y+slot.h;y++)for(let x=slot.x;x<slot.x+slot.w;x++){
    const index=y*COLS+x;
    if(++cells[index]>1)return false;
   }
  }
  return cells.every(count=>count===1);
 }
 function reflow(template,bx,by,focusIndex){
  if(!Array.isArray(template)||template.length!==12||focusIndex<0||focusIndex>=12)return null;
  const key=`${bx}:${by}:${focusIndex}`;
  if(cache.has(key))return cache.get(key);
  const source=orient(template,bx,by);
  const original=center(source[focusIndex]);
  let best=null,bestScore=Infinity;
  for(const fy of [0,2])for(const fx of [0,3,6]){
   const focusSlot={x:fx,y:fy,w:FOCUS,h:FOCUS};
   const targets=remainingSlots(fx,fy);
   if(targets.length!==OTHER_COUNT)throw Error('Invalid 6x6 focus partition');
   const option=assign(source,focusIndex,focusSlot,targets);
   const goal=center(focusSlot);
   // The chosen card should still feel anchored near its starting seat.
   const score=option.score+Math.hypot(goal.x-original.x,goal.y-original.y)*5;
   if(score<bestScore){best=option.slots;bestScore=score}
  }
  if(!exactCover(best))throw Error('Reflow did not cover its 12x8 block');
  cache.set(key,best);
  if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
  return best;
 }
 root.NOEMAPosterWallLayout=Object.freeze({orient,reflow,exactCover,remainingSlots});
})(typeof window==='undefined'?globalThis:window);
