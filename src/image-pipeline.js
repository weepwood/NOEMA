/* Image pipeline owns queue, worker lifecycle, URLs and cache; dependencies supplied by gallery. */
(function(root){
'use strict';
function create({getVersion,invalidateCollection,getArtworks,isLive,getPinned,persistentStore,getPersistentKey,THUMB_EDGE,PREVIEW_EDGE,MAX_THUMB_CACHE,MAX_THUMB_BYTES,photo}){
let thumbCacheBytes=0;
let thumbnailWorker=null,workerDisabled=false,workerId=0;
const workerPending=new Map();
function disableWorker(error){workerDisabled=true;thumbnailWorker?.terminate();thumbnailWorker=null;for(const task of workerPending.values())task.reject(error);workerPending.clear()}
function getThumbnailWorker(){
 if(workerDisabled||location.protocol==='file:'||!('Worker' in window)||!('OffscreenCanvas' in window))return null;
 if(thumbnailWorker)return thumbnailWorker;
 try{
  const worker=new Worker(new URL('./thumbnail-worker.js',document.baseURI));
  worker.onmessage=({data})=>{const task=workerPending.get(data.id);if(!task)return;workerPending.delete(data.id);data.error?task.reject(new Error(data.error)):task.resolve(data.blob)};
  worker.onerror=()=>disableWorker(new Error('Worker unavailable'));
  thumbnailWorker=worker;return worker;
 }catch{workerDisabled=true;return null}
}
function thumbnailInBackground(file,maxEdge=THUMB_EDGE,ratio=1){
 const worker=getThumbnailWorker();if(!worker)return makeThumbnailBlob(file,maxEdge,ratio);
 return new Promise((resolve,reject)=>{
  const id=++workerId;
  const timer=setTimeout(()=>{if(!workerPending.has(id))return;disableWorker(new Error('Thumbnail worker timed out'))},20000);
  workerPending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
  try{worker.postMessage({id,file,maxEdge,ratio})}catch(e){clearTimeout(timer);workerPending.delete(id);reject(e)}
 }).catch(()=>makeThumbnailBlob(file,maxEdge,ratio));
}
function rememberThumbnail(art,url,bytes){
 if(thumbCache.has(art)){const previous=thumbCache.get(art);if(previous&&previous!==url)URL.revokeObjectURL(previous);thumbCacheBytes-=art.thumbBytes||0;thumbCache.delete(art)}
 art.thumbBytes=bytes;art.thumbUrl=url;thumbCache.set(art,url);thumbCacheBytes+=bytes;
 evictThumbnails();
}

const thumbCache=new Map();
const thumbnailQueue=[];
const previewCache=new Map(),MAX_PREVIEW_CACHE=3;
let thumbnailWorkers=0;
function queueImageTask(task){
 thumbnailQueue.push(task);
 thumbnailQueue.sort((a,b)=>(b.preview?1:0)-(a.preview?1:0)||(b.priority||0)-(a.priority||0));
 pumpThumbnails();
}
function scheduleThumbnail(art,priority=0){
 if(!art.file)return Promise.resolve(photo(art.img,780));
 if(art.thumbUrl&&art.thumbEdge===(art.requestedEdge||THUMB_EDGE)){thumbCache.delete(art);thumbCache.set(art,art.thumbUrl);return Promise.resolve(art.thumbUrl)}
 if(art.thumbPromise){
  for(const task of thumbnailQueue)if(task.art===art&&!task.preview)
   task.priority=Math.max(task.priority||0,priority);
  thumbnailQueue.sort((a,b)=>(b.preview?1:0)-(a.preview?1:0)||(b.priority||0)-(a.priority||0));
  return art.thumbPromise;
 }
 const version=getVersion();
 const pending=new Promise(resolve=>queueImageTask({art,version,resolve,priority,edge:art.requestedEdge||THUMB_EDGE}));
 art.thumbPromise=pending;
 void pending.then(()=>{if(art.thumbPromise===pending)art.thumbPromise=null});
 return pending;
}
function schedulePreview(art){
 const cached=previewCache.get(art);
 if(cached){previewCache.delete(art);previewCache.set(art,cached);return Promise.resolve(cached)}
 if(art.previewPromise)return art.previewPromise;
 const version=getVersion();
 const pending=new Promise(resolve=>queueImageTask({art,version,resolve,preview:true,priority:Infinity}))
  .then(blob=>{
   if(version!==getVersion()||!blob)return null;
   previewCache.delete(art);previewCache.set(art,blob);
   while(previewCache.size>MAX_PREVIEW_CACHE)previewCache.delete(previewCache.keys().next().value);
   return blob;
  }).finally(()=>{if(art.previewPromise===pending)art.previewPromise=null});
 art.previewPromise=pending;
 return pending;
}
async function makeThumbnailBlob(file,maxEdge=THUMB_EDGE,ratio=1){
 let bitmap;
 try{
  if(typeof createImageBitmap!=='function')throw Error('ImageBitmap unavailable');
  const edge=Math.max(64,Math.min(2048,Math.round(maxEdge)));
  const resize=Number.isFinite(ratio)&&ratio>0&&ratio<1?{resizeHeight:edge}:{resizeWidth:edge};
  bitmap=await createImageBitmap(file,{...resize,resizeQuality:'medium'});
  const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas unavailable');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',edge>1024?.84:.76));
  if(!blob)throw Error('Cannot encode thumbnail');
  return blob;
 }finally{bitmap?.close?.()}
}
function pumpThumbnails(){
 // Bound simultaneous decodes of large originals; main-thread fallback is serial.
 while(thumbnailWorkers<(workerDisabled||location.protocol==='file:'||!('Worker' in window)||!('OffscreenCanvas' in window)?1:2)&&thumbnailQueue.length){
  const task=thumbnailQueue.shift();
  if(task.version!==getVersion()){task.resolve(null);continue}
  thumbnailWorkers++;
  (async()=>{
   try{
    if(task.preview){
     const key=await getPersistentKey(task.art);
     if(task.version!==getVersion()){task.resolve(null);return}
     const previewKey=key?'p1:'+key:null;
     let blob=previewKey?await persistentStore.get(previewKey):null;
     const cached=Boolean(blob);
     if(task.version!==getVersion()){task.resolve(null);return}
     if(!blob)blob=await thumbnailInBackground(task.art.file,PREVIEW_EDGE,task.art.ratio);
     if(task.version!==getVersion()){task.resolve(null);return}
     task.resolve(blob);
     // Persistent storage is best-effort and capped by the shared 96 MiB budget.
     if(!cached&&previewKey&&blob?.type==='image/webp')void persistentStore.put(previewKey,blob);
     return;
    }
    const identity=await getPersistentKey(task.art);
     const key=identity?'lod1:'+task.edge+':'+identity:null;
     if(task.version!==getVersion()){task.resolve(null);return}
     let blob=key?await persistentStore.get(key):null;
    const cacheHit=Boolean(blob);
    if(task.version!==getVersion()){task.resolve(null);return}
    if(!blob)blob=await thumbnailInBackground(task.art.file,task.edge||THUMB_EDGE,task.art.ratio);
    if(task.version!==getVersion()||!isLive(task.art)){task.resolve(null);return}
    const url=URL.createObjectURL(blob);task.art.thumbEdge=task.edge||THUMB_EDGE;rememberThumbnail(task.art,url,blob.size);task.resolve(url);
    if(!cacheHit&&key&&blob.type==='image/webp')void persistentStore.put(key,blob);
   }catch(error){
    if(task.version!==getVersion()){task.resolve(null);return}
    if(task.preview){task.resolve(null);return}
    task.art.thumbFailed=true;
    console.warn('缩略图生成失败:',task.art.title,error);
    // Compressed byte size cannot bound decoded pixels; never load originals here.
    task.resolve(task.art.thumbUrl||null);
   }finally{thumbnailWorkers--;pumpThumbnails()}
  })();
 }
}
function evictThumbnails(){
 const lod=window.NOEMAImageLOD;
 let pixels=lod.pixelBytes([...thumbCache.keys()]);
 const within=()=>thumbCache.size<=MAX_THUMB_CACHE&&thumbCacheBytes<=MAX_THUMB_BYTES&&pixels<=lod.PIXEL_BUDGET;
 if(within())return;
 const pinned=getPinned();
 for(const [art,url] of thumbCache){
  if(within())break;
  if(pinned.has(art))continue;
  pixels-=lod.pixelBytes([art]);
  URL.revokeObjectURL(url);thumbCache.delete(art);thumbCacheBytes-=art.thumbBytes||0;art.thumbBytes=0;art.thumbUrl=null;art.thumbPromise=null;art.thumbEdge=0;
 }
}
function invalidateImageTasks(){
 invalidateCollection();
 for(const art of getArtworks()){art.thumbPromise=null;art.previewPromise=null;art.thumbFailed=false}
 while(thumbnailQueue.length)thumbnailQueue.shift().resolve(null);
}
function clearThumbnailCache(){
 invalidateImageTasks();
 for(const [art,url] of thumbCache){URL.revokeObjectURL(url);art.thumbUrl=null;art.thumbPromise=null;art.thumbBytes=0;art.thumbEdge=0}
 thumbCache.clear();thumbCacheBytes=0;previewCache.clear();
 while(thumbnailQueue.length){thumbnailQueue.shift().resolve(null)}
}

return Object.freeze({enqueue:queueImageTask,scheduleThumbnail,schedulePreview,evict:evictThumbnails,invalidate:invalidateImageTasks,clear:clearThumbnailCache,clearPreviews:()=>previewCache.clear(),getPreview:art=>previewCache.get(art),reconcile:(live,priority,previews)=>root.NOEMAImageQueue.reconcile(thumbnailQueue,live,priority,previews),snapshot:()=>({cacheCount:thumbCache.size,cacheBytes:thumbCacheBytes,estimatedPixelsBytes:root.NOEMAImageLOD.pixelBytes([...thumbCache.keys()]),pixelMiB:root.NOEMAImageLOD.estimateMiB([...thumbCache.keys()]),queue:thumbnailQueue.length,workers:thumbnailWorkers,pendingWorker:workerPending.size}),dispose:()=>disableWorker(new Error('Image pipeline disposed'))});
}
root.NOEMAImagePipeline=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
