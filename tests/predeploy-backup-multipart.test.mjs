import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, {
  abortSystemBackupMultipart,
  completeSystemBackupMultipart,
  createSystemBackupMultipart,
  headSystemBackupObject,
  uploadSystemBackupPart,
} from '../release-tools/predeploy-backup-refresh/worker.js';

function fakeBucket() {
  const uploads = new Map();
  const objects = new Map();
  return {
    uploads,
    objects,
    async createMultipartUpload(key, options) {
      const uploadId = 'unit-upload-123456';
      uploads.set(uploadId, { key, options, parts: new Map() });
      return { uploadId };
    },
    resumeMultipartUpload(key, uploadId) {
      const upload = uploads.get(uploadId);
      if (!upload || upload.key !== key) throw new Error('MULTIPART_UPLOAD_NOT_FOUND');
      return {
        async uploadPart(partNumber, bytes) {
          const body = Buffer.from(bytes);
          const etag = 'etag-' + partNumber;
          upload.parts.set(partNumber, body);
          return { partNumber, etag };
        },
        async complete(parts) {
          const body = Buffer.concat(parts.map(p => upload.parts.get(p.partNumber)));
          objects.set(key, body);
          uploads.delete(uploadId);
          return { size: body.length, etag: 'complete-etag' };
        },
        async abort() {
          uploads.delete(uploadId);
        },
      };
    },
    async head(key) {
      const body = objects.get(key);
      return body ? { size: body.length, etag: 'complete-etag' } : null;
    },
  };
}

const KEY = 'backups/system/system-20261016194911560.enc.json';
const TOKEN = 'a'.repeat(64);
function request(path, { method = 'GET', body, token = TOKEN, headers = {} } = {}) {
  return new Request('https://sidecar.test' + path, {
    method,
    headers: { ...(body instanceof ArrayBuffer || ArrayBuffer.isView(body) ? {} : { 'content-type': 'application/json' }),
      ...(token ? { 'x-mel-predeploy-backup-refresh': token } : {}), ...headers },
    body: body === undefined ? undefined : (typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body) ? body : JSON.stringify(body)),
  });
}

test('predeploy sidecar creates, completes and HEAD-verifies an authenticated multipart R2 backup', async () => {
  const env = { MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN: TOKEN, MEDIA_BUCKET: fakeBucket() };
  const created = await worker.fetch(request('/multipart/create', { method: 'POST', body: { object_key: KEY } }), env);
  assert.equal(created.status, 200);
  const meta = await created.json();
  assert.equal(meta.status, 'R2_MULTIPART_CREATED');

  const bytes = new TextEncoder().encode('encrypted backup bytes').buffer;
  const query = new URLSearchParams({ object_key: KEY, upload_id: meta.upload_id, part_number: '1' });
  const part = await worker.fetch(request('/multipart/part?' + query, {
    method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' },
  }), env);
  const partResult = await part.json();
  assert.equal(part.status, 200);
  assert.equal(partResult.status, 'R2_MULTIPART_PART_UPLOADED');

  const completed = await worker.fetch(request('/multipart/complete', {
    method: 'POST',
    body: { object_key: KEY, upload_id: meta.upload_id, parts: [{ part_number: 1, etag: partResult.etag }] },
  }), env);
  const done = await completed.json();
  assert.equal(completed.status, 200);
  assert.equal(done.status, 'R2_MULTIPART_COMPLETED');
  assert.equal(done.size, bytes.byteLength);

  const head = await worker.fetch(request('/multipart/head?' + new URLSearchParams({ object_key: KEY })), env);
  const headResult = await head.json();
  assert.equal(headResult.status, 'R2_OBJECT_HEAD');
  assert.equal(headResult.present, true);
  assert.equal(headResult.size, bytes.byteLength);
  assert.deepEqual(env.MEDIA_BUCKET.objects.get(KEY), Buffer.from(bytes));
});

test('predeploy multipart endpoints reject unauthenticated requests and non-system object keys', async () => {
  const env = { MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN: TOKEN, MEDIA_BUCKET: fakeBucket() };
  const unauthenticated = await worker.fetch(request('/multipart/create', {
    method: 'POST', body: { object_key: KEY }, token: '',
  }), env);
  assert.equal(unauthenticated.status, 401);

  assert.deepEqual(await createSystemBackupMultipart(env, { object_key: 'other/private.bin' }),
    { ok: false, status: 'SYSTEM_BACKUP_KEY_INVALID' });
  assert.deepEqual(await uploadSystemBackupPart(env, {
    object_key: KEY, upload_id: 'unit-upload-123456', part_number: 1,
  }, new ArrayBuffer(0)), { ok: false, status: 'R2_MULTIPART_PART_SIZE_INVALID' });
  assert.deepEqual(await completeSystemBackupMultipart(env, {
    object_key: KEY, upload_id: 'unit-upload-123456',
    parts: [{ part_number: 2, etag: 'bad-order' }],
  }), { ok: false, status: 'R2_MULTIPART_PARTS_INVALID' });
  assert.deepEqual(await headSystemBackupObject(env, 'other/private.bin'),
    { ok: false, status: 'SYSTEM_BACKUP_KEY_INVALID' });
});

test('predeploy multipart abort removes an incomplete upload', async () => {
  const env = { MEDIA_BUCKET: fakeBucket() };
  const created = await createSystemBackupMultipart(env, { object_key: KEY });
  assert.equal(created.ok, true);
  assert.equal(env.MEDIA_BUCKET.uploads.has(created.upload_id), true);
  assert.deepEqual(await abortSystemBackupMultipart(env, { object_key: KEY, upload_id: created.upload_id }),
    { ok: true, status: 'R2_MULTIPART_ABORTED' });
  assert.equal(env.MEDIA_BUCKET.uploads.has(created.upload_id), false);
});

test('runner uses bounded multipart instead of Wrangler whole-file put for encrypted backup objects', async () => {
  const runner = await readFile(new URL('../release-tools/predeploy-backup-refresh/runner.mjs', import.meta.url), 'utf8');
  assert.match(runner, /R2_MULTIPART_CHUNK_BYTES = 16 \* 1024 \* 1024/);
  assert.match(runner, /uploadEncryptedBackupMultipart\(sidecar, objectKey, uploadPath, payloadBytes\)/);
  assert.match(runner, /R2_MULTIPART_PART_ATTEMPTS = 6/);
  assert.match(runner, /BACKUP_R2_ROUNDTRIP_MISMATCH/);
  const storagePut = runner.slice(runner.indexOf("async put(snapshot"), runner.indexOf("async get()"));
  assert.doesNotMatch(storagePut, /'r2', 'object', 'put'/);
  assert.match(storagePut, /encrypted-r2-multipart-upload:complete/);
});
