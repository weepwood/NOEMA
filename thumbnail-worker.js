/* NOEMA image resize worker. Original files stay on the user's device.
 * The decoder is asked for a bounded bitmap BEFORE the canvas is allocated.
 */
self.onmessage = async ({data}) => {
  const {id,file, maxEdge=500, ratio=1} = data;
  let bitmap;
  try {
    if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas==='undefined')
      throw new Error('OffscreenCanvas unavailable');
    // Portraits use resizeHeight so large vertical images are not decoded at
    // their full height. Unknown ratios default to width-based resizing.
    const edge=Math.max(64,Math.min(2048,Math.round(Number(maxEdge)||500)));
    const portrait=Number.isFinite(ratio)&&ratio>0&&ratio<1;
    const resize=portrait?{resizeHeight:edge}:{resizeWidth:edge};
    bitmap=await createImageBitmap(file,{...resize,resizeQuality:'medium'});
    const scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=new OffscreenCanvas(width,height);
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw new Error('Canvas context unavailable');
    context.drawImage(bitmap,0,0,width,height);
    const blob=await canvas.convertToBlob({
      type:'image/webp',quality:edge>1024?.84:.76
    });
    self.postMessage({id,blob});
  }catch(error){
    self.postMessage({id,error:error?.message||'Image conversion failed'});
  }finally{
    bitmap?.close?.();
  }
};
