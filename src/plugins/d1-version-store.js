import { DomainError, requireValue } from '../core/contracts.js';
import { validateManifest } from './validator.js';

function pluginError(code, status = 500) {
  return new DomainError(code, status);
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function text(value) {
  return String(value ?? '').trim();
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    throw pluginError(code, 500);
  }
}

async function recordFromRow(row) {
  if (!row) return null;
  const manifest = parseJson(row.manifest_json, 'PLUGIN_MANIFEST_STORE_CORRUPT');
  const evidence = parseJson(row.evidence_json || '{}', 'PLUGIN_EVIDENCE_STORE_CORRUPT');
  const valid = validateManifest(manifest, 'plugin');
  requireValue(valid.id === row.plugin_id && valid.version === row.version, 'PLUGIN_STORE_IDENTITY_MISMATCH', 500);

  const checksum = await sha256(row.manifest_json);
  requireValue(checksum === row.manifest_sha256, 'PLUGIN_MANIFEST_CHECKSUM_MISMATCH', 500);

  return clone({
    plugin_id: row.plugin_id,
    version: row.version,
    status: row.status,
    manifest: valid,
    artifact_ref: row.artifact_ref,
    artifact_digest: row.artifact_digest || null,
    evidence,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  });
}

/**
 * Durable control-plane storage. Executable plugin code is intentionally not
 * persisted in D1; only identity, manifest, artifact references and evidence.
 */
export class D1PluginVersionStore {
  constructor(db) {
    if (!db) throw pluginError('PLUGIN_DB_REQUIRED', 503);
    this.db = db;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS plugin_versions (
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      manifest_sha256 TEXT NOT NULL,
      artifact_ref TEXT NOT NULL,
      artifact_digest TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(plugin_id, version)
    )`).run();

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS plugin_active_versions (
      plugin_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      previous_version TEXT
    )`).run();

    await this.db.prepare(`CREATE TABLE IF NOT EXISTS plugin_activation_history (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      previous_version TEXT
    )`).run();

    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_plugin_versions_status ON plugin_versions(plugin_id,status,updated_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_plugin_activation_history ON plugin_activation_history(plugin_id,sequence)').run();
    this._ready = true;
    return this;
  }

