import { SKILL_REGISTRY_SCHEMA, SkillRegistry } from './skill-registry.js';

function requiredText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export class D1SkillRegistryStore {
  constructor(db, { registryKey = 'system' } = {}) {
    if (!db) throw new Error('SKILL_REGISTRY_DB_REQUIRED');
    this.db = db;
    this.registryKey = requiredText(registryKey, 'SKILL_REGISTRY_KEY_REQUIRED');
    if (this.registryKey.length > 200) throw new Error('SKILL_REGISTRY_KEY_INVALID');
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_skill_registry_snapshots (
      registry_key TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    this._ready = true;
    return this;
  }

  async load() {
    await this.ready();
    const row = await this.db.prepare(
      'SELECT registry_key, schema_version, snapshot_json, checksum_sha256, updated_at FROM mel_skill_registry_snapshots WHERE registry_key=?'
    ).bind(this.registryKey).first();
    if (!row) return null;

    if (row.schema_version !== SKILL_REGISTRY_SCHEMA) {
      throw new Error('SKILL_REGISTRY_STORE_SCHEMA_MISMATCH');
    }

    const actualChecksum = await sha256(row.snapshot_json);
    if (actualChecksum !== row.checksum_sha256) {
      throw new Error('SKILL_REGISTRY_STORE_CHECKSUM_MISMATCH');
    }

    let snapshot;
    try {
      snapshot = JSON.parse(row.snapshot_json);
    } catch {
      throw new Error('SKILL_REGISTRY_STORE_CORRUPT');
    }

    if (snapshot?.schema !== SKILL_REGISTRY_SCHEMA) {
      throw new Error('SKILL_REGISTRY_STORE_SCHEMA_MISMATCH');
    }
    return clone(snapshot);
  }

  async save(snapshot) {
    await this.ready();
    if (!snapshot || snapshot.schema !== SKILL_REGISTRY_SCHEMA || !Array.isArray(snapshot.entries)) {
      throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
    }

    const snapshotJson = JSON.stringify(snapshot);
    const checksum = await sha256(snapshotJson);
    const updatedAt = Date.now();

    await this.db.prepare(`INSERT INTO mel_skill_registry_snapshots(
      registry_key, schema_version, snapshot_json, checksum_sha256, updated_at
    ) VALUES(?,?,?,?,?)
    ON CONFLICT(registry_key) DO UPDATE SET
      schema_version=excluded.schema_version,
      snapshot_json=excluded.snapshot_json,
      checksum_sha256=excluded.checksum_sha256,
      updated_at=excluded.updated_at`).bind(
      this.registryKey,
      SKILL_REGISTRY_SCHEMA,
      snapshotJson,
      checksum,
      updatedAt,
    ).run();

    return {
      registry_key: this.registryKey,
      schema: SKILL_REGISTRY_SCHEMA,
      checksum_sha256: checksum,
      updated_at: updatedAt,
    };
  }
}

export async function restoreD1SkillRegistry(db, options = {}) {
  const store = new D1SkillRegistryStore(db, options);
  return SkillRegistry.restore(store);
}
