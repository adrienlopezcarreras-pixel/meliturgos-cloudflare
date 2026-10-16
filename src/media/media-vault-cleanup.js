import { expiredMediaKeys } from '../api/file-upload.js';

const MAX_SCAN_OBJECTS = 1000;
const MEDIA_PREFIXES = Object.freeze(['uploads/','computer/screenshots/']);

export async function runExpiredMediaCleanup(env = {}, options = {}) {
  const bucket = env?.MEDIA_BUCKET;
  if (!bucket || typeof bucket.list !== 'function' || typeof bucket.delete !== 'function') {
    return { ok:true, skipped:true, status:'MEDIA_BUCKET_UNAVAILABLE', scanned:0, deleted:0, prefixes:[] };
  }

  const owner = String(env.MELITURGOS_USER || 'owner');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const maxObjects = Math.max(1, Math.min(MAX_SCAN_OBJECTS, Number(options.maxObjects) || MAX_SCAN_OBJECTS));
  let scanned = 0;
  const eligible = [];
  const scannedPrefixes = [];
  const perPrefixBudget = Math.max(1, Math.ceil(maxObjects / MEDIA_PREFIXES.length));

  for (const prefix of MEDIA_PREFIXES) {
    let cursor = null;
    let prefixScanned = 0;
    do {
      const remaining = Math.min(maxObjects - scanned, perPrefixBudget - prefixScanned);
      if (remaining <= 0) break;
      const page = await bucket.list({
        prefix,
        limit: Math.min(1000, remaining),
        include: ['customMetadata'],
        ...(cursor ? { cursor } : {}),
      });
      const objects = Array.isArray(page?.objects) ? page.objects : [];
      scanned += objects.length;
      prefixScanned += objects.length;
      scannedPrefixes.push(prefix);
      for (const object of objects) {
        if (String(object?.customMetadata?.owner || '') !== owner) continue;
        eligible.push(object);
      }
      cursor = page?.truncated && page?.cursor && scanned < maxObjects && prefixScanned < perPrefixBudget
        ? String(page.cursor) : null;
    } while (cursor);
    if (scanned >= maxObjects) break;
  }

  const keys = expiredMediaKeys(eligible, now).slice(0, MAX_SCAN_OBJECTS);
  if (keys.length) await bucket.delete(keys);

  return {
    ok:true,
    skipped:false,
    status:'MEDIA_CLEANUP_COMPLETE',
    scanned,
    deleted:keys.length,
    prefixes:[...new Set(scannedPrefixes)],
  };
}
