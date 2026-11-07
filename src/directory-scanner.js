/* NOEMA Directory Scanner: incremental, cancel-aware directory discovery.
   No persistent permissions, image data upload, or file modifications. */
(function(root){
 'use strict';
 const imageName = name => /\.(?:jpe?g|png|webp|avif|gif|bmp)$/i.test(name);
 const yieldToUI = () => new Promise(resolve=>setTimeout(resolve,0));
 async function scan(handle,{isCancelled=()=>false,onProgress=()=>{},maxFiles=20000,concurrency=4,yieldEvery=60}={}){
  const dirs=[{handle,path:''}],files=[],inflight=new Set();
  let visited=0,ignored=0,errors=0,directories=0;
  const begin=typeof performance==='undefined'?Date.now():performance.now();
  const elapsed=()=>Math.round((typeof performance==='undefined'?Date.now():performance.now())-begin);
  const report=()=>onProgress({visited,accepted:files.length,ignored,errors,directories,elapsedMs:elapsed()});
  async function flush(){if(inflight.size)await Promise.allSettled([...inflight])}
  while(dirs.length&&!isCancelled()&&files.length+inflight.size<maxFiles){
   const {handle:dir,path}=dirs.shift();directories++;
   try{
    for await (const item of dir.values()){
     if(isCancelled()||files.length+inflight.size>=maxFiles)break;
     visited++;
     if(item.kind==='directory')dirs.push({handle:item,path:(path?path+'/':'')+item.name});
     else if(item.kind==='file'&&imageName(item.name)){
       let promise;
       promise=item.getFile().then(file=>{
         if(isCancelled()||files.length>=maxFiles)return;
         try{file.__noemaPath=(path?path+'/':'')+file.name}catch{}
         files.push(file);
       }).catch(()=>{errors++}).finally(()=>inflight.delete(promise));
       inflight.add(promise);
       if(inflight.size>=concurrency)await Promise.race(inflight);
     }else ignored++;
     if(visited%yieldEvery===0){report();await yieldToUI()}
    }
   }catch{errors++}
   report();await yieldToUI();
  }
  await flush();report();
  return {files:isCancelled()?[]:files.slice(0,maxFiles),stats:{visited,accepted:files.length,ignored,errors,directories,elapsedMs:elapsed()},cancelled:isCancelled()};
 }
 root.NOEMADirectoryScanner=Object.freeze({scan,imageName});
})(typeof window==='undefined'?globalThis:window);
