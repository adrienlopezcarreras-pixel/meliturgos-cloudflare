// [GPT] One private browser-only preview pipeline for both MEL chat surfaces.
// Large camera photos are resized in memory; no R2 URL or photo bytes leave the
// browser through the preview itself. GIF is represented by a still thumbnail.
export function localPhotoPreview(file) {
  const mime = String(file?.type || '');
  if (!/^image\/(?:jpeg|png|webp|gif)$/i.test(mime) || !file?.size || file.size > 25 * 1024 * 1024) return Promise.resolve(null);
  if (typeof Image === 'undefined' || typeof document === 'undefined'
    || typeof URL?.createObjectURL !== 'function' || typeof URL?.revokeObjectURL !== 'function') return Promise.resolve(null);
  let blobUrl;
  try { blobUrl = URL.createObjectURL(file); } catch { return Promise.resolve(null); }
  return new Promise(resolve => {
    let settled = false;
    const image = new Image();
    const timer = setTimeout(() => finish(null), 10000);
    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(blobUrl);
      resolve(value);
    }
    image.onload = () => {
      try {
        const w = image.naturalWidth, h = image.naturalHeight;
        if (!w || !h || w * h > 80_000_000) return finish(null);
        const factor = Math.min(1, 1024 / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * factor));
        canvas.height = Math.max(1, Math.round(h * factor));
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.fillStyle = '#fff'; // Transparent PNG/WEBP remains legible as JPEG.
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.65, 0.45]) {
          const preview = canvas.toDataURL('image/jpeg', quality);
          if (/^data:image\/jpeg;base64,/i.test(preview) && preview.length <= 1_600_000) return finish(preview);
        }
        finish(null);
      } catch { finish(null); }
    };
    image.onerror = () => finish(null);
    image.src = blobUrl;
  });
}
export const MEL_CHAT_PHOTO_PREVIEW_SOURCE = localPhotoPreview.toString() + '\n';
