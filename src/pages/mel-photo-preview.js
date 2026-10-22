// [GPT] Shared, browser-only photo preview used by Normal and Professor.
// Private image bytes stay in the owner's browser and are never uploaded again.
// Large photographs are decoded once into a bounded thumbnail (no object URLs).
export async function melLocalPhotoPreview(file) {
  const type = String(file?.type || '').toLowerCase();
  const size = Number(file?.size || 0);
  if (!/^image\/(?:png|jpeg|gif|webp)$/.test(type) || !Number.isFinite(size) || size <= 0 || size > 25_000_000) return null;
  if (size <= 2_000_000) {
    if (typeof FileReader === 'undefined') return null;
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = typeof reader.result === 'string' ? reader.result : '';
        resolve(/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value) ? value : null);
      };
      reader.onerror = () => resolve(null);
      reader.onabort = () => resolve(null);
      try { reader.readAsDataURL(file); } catch { resolve(null); }
    });
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const edge = Math.max(bitmap.width, bitmap.height);
    if (!Number.isFinite(edge) || edge <= 0) return null;
    const scale = Math.min(1, 640 / edge);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL('image/jpeg', 0.72);
    return /^data:image\/jpeg;base64,/i.test(preview) ? preview : null;
  } catch {
    return null;
  } finally {
    try { bitmap?.close(); } catch {}
  }
}
export const MEL_PHOTO_PREVIEW_SOURCE = melLocalPhotoPreview.toString() + '\n';
