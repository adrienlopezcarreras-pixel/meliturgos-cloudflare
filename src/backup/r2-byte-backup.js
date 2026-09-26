import { requireValue } from '../core/contracts.js';

export const R2_BYTE_BACKUP_SCHEMA = 'MEL_R2_BYTE_BACKUP_V1';
export const DEFAULT_R2_BACKUP_MAX_OBJECTS = 5000;
export const DEFAULT_R2_BACKUP_MAX_OBJECT_BYTES = 32 * 1024 * 1024;

function text(value) {
  return String(value ?? '').trim();
}

function safePositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.trunc(n));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readObjectBytes(object, expectedSize, key) {
  requireValue(object?.arrayBuffer, 'BACKUP_R2_OBJECT_BODY_UNAVAILABLE', 503);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (Number.isFinite(expectedSize)) {
    requireValue(bytes.byteLength === expectedSize, 'BACKUP_R2_OBJECT_SIZE_MISMATCH', 409);
  }
  requireValue(bytes.byteLength >= 0, 'BACKUP_R2_OBJECT_READ_FAILED', 503);
  return bytes;
}

async function cleanup(bucket, keys) {
  for (const key of keys) {
    try { await bucket.delete(key); } catch {}
  }
}

function backupObjectKey(snapshotId, originalKey, digest) {
  const keyBytes = new TextEncoder().encode(originalKey);
  const keyToken = bytesToBase64Url(keyBytes).slice(0, 120);
  return `backups/system/r2-bytes/${snapshotId}/${digest.slice(0,24)}-${keyToken || 'object'}.bin`;
}

export async function backupR2ObjectBytes(bucket, {
  snapshotId,
  sourcePrefix = '',
  maxObjects = DEFAULT_R2_BACKUP_MAX_OBJECTS,
  maxObjectBytes = DEFAULT_R2_BACKUP_MAX_OBJECT_BYTES,
  excludedPrefix = 'backups/system/',
} = {}) {
  requireValue(bucket?.list && bucket?.get && bucket?.put && bucket?.delete, 'BACKUP_R2_UNAVAILABLE', 503);
  const id = text(snapshotId);
  requireValue(/^[A-Za-z0-9._-]{1,160}$/.test(id), 'BACKUP_ID_INVALID', 400);
  const objectLimit = safePositiveInt(maxObjects, DEFAULT_R2_BACKUP_MAX_OBJECTS, 100000);
  const byteLimit = safePositiveInt(maxObjectBytes, DEFAULT_R2_BACKUP_MAX_OBJECT_BYTES, 128 * 1024 * 1024);

  const descriptors = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: sourcePrefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page?.objects || []) {
      const key = text(object?.key);
      if (!key || key.startsWith(excludedPrefix)) continue;
      descriptors.push({
        key,
        size: Number(object?.size || 0),
        etag: object?.etag || null,
        uploaded: object?.uploaded instanceof Date ? object.uploaded.toISOString() : (object?.uploaded || null),
      });
      requireValue(descriptors.length <= objectLimit, 'BACKUP_R2_OBJECT_COUNT_LIMIT', 413);
    }
    cursor = page?.truncated && page?.cursor ? page.cursor : undefined;
  } while (cursor);

  descriptors.sort((a,b)=>a.key.localeCompare(b.key));
  const copied = [];
  let totalBytes = 0;

  try {
    for (const descriptor of descriptors) {
      requireValue(
        Number.isInteger(descriptor.size) && descriptor.size >= 0 && descriptor.size <= byteLimit,
        'BACKUP_R2_OBJECT_BYTE_LIMIT',
        413,
      );
      const source = await bucket.get(descriptor.key);
      requireValue(source, 'BACKUP_R2_OBJECT_MISSING', 409);
      const bytes = await readObjectBytes(source, descriptor.size, descriptor.key);
      const digest = await sha256Hex(bytes);
      const destination = backupObjectKey(id, descriptor.key, digest);
      await bucket.put(destination, bytes, {
        ...(source?.httpMetadata ? { httpMetadata: source.httpMetadata } : {}),
        customMetadata: {
          mel_backup_schema: R2_BYTE_BACKUP_SCHEMA,
          mel_source_key_sha256: await sha256Hex(new TextEncoder().encode(descriptor.key)),
          mel_content_sha256: digest,
        },
      });
      const stored = await bucket.get(destination);
      requireValue(stored, 'BACKUP_R2_COPY_MISSING', 503);
      const storedBytes = await readObjectBytes(stored, bytes.byteLength, destination);
      requireValue(await sha256Hex(storedBytes) === digest, 'BACKUP_R2_COPY_INTEGRITY_MISMATCH', 409);
      totalBytes += bytes.byteLength;
      copied.push({
        key: descriptor.key,
        backup_key: destination,
        size: bytes.byteLength,
        sha256: digest,
        etag: descriptor.etag,
        uploaded: descriptor.uploaded,
      });
    }
  } catch (error) {
    await cleanup(bucket, copied.map(row => row.backup_key));
    throw error;
  }

  return {
    type: R2_BYTE_BACKUP_SCHEMA,
    snapshot_id: id,
    objectCount: copied.length,
    totalBytes,
    objects: copied,
  };
}

export async function restoreR2ObjectBytes(sourceBucket, targetBucket, manifest, {
  targetPrefix = '',
  verify = true,
} = {}) {
  requireValue(sourceBucket?.get, 'BACKUP_R2_SOURCE_UNAVAILABLE', 503);
  requireValue(targetBucket?.put && targetBucket?.get && targetBucket?.delete, 'BACKUP_R2_TARGET_UNAVAILABLE', 503);
  requireValue(manifest?.type === R2_BYTE_BACKUP_SCHEMA && Array.isArray(manifest.objects), 'BACKUP_R2_MANIFEST_INVALID', 400);

  const restored = [];
  try {
    for (const descriptor of manifest.objects) {
      const source = await sourceBucket.get(descriptor.backup_key);
      requireValue(source, 'BACKUP_R2_COPY_MISSING', 409);
      const bytes = await readObjectBytes(source, Number(descriptor.size), descriptor.backup_key);
      requireValue(await sha256Hex(bytes) === descriptor.sha256, 'BACKUP_R2_COPY_INTEGRITY_MISMATCH', 409);
      const targetKey = `${targetPrefix}${descriptor.key}`;
      await targetBucket.put(targetKey, bytes, source?.httpMetadata ? { httpMetadata: source.httpMetadata } : undefined);
      if (verify) {
        const target = await targetBucket.get(targetKey);
        requireValue(target, 'BACKUP_R2_RESTORE_MISSING', 503);
        const restoredBytes = await readObjectBytes(target, bytes.byteLength, targetKey);
        requireValue(await sha256Hex(restoredBytes) === descriptor.sha256, 'BACKUP_R2_RESTORE_INTEGRITY_MISMATCH', 409);
      }
      restored.push({ key: descriptor.key, target_key: targetKey, size: bytes.byteLength, sha256: descriptor.sha256 });
    }
  } catch (error) {
    await cleanup(targetBucket, restored.map(row => row.target_key));
    throw error;
  }

  return {
    ok: true,
    status: 'RESTORED_VERIFIED',
    objectCount: restored.length,
    totalBytes: restored.reduce((sum,row)=>sum+row.size,0),
    objects: restored,
  };
}
