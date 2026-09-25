import { port, requireValue } from '../core/contracts.js';
import { PLUGIN_STATES, transition } from '../core/lifecycle/extension.js';
import { validateManifest } from './validator.js';

export const methods = ['register', 'get', 'list', 'disable'];
export const createRegistry = adapters => port('plugins/registry', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function parseJson(value, code) {
  try {
    return JSON.parse(String(value));
  } catch {
    requireValue(false, code, 500);
  }
}

function pluginId(input = {}) {
  const value = input.plugin_id ?? input.id;
  requireValue(nonEmptyString(value), 'PLUGIN_REGISTRY_ID_REQUIRED', 400);
  return value.trim();
}

function versionId(pluginIdValue, version) {
  return `${pluginIdValue}@${version}`;
}

function normalizeProofs(value = {}) {
  requireValue(isRecord(value), 'PLUGIN_REGISTRY_PROOFS_INVALID', 400);
  return clone(value);
}

function normalizeRegistration(input = {}) {
  requireValue(isRecord(input), 'PLUGIN_REGISTRY_INPUT_INVALID', 400);
  const manifest = validateManifest(input.manifest, 'plugin');
  requireValue(nonEmptyString(input.artifact_hash), 'PLUGIN_REGISTRY_ARTIFACT_HASH_REQUIRED', 400);
  const status = input.status ?? 'DISCOVERED';
  requireValue(PLUGIN_STATES.includes(status), 'PLUGIN_REGISTRY_STATUS_INVALID', 400);
  return {
    manifest,
    artifact_hash: input.artifact_hash.trim(),
    proofs: normalizeProofs(input.proofs),
    status,
  };
}

function versionRecord(row) {
  requireValue(row, 'PLUGIN_REGISTRY_VERSION_NOT_FOUND', 404);
  const manifest = parseJson(row.manifest, 'PLUGIN_REGISTRY_MANIFEST_CORRUPT');
  const proofs = parseJson(row.proofs, 'PLUGIN_REGISTRY_PROOFS_CORRUPT');
  requireValue(isRecord(manifest) && isRecord(proofs), 'PLUGIN_REGISTRY_RECORD_CORRUPT', 500);

  let validated;
  try {
    validated = validateManifest(manifest, 'plugin');
  } catch {
    requireValue(false, 'PLUGIN_REGISTRY_MANIFEST_CORRUPT', 500);
  }

  return {
    id: String(row.id),
    plugin_id: String(row.plugin_id),
    version: String(row.version),
    manifest: validated,
    artifact_hash: String(row.artifact_hash),
    proofs,
    status: String(row.status),
    created_at: Number(row.created_at),
  };
}

function rootRecord(row, active = null) {
  requireValue(row, 'PLUGIN_REGISTRY_NOT_FOUND', 404);
  return {
    id: String(row.id),
    active_version: row.active_version == null ? null : String(row.active_version),
    status: String(row.status),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    active: active ? clone(active) : null,
  };
}

function normalizeList(input = {}) {
  requireValue(isRecord(input), 'PLUGIN_REGISTRY_LIST_INVALID', 400);
  const status = input.status;
  requireValue(status === undefined || PLUGIN_STATES.includes(status), 'PLUGIN_REGISTRY_STATUS_INVALID', 400);
  const plugin = input.plugin_id ?? input.id;
  requireValue(plugin === undefined || nonEmptyString(plugin), 'PLUGIN_REGISTRY_ID_REQUIRED', 400);
  const limit = input.limit ?? 100;
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'PLUGIN_REGISTRY_LIMIT_INVALID', 400);
  return {
    ...(plugin === undefined ? {} : { plugin_id: plugin.trim() }),
    ...(status === undefined ? {} : { status }),
    limit,
  };
}

/**
 * Durable plugin-version registry backed by the canonical plugins/plugin_versions
 * tables from migrations/0004_gen2_foundations.sql.
 *
 * Immutable identity fields (manifest + artifact hash) cannot be replaced for an
 * existing plugin/version. Re-registering the same state is idempotent; status
 * changes must follow the canonical plugin lifecycle and its proof gates.
 */
