const SCHEMA = 'mel.skill-registry/v1';
const STATES = new Set(['candidate', 'verified', 'deprecated']);

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

function normalizeCapabilities(capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new Error('SKILL_REGISTRY_CAPABILITIES_REQUIRED');
  }
  const values = [...new Set(capabilities.map(value => required(value, 'SKILL_REGISTRY_CAPABILITY_INVALID')))];
  values.sort();
  return values;
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) throw new Error('SKILL_REGISTRY_EVIDENCE_INVALID');
  return evidence.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('SKILL_REGISTRY_EVIDENCE_INVALID');
    }
    const id = required(entry.id, 'SKILL_REGISTRY_EVIDENCE_ID_REQUIRED');
    const status = required(entry.status, 'SKILL_REGISTRY_EVIDENCE_STATUS_REQUIRED');
    return freezeDeep({ ...clone(entry), id, status, sequence: index + 1 });
  });
}

function isVerified(record) {
  return record.state === 'verified' && record.evidence.some(entry => entry.status === 'verified' || entry.status === 'pass');
}

function publicRecord(record) {
  return freezeDeep(clone(record));
}

export class SkillRegistry {
  constructor({ snapshot = null, store = null } = {}) {
    this.entries = new Map();
    this.active = new Map();
    this.activationHistory = new Map();
    this.sequence = 0;
    this.store = store;
    if (snapshot) this.importSnapshot(snapshot);
  }

  register({ skillId, name, version, capabilities, state = 'candidate', evidence = [], metadata = {} }) {
    const normalizedSkillId = required(skillId, 'SKILL_REGISTRY_ID_REQUIRED');
    const normalizedName = required(name, 'SKILL_REGISTRY_NAME_REQUIRED');
    const normalizedVersion = required(version, 'SKILL_REGISTRY_VERSION_REQUIRED');
    if (!STATES.has(state)) throw new Error('SKILL_REGISTRY_STATE_INVALID');
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('SKILL_REGISTRY_METADATA_INVALID');
    }

    const record = freezeDeep({
      skill_id: normalizedSkillId,
      name: normalizedName,
      version: normalizedVersion,
      capabilities: normalizeCapabilities(capabilities),
      state,
      evidence: normalizeEvidence(evidence),
      metadata: clone(metadata),
      sequence: this.sequence + 1
    });

    const versions = this.entries.get(normalizedSkillId) || new Map();
    const existing = versions.get(normalizedVersion);
    if (existing) {
      const comparableExisting = { ...existing, sequence: record.sequence };
      if (stableJson(comparableExisting) !== stableJson(record)) {
        throw new Error('SKILL_REGISTRY_VERSION_CONFLICT');
      }
      return publicRecord(existing);
    }