  async putVersion(record, { createOnly = false } = {}) {
    await this.ready();
    requireValue(record && typeof record === 'object' && !Array.isArray(record), 'PLUGIN_RECORD_REQUIRED', 400);

    const manifest = validateManifest(record.manifest, 'plugin');
    requireValue(text(record.plugin_id) === manifest.id, 'PLUGIN_RECORD_ID_MISMATCH', 400);
    requireValue(text(record.version) === manifest.version, 'PLUGIN_RECORD_VERSION_MISMATCH', 400);
    requireValue(text(record.status), 'PLUGIN_RECORD_STATUS_REQUIRED', 400);
    requireValue(text(record.artifact_ref), 'PLUGIN_ARTIFACT_REF_REQUIRED', 400);
    requireValue(Number.isFinite(Number(record.created_at)), 'PLUGIN_RECORD_CREATED_AT_REQUIRED', 400);
    requireValue(Number.isFinite(Number(record.updated_at)), 'PLUGIN_RECORD_UPDATED_AT_REQUIRED', 400);

    const manifestJson = JSON.stringify(manifest);
    const checksum = await sha256(manifestJson);
    const evidenceJson = JSON.stringify(record.evidence || {});

    if (createOnly) {
      try {
        await this.db.prepare(`INSERT INTO plugin_versions(
          plugin_id,version,status,manifest_json,manifest_sha256,artifact_ref,
          artifact_digest,evidence_json,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
          manifest.id,
          manifest.version,
          record.status,
          manifestJson,
          checksum,
          record.artifact_ref,
          record.artifact_digest || null,
          evidenceJson,
          Number(record.created_at),
          Number(record.updated_at),
        ).run();
      } catch (error) {
        const existing = await this.getVersion(manifest.id, manifest.version);
        if (existing) throw pluginError('PLUGIN_VERSION_EXISTS', 409);
        throw error;
      }
      return this.getVersion(manifest.id, manifest.version);
    }

    const existing = await this.getVersion(manifest.id, manifest.version);
    requireValue(existing, 'PLUGIN_VERSION_NOT_FOUND', 404);
    requireValue(
      existing.manifest.id === manifest.id
        && existing.manifest.version === manifest.version
        && existing.artifact_ref === record.artifact_ref,
      'PLUGIN_VERSION_IMMUTABLE_IDENTITY_MISMATCH',
      409,
    );

    await this.db.prepare(`UPDATE plugin_versions SET
      status=?,
      manifest_json=?,
      manifest_sha256=?,
      artifact_digest=?,
      evidence_json=?,
      updated_at=?
      WHERE plugin_id=? AND version=?`).bind(
      record.status,
      manifestJson,
      checksum,
      record.artifact_digest || null,
      evidenceJson,
      Number(record.updated_at),
      manifest.id,
      manifest.version,
    ).run();
    return this.getVersion(manifest.id, manifest.version);
  }

  async getVersion(pluginId, version) {
    await this.ready();
    const id = text(pluginId);
    const v = text(version);
    if (!id || !v) return null;
    const row = await this.db.prepare(
      'SELECT * FROM plugin_versions WHERE plugin_id=? AND version=?'
    ).bind(id, v).first();
    return recordFromRow(row);
  }

  async listVersions(pluginId) {
    await this.ready();
    const id = text(pluginId);
    requireValue(id, 'PLUGIN_ID_REQUIRED', 400);
    const result = await this.db.prepare(
      'SELECT * FROM plugin_versions WHERE plugin_id=? ORDER BY created_at ASC, version ASC'
    ).bind(id).all();
    const rows = [];
    for (const row of result.results || []) rows.push(await recordFromRow(row));
    return rows;
  }

  async getActive(pluginId) {
    await this.ready();
    const id = text(pluginId);
    requireValue(id, 'PLUGIN_ID_REQUIRED', 400);
    const row = await this.db.prepare(
      'SELECT plugin_id,version,activated_at,previous_version FROM plugin_active_versions WHERE plugin_id=?'
    ).bind(id).first();
    if (!row) return null;
    const version = await this.getVersion(id, row.version);
    requireValue(version, 'PLUGIN_ACTIVE_VERSION_MISSING', 500);
    return {
      plugin_id: id,
      version: row.version,
      activated_at: Number(row.activated_at),
      previous_version: row.previous_version || null,
      record: version,
    };
  }

  async setActive(pluginId, version, {
    activated_at = Date.now(),
    previous_version = null,
  } = {}) {
    await this.ready();
    const id = text(pluginId);
    const v = text(version);
    requireValue(id && v, 'PLUGIN_ACTIVE_IDENTITY_REQUIRED', 400);
    const record = await this.getVersion(id, v);
    requireValue(record?.status === 'ACTIVE', 'PLUGIN_ACTIVE_RECORD_REQUIRED', 409);

    await this.db.prepare(`INSERT INTO plugin_active_versions(
      plugin_id,version,activated_at,previous_version
    ) VALUES(?,?,?,?)
    ON CONFLICT(plugin_id) DO UPDATE SET
      version=excluded.version,
      activated_at=excluded.activated_at,
      previous_version=excluded.previous_version`).bind(
      id,
      v,
      Number(activated_at),
      previous_version || null,
    ).run();

    await this.db.prepare(`INSERT INTO plugin_activation_history(
      plugin_id,version,action,occurred_at,previous_version
    ) VALUES(?,?,?,?,?)`).bind(
      id,
      v,
      'ACTIVATE',
      Number(activated_at),
      previous_version || null,
    ).run();

    return this.getActive(id);
  }

  async clearActive(pluginId, { at = Date.now() } = {}) {
    await this.ready();
    const id = text(pluginId);
    requireValue(id, 'PLUGIN_ID_REQUIRED', 400);
    const active = await this.getActive(id);
    if (!active) return null;

    await this.db.prepare('DELETE FROM plugin_active_versions WHERE plugin_id=?').bind(id).run();
    await this.db.prepare(`INSERT INTO plugin_activation_history(
      plugin_id,version,action,occurred_at,previous_version
    ) VALUES(?,?,?,?,?)`).bind(
      id,
      active.version,
      'CLEAR_ACTIVE',
      Number(at),
      active.previous_version || null,
    ).run();
    return active;
  }

  async activationHistory(pluginId, { limit = 100 } = {}) {
    await this.ready();
    const id = text(pluginId);
    requireValue(id, 'PLUGIN_ID_REQUIRED', 400);
    const capped = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)));
    const result = await this.db.prepare(`SELECT
      sequence,plugin_id,version,action,occurred_at,previous_version
      FROM plugin_activation_history
      WHERE plugin_id=?
      ORDER BY sequence ASC
      LIMIT ?`).bind(id, capped).all();

    return (result.results || []).map(row => ({
      sequence: Number(row.sequence),
      plugin_id: row.plugin_id,
      version: row.version,
      action: row.action,
      occurred_at: Number(row.occurred_at),
      previous_version: row.previous_version || null,
    }));
  }
}

export function createD1PluginVersionStore(db) {
  return new D1PluginVersionStore(db);
}
