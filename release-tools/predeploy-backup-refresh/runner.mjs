import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createVerifiedBackupService } from '../../src/backup/backup-service.js';
import {
  createBackupEncryptionCodec,
  decodeBackupEncryptionKey,
} from '../../src/backup/encrypted-backup-storage.js';
import { inspectRestoreCandidate } from '../../src/backup/restore-service.js';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../../src/core/config.js';

const SYSTEM_BACKUP_PREFIX = 'backups/system/';
const D1_PAGE_SIZE = 500;
const MAX_ROWS_PER_TABLE = 50_000;
const MAX_R2_PAGES = 1000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`ENV_REQUIRED:${name}`);
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sidecarJson({ baseUrl, token }, path, init = {}, { attempts = 12 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const url = new URL(path, baseUrl);
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers || {}),
          'x-mel-predeploy-backup-refresh': token,
        },
      });
      const raw = await response.text();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
      if (response.ok && parsed?.ok === true) return parsed;
      lastError = new Error(`SIDECAR_HTTP_${response.status}:${parsed?.status || 'INVALID'}:${parsed?.code || ''}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(Math.min(2000, 500 * attempt));
  }
  throw lastError || new Error('SIDECAR_REQUEST_FAILED');
}

async function exportD1(sidecar) {
  const discovered = await sidecarJson(sidecar, '/d1/tables');
  if (discovered?.status !== 'D1_TABLES' || !Array.isArray(discovered.tables)) {
    throw new Error('D1_TABLE_DISCOVERY_INVALID');
  }

  const tables = [];
  for (const descriptor of discovered.tables) {
    const name = String(descriptor?.name || '').trim();
    if (!name || name.startsWith('_cf_')) continue;
    const tableRows = [];
    let offset = 0;

    while (true) {
      const qs = new URLSearchParams({
        table: name,
        offset: String(offset),
        limit: String(D1_PAGE_SIZE),
      });
      const page = await sidecarJson(sidecar, `/d1/rows?${qs.toString()}`);
      if (page?.status !== 'D1_ROWS_PAGE' || String(page?.table || '') !== name || !Array.isArray(page.rows)) {
        throw new Error(`D1_ROWS_PAGE_INVALID:${name}`);
      }
      tableRows.push(...page.rows);
      if (tableRows.length > MAX_ROWS_PER_TABLE) throw new Error(`BACKUP_TABLE_ROW_LIMIT:${name}`);
      if (page.has_more !== true) break;
      offset += page.rows.length;
      if (page.rows.length === 0) throw new Error(`D1_PAGINATION_STALLED:${name}`);
    }

    tables.push({
      name,
      schema: descriptor?.schema || null,
      rowCount: tableRows.length,
      rows: tableRows,
    });
  }

  return {
    type: 'MEL_D1_LOGICAL_EXPORT_V1',
    tableCount: tables.length,
    tables,
  };
}

async function fetchInventory(sidecar) {
  const objects = [];
  let cursor = null;
  for (let pageNumber = 0; pageNumber < MAX_R2_PAGES; pageNumber += 1) {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    const path = `/inventory${qs.size ? `?${qs.toString()}` : ''}`;
    const payload = await sidecarJson(sidecar, path);
    if (payload?.status !== 'R2_INVENTORY_PAGE' || !Array.isArray(payload.objects)) {
      throw new Error('R2_INVENTORY_PAGE_INVALID');
    }

    for (const object of payload.objects) {
      const key = String(object?.key || '');
      if (!key || key.startsWith(SYSTEM_BACKUP_PREFIX)) continue;
      objects.push({
        key,
        size: Number(object?.size || 0),
        etag: object?.etag || null,
        uploaded: object?.uploaded || null,
      });
    }

    if (payload.truncated !== true) break;
    cursor = String(payload.cursor || '');
    if (!cursor) throw new Error('R2_INVENTORY_CURSOR_MISSING');
    if (pageNumber === MAX_R2_PAGES - 1) throw new Error('R2_INVENTORY_PAGE_LIMIT');
  }

  objects.sort((a, b) => a.key.localeCompare(b.key));
  return {
    type: 'MEL_R2_INVENTORY_V1',
    objectCount: objects.length,
    objects,
  };
}

async function registerMetadata(sidecar, registration) {
  const result = await sidecarJson(sidecar, '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  });
  if (result?.status !== 'BACKUP_METADATA_REGISTERED') throw new Error('BACKUP_METADATA_REGISTRATION_FAILED');
  if (result?.backup_object_present !== true || Number(result?.backup_object_bytes || 0) <= 0) {
    throw new Error('BACKUP_OBJECT_NOT_PROVEN_AFTER_UPLOAD');
  }
  return result;
}

const WRANGLER_TRANSIENT_RE = /(?:\b(?:429|500|502|503|504|520|522|524)\b|failed to fetch|fetch failed|econnreset|etimedout|socket hang up|temporar(?:y|ily)|network error)/i;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runWrangler(args, { attempts = 1 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    const result = spawnSync('npx', ['wrangler', ...args], {
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    });
    last = result;
    if (result.status === 0) return result;

    const detail = String(result.stderr || result.stdout || '').replace(/\s+/g, ' ').trim();
    const transient = WRANGLER_TRANSIENT_RE.test(detail);
    if (!transient || attempt >= attempts) {
      throw new Error(`WRANGLER_FAILED:${args.slice(0, 4).join(':')}:${detail.slice(0, 500)}`);
    }

    const delayMs = Math.min(20_000, 2_000 * (2 ** (attempt - 1)));
    process.stderr.write(`Transient Wrangler/R2 failure on attempt ${attempt}/${attempts}; retrying in ${delayMs}ms.\n`);
    sleepSync(delayMs);
  }

  const detail = String(last?.stderr || last?.stdout || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  throw new Error(`WRANGLER_FAILED:${args.slice(0, 4).join(':')}:${detail}`);
}

async function createBackup() {
  required('CLOUDFLARE_ACCOUNT_ID');
  required('CLOUDFLARE_API_TOKEN');
  const bucketName = required('MEL_R2_BUCKET_NAME');
  const inventoryUrl = required('MEL_PREDEPLOY_BACKUP_REFRESH_URL');
  const inventoryToken = required('MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN');
  const sourceSha = required('MEL_SOURCE_SHA').toLowerCase();
  const sourceBranch = required('MEL_SOURCE_BRANCH');
  const keyId = required('MEL_BACKUP_ENCRYPTION_KEY_ID');
  const keyB64 = required('MEL_BACKUP_ENCRYPTION_KEY_B64');

  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  if (!sourceBranch.startsWith('release/')) throw new Error('SOURCE_BRANCH_INVALID');

  const sidecar = { baseUrl: inventoryUrl, token: inventoryToken };
  const encryptionCodec = createBackupEncryptionCodec({
    keyId,
    keyBytes: decodeBackupEncryptionKey(keyB64),
  });
  const now = new Date().toISOString();
  const id = `system-${now.replace(/[^0-9]/g, '').slice(0, 17)}`;
  const workdir = await mkdtemp(join(tmpdir(), 'mel-predeploy-backup-'));

  const sources = {
    database: () => exportD1(sidecar),
    r2_inventory: () => fetchInventory(sidecar),
    runtime: async () => ({
      type: 'MEL_RUNTIME_DESCRIPTOR_V1',
      appVersion: APP_VERSION,
      dbSchemaVersion: DB_SCHEMA_VERSION,
      worker: 'meliturgos',
      candidateBranch: sourceBranch,
      deployedGitSha: sourceSha,
      deployedGitBranch: sourceBranch,
      runtimeEnvironment: 'production',
    }),
  };

  let persisted = null;
  const storage = {
    async put(snapshot, context = {}) {
      const verification = context?.verification?.ok === true ? context.verification : null;
      if (!verification) throw new Error('BACKUP_CRYPTOGRAPHIC_VERIFICATION_REQUIRED');
      const restoreProof = inspectRestoreCandidate(snapshot, { integrity: verification });
      if (restoreProof?.ok !== true) throw new Error(`BACKUP_RESTORE_PROOF_FAILED:${restoreProof?.code || 'UNKNOWN'}`);

      const envelope = await encryptionCodec.seal(snapshot);
      const objectKey = `${SYSTEM_BACKUP_PREFIX}${snapshot.id}.enc.json`;
      const uploadPath = join(workdir, 'backup.enc.json');
      const verifyPath = join(workdir, 'backup.verify.enc.json');
      const payload = JSON.stringify(envelope);
      await writeFile(uploadPath, payload, 'utf8');

      runWrangler([
        'r2', 'object', 'put', `${bucketName}/${objectKey}`,
        '--file', uploadPath,
        '--content-type', 'application/json; charset=utf-8',
        '--remote',
      ], { attempts: 6 });

      try {
        runWrangler([
          'r2', 'object', 'get', `${bucketName}/${objectKey}`,
          '--file', verifyPath,
          '--remote',
        ], { attempts: 6 });
        const downloaded = await readFile(verifyPath, 'utf8');
        if (downloaded !== payload) throw new Error('BACKUP_R2_ROUNDTRIP_MISMATCH');

        const metadata = {
          schema: snapshot.schema,
          createdAt: snapshot.createdAt,
          integritySha256: snapshot.integritySha256,
          sourceCount: snapshot.sourceCount,
          verified: true,
          encrypted: true,
          encryptionSchema: encryptionCodec.schema,
          encryptionAlgorithm: encryptionCodec.algorithm,
          encryptionKeyId: encryptionCodec.key_id,
          restoreVerified: true,
          restoreCode: restoreProof.code || 'RESTORE_CANDIDATE_VERIFIED',
          restoreIntegritySha256: snapshot.integritySha256,
          restoreDeployedGitSha: restoreProof?.runtime?.deployedGitSha || null,
          restoreTableCount: Number(restoreProof?.database?.tableCount || 0),
          restoreRowCount: Number(restoreProof?.database?.rowCount || 0),
          restoreR2ObjectCount: Number(restoreProof?.r2?.objectCount || 0),
        };
        const registration = await registerMetadata(sidecar, {
          id: snapshot.id,
          object_key: objectKey,
          metadata,
          created_at: Date.parse(snapshot.createdAt) || Date.now(),
        });
        persisted = {
          id: snapshot.id,
          objectKey,
          restoreProof,
          bytes: Number(registration.backup_object_bytes || Buffer.byteLength(payload)),
        };
      } catch (error) {
        try {
          runWrangler(['r2', 'object', 'delete', `${bucketName}/${objectKey}`, '--remote'], { attempts: 4 });
        } catch {}
        throw error;
      }
    },
    async get() {
      return null;
    },
  };

  try {
    const service = createVerifiedBackupService({ sources, storage, now: () => now });
    const created = await service.create({ id }, { requestId: `predeploy-runner:${now}` });
    if (!persisted || persisted.id !== created.id) throw new Error('BACKUP_PERSISTENCE_NOT_CONFIRMED');
    if (!/^[0-9a-f]{64}$/.test(String(created.integritySha256 || '').toLowerCase())) {
      throw new Error('BACKUP_INTEGRITY_INVALID');
    }
    if (String(persisted.restoreProof?.runtime?.deployedGitSha || '').toLowerCase() !== sourceSha) {
      throw new Error('BACKUP_RESTORE_SHA_MISMATCH');
    }

    return {
      ok: true,
      status: 'PREDEPLOY_BACKUP_REFRESH_CREATED',
      backup: {
        id: created.id,
        integrity_sha256: created.integritySha256,
        source_count: Number(created.sourceCount || 0),
        source_sha: sourceSha,
        source_branch: sourceBranch,
        encrypted: true,
        restore_candidate_verified: true,
        backup_object_present: true,
        backup_object_bytes: persisted.bytes,
      },
    };
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

try {
  const result = await createBackup();
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    status: 'PREDEPLOY_BACKUP_REFRESH_FAILED',
    code: String(error?.code || error?.message || error).slice(0, 500),
  }));
  process.exitCode = 1;
}
