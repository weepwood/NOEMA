/* Pending tasks only; active decoders are not forcibly interrupted. */
(function(root){
 'use strict';
 function reconcile(queue,live,priority,previews){
  for(let i=queue.length-1;i>=0;i--){const task=queue[i],tile=live.get(task.art);
   if(task.preview?!previews.has(task.art):!tile){queue.splice(i,1);task.resolve(null)}
   else if(!task.preview)task.priority=priority(tile);
  }
  queue.sort((a,b)=>(b.preview?1:0)-(a.preview?1:0)||(b.priority||0)-(a.priority||0));
 }
 root.NOEMAImageQueue=Object.freeze({reconcile});
})(typeof window==='undefined'?globalThis:window);
