import { createVerifiedBackupService } from './backup-service.js';
import { requireValue } from '../core/contracts.js';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../core/config.js';
import { migrate } from '../persistence/migrations.js';
import { stableStringify } from '../resilience/recovery-bundle.js';
import { ENCRYPTED_BACKUP_SCHEMA, createEnvBackupEncryptionCodec } from './encrypted-backup-storage.js';
import { backupR2ObjectBytes } from './r2-byte-backup.js';

function deployedGitSha(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_SHA || '').trim();
  if (/^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();
  try {
    const built = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA || '').trim() : '';
    return /^[a-f0-9]{40}$/i.test(built) ? built.toLowerCase() : null;
  } catch {
    return null;
  }
}

function deployedGitBranch(env = {}) {
  const direct = String(env?.MEL_DEPLOYED_GIT_BRANCH || '').trim();
  if (direct) return direct;
  try {
    const built = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined' ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim() : '';
    return built || null;
  } catch {
    return null;
  }
}

export const SYSTEM_BACKUP_PREFIX = 'backups/system/';
export const DEFAULT_SYSTEM_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_SYSTEM_BACKUP_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SYSTEM_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ROWS_PER_PAGE = 1000;
const DEFAULT_MAX_ROWS_PER_TABLE = 50_000;

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function deterministicRows(input) {
  return [...input].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

export async function exportD1SystemState(db, {
  pageSize = DEFAULT_ROWS_PER_PAGE,
  maxRowsPerTable = DEFAULT_MAX_ROWS_PER_TABLE,
} = {}) {
  requireValue(db?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
  const safePageSize = Math.max(1, Math.min(5000, Number(pageSize) || DEFAULT_ROWS_PER_PAGE));
  const safeMaxRows = Math.max(safePageSize, Math.min(250_000, Number(maxRowsPerTable) || DEFAULT_MAX_ROWS_PER_TABLE));
  const discovered = rows(await db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all());
  const tables = [];

  for (const descriptor of discovered) {
    const name = String(descriptor?.name || '').trim();
    if (!name) continue;
    // Cloudflare D1 exposes internal bookkeeping tables (for example _cf_KV)
    // through sqlite_master but rejects direct reads with SQLITE_AUTH. They are
    // platform state, not MEL-owned recoverable data, so a logical MEL backup
    // must never attempt to export them.
    if (name.startsWith('_cf_')) continue;
    const tableRows = [];
    let offset = 0;
    while (true) {
      const page = rows(await db.prepare(
        `SELECT * FROM ${quoteIdentifier(name)} LIMIT ? OFFSET ?`
      ).bind(safePageSize, offset).all());
      tableRows.push(...page);
      if (page.length < safePageSize) break;
      offset += page.length;
      if (tableRows.length >= safeMaxRows) {
        const probe = rows(await db.prepare(
          `SELECT * FROM ${quoteIdentifier(name)} LIMIT 1 OFFSET ?`
        ).bind(tableRows.length).all());
        if (probe.length) throw new Error(`BACKUP_TABLE_ROW_LIMIT:${name}`);
        break;
      }
    }
    tables.push({
      name,
      schema: descriptor?.sql || null,
      rowCount: tableRows.length,
      rows: deterministicRows(tableRows),
    });
  }

  return {
    type: 'MEL_D1_LOGICAL_EXPORT_V1',
    tableCount: tables.length,
    tables,
  };
}

export async function exportR2Inventory(bucket, { prefix = '' } = {}) {
  requireValue(bucket?.list, 'BACKUP_R2_UNAVAILABLE', 503);
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page?.objects || []) {
      const key = String(object?.key || '');
      if (!key || key.startsWith(SYSTEM_BACKUP_PREFIX)) continue;
      objects.push({
        key,
        size: Number(object?.size || 0),
        etag: object?.etag || null,
        uploaded: object?.uploaded instanceof Date ? object.uploaded.toISOString() : (object?.uploaded || null),
      });
    }
    cursor = page?.truncated && page?.cursor ? page.cursor : undefined;
  } while (cursor);

  objects.sort((a, b) => a.key.localeCompare(b.key));
  return {
    type: 'MEL_R2_INVENTORY_V1',
    objectCount: objects.length,
    objects,
  };
}

