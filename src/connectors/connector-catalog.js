const SCHEMA = 'mel.connector-catalog/v1';
const INSTALL_STATES = new Set(['installed', 'enabled', 'disabled']);
const HEALTH_STATES = new Set(['unknown', 'healthy', 'degraded', 'failed']);
const AUTH_MODES = new Set(['none', 'oauth2', 'api_key', 'custom']);
const SECRET_KEY_RE = /(secret|password|credential|access[_-]?token|refresh[_-]?token|private[_-]?key|api[_-]?token)/i;

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function clone(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function normalizeStrings(values, code, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) throw new Error(code);
  const normalized = [...new Set(values.map(value => required(value, code)))];
  normalized.sort();
  return normalized;
}

function assertNoSecrets(value, path = 'manifest') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) throw new Error('CONNECTOR_CATALOG_SECRET_FIELD_FORBIDDEN');
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function normalizeManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('CONNECTOR_CATALOG_MANIFEST_INVALID');
  }
  assertNoSecrets(input);

  const id = required(input.id, 'CONNECTOR_CATALOG_ID_REQUIRED');
  const name = required(input.name, 'CONNECTOR_CATALOG_NAME_REQUIRED');
  const version = required(input.version, 'CONNECTOR_CATALOG_VERSION_REQUIRED');
  const capabilities = normalizeStrings(input.capabilities, 'CONNECTOR_CATALOG_CAPABILITIES_REQUIRED', { allowEmpty: false });
  const auth = input.auth || 'none';
  if (!AUTH_MODES.has(auth)) throw new Error('CONNECTOR_CATALOG_AUTH_MODE_INVALID');

  const requiredScopes = normalizeStrings(input.scopes?.required || [], 'CONNECTOR_CATALOG_SCOPE_INVALID');
  const optionalScopes = normalizeStrings(input.scopes?.optional || [], 'CONNECTOR_CATALOG_SCOPE_INVALID')
    .filter(scope => !requiredScopes.includes(scope));
  const metadata = input.metadata === undefined ? {} : input.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('CONNECTOR_CATALOG_METADATA_INVALID');
  }

  return freezeDeep({
    id,
    name,
    version,
    capabilities,
    auth,
    scopes: freezeDeep({ required: requiredScopes, optional: optionalScopes }),
    metadata: clone(metadata)
  });
}

function connectorKey(id, version) {
  return `${id}@${version}`;
}

function publicValue(value) {
  return freezeDeep(clone(value));
}

function normalizeProbeResult(result) {
  if (!result || typeof result !== 'object' || !HEALTH_STATES.has(result.status) || result.status === 'unknown') {
    return freezeDeep({ status: 'failed', code: 'INVALID_PROBE_RESULT', latency_ms: null });
  }
  const latency = Number.isFinite(result.latency_ms) && result.latency_ms >= 0
    ? Math.round(result.latency_ms)
    : null;
  const code = typeof result.code === 'string' && result.code.trim()
    ? result.code.trim().slice(0, 80)
    : null;
  return freezeDeep({ status: result.status, code, latency_ms: latency });
}

export class ConnectorCatalog {
  constructor({ healthProbe = null, snapshot = null } = {}) {
    this.manifests = new Map();
    this.installations = new Map();
    this.healthProbe = healthProbe;
    this.sequence = 0;
    if (snapshot) this.importSnapshot(snapshot);
  }

  register(manifestInput) {
    const manifest = normalizeManifest(manifestInput);
    const key = connectorKey(manifest.id, manifest.version);
    const existing = this.manifests.get(key);
    if (existing) {
      if (stableJson(existing) !== stableJson(manifest)) throw new Error('CONNECTOR_CATALOG_VERSION_CONFLICT');
      return publicValue(existing);
    }
    this.manifests.set(key, manifest);
    return publicValue(manifest);
  }

