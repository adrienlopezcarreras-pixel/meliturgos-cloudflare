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

// Workerd can hash a stream without materialising the object in the Worker heap.
// Keep the bounded byte path for providers without native DigestStream support.
async function hashObjectStream(object, expectedSize) {
  requireValue(object?.body?.getReader, 'BACKUP_R2_OBJECT_BODY_UNAVAILABLE', 503);
  const digest = new crypto.DigestStream('SHA-256');
  const digestResult = digest.digest;
  digestResult.catch(() => {});
  const reader = object.body.getReader(), writer = digest.getWriter();
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      requireValue(size <= expectedSize, 'BACKUP_R2_OBJECT_SIZE_MISMATCH', 409);
      await writer.write(chunk.value);
    }
    requireValue(size === expectedSize, 'BACKUP_R2_OBJECT_SIZE_MISMATCH', 409);
    await writer.close();
    return [...new Uint8Array(await digestResult)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    await Promise.allSettled([reader.cancel(error), writer.abort(error)]);
    throw error;
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
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
  const attempted = [];
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
      const streaming = typeof crypto.DigestStream === 'function' && !!source.body?.getReader;
      let bytes;
      if (streaming) {
        requireValue(source.size === descriptor.size && typeof source.etag === 'string' && source.etag === descriptor.etag,
          'BACKUP_R2_SOURCE_CHANGED', 409);
      } else {
        bytes = await readObjectBytes(source, descriptor.size, descriptor.key);
      }
      const digest = streaming ? await hashObjectStream(source, descriptor.size) : await sha256Hex(bytes);
      const destination = backupObjectKey(id, descriptor.key, digest);
      requireValue(!(await bucket.get(destination)), 'BACKUP_R2_COPY_TARGET_NOT_EMPTY', 409);
      let body = bytes;
      if (streaming) {
        // A second R2 read retains the native known-length body for R2.put.
        // Never copy a replacement version after hashing the first version.
        const copy = await bucket.get(descriptor.key);
        requireValue(copy?.body && copy.size === descriptor.size && copy.etag === source.etag,
          'BACKUP_R2_SOURCE_CHANGED', 409);
        body = copy.body;
      }
      attempted.push(destination);
      await bucket.put(destination, body, {
        ...(source?.httpMetadata ? { httpMetadata: source.httpMetadata } : {}),
        customMetadata: {
          mel_backup_schema: R2_BYTE_BACKUP_SCHEMA,
          mel_source_key_sha256: await sha256Hex(new TextEncoder().encode(descriptor.key)),
          mel_content_sha256: digest,
        },
      });
      const stored = await bucket.get(destination);
      requireValue(stored, 'BACKUP_R2_COPY_MISSING', 503);
      const storedDigest = streaming ? await hashObjectStream(stored, descriptor.size)
        : await sha256Hex(await readObjectBytes(stored, descriptor.size, destination));
      requireValue(storedDigest === digest, 'BACKUP_R2_COPY_INTEGRITY_MISMATCH', 409);
      totalBytes += descriptor.size;
      copied.push({
        key: descriptor.key,
        backup_key: destination,
        size: descriptor.size,
        sha256: digest,
        etag: descriptor.etag,
        uploaded: descriptor.uploaded,
      });
    }
  } catch (error) {
    await cleanup(bucket, attempted);
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
  concurrency = 1,
} = {}) {
  requireValue(sourceBucket?.get, 'BACKUP_R2_SOURCE_UNAVAILABLE', 503);
  requireValue(targetBucket?.put && targetBucket?.get && targetBucket?.delete, 'BACKUP_R2_TARGET_UNAVAILABLE', 503);
  requireValue(manifest?.type === R2_BYTE_BACKUP_SCHEMA && Array.isArray(manifest.objects), 'BACKUP_R2_MANIFEST_INVALID', 400);

  requireValue(Number.isInteger(concurrency)&&concurrency>=1&&concurrency<=4,'BACKUP_R2_RESTORE_CONCURRENCY_INVALID',400);
  const restored = new Array(manifest.objects.length), written=new Set();
  let next=0, failure; let failed=false;
  async function worker() {
    while(!failed&&next<manifest.objects.length) {
      const index=next++, descriptor=manifest.objects[index];
      try {
        const source = await sourceBucket.get(descriptor.backup_key);
        requireValue(source, 'BACKUP_R2_COPY_MISSING', 409);
        const bytes = await readObjectBytes(source, Number(descriptor.size), descriptor.backup_key);
        requireValue(await sha256Hex(bytes) === descriptor.sha256, 'BACKUP_R2_COPY_INTEGRITY_MISMATCH', 409);
        const targetKey = `${targetPrefix}${descriptor.key}`;
        requireValue(!(await targetBucket.get(targetKey)), 'BACKUP_R2_RESTORE_TARGET_NOT_EMPTY', 409);
        written.add(targetKey);
        await targetBucket.put(targetKey, bytes, source?.httpMetadata ? { httpMetadata: source.httpMetadata } : undefined);
        if (verify) {
          const target = await targetBucket.get(targetKey);
          requireValue(target, 'BACKUP_R2_RESTORE_MISSING', 503);
          const restoredBytes = await readObjectBytes(target, bytes.byteLength, targetKey);
          requireValue(await sha256Hex(restoredBytes) === descriptor.sha256, 'BACKUP_R2_RESTORE_INTEGRITY_MISMATCH', 409);
        }
        restored[index]={key:descriptor.key,target_key:targetKey,size:bytes.byteLength,sha256:descriptor.sha256};
      }catch(error){if(!failed){failed=true;failure=error;}}
    }
  }
  // All in-flight copies finish before rollback, so none can write after cleanup.
  await Promise.all(Array.from({length:Math.min(concurrency,manifest.objects.length)},()=>worker()));
  if(failed){await cleanup(targetBucket,[...written]);throw failure;}

  return {
    ok: true,
    status: 'RESTORED_VERIFIED',
    objectCount: restored.length,
    totalBytes: restored.reduce((sum,row)=>sum+row.size,0),
    objects: restored,
  };
}
