import { DomainError, requireValue } from '../core/contracts.js';
import {
  CONNECTOR_CATALOG_SCHEMA,
  ConnectorCatalog,
} from './connector-catalog.js';

function connectorError(code, status = 500) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function parseSnapshot(value) {
  let snapshot;
  try {
    snapshot = JSON.parse(value || '{}');
  } catch {
    throw connectorError('CONNECTOR_CATALOG_STORE_CORRUPT', 500);
  }
  if (snapshot?.schema !== CONNECTOR_CATALOG_SCHEMA) {
    throw connectorError('CONNECTOR_CATALOG_STORE_SCHEMA_MISMATCH', 500);
  }
  // Reuse the canonical import validator as the authoritative structural gate.
  new ConnectorCatalog({ snapshot });
  return snapshot;
}

export class D1ConnectorCatalogStore {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db) throw connectorError('CONNECTOR_CATALOG_DB_REQUIRED', 503);
    this.db = db;
    this.now = now;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_connector_catalogs (
      owner TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    this._ready = true;
    return this;
  }

  async load(owner) {
    await this.ready();
    const normalizedOwner = text(owner);
    requireValue(normalizedOwner, 'CONNECTOR_CATALOG_OWNER_REQUIRED', 401);
    const row = await this.db.prepare(
      'SELECT owner,schema_version,snapshot_json,checksum_sha256,revision,updated_at FROM mel_connector_catalogs WHERE owner=?'
    ).bind(normalizedOwner).first();
    if (!row) return null;

    requireValue(row.schema_version === CONNECTOR_CATALOG_SCHEMA, 'CONNECTOR_CATALOG_STORE_SCHEMA_MISMATCH', 500);
    const actual = await sha256(row.snapshot_json);
    requireValue(actual === row.checksum_sha256, 'CONNECTOR_CATALOG_STORE_CHECKSUM_MISMATCH', 500);
    const snapshot = parseSnapshot(row.snapshot_json);
    return Object.freeze({
      owner: normalizedOwner,
      snapshot: structuredClone(snapshot),
      checksum_sha256: row.checksum_sha256,
      revision: Number(row.revision),
      updated_at: Number(row.updated_at),
    });
  }

  async save(owner, snapshot, { expectedChecksum = null } = {}) {
    await this.ready();
    const normalizedOwner = text(owner);
    requireValue(normalizedOwner, 'CONNECTOR_CATALOG_OWNER_REQUIRED', 401);

    // Validate through the canonical catalog before persistence.
    const validated = new ConnectorCatalog({ snapshot }).exportSnapshot();
    const snapshotJson = stableJson(validated);
    const checksum = await sha256(snapshotJson);
    const current = await this.db.prepare(
      'SELECT checksum_sha256,revision FROM mel_connector_catalogs WHERE owner=?'
    ).bind(normalizedOwner).first();
    const at = this.now();

    if (!current) {
      requireValue(expectedChecksum == null, 'CONNECTOR_CATALOG_STORE_CONFLICT', 409);
      try {
        await this.db.prepare(`INSERT INTO mel_connector_catalogs(
          owner,schema_version,snapshot_json,checksum_sha256,revision,updated_at
        ) VALUES(?,?,?,?,?,?)`).bind(
          normalizedOwner,
          CONNECTOR_CATALOG_SCHEMA,
          snapshotJson,
          checksum,
          1,
          at,
        ).run();
      } catch (error) {
        const raced = await this.db.prepare(
          'SELECT checksum_sha256 FROM mel_connector_catalogs WHERE owner=?'
        ).bind(normalizedOwner).first();
        if (raced) throw connectorError('CONNECTOR_CATALOG_STORE_CONFLICT', 409);
        throw error;
      }
      return this.load(normalizedOwner);
    }

    requireValue(
      expectedChecksum != null && text(expectedChecksum) === text(current.checksum_sha256),
      'CONNECTOR_CATALOG_STORE_CONFLICT',
      409,
    );

    const nextRevision = Number(current.revision || 0) + 1;
    const result = await this.db.prepare(`UPDATE mel_connector_catalogs
      SET schema_version=?,snapshot_json=?,checksum_sha256=?,revision=?,updated_at=?
      WHERE owner=? AND checksum_sha256=?`).bind(
      CONNECTOR_CATALOG_SCHEMA,
      snapshotJson,
      checksum,
      nextRevision,
      at,
      normalizedOwner,
      current.checksum_sha256,
    ).run();
    requireValue(Boolean(result?.meta?.changes), 'CONNECTOR_CATALOG_STORE_CONFLICT', 409);
    return this.load(normalizedOwner);
  }
}

