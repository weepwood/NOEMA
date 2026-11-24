/* Pure gesture transitions and exponential friction; no DOM dependencies. */
(function(root){
 'use strict';
 function pinch(points,camera){if(points.length<2)return null;const [a,b]=points,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};return{dist:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),mid,scale:camera.s,world:{x:(mid.x-camera.x)/camera.s,y:(mid.y-camera.y)/camera.s}}}
 function resumeDrag(id,p,time){return{id,point:p,start:p,travel:100,tile:null,vx:0,vy:0,lastTime:time}}
 function coast(vx,vy,dt,tau=115){const decay=Math.exp(-Math.max(0,dt)/tau);return{dx:vx*tau*(1-decay),dy:vy*tau*(1-decay),vx:vx*decay,vy:vy*decay}}
 root.NOEMAGestureCore=Object.freeze({pinch,resumeDrag,coast});
})(typeof window==='undefined'?globalThis:window);
