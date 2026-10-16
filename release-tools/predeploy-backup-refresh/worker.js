const SYSTEM_BACKUP_PREFIX = 'backups/system/';
const INVENTORY_PATH = '/inventory';
const D1_TABLES_PATH = '/d1/tables';
const D1_ROWS_PATH = '/d1/rows';
const REGISTER_PATH = '/register';
const UPLOAD_CREATE_PATH = '/upload/create';
const UPLOAD_PART_PATH = '/upload/part';
const UPLOAD_COMPLETE_PATH = '/upload/complete';
const UPLOAD_ABORT_PATH = '/upload/abort';
const R2_PAGE_LIMIT = 1000;
const MAX_MULTIPART_PARTS = 10_000;
const MAX_MULTIPART_PART_BYTES = 24 * 1024 * 1024;
const D1_PAGE_LIMIT = 500;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function equalToken(expected, supplied) {
  const a = new TextEncoder().encode(String(expected || ''));
  const b = new TextEncoder().encode(String(supplied || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i % Math.max(1, a.length)] || 0) ^ (b[i % Math.max(1, b.length)] || 0);
  }
  return a.length >= 32 && a.length === b.length && diff === 0;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

export async function listInventoryPage(env, cursor = null) {
  if (!env?.MEDIA_BUCKET?.list) return { ok: false, status: 'R2_BINDING_REQUIRED' };
  const options = { limit: R2_PAGE_LIMIT };
  if (cursor) options.cursor = cursor;
  const page = await env.MEDIA_BUCKET.list(options);
  const objects = (page?.objects || [])
    .filter(object => {
      const key = String(object?.key || '');
      return key && !key.startsWith(SYSTEM_BACKUP_PREFIX);
    })
    .map(object => ({
      key: String(object.key),
      size: Number(object?.size || 0),
      etag: object?.etag || null,
      uploaded: object?.uploaded instanceof Date ? object.uploaded.toISOString() : (object?.uploaded || null),
    }));

  return {
    ok: true,
    status: 'R2_INVENTORY_PAGE',
    objects,
    truncated: page?.truncated === true,
    cursor: page?.truncated === true ? String(page?.cursor || '') || null : null,
  };
}

export async function listD1Tables(env) {
  if (!env?.DB?.prepare) return { ok: false, status: 'D1_BINDING_REQUIRED' };
  const result = await env.DB.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const tables = rows(result)
    .map(row => ({ name: String(row?.name || ''), schema: row?.sql || null }))
    .filter(row => row.name && !row.name.startsWith('_cf_'));
  return { ok: true, status: 'D1_TABLES', tables };
}

export async function listD1Rows(env, { table, offset = 0, limit = D1_PAGE_LIMIT } = {}) {
  if (!env?.DB?.prepare) return { ok: false, status: 'D1_BINDING_REQUIRED' };
  const name = String(table || '').trim();
  if (!name || name.length > 160) return { ok: false, status: 'D1_TABLE_INVALID' };
  const safeOffset = Number(offset);
  const safeLimit = Math.max(1, Math.min(D1_PAGE_LIMIT, Number(limit) || D1_PAGE_LIMIT));
  if (!Number.isInteger(safeOffset) || safeOffset < 0 || safeOffset > 250_000) {
    return { ok: false, status: 'D1_OFFSET_INVALID' };
  }

  const exists = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? AND name NOT LIKE 'sqlite_%' LIMIT 1"
  ).bind(name).first();
  if (!exists?.name || name.startsWith('_cf_')) return { ok: false, status: 'D1_TABLE_NOT_FOUND' };

  const quoted = quoteIdentifier(name);
  let result;
  try {
    result = await env.DB.prepare(
      `SELECT * FROM ${quoted} ORDER BY rowid LIMIT ? OFFSET ?`
    ).bind(safeLimit, safeOffset).all();
  } catch {
    result = await env.DB.prepare(
      `SELECT * FROM ${quoted} LIMIT ? OFFSET ?`
    ).bind(safeLimit, safeOffset).all();
  }
  const pageRows = rows(result);
  return {
    ok: true,
    status: 'D1_ROWS_PAGE',
    table: name,
    rows: pageRows,
    offset: safeOffset,
    limit: safeLimit,
    has_more: pageRows.length === safeLimit,
  };
}

function validRegistration(input) {
  const id = String(input?.id || '');
  const objectKey = String(input?.object_key || '');
  const createdAt = Number(input?.created_at);
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(id)) return null;
  if (objectKey !== `${SYSTEM_BACKUP_PREFIX}${id}.enc.json`) return null;
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;

  const metadata = input?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const integrity = String(metadata.integritySha256 || '').toLowerCase();
  const restoreIntegrity = String(metadata.restoreIntegritySha256 || '').toLowerCase();
  const restoreSha = String(metadata.restoreDeployedGitSha || '').toLowerCase();
  if (metadata.verified !== true || metadata.encrypted !== true || metadata.restoreVerified !== true) return null;
  if (!/^[0-9a-f]{64}$/.test(integrity) || restoreIntegrity !== integrity) return null;
  if (!/^[0-9a-f]{40}$/.test(restoreSha)) return null;
  if (!String(metadata.encryptionKeyId || '').trim()) return null;
  return { id, objectKey, createdAt, metadata };
}