export function createD1PluginRegistryAdapter(db, { now = () => Date.now() } = {}) {
  requireValue(db && typeof db.prepare === 'function', 'PLUGIN_REGISTRY_D1_REQUIRED', 500);

  async function loadVersion(id, version) {
    const row = await db.prepare(`SELECT
      id, plugin_id, version, manifest, artifact_hash, proofs, status, created_at
      FROM plugin_versions WHERE plugin_id=? AND version=?`)
      .bind(id, version)
      .first();
    return row ? versionRecord(row) : null;
  }

  async function loadRoot(id) {
    return db.prepare(`SELECT id, active_version, status, created_at, updated_at
      FROM plugins WHERE id=?`).bind(id).first();
  }

  async function syncRoot(id, version, status) {
    const timestamp = now();
    const root = await loadRoot(id);
    if (!root) {
      await db.prepare(`INSERT INTO plugins(id, active_version, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(id, status === 'ACTIVE' ? version : null, status, timestamp, timestamp)
        .run();
      return;
    }

    if (status === 'ACTIVE') {
      await db.prepare('UPDATE plugins SET active_version=?, status=?, updated_at=? WHERE id=?')
        .bind(version, 'ACTIVE', timestamp, id)
        .run();
      return;
    }

    if (root.active_version === version && ['DISABLED', 'ROLLED_BACK'].includes(status)) {
      await db.prepare('UPDATE plugins SET active_version=NULL, status=?, updated_at=? WHERE id=?')
        .bind(status, timestamp, id)
        .run();
      return;
    }

    if (root.active_version == null) {
      await db.prepare('UPDATE plugins SET status=?, updated_at=? WHERE id=?')
        .bind(status, timestamp, id)
        .run();
    }
  }

  async function register(input = {}) {
    const candidate = normalizeRegistration(input);
    const id = candidate.manifest.id;
    const version = candidate.manifest.version;
    const existing = await loadVersion(id, version);

    if (!existing) {
      requireValue(candidate.status === 'DISCOVERED', 'PLUGIN_REGISTRY_INITIAL_STATE_INVALID', 409);
      const timestamp = now();

      await db.prepare(`INSERT OR IGNORE INTO plugins(
        id, active_version, status, created_at, updated_at
      ) VALUES (?, NULL, 'DISCOVERED', ?, ?)`).bind(id, timestamp, timestamp).run();

      const inserted = await db.prepare(`INSERT OR IGNORE INTO plugin_versions(
        id, plugin_id, version, manifest, artifact_hash, proofs, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        versionId(id, version),
        id,
        version,
        stableJson(candidate.manifest),
        candidate.artifact_hash,
        stableJson(candidate.proofs),
        'DISCOVERED',
        timestamp,
      ).run();

      if (Number(inserted?.meta?.changes || 0) === 0) {
        const raced = await loadVersion(id, version);
        requireValue(raced, 'PLUGIN_REGISTRY_VERSION_CONFLICT', 409);
        requireValue(
          stableJson(raced.manifest) === stableJson(candidate.manifest)
            && raced.artifact_hash === candidate.artifact_hash,
          'PLUGIN_REGISTRY_VERSION_CONFLICT',
          409,
        );
        return raced;
      }

      return loadVersion(id, version);
    }

    requireValue(
      stableJson(existing.manifest) === stableJson(candidate.manifest)
        && existing.artifact_hash === candidate.artifact_hash,
      'PLUGIN_REGISTRY_VERSION_CONFLICT',
      409,
    );

    if (existing.status === candidate.status) return existing;

    const next = transition(existing, candidate.status, candidate.proofs, 'plugin');
    await db.prepare(`UPDATE plugin_versions SET status=?, proofs=?
      WHERE plugin_id=? AND version=?`).bind(
      next.status,
      stableJson(candidate.proofs),
      id,
      version,
    ).run();
    await syncRoot(id, version, next.status);
    return loadVersion(id, version);
  }

  async function get(input = {}) {
    const id = pluginId(input);
    if (input.version !== undefined) {
      requireValue(nonEmptyString(input.version), 'PLUGIN_REGISTRY_VERSION_REQUIRED', 400);
      const row = await loadVersion(id, input.version.trim());
      requireValue(row, 'PLUGIN_REGISTRY_VERSION_NOT_FOUND', 404);
      return row;
    }

    const root = await loadRoot(id);
    requireValue(root, 'PLUGIN_REGISTRY_NOT_FOUND', 404);
    const active = root.active_version ? await loadVersion(id, String(root.active_version)) : null;
    return rootRecord(root, active);
  }

  async function list(input = {}) {
    const query = normalizeList(input);
    const clauses = [];
    const values = [];

    if (query.plugin_id !== undefined) {
      clauses.push('plugin_id=?');
      values.push(query.plugin_id);
    }
    if (query.status !== undefined) {
      clauses.push('status=?');
      values.push(query.status);
    }

    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    values.push(query.limit);
    const result = await db.prepare(`SELECT
      id, plugin_id, version, manifest, artifact_hash, proofs, status, created_at
      FROM plugin_versions${where}
      ORDER BY created_at DESC, plugin_id ASC, version ASC
      LIMIT ?`).bind(...values).all();

    return (result?.results || []).map(versionRecord);
  }

  async function disable(input = {}) {
    const id = pluginId(input);
    const root = await loadRoot(id);
    requireValue(root, 'PLUGIN_REGISTRY_NOT_FOUND', 404);
    const targetVersion = input.version === undefined ? root.active_version : input.version;
    requireValue(nonEmptyString(targetVersion), 'PLUGIN_REGISTRY_NOT_ACTIVE', 409);

    const current = await loadVersion(id, String(targetVersion).trim());
    requireValue(current, 'PLUGIN_REGISTRY_VERSION_NOT_FOUND', 404);
    const next = transition(current, 'DISABLED', {}, 'plugin');

    await db.prepare('UPDATE plugin_versions SET status=? WHERE plugin_id=? AND version=?')
      .bind(next.status, id, current.version)
      .run();
    await syncRoot(id, current.version, next.status);
    return loadVersion(id, current.version);
  }

  return Object.freeze({ register, get, list, disable });
}
