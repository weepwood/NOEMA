/* NOEMA thumbnail worker — original code. All processing stays inside the browser. */
self.onmessage = async ({data}) => {
  const {id, file, maxEdge = 500} = data;
  let bitmap;
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas unavailable');
    }
    // Decode and resize away from the interaction thread. Pixel aspect ratio is preserved.
    bitmap = await createImageBitmap(file, {resizeWidth: maxEdge, resizeQuality: 'medium'});
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', {alpha: false});
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({type: 'image/webp', quality: .78});
    self.postMessage({id, blob});
  } catch (error) {
    self.postMessage({id, error: error?.message || 'Thumbnail conversion failed'});
  } finally {
    bitmap?.close?.();
  }
};