    this.sequence += 1;
    versions.set(normalizedVersion, record);
    this.entries.set(normalizedSkillId, versions);
    return publicRecord(record);
  }

  activate(skillId, version) {
    const normalizedSkillId = required(skillId, 'SKILL_REGISTRY_ID_REQUIRED');
    const normalizedVersion = required(version, 'SKILL_REGISTRY_VERSION_REQUIRED');
    const record = this.entries.get(normalizedSkillId)?.get(normalizedVersion);
    if (!record) throw new Error('SKILL_REGISTRY_VERSION_NOT_FOUND');
    if (!isVerified(record)) throw new Error('SKILL_REGISTRY_VERSION_NOT_VERIFIED');

    const previous = this.active.get(normalizedSkillId) || null;
    this.active.set(normalizedSkillId, normalizedVersion);
    const history = this.activationHistory.get(normalizedSkillId) || [];
    if (history.at(-1) !== normalizedVersion) history.push(normalizedVersion);
    this.activationHistory.set(normalizedSkillId, history);
    return freezeDeep({ skill_id: normalizedSkillId, previous, active: normalizedVersion });
  }

  resolve(skillId, version = null) {
    const normalizedSkillId = required(skillId, 'SKILL_REGISTRY_ID_REQUIRED');
    const selected = version || this.active.get(normalizedSkillId);
    if (!selected) throw new Error('SKILL_REGISTRY_NO_ACTIVE_VERSION');
    const record = this.entries.get(normalizedSkillId)?.get(selected);
    if (!record) throw new Error('SKILL_REGISTRY_VERSION_NOT_FOUND');
    return publicRecord(record);
  }

  history(skillId) {
    const normalizedSkillId = required(skillId, 'SKILL_REGISTRY_ID_REQUIRED');
    const records = [...(this.entries.get(normalizedSkillId)?.values() || [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map(publicRecord);
    return freezeDeep(records);
  }

  list({ capability = null, activeOnly = false } = {}) {
    const rows = [];
    for (const [skillId, versions] of this.entries) {
      for (const record of versions.values()) {
        if (activeOnly && this.active.get(skillId) !== record.version) continue;
        if (capability && !record.capabilities.includes(capability)) continue;
        rows.push(publicRecord(record));
      }
    }
    rows.sort((a, b) => a.sequence - b.sequence);
    return freezeDeep(rows);
  }

  rollback(skillId, targetVersion = null) {
    const normalizedSkillId = required(skillId, 'SKILL_REGISTRY_ID_REQUIRED');
    if (targetVersion) return this.activate(normalizedSkillId, targetVersion);

    const history = [...(this.activationHistory.get(normalizedSkillId) || [])];
    if (history.length < 2) throw new Error('SKILL_REGISTRY_NO_ROLLBACK_TARGET');
    const current = history.pop();
    const previous = history.at(-1);
    this.activationHistory.set(normalizedSkillId, history);
    this.active.set(normalizedSkillId, previous);
    return freezeDeep({ skill_id: normalizedSkillId, previous: current, active: previous });
  }

  exportSnapshot() {
    const entries = [];
    for (const versions of this.entries.values()) {
      for (const record of versions.values()) entries.push(publicRecord(record));
    }
    entries.sort((a, b) => a.sequence - b.sequence);
    return freezeDeep({
      schema: SCHEMA,
      entries,
      active: Object.fromEntries([...this.active].sort(([a], [b]) => a.localeCompare(b))),
      activation_history: Object.fromEntries(
        [...this.activationHistory]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([skillId, versions]) => [skillId, [...versions]])
      )
    });
  }

  importSnapshot(snapshot) {
    if (snapshot?.schema !== SCHEMA || !Array.isArray(snapshot.entries)) {
      throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
    }
    if (this.entries.size) throw new Error('SKILL_REGISTRY_IMPORT_REQUIRES_EMPTY_REGISTRY');

    const ordered = [...snapshot.entries].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    for (const record of ordered) {
      this.register({
        skillId: record.skill_id,
        name: record.name,
        version: record.version,
        capabilities: record.capabilities,
        state: record.state,
        evidence: record.evidence,
        metadata: record.metadata
      });
    }

    this.active.clear();
    this.activationHistory.clear();
    for (const [skillId, version] of Object.entries(snapshot.active || {})) {
      const record = this.entries.get(skillId)?.get(version);
      if (!record || !isVerified(record)) throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
      this.active.set(skillId, version);
      const history = snapshot.activation_history?.[skillId] || [version];
      if (!Array.isArray(history) || history.length === 0) throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
      for (const item of history) {
        const historical = this.entries.get(skillId)?.get(item);
        if (!historical || !isVerified(historical)) throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
      }
      if (history.at(-1) !== version) throw new Error('SKILL_REGISTRY_SNAPSHOT_INVALID');
      this.activationHistory.set(skillId, [...history]);
    }
    return this;
  }

  async persist() {
    if (!this.store || typeof this.store.save !== 'function') throw new Error('SKILL_REGISTRY_STORE_REQUIRED');
    await this.store.save(this.exportSnapshot());
    return this;
  }

  static async restore(store) {
    if (!store || typeof store.load !== 'function') throw new Error('SKILL_REGISTRY_STORE_REQUIRED');
    const snapshot = await store.load();
    return new SkillRegistry({ snapshot: snapshot || undefined, store });
  }
}

export class MemorySkillRegistryStore {
  constructor(snapshot = null) {
    this.snapshot = clone(snapshot);
  }

  async load() {
    return clone(this.snapshot);
  }

  async save(snapshot) {
    this.snapshot = clone(snapshot);
  }
}

export const SKILL_REGISTRY_SCHEMA = SCHEMA;
