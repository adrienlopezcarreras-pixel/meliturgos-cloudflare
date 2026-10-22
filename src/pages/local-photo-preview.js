// [GPT] One private local-thumbnail implementation for Normal and Professor.
// No upload keys, image bytes or local object URLs leave the browser.
export async function melLocalPhotoPreview(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (!/^image\/(?:png|jpeg|gif|webp)$/.test(mime) || !file?.size || file.size > 25_000_000) return null;
  if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width < 1 || bitmap.height < 1) return null;
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.78);
    } catch {
      // Fall through to the small-file decoder on older browsers.
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }
  if (file.size > 2_000_000 || typeof FileReader === 'undefined') return null;
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      resolve(/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(data) ? data : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const LOCAL_PHOTO_PREVIEW_SOURCE = melLocalPhotoPreview.toString() + '\n';