function validSystemObjectKey(value) {
  const key = String(value || '');
  if (key.length > 220 || !key.startsWith(SYSTEM_BACKUP_PREFIX) || !key.endsWith('.enc.json')) return false;
  const name = key.slice(SYSTEM_BACKUP_PREFIX.length);
  return /^[A-Za-z0-9._-]{1,160}\\.enc\\.json$/.test(name) && !name.includes('..');
}

async function readSmallJson(request, maxBytes = 64 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > maxBytes) return { error: 'REQUEST_TOO_LARGE' };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maxBytes) return { error: 'REQUEST_TOO_LARGE' };
    return { value: raw ? JSON.parse(raw) : {} };
  } catch {
    return { error: 'INVALID_JSON' };
  }
}

export async function createBackupMultipart(env, input) {
  if (!env?.MEDIA_BUCKET?.createMultipartUpload) return { ok: false, status: 'R2_MULTIPART_BINDING_REQUIRED' };
  const key = String(input?.object_key || '');
  if (!validSystemObjectKey(key)) return { ok: false, status: 'BACKUP_MULTIPART_KEY_INVALID' };
  const upload = await env.MEDIA_BUCKET.createMultipartUpload(key, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
  if (!upload?.uploadId || upload.key !== key) return { ok: false, status: 'BACKUP_MULTIPART_CREATE_UNCONFIRMED' };
  return { ok: true, status: 'BACKUP_MULTIPART_CREATED', key, upload_id: String(upload.uploadId) };
}

export async function uploadBackupMultipartPart(env, request, url) {
  if (!env?.MEDIA_BUCKET?.resumeMultipartUpload) return { ok: false, status: 'R2_MULTIPART_BINDING_REQUIRED' };
  const key = String(url.searchParams.get('key') || '');
  const uploadId = String(url.searchParams.get('upload_id') || '');
  const partNumber = Number(url.searchParams.get('part_number'));
  const length = Number(request.headers.get('content-length') || 0);
  if (!validSystemObjectKey(key) || !uploadId || uploadId.length > 1024) return { ok: false, status: 'BACKUP_MULTIPART_BINDING_INVALID' };
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_MULTIPART_PARTS) return { ok: false, status: 'BACKUP_MULTIPART_PART_NUMBER_INVALID' };
  if (!request.body || !Number.isFinite(length) || length <= 0 || length > MAX_MULTIPART_PART_BYTES) return { ok: false, status: 'BACKUP_MULTIPART_PART_SIZE_INVALID' };
  const upload = env.MEDIA_BUCKET.resumeMultipartUpload(key, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  if (Number(part?.partNumber) !== partNumber || !String(part?.etag || '')) return { ok: false, status: 'BACKUP_MULTIPART_PART_UNCONFIRMED' };
  return { ok: true, status: 'BACKUP_MULTIPART_PART_UPLOADED', part: { partNumber, etag: String(part.etag) }, bytes: length };
}

export async function completeBackupMultipart(env, input) {
  if (!env?.MEDIA_BUCKET?.resumeMultipartUpload || !env?.MEDIA_BUCKET?.head) return { ok: false, status: 'R2_MULTIPART_BINDING_REQUIRED' };
  const key = String(input?.object_key || '');
  const uploadId = String(input?.upload_id || '');
  const parts = input?.parts;
  if (!validSystemObjectKey(key) || !uploadId || uploadId.length > 1024 || !Array.isArray(parts) || parts.length < 1 || parts.length > MAX_MULTIPART_PARTS) {
    return { ok: false, status: 'BACKUP_MULTIPART_COMPLETION_INVALID' };
  }
  const normalized = [];
  for (let index = 0; index < parts.length; index += 1) {
    const partNumber = Number(parts[index]?.partNumber);
    const etag = String(parts[index]?.etag || '');
    if (partNumber !== index + 1 || !etag || etag.length > 1024) return { ok: false, status: 'BACKUP_MULTIPART_PARTS_INVALID' };
    normalized.push({ partNumber, etag });
  }
  const upload = env.MEDIA_BUCKET.resumeMultipartUpload(key, uploadId);
  const completed = await upload.complete(normalized);
  const object = await env.MEDIA_BUCKET.head(key);
  const bytes = Number(object?.size || 0);
  if (!completed || !object || bytes <= 0 || (completed.key && completed.key !== key)) {
    return { ok: false, status: 'BACKUP_MULTIPART_OBJECT_NOT_VERIFIED' };
  }
  return { ok: true, status: 'BACKUP_MULTIPART_COMPLETED', object_key: key, object_bytes: bytes, etag: String(object?.httpEtag || completed?.httpEtag || '') };
}

export async function abortBackupMultipart(env, input) {
  if (!env?.MEDIA_BUCKET?.resumeMultipartUpload) return { ok: false, status: 'R2_MULTIPART_BINDING_REQUIRED' };
  const key = String(input?.object_key || '');
  const uploadId = String(input?.upload_id || '');
  if (!validSystemObjectKey(key) || !uploadId || uploadId.length > 1024) return { ok: false, status: 'BACKUP_MULTIPART_BINDING_INVALID' };
  await env.MEDIA_BUCKET.resumeMultipartUpload(key, uploadId).abort();
  return { ok: true, status: 'BACKUP_MULTIPART_ABORTED' };
}

export async function registerBackupMetadata(env, input) {
  if (!env?.DB?.prepare) return { ok: false, status: 'D1_BINDING_REQUIRED' };
  if (!env?.MEDIA_BUCKET?.head) return { ok: false, status: 'R2_BINDING_REQUIRED' };
  const candidate = validRegistration(input);
  if (!candidate) return { ok: false, status: 'BACKUP_REGISTRATION_INVALID' };

  const object = await env.MEDIA_BUCKET.head(candidate.objectKey);
  const bytes = Number(object?.size || 0);
  if (!object || bytes <= 0) return { ok: false, status: 'BACKUP_OBJECT_NOT_PROVEN' };

  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS backup_objects (id TEXT PRIMARY KEY,object_key TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at INTEGER NOT NULL)'
  ).run();
  await env.DB.prepare(
    'INSERT INTO backup_objects(id,object_key,metadata_json,created_at) VALUES(?,?,?,?)'
  ).bind(
    candidate.id,
    candidate.objectKey,
    JSON.stringify(candidate.metadata),
    candidate.createdAt,
  ).run();

  return {
    ok: true,
    status: 'BACKUP_METADATA_REGISTERED',
    id: candidate.id,
    object_key: candidate.objectKey,
    backup_object_present: true,
    backup_object_bytes: bytes,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const expected = String(env?.MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN || '');
    const supplied = String(request.headers.get('x-mel-predeploy-backup-refresh') || '');
    if (!equalToken(expected, supplied)) return json({ ok: false, status: 'AUTH_REQUIRED' }, 401);

    try {
      if (url.pathname === INVENTORY_PATH && request.method === 'GET') {
        const cursor = String(url.searchParams.get('cursor') || '');
        if (cursor.length > 4096) return json({ ok: false, status: 'CURSOR_INVALID' }, 400);
        const result = await listInventoryPage(env, cursor || null);
        return json(result, result.ok ? 200 : 503);
      }

      if (url.pathname === D1_TABLES_PATH && request.method === 'GET') {
        const result = await listD1Tables(env);
        return json(result, result.ok ? 200 : 503);
      }

      if (url.pathname === D1_ROWS_PATH && request.method === 'GET') {
        const result = await listD1Rows(env, {
          table: url.searchParams.get('table'),
          offset: Number(url.searchParams.get('offset') || 0),
          limit: Number(url.searchParams.get('limit') || D1_PAGE_LIMIT),
        });
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname === UPLOAD_CREATE_PATH && request.method === 'POST') {
        const parsed = await readSmallJson(request, 4096);
        if (parsed.error) return json({ ok: false, status: parsed.error }, parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400);
        const result = await createBackupMultipart(env, parsed.value);
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname === UPLOAD_PART_PATH && request.method === 'PUT') {
        const result = await uploadBackupMultipartPart(env, request, url);
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname === UPLOAD_COMPLETE_PATH && request.method === 'POST') {
        const parsed = await readSmallJson(request, 2 * 1024 * 1024);
        if (parsed.error) return json({ ok: false, status: parsed.error }, parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400);
        const result = await completeBackupMultipart(env, parsed.value);
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname === UPLOAD_ABORT_PATH && request.method === 'POST') {
        const parsed = await readSmallJson(request, 4096);
        if (parsed.error) return json({ ok: false, status: parsed.error }, parsed.error === 'REQUEST_TOO_LARGE' ? 413 : 400);
        const result = await abortBackupMultipart(env, parsed.value);
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname === REGISTER_PATH && request.method === 'POST') {
        const length = Number(request.headers.get('content-length') || 0);
        if (Number.isFinite(length) && length > 64 * 1024) {
          return json({ ok: false, status: 'REQUEST_TOO_LARGE' }, 413);
        }
        let body = {};
        try { body = await request.json(); }
        catch { return json({ ok: false, status: 'INVALID_JSON' }, 400); }
        const result = await registerBackupMetadata(env, body);
        return json(result, result.ok ? 200 : 409);
      }

      return json({ ok: false, status: 'NOT_FOUND' }, 404);
    } catch (error) {
      return json({
        ok: false,
        status: 'PREDEPLOY_BACKUP_SIDECAR_FAILED',
        code: String(error?.code || error?.message || error).slice(0, 220),
      }, 503);
    }
  },
};