export class PersistentConnectorCatalog {
  constructor({
    store,
    owner,
    healthProbe = null,
    catalog = null,
    checksum = null,
    revision = 0,
  } = {}) {
    if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
      throw new Error('CONNECTOR_CATALOG_STORE_REQUIRED');
    }
    this.store = store;
    this.owner = text(owner);
    if (!this.owner) throw new Error('CONNECTOR_CATALOG_OWNER_REQUIRED');
    this.healthProbe = healthProbe;
    this.catalog = catalog || new ConnectorCatalog({ healthProbe });
    this.checksum = checksum;
    this.revision = revision;
  }

  static async restore({ store, owner, healthProbe = null } = {}) {
    if (!store || typeof store.load !== 'function') throw new Error('CONNECTOR_CATALOG_STORE_REQUIRED');
    const normalizedOwner = text(owner);
    if (!normalizedOwner) throw new Error('CONNECTOR_CATALOG_OWNER_REQUIRED');
    const persisted = await store.load(normalizedOwner);
    return new PersistentConnectorCatalog({
      store,
      owner: normalizedOwner,
      healthProbe,
      catalog: new ConnectorCatalog({
        healthProbe,
        ...(persisted ? { snapshot: persisted.snapshot } : {}),
      }),
      checksum: persisted?.checksum_sha256 || null,
      revision: persisted?.revision || 0,
    });
  }

  async #persist() {
    try {
      const persisted = await this.store.save(
        this.owner,
        this.catalog.exportSnapshot(),
        { expectedChecksum: this.checksum },
      );
      this.checksum = persisted.checksum_sha256;
      this.revision = persisted.revision;
      return persisted;
    } catch (error) {
      if (error?.code === 'CONNECTOR_CATALOG_STORE_CONFLICT'
        || error?.message === 'CONNECTOR_CATALOG_STORE_CONFLICT') {
        const latest = await this.store.load(this.owner);
        this.catalog = new ConnectorCatalog({
          healthProbe: this.healthProbe,
          ...(latest ? { snapshot: latest.snapshot } : {}),
        });
        this.checksum = latest?.checksum_sha256 || null;
        this.revision = latest?.revision || 0;
      }
      throw error;
    }
  }

  async #mutate(action) {
    const before = this.catalog.exportSnapshot();
    let result;
    try {
      result = await action();
      await this.#persist();
      return result;
    } catch (error) {
      // If #persist already resynchronized after a concurrency conflict, keep
      // that latest state. Otherwise rollback the local mutation.
      if (error?.code !== 'CONNECTOR_CATALOG_STORE_CONFLICT'
        && error?.message !== 'CONNECTOR_CATALOG_STORE_CONFLICT') {
        this.catalog = new ConnectorCatalog({
          healthProbe: this.healthProbe,
          snapshot: before,
        });
      }
      throw error;
    }
  }

  register(manifest) {
    return this.#mutate(() => this.catalog.register(manifest));
  }

  install(input) {
    return this.#mutate(() => this.catalog.install(input));
  }

  checkHealth(id) {
    return this.#mutate(() => this.catalog.checkHealth(id));
  }

  enable(id) {
    return this.#mutate(() => this.catalog.enable(id));
  }

  disable(id) {
    return this.#mutate(() => this.catalog.disable(id));
  }

  discover(input = {}) {
    return this.catalog.discover(input);
  }

  get(id) {
    return this.catalog.get(id);
  }

  listInstalled(input = {}) {
    return this.catalog.listInstalled(input);
  }

  exportSnapshot() {
    return this.catalog.exportSnapshot();
  }

  state() {
    return Object.freeze({
      owner: this.owner,
      checksum_sha256: this.checksum,
      revision: this.revision,
      connector_count: this.catalog.listInstalled().length,
    });
  }

  async refresh() {
    const latest = await this.store.load(this.owner);
    this.catalog = new ConnectorCatalog({
      healthProbe: this.healthProbe,
      ...(latest ? { snapshot: latest.snapshot } : {}),
    });
    this.checksum = latest?.checksum_sha256 || null;
    this.revision = latest?.revision || 0;
    return this.state();
  }
}

export function createD1ConnectorCatalogStore(db, options = {}) {
  return new D1ConnectorCatalogStore(db, options);
}
