/* Inspector viewport geometry, independently testable. */
(function(root){
 'use strict';
 function fit(view,image){return Math.max(.001,Math.min(Math.max(1,view.width-38)/Math.max(1,image.w),Math.max(1,view.height-38)/Math.max(1,image.h)))}
 function zoomPan(pan,anchor,factor){return{x:anchor.x-(anchor.x-pan.x)*factor,y:anchor.y-(anchor.y-pan.y)*factor}}
 root.NOEMAInspectorCore=Object.freeze({fit,zoomPan});
})(typeof window==='undefined'?globalThis:window);