function parseMetadata(raw) {
  try { return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}

export function createR2D1BackupStorage({ db, bucket, encryptionCodec = null }) {
  requireValue(db?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
  requireValue(bucket?.put && bucket?.get && bucket?.delete, 'BACKUP_R2_UNAVAILABLE', 503);

  return {
    async put(snapshot) {
      const id = String(snapshot?.id || '');
      requireValue(/^[A-Za-z0-9._-]{1,160}$/.test(id), 'BACKUP_ID_INVALID');
      const existing = await db.prepare('SELECT object_key FROM backup_objects WHERE id=?').bind(id).first();
      requireValue(!existing, 'BACKUP_ID_EXISTS', 409);
      const encrypted = Boolean(encryptionCodec);
      const objectKey = `${SYSTEM_BACKUP_PREFIX}${id}${encrypted ? '.enc' : ''}.json`;
      const storedValue = encrypted ? await encryptionCodec.seal(snapshot) : snapshot;
      const payload = JSON.stringify(storedValue);
      await bucket.put(objectKey, payload, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });
      try {
        await db.prepare('INSERT INTO backup_objects(id, object_key, metadata_json, created_at) VALUES(?,?,?,?)')
          .bind(id, objectKey, JSON.stringify({
            schema: snapshot.schema,
            createdAt: snapshot.createdAt,
            integritySha256: snapshot.integritySha256,
            sourceCount: snapshot.sourceCount,
            verified: snapshot.verified === true,
            encrypted,
            encryptionSchema: encrypted ? encryptionCodec.schema : null,
            encryptionAlgorithm: encrypted ? encryptionCodec.algorithm : null,
            encryptionKeyId: encrypted ? encryptionCodec.key_id : null,
          }), Date.parse(snapshot.createdAt) || Date.now())
          .run();
      } catch (error) {
        await bucket.delete(objectKey);
        throw error;
      }
    },

    async get(id) {
      const row = await db.prepare('SELECT object_key FROM backup_objects WHERE id=?').bind(String(id || '')).first();
      if (!row?.object_key) return null;
      const object = await bucket.get(row.object_key);
      if (!object) return null;
      let parsed;
      try { parsed = JSON.parse(await object.text()); }
      catch { return null; }
      if (parsed?.schema === ENCRYPTED_BACKUP_SCHEMA) {
        requireValue(encryptionCodec?.open, 'BACKUP_ENCRYPTION_CODEC_REQUIRED', 503);
        return encryptionCodec.open(parsed);
      }
      if (encryptionCodec) {
        throw Object.assign(new Error('BACKUP_ENCRYPTION_EXPECTED'), { code: 'BACKUP_ENCRYPTION_EXPECTED', status: 409 });
      }
      return parsed;
    },

    async list({ limit = 20 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const result = await db.prepare(
        "SELECT id, object_key, metadata_json, created_at FROM backup_objects WHERE object_key LIKE 'backups/system/%' ORDER BY created_at DESC LIMIT ?"
      ).bind(safeLimit).all();
      return rows(result).map((row) => ({
        id: row.id,
        objectKey: row.object_key,
        createdAt: parseMetadata(row.metadata_json).createdAt || new Date(Number(row.created_at) || 0).toISOString(),
        integritySha256: parseMetadata(row.metadata_json).integritySha256 || null,
        sourceCount: Number(parseMetadata(row.metadata_json).sourceCount || 0),
        verified: parseMetadata(row.metadata_json).verified === true,
        encrypted: parseMetadata(row.metadata_json).encrypted === true,
        encryptionSchema: parseMetadata(row.metadata_json).encryptionSchema || null,
        encryptionAlgorithm: parseMetadata(row.metadata_json).encryptionAlgorithm || null,
        encryptionKeyId: parseMetadata(row.metadata_json).encryptionKeyId || null,
      }));
    },
  };
}

export function systemBackupSources(env) {
  const sources = {
    database: () => exportD1SystemState(env.DB, {
      maxRowsPerTable: Number(env.MEL_SYSTEM_BACKUP_MAX_ROWS_PER_TABLE) || DEFAULT_MAX_ROWS_PER_TABLE,
    }),
    r2_inventory: () => exportR2Inventory(env.MEDIA_BUCKET),
    runtime: async () => ({
      type: 'MEL_RUNTIME_DESCRIPTOR_V1',
      appVersion: APP_VERSION,
      dbSchemaVersion: DB_SCHEMA_VERSION,
      worker: 'meliturgos',
      candidateBranch: env.MEL_GITHUB_BRANCH || null,
      deployedGitSha: deployedGitSha(env),
      deployedGitBranch: deployedGitBranch(env),
      runtimeEnvironment: env.MEL_RUNTIME_ENV || 'production',
    }),
  };

  if (String(env?.MEL_SYSTEM_BACKUP_COPY_R2_BYTES || '').trim().toLowerCase() === 'true') {
    sources.r2_objects = input => backupR2ObjectBytes(env.MEDIA_BUCKET, {
      snapshotId: String(input?.id || ''),
      maxObjects: Number(env.MEL_SYSTEM_BACKUP_R2_MAX_OBJECTS) || undefined,
      maxObjectBytes: Number(env.MEL_SYSTEM_BACKUP_R2_MAX_OBJECT_BYTES) || undefined,
    });
  }

  return sources;
}

export function createSystemBackupService(env, { now = () => new Date().toISOString() } = {}) {
  requireValue(env?.DB?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
  requireValue(env?.MEDIA_BUCKET?.put, 'BACKUP_R2_UNAVAILABLE', 503);

  const encryptionKeyId = String(env?.MEL_BACKUP_ENCRYPTION_KEY_ID || '').trim();
  const encryptionKey = String(env?.MEL_BACKUP_ENCRYPTION_KEY_B64 || '').trim();
  const encryptionRequested = Boolean(encryptionKeyId || encryptionKey);
  requireValue(
    !encryptionRequested || Boolean(encryptionKeyId && encryptionKey),
    'BACKUP_ENCRYPTION_CONFIG_INCOMPLETE',
    503,
  );
  const encryptionCodec = encryptionRequested ? createEnvBackupEncryptionCodec(env) : null;

  return createVerifiedBackupService({
    now,
    storage: createR2D1BackupStorage({
      db: env.DB,
      bucket: env.MEDIA_BUCKET,
      encryptionCodec,
    }),
    sources: systemBackupSources(env),
  });
}

function resolvedInterval(env, override) {
  const requested = Number(override ?? env?.MEL_SYSTEM_BACKUP_INTERVAL_MS ?? DEFAULT_SYSTEM_BACKUP_INTERVAL_MS);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_SYSTEM_BACKUP_INTERVAL_MS;
  return Math.max(MIN_SYSTEM_BACKUP_INTERVAL_MS, Math.min(MAX_SYSTEM_BACKUP_INTERVAL_MS, requested));
}

function snapshotId(iso) {
  return `system-${iso.replace(/[^0-9]/g, '').slice(0, 17)}`;
}

export async function runScheduledSystemBackup(env, {
  now = () => new Date().toISOString(),
  intervalMs,
  force = false,
  service: injectedService = null,
} = {}) {
  if (String(env?.MEL_PREVIEW_ISOLATED || '').toLowerCase() === 'true' || String(env?.MEL_RUNTIME_ENV || '').toLowerCase() === 'preview') {
    return { ok: true, status: 'SKIPPED_PREVIEW' };
  }

  let service = injectedService;
  if (!service) {
    requireValue(env?.DB?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
    requireValue(env?.MEDIA_BUCKET?.put, 'BACKUP_R2_UNAVAILABLE', 503);
    await migrate(env.DB);
    service = createSystemBackupService(env, { now });
  }

  const currentIso = now();
  const currentMs = Date.parse(currentIso);
  requireValue(Number.isFinite(currentMs), 'BACKUP_TIME_INVALID');
  const interval = resolvedInterval(env, intervalMs);
  const latest = (await service.list({ limit: 1 }))[0] || null;

  if (latest?.id && force !== true) {
    const verification = await service.verify({ id: latest.id });
    const latestMs = Date.parse(latest.createdAt || '');
    if (verification?.ok && Number.isFinite(latestMs) && currentMs - latestMs < interval) {
      return {
        ok: true,
        status: 'VERIFIED_CURRENT',
        id: latest.id,
        integritySha256: verification.integritySha256,
        nextDueAt: new Date(latestMs + interval).toISOString(),
      };
    }
  }

  const created = await service.create({ id: snapshotId(currentIso) }, { requestId: `scheduled-backup:${currentIso}` });
  const verification = await service.verify({ id: created.id });
  requireValue(verification?.ok, 'BACKUP_POST_PERSIST_VERIFY_FAILED', 503);
  return {
    ok: true,
    status: 'CREATED_VERIFIED',
    id: created.id,
    integritySha256: created.integritySha256,
    sourceCount: created.sourceCount,
    nextDueAt: new Date(currentMs + interval).toISOString(),
  };
}


/**
 * Explicit encrypted system backup service.
 *
 * The canonical scheduled path now also selects encryption automatically when both
 * MEL_BACKUP_ENCRYPTION_KEY_B64 and MEL_BACKUP_ENCRYPTION_KEY_ID are provisioned.
 * A partial encryption configuration fails closed instead of silently downgrading.
 */
export function createEncryptedSystemBackupService(env, { now = () => new Date().toISOString(), codec = null } = {}) {
  requireValue(env?.DB?.prepare, 'BACKUP_DB_UNAVAILABLE', 503);
  requireValue(env?.MEDIA_BUCKET?.put, 'BACKUP_R2_UNAVAILABLE', 503);
  const encryptionCodec = codec || createEnvBackupEncryptionCodec(env);
  return createVerifiedBackupService({
    now,
    storage: createR2D1BackupStorage({
      db: env.DB,
      bucket: env.MEDIA_BUCKET,
      encryptionCodec,
    }),
    sources: systemBackupSources(env),
  });
}
