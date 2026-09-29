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
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 50_000;
const MAX_R2_PAGES = 1000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`ENV_REQUIRED:${name}`);
  return value;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function cloudflareJson(url, init, { attempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const raw = await response.text();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
      if (response.ok && parsed?.success !== false) return parsed;
      const code = parsed?.errors?.[0]?.code || parsed?.result?.errors?.[0]?.code || response.status;
      lastError = new Error(`CLOUDFLARE_HTTP_${response.status}:${code}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(750 * attempt);
  }
  throw lastError || new Error('CLOUDFLARE_REQUEST_FAILED');
}

function d1Endpoint(accountId, databaseId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
}

async function d1Execute({ accountId, databaseId, token }, sql, params = []) {
  const parsed = await cloudflareJson(d1Endpoint(accountId, databaseId), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const groups = Array.isArray(parsed?.result)
    ? parsed.result
    : (parsed?.result ? [parsed.result] : []);
  if (!groups.length || groups.some(group => group?.success === false)) {
    throw new Error('D1_QUERY_FAILED');
  }
  return groups;
}

async function d1Rows(client, sql, params = []) {
  const groups = await d1Execute(client, sql, params);
  return groups.flatMap(group => Array.isArray(group?.results) ? group.results : []);
}

async function exportD1(client) {
  const discovered = await d1Rows(
    client,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tables = [];

  for (const descriptor of discovered) {
    const name = String(descriptor?.name || '').trim();
    if (!name || name.startsWith('_cf_')) continue;
    const tableRows = [];
    let offset = 0;
    let rowidSupported = true;

    while (true) {
      const quoted = quoteIdentifier(name);
      let page;
      try {
        page = await d1Rows(
          client,
          `SELECT * FROM ${quoted}${rowidSupported ? ' ORDER BY rowid' : ''} LIMIT ? OFFSET ?`,
          [PAGE_SIZE, offset],
        );
      } catch (error) {
        if (offset === 0 && rowidSupported) {
          rowidSupported = false;
          page = await d1Rows(client, `SELECT * FROM ${quoted} LIMIT ? OFFSET ?`, [PAGE_SIZE, offset]);
        } else {
          throw error;
        }
      }

      tableRows.push(...page);
      if (tableRows.length > MAX_ROWS_PER_TABLE) throw new Error(`BACKUP_TABLE_ROW_LIMIT:${name}`);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }

    tables.push({
      name,
      schema: descriptor?.sql || null,
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

async function fetchInventory({ baseUrl, token }) {
  const objects = [];
  let cursor = null;
  for (let pageNumber = 0; pageNumber < MAX_R2_PAGES; pageNumber += 1) {
    const url = new URL('/inventory', baseUrl);
    if (cursor) url.searchParams.set('cursor', cursor);

    let payload = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { 'x-mel-predeploy-backup-refresh': token },
        });
        const raw = await response.text();
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
        if (response.ok && parsed?.ok === true && parsed?.status === 'R2_INVENTORY_PAGE') {
          payload = parsed;
          break;
        }
        lastError = new Error(`R2_INVENTORY_HTTP_${response.status}:${parsed?.status || 'INVALID'}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < 5) await sleep(500 * attempt);
    }
    if (!payload) throw lastError || new Error('R2_INVENTORY_FAILED');

    for (const object of payload.objects || []) {
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

function runWrangler(args) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    throw new Error(`WRANGLER_FAILED:${args.slice(0, 4).join(':')}:${detail}`);
  }
  return result;
}

async function createBackup() {
  const accountId = required('CLOUDFLARE_ACCOUNT_ID');
  const cloudflareToken = required('CLOUDFLARE_API_TOKEN');
  const databaseId = required('MEL_D1_DATABASE_ID');
  const bucketName = required('MEL_R2_BUCKET_NAME');
  const inventoryUrl = required('MEL_PREDEPLOY_BACKUP_REFRESH_URL');
  const inventoryToken = required('MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN');
  const sourceSha = required('MEL_SOURCE_SHA').toLowerCase();
  const sourceBranch = required('MEL_SOURCE_BRANCH');
  const keyId = required('MEL_BACKUP_ENCRYPTION_KEY_ID');
  const keyB64 = required('MEL_BACKUP_ENCRYPTION_KEY_B64');

  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('SOURCE_SHA_INVALID');
  if (!sourceBranch.startsWith('release/')) throw new Error('SOURCE_BRANCH_INVALID');

  const d1 = { accountId, databaseId, token: cloudflareToken };
  const encryptionCodec = createBackupEncryptionCodec({
    keyId,
    keyBytes: decodeBackupEncryptionKey(keyB64),
  });
  const now = new Date().toISOString();
  const id = `system-${now.replace(/[^0-9]/g, '').slice(0, 17)}`;
  const workdir = await mkdtemp(join(tmpdir(), 'mel-predeploy-backup-'));

  const sources = {
    database: () => exportD1(d1),
    r2_inventory: () => fetchInventory({ baseUrl: inventoryUrl, token: inventoryToken }),
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
      ]);

      try {
        runWrangler([
          'r2', 'object', 'get', `${bucketName}/${objectKey}`,
          '--file', verifyPath,
          '--remote',
        ]);
        const downloaded = await readFile(verifyPath, 'utf8');
        if (downloaded !== payload) throw new Error('BACKUP_R2_ROUNDTRIP_MISMATCH');

        await d1Execute(
          d1,
          'CREATE TABLE IF NOT EXISTS backup_objects (id TEXT PRIMARY KEY,object_key TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at INTEGER NOT NULL)',
        );
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
        await d1Execute(
          d1,
          'INSERT INTO backup_objects(id,object_key,metadata_json,created_at) VALUES(?,?,?,?)',
          [snapshot.id, objectKey, JSON.stringify(metadata), Date.parse(snapshot.createdAt) || Date.now()],
        );
        persisted = {
          id: snapshot.id,
          objectKey,
          restoreProof,
          bytes: Buffer.byteLength(payload),
        };
      } catch (error) {
        try {
          runWrangler(['r2', 'object', 'delete', `${bucketName}/${objectKey}`, '--remote']);
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
