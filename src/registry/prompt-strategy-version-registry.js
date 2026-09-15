const TYPES = new Set(['prompt', 'strategy']);
const SCHEMA = 'mel.prompt-strategy-version-registry/v1';

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

function registryKey(type, name) {
  if (!TYPES.has(type)) throw new Error('PROMPT_VERSION_TYPE_INVALID');
  return `${type}:${required(name, 'PROMPT_VERSION_NAME_REQUIRED')}`;
}

function publicRecord(record) {
  return freezeDeep(clone(record));
}

export class PromptStrategyVersionRegistry {
  constructor(snapshot = null) {
    this.entries = new Map();
    this.active = new Map();
    this.activationHistory = new Map();
    this.sequence = 0;
    if (snapshot) this.importSnapshot(snapshot);
  }

  register({ type, name, version, value, metadata = {}, activate = false }) {
    const key = registryKey(type, name);
    const normalizedVersion = required(version, 'PROMPT_VERSION_VERSION_REQUIRED');
    if (value === undefined) throw new Error('PROMPT_VERSION_VALUE_REQUIRED');

    const versions = this.entries.get(key) || new Map();
    if (versions.has(normalizedVersion)) throw new Error('PROMPT_VERSION_ALREADY_EXISTS');

    const record = freezeDeep({
      type,
      name: key.slice(type.length + 1),
      version: normalizedVersion,
      value: clone(value),
      metadata: clone(metadata) || {},
      sequence: ++this.sequence
    });
    versions.set(normalizedVersion, record);
    this.entries.set(key, versions);

    if (!this.active.has(key) || activate) this.activate(type, record.name, normalizedVersion);
    return publicRecord(record);
  }

  registerPrompt(name, version, template, options = {}) {
    return this.register({ type: 'prompt', name, version, value: template, ...options });
  }

  registerStrategy(name, version, strategy, options = {}) {
    return this.register({ type: 'strategy', name, version, value: strategy, ...options });
  }

  activate(type, name, version) {
    const key = registryKey(type, name);
    const normalizedVersion = required(version, 'PROMPT_VERSION_VERSION_REQUIRED');
    const versions = this.entries.get(key);
    if (!versions?.has(normalizedVersion)) throw new Error('PROMPT_VERSION_NOT_FOUND');

    const previous = this.active.get(key) || null;
    this.active.set(key, normalizedVersion);
    const log = this.activationHistory.get(key) || [];
    if (log.at(-1) !== normalizedVersion) log.push(normalizedVersion);
    this.activationHistory.set(key, log);
    return freezeDeep({ type, name: key.slice(type.length + 1), previous, active: normalizedVersion });
  }

  resolve(type, name, version = null) {
    const key = registryKey(type, name);
    const selected = version || this.active.get(key);
    if (!selected) throw new Error('PROMPT_VERSION_NO_ACTIVE_VERSION');
    const record = this.entries.get(key)?.get(selected);
    if (!record) throw new Error('PROMPT_VERSION_NOT_FOUND');
    return publicRecord(record);
  }

  history(type, name) {
    const key = registryKey(type, name);
    const versions = [...(this.entries.get(key)?.values() || [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map(publicRecord);
    return freezeDeep(versions);
  }

  rollback(type, name, targetVersion = null) {
    const key = registryKey(type, name);
    if (targetVersion) return this.activate(type, name, targetVersion);

    const log = this.activationHistory.get(key) || [];
    if (log.length < 2) throw new Error('PROMPT_VERSION_NO_ROLLBACK_TARGET');

    const current = log.pop();
    const previous = log.at(-1);
    this.activationHistory.set(key, log);
    this.active.set(key, previous);
    return freezeDeep({ type, name: key.slice(type.length + 1), previous: current, active: previous });
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
      active: Object.fromEntries(this.active),
      activation_history: Object.fromEntries(
        [...this.activationHistory].map(([key, versions]) => [key, [...versions]])
      )
    });
  }

  importSnapshot(snapshot) {
    if (snapshot?.schema !== SCHEMA || !Array.isArray(snapshot.entries)) {
      throw new Error('PROMPT_VERSION_SNAPSHOT_INVALID');
    }
    if (this.entries.size) throw new Error('PROMPT_VERSION_IMPORT_REQUIRES_EMPTY_REGISTRY');

    for (const record of snapshot.entries) {
      this.register({
        type: record.type,
        name: record.name,
        version: record.version,
        value: record.value,
        metadata: record.metadata,
        activate: false
      });
    }

    this.active.clear();
    this.activationHistory.clear();
    for (const [key, version] of Object.entries(snapshot.active || {})) {
      const [type, ...nameParts] = key.split(':');
      const name = nameParts.join(':');
      const versions = this.entries.get(key);
      if (!TYPES.has(type) || !versions?.has(version)) throw new Error('PROMPT_VERSION_SNAPSHOT_INVALID');
      this.active.set(key, version);
      const history = snapshot.activation_history?.[key] || [version];
      if (!Array.isArray(history) || history.some(item => !versions.has(item))) {
        throw new Error('PROMPT_VERSION_SNAPSHOT_INVALID');
      }
      this.activationHistory.set(key, [...history]);
    }
    return this;
  }
}

export function createPromptStrategyVersionRegistry(snapshot = null) {
  return new PromptStrategyVersionRegistry(snapshot);
}

export const PROMPT_STRATEGY_VERSION_SCHEMA = SCHEMA;
