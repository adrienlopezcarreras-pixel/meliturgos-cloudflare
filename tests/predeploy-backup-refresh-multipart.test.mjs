import test from 'node:test';
import assert from 'node:assert/strict';
import {
  abortBackupMultipart,
  completeBackupMultipart,
  createBackupMultipart,
  uploadBackupMultipartPart,
} from '../release-tools/predeploy-backup-refresh/worker.js';

const KEY = 'backups/system/system-20261016194911560.enc.json';
const TOKEN = 'a'.repeat(64);

function multipartHarness() {
  const uploaded = new Map();
  const objects = new Map();
  const calls = { created: [], completed: [], aborted: [] };
  const MEDIA_BUCKET = {
    async createMultipartUpload(key, options) {
      calls.created.push({ key, options });
      return { key, uploadId: 'upload-test-001' };
    },
    resumeMultipartUpload(key, uploadId) {
      assert.equal(uploadId, 'upload-test-001');
      return {
        async uploadPart(partNumber, body) {
          const reader = body.getReader();
          let bytes = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
          }
          const etag = 'etag-' + partNumber;
          uploaded.set(partNumber, { partNumber, etag, bytes, key });
          return { partNumber, etag };
        },
        async complete(parts) {
          calls.completed.push({ key, parts });
          const bytes = parts.reduce((total, part) => total + (uploaded.get(part.partNumber)?.bytes || 0), 0);
          const object = { key, size: bytes, httpEtag: 'final-etag' };
          objects.set(key, object);
          return object;
        },
        async abort() { calls.aborted.push({ key, uploadId }); },
      };
    },
    async head(key) { return objects.get(key) || null; },
  };
  return { env: { MEDIA_BUCKET, MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN: TOKEN }, uploaded, objects, calls };
}

function bodyRequest(bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    body: new ReadableStream({
      start(controller) { controller.enqueue(payload); controller.close(); },
    }),
    headers: new Headers({ 'content-length': String(payload.byteLength) }),
  };
}

test('backup multipart lifecycle streams parts, completes the object, and proves stored size', async () => {
  const h = multipartHarness();
  const created = await createBackupMultipart(h.env, { object_key: KEY });
  assert.equal(created.ok, true);
  assert.equal(created.status, 'BACKUP_MULTIPART_CREATED');
  assert.equal(created.upload_id, 'upload-test-001');
  assert.equal(h.calls.created[0].options.httpMetadata.contentType, 'application/json; charset=utf-8');

  const first = await uploadBackupMultipartPart(
    h.env,
    bodyRequest(new Uint8Array(5 * 1024 * 1024)),
    new URL('https://sidecar.test/upload/part?key=' + encodeURIComponent(KEY) + '&upload_id=upload-test-001&part_number=1'),
  );
  const last = await uploadBackupMultipartPart(
    h.env,
    bodyRequest(new Uint8Array([1, 2, 3, 4])),
    new URL('https://sidecar.test/upload/part?key=' + encodeURIComponent(KEY) + '&upload_id=upload-test-001&part_number=2'),
  );
  assert.deepEqual(first.part, { partNumber: 1, etag: 'etag-1' });
  assert.equal(first.bytes, 5 * 1024 * 1024);
  assert.equal(last.bytes, 4);

  const complete = await completeBackupMultipart(h.env, {
    object_key: KEY,
    upload_id: created.upload_id,
    parts: [first.part, last.part],
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.status, 'BACKUP_MULTIPART_COMPLETED');
  assert.equal(complete.object_bytes, 5 * 1024 * 1024 + 4);
  assert.equal(complete.etag, 'final-etag');
  assert.deepEqual(h.calls.completed[0].parts, [first.part, last.part]);
});

test('backup multipart endpoints reject keys outside the system backup namespace', async () => {
  const h = multipartHarness();
  const result = await createBackupMultipart(h.env, { object_key: 'uploads/private.json' });
  assert.deepEqual(result, { ok: false, status: 'BACKUP_MULTIPART_KEY_INVALID' });
  assert.equal(h.calls.created.length, 0);
});

test('backup multipart upload rejects invalid part numbers and oversized parts', async () => {
  const h = multipartHarness();
  const invalidNumber = await uploadBackupMultipartPart(
    h.env, bodyRequest(new Uint8Array([1])),
    new URL('https://sidecar.test/upload/part?key=' + encodeURIComponent(KEY) + '&upload_id=upload-test-001&part_number=0'),
  );
  assert.deepEqual(invalidNumber, { ok: false, status: 'BACKUP_MULTIPART_PART_NUMBER_INVALID' });

  const tooLarge = {
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }),
    headers: new Headers({ 'content-length': String(25 * 1024 * 1024) }),
  };
  const sizeResult = await uploadBackupMultipartPart(
    h.env, tooLarge,
    new URL('https://sidecar.test/upload/part?key=' + encodeURIComponent(KEY) + '&upload_id=upload-test-001&part_number=1'),
  );
  assert.deepEqual(sizeResult, { ok: false, status: 'BACKUP_MULTIPART_PART_SIZE_INVALID' });
});

test('backup multipart upload can abort an incomplete upload', async () => {
  const h = multipartHarness();
  const result = await abortBackupMultipart(h.env, { object_key: KEY, upload_id: 'upload-test-001' });
  assert.deepEqual(result, { ok: true, status: 'BACKUP_MULTIPART_ABORTED' });
  assert.deepEqual(h.calls.aborted, [{ key: KEY, uploadId: 'upload-test-001' }]);
});