  discover({ capability = null, auth = null } = {}) {
    if (auth && !AUTH_MODES.has(auth)) throw new Error('CONNECTOR_CATALOG_AUTH_MODE_INVALID');
    const rows = [...this.manifests.values()]
      .filter(manifest => !capability || manifest.capabilities.includes(capability))
      .filter(manifest => !auth || manifest.auth === auth)
      .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))
      .map(publicValue);
    return freezeDeep(rows);
  }

  install({ id, version, grantedScopes = [] }) {
    const normalizedId = required(id, 'CONNECTOR_CATALOG_ID_REQUIRED');
    const normalizedVersion = required(version, 'CONNECTOR_CATALOG_VERSION_REQUIRED');
    const manifest = this.manifests.get(connectorKey(normalizedId, normalizedVersion));
    if (!manifest) throw new Error('CONNECTOR_CATALOG_MANIFEST_NOT_FOUND');

    const granted = normalizeStrings(grantedScopes, 'CONNECTOR_CATALOG_SCOPE_INVALID');
    const declared = new Set([...manifest.scopes.required, ...manifest.scopes.optional]);
    if (granted.some(scope => !declared.has(scope))) throw new Error('CONNECTOR_CATALOG_SCOPE_UNDECLARED');
    if (manifest.scopes.required.some(scope => !granted.includes(scope))) {
      throw new Error('CONNECTOR_CATALOG_REQUIRED_SCOPE_MISSING');
    }

    const existing = this.installations.get(normalizedId);
    if (existing) {
      const same = existing.version === normalizedVersion && stableJson(existing.granted_scopes) === stableJson(granted);
      if (!same) throw new Error('CONNECTOR_CATALOG_INSTALL_CONFLICT');
      return publicValue(existing);
    }

    const record = freezeDeep({
      connector_id: normalizedId,
      version: normalizedVersion,
      state: 'installed',
      granted_scopes: granted,
      health: freezeDeep({ status: 'unknown', code: null, latency_ms: null, checked_sequence: null }),
      sequence: ++this.sequence
    });
    this.installations.set(normalizedId, record);
    return publicValue(record);
  }

  get(id) {
    const normalizedId = required(id, 'CONNECTOR_CATALOG_ID_REQUIRED');
    const record = this.installations.get(normalizedId);
    if (!record) throw new Error('CONNECTOR_CATALOG_NOT_INSTALLED');
    return publicValue(record);
  }

  listInstalled({ state = null } = {}) {
    if (state && !INSTALL_STATES.has(state)) throw new Error('CONNECTOR_CATALOG_STATE_INVALID');
    const rows = [...this.installations.values()]
      .filter(record => !state || record.state === state)
      .sort((a, b) => a.sequence - b.sequence)
      .map(publicValue);
    return freezeDeep(rows);
  }

  async checkHealth(id) {
    const normalizedId = required(id, 'CONNECTOR_CATALOG_ID_REQUIRED');
    const record = this.installations.get(normalizedId);
    if (!record) throw new Error('CONNECTOR_CATALOG_NOT_INSTALLED');
    if (typeof this.healthProbe !== 'function') throw new Error('CONNECTOR_CATALOG_HEALTH_PROBE_REQUIRED');

    const manifest = this.manifests.get(connectorKey(normalizedId, record.version));
    let health;
    try {
      health = normalizeProbeResult(await this.healthProbe(publicValue(manifest), publicValue(record)));
    } catch {
      health = freezeDeep({ status: 'failed', code: 'PROBE_FAILED', latency_ms: null });
    }

    const next = freezeDeep({
      ...record,
      health: freezeDeep({ ...health, checked_sequence: ++this.sequence })
    });
    this.installations.set(normalizedId, next);
    return publicValue(next.health);
  }

  enable(id) {
    const normalizedId = required(id, 'CONNECTOR_CATALOG_ID_REQUIRED');
    const record = this.installations.get(normalizedId);
    if (!record) throw new Error('CONNECTOR_CATALOG_NOT_INSTALLED');
    if (record.health.status !== 'healthy') throw new Error('CONNECTOR_CATALOG_HEALTH_REQUIRED');

    const manifest = this.manifests.get(connectorKey(normalizedId, record.version));
    if (manifest.scopes.required.some(scope => !record.granted_scopes.includes(scope))) {
      throw new Error('CONNECTOR_CATALOG_REQUIRED_SCOPE_MISSING');
    }
    if (record.state === 'enabled') return publicValue(record);

    const next = freezeDeep({ ...record, state: 'enabled' });
    this.installations.set(normalizedId, next);
    return publicValue(next);
  }

  disable(id) {
    const normalizedId = required(id, 'CONNECTOR_CATALOG_ID_REQUIRED');
    const record = this.installations.get(normalizedId);
    if (!record) throw new Error('CONNECTOR_CATALOG_NOT_INSTALLED');
    if (record.state === 'disabled') return publicValue(record);
    const next = freezeDeep({ ...record, state: 'disabled' });
    this.installations.set(normalizedId, next);
    return publicValue(next);
  }

  exportSnapshot() {
    const manifests = [...this.manifests.values()]
      .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))
      .map(publicValue);
    const installations = [...this.installations.values()]
      .sort((a, b) => a.sequence - b.sequence)
      .map(publicValue);
    return freezeDeep({ schema: SCHEMA, manifests, installations });
  }

  importSnapshot(snapshot) {
    if (snapshot?.schema !== SCHEMA || !Array.isArray(snapshot.manifests) || !Array.isArray(snapshot.installations)) {
      throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
    }
    if (this.manifests.size || this.installations.size) throw new Error('CONNECTOR_CATALOG_IMPORT_REQUIRES_EMPTY');

    for (const manifest of snapshot.manifests) this.register(manifest);
    for (const record of snapshot.installations) {
      if (!INSTALL_STATES.has(record.state)) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      const manifest = this.manifests.get(connectorKey(record.connector_id, record.version));
      if (!manifest) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      const declared = new Set([...manifest.scopes.required, ...manifest.scopes.optional]);
      const granted = normalizeStrings(record.granted_scopes, 'CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      if (granted.some(scope => !declared.has(scope))) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      if (manifest.scopes.required.some(scope => !granted.includes(scope))) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      const health = record.health;
      if (!health || !HEALTH_STATES.has(health.status)) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      if (record.state === 'enabled' && health.status !== 'healthy') throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      const sequence = Number(record.sequence);
      if (!Number.isInteger(sequence) || sequence < 1) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      const restored = freezeDeep({
        connector_id: record.connector_id,
        version: record.version,
        state: record.state,
        granted_scopes: granted,
        health: freezeDeep({
          status: health.status,
          code: typeof health.code === 'string' ? health.code : null,
          latency_ms: Number.isFinite(health.latency_ms) ? health.latency_ms : null,
          checked_sequence: Number.isInteger(health.checked_sequence) ? health.checked_sequence : null
        }),
        sequence
      });
      if (this.installations.has(record.connector_id)) throw new Error('CONNECTOR_CATALOG_SNAPSHOT_INVALID');
      this.installations.set(record.connector_id, restored);
      this.sequence = Math.max(this.sequence, sequence, restored.health.checked_sequence || 0);
    }
    return this;
  }
}

export const CONNECTOR_CATALOG_SCHEMA = SCHEMA;
