import { port, requireValue } from '../core/contracts.js';

export const SKILL_STATUSES = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  VERIFIED: 'VERIFIED',
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
});

export const methods = Object.freeze([
  'register',
  'verify',
  'activate',
  'deprecate',
  'get',
  'list',
  'resolve',
  'exportSnapshot',
  'importSnapshot',
]);

export const createSkillRegistry = (adapters = {}) => port('skill_registry', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);
const keyOf = (skillId, version) => `${skillId}@${version}`;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function canonicalStringArray(value, code, { min = 0 } = {}) {
  requireValue(Array.isArray(value) && value.length >= min, code, 400);
  const normalized = value.map(entry => {
    requireValue(nonEmptyString(entry), code, 400);
    return entry.trim();
  });
  requireValue(new Set(normalized).size === normalized.length, `${code}_DUPLICATE`, 400);
  return normalized.sort((a, b) => a.localeCompare(b));
}

function canonicalProvenance(value) {
  requireValue(isRecord(value), 'SKILL_PROVENANCE_INVALID', 400);
  requireValue(nonEmptyString(value.type), 'SKILL_PROVENANCE_TYPE_INVALID', 400);
  requireValue(nonEmptyString(value.ref), 'SKILL_PROVENANCE_REF_INVALID', 400);
  return {
    type: value.type.trim(),
    ref: value.ref.trim(),
    ...(nonEmptyString(value.commit) ? { commit: value.commit.trim() } : {}),
  };
}

function canonicalEvidence(value = []) {
  requireValue(Array.isArray(value), 'SKILL_EVIDENCE_INVALID', 400);
  return value.map((entry, index) => {
    requireValue(isRecord(entry), 'SKILL_EVIDENCE_INVALID', 400);
    requireValue(nonEmptyString(entry.kind), 'SKILL_EVIDENCE_KIND_INVALID', 400);
    requireValue(nonEmptyString(entry.ref), 'SKILL_EVIDENCE_REF_INVALID', 400);
    requireValue(Number.isFinite(entry.observed_at), 'SKILL_EVIDENCE_TIME_INVALID', 400);
    requireValue(entry.score === undefined || Number.isFinite(entry.score), 'SKILL_EVIDENCE_SCORE_INVALID', 400);
    return {
      kind: entry.kind.trim(),
      ref: entry.ref.trim(),
      observed_at: entry.observed_at,
      ...(entry.score === undefined ? {} : { score: entry.score }),
      _order: index,
    };
  }).sort((a, b) => a.observed_at - b.observed_at || a._order - b._order)
    .map(({ _order, ...entry }) => entry);
}

export function skillDefinition(input = {}) {
  requireValue(isRecord(input), 'SKILL_INVALID', 400);
  requireValue(nonEmptyString(input.skill_id), 'SKILL_ID_INVALID', 400);
  requireValue(nonEmptyString(input.version) && SEMVER.test(input.version.trim()), 'SKILL_VERSION_INVALID', 400);
  requireValue(nonEmptyString(input.name), 'SKILL_NAME_INVALID', 400);
  requireValue(Number.isFinite(input.created_at), 'SKILL_CREATED_AT_INVALID', 400);

  const description = input.description === undefined ? '' : input.description;
  requireValue(typeof description === 'string', 'SKILL_DESCRIPTION_INVALID', 400);

  return clone({
    skill_id: input.skill_id.trim(),
    version: input.version.trim(),
    name: input.name.trim(),
    description: description.trim(),
    capabilities: canonicalStringArray(input.capabilities ?? [], 'SKILL_CAPABILITIES_INVALID', { min: 1 }),
    tags: canonicalStringArray(input.tags ?? [], 'SKILL_TAGS_INVALID'),
    provenance: canonicalProvenance(input.provenance),
    evidence: canonicalEvidence(input.evidence ?? []),
    created_at: input.created_at,
    metadata: isRecord(input.metadata) ? clone(input.metadata) : {},
  });
}

function skillRef(input = {}) {
  requireValue(isRecord(input), 'SKILL_REF_INVALID', 400);
  requireValue(nonEmptyString(input.skill_id), 'SKILL_ID_INVALID', 400);
  requireValue(nonEmptyString(input.version) && SEMVER.test(input.version.trim()), 'SKILL_VERSION_INVALID', 400);
  return { skill_id: input.skill_id.trim(), version: input.version.trim() };
}

function transitionRequest(input = {}, action) {
  const ref = skillRef(input);
  const timeField = action === 'verify' ? 'verified_at' : action === 'activate' ? 'activated_at' : 'deprecated_at';
  requireValue(Number.isFinite(input[timeField]), `SKILL_${action.toUpperCase()}_TIME_INVALID`, 400);
  return {
    ...ref,
    [timeField]: input[timeField],
    ...(action === 'verify' ? { evidence: canonicalEvidence(input.evidence ?? []) } : {}),
    ...(action === 'deprecate' && nonEmptyString(input.reason) ? { reason: input.reason.trim() } : {}),
  };
}

export function listSkillsRequest(input = {}) {
  requireValue(isRecord(input), 'SKILL_LIST_INVALID', 400);
  requireValue(input.status === undefined || Object.values(SKILL_STATUSES).includes(input.status), 'SKILL_LIST_STATUS_INVALID', 400);
  requireValue(input.capability === undefined || nonEmptyString(input.capability), 'SKILL_LIST_CAPABILITY_INVALID', 400);
  const limit = input.limit ?? 100;
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'SKILL_LIST_LIMIT_INVALID', 400);
  return {
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.capability === undefined ? {} : { capability: input.capability.trim() }),
    limit,
  };
}

export function resolveSkillRequest(input = {}) {
  requireValue(isRecord(input), 'SKILL_RESOLVE_INVALID', 400);
  requireValue(nonEmptyString(input.capability), 'SKILL_RESOLVE_CAPABILITY_INVALID', 400);
  return { capability: input.capability.trim() };
}

function snapshotRecord(record) {
  return clone({
    definition: record.definition,
    status: record.status,
    registered_at: record.registered_at,
    ...(record.verified_at !== undefined ? { verified_at: record.verified_at } : {}),
    ...(record.activated_at !== undefined ? { activated_at: record.activated_at } : {}),
    ...(record.deprecated_at !== undefined ? { deprecated_at: record.deprecated_at } : {}),
    ...(record.deprecation_reason ? { deprecation_reason: record.deprecation_reason } : {}),
  });
}

function comparableDefinition(definition) {
  return JSON.stringify(definition);
}

/**
 * Reference implementation for MEL-EVOL-05.
 *
 * The registry keeps immutable versioned skill definitions and mutable lifecycle
 * state outside those definitions. A production adapter can persist the same
 * contract in D1/R2 without coupling learned skills to one provider or runtime.
 */
export function createInMemorySkillRegistryAdapter(seed = []) {
  requireValue(Array.isArray(seed), 'SKILL_SEED_INVALID', 400);

  const records = new Map();
  let sequence = 0;

  const insert = (definition, registeredAt = definition.created_at, status = SKILL_STATUSES.CANDIDATE) => {
    const key = keyOf(definition.skill_id, definition.version);
    requireValue(!records.has(key), 'SKILL_VERSION_EXISTS', 409);
    const record = { definition, status, registered_at: registeredAt, sequence: sequence++ };
    records.set(key, record);
    return record;
  };

  for (const raw of seed) {
    requireValue(isRecord(raw), 'SKILL_SEED_INVALID', 400);
    const definition = skillDefinition(raw.definition ?? raw);
    const status = raw.status ?? SKILL_STATUSES.CANDIDATE;
    requireValue(Object.values(SKILL_STATUSES).includes(status), 'SKILL_SEED_STATUS_INVALID', 400);
    const record = insert(definition, raw.registered_at ?? definition.created_at, status);
    if (Number.isFinite(raw.verified_at)) record.verified_at = raw.verified_at;
    if (Number.isFinite(raw.activated_at)) record.activated_at = raw.activated_at;
    if (Number.isFinite(raw.deprecated_at)) record.deprecated_at = raw.deprecated_at;
    if (nonEmptyString(raw.deprecation_reason)) record.deprecation_reason = raw.deprecation_reason.trim();
  }

  const requireRecord = ref => {
    const record = records.get(keyOf(ref.skill_id, ref.version));
    requireValue(record, 'SKILL_NOT_FOUND', 404);
    return record;
  };

  const deactivateOtherVersions = (skillId, keepKey) => {
    for (const [key, record] of records) {
      if (key !== keepKey && record.definition.skill_id === skillId && record.status === SKILL_STATUSES.ACTIVE) {
        record.status = SKILL_STATUSES.VERIFIED;
        delete record.activated_at;
      }
    }
  };

  return Object.freeze({
    async register(input) {
      const definition = skillDefinition(input.definition ?? input);
      const key = keyOf(definition.skill_id, definition.version);
      const existing = records.get(key);
      if (existing) {
        requireValue(comparableDefinition(existing.definition) === comparableDefinition(definition), 'SKILL_VERSION_CONFLICT', 409);
        return { record: snapshotRecord(existing), deduplicated: true };
      }
      const record = insert(definition, input.registered_at ?? definition.created_at);
      return { record: snapshotRecord(record), deduplicated: false };
    },

    async verify(input) {
      const request = transitionRequest(input, 'verify');
      const record = requireRecord(request);
      requireValue(record.status !== SKILL_STATUSES.DEPRECATED, 'SKILL_DEPRECATED', 409);
      const evidence = canonicalEvidence([...record.definition.evidence, ...request.evidence]);
      requireValue(evidence.length > 0, 'SKILL_VERIFICATION_EVIDENCE_REQUIRED', 400);
      record.definition = clone({ ...record.definition, evidence });
      record.status = record.status === SKILL_STATUSES.ACTIVE ? SKILL_STATUSES.ACTIVE : SKILL_STATUSES.VERIFIED;
      record.verified_at = request.verified_at;
      return snapshotRecord(record);
    },

    async activate(input) {
      const request = transitionRequest(input, 'activate');
      const record = requireRecord(request);
      requireValue(record.status === SKILL_STATUSES.VERIFIED || record.status === SKILL_STATUSES.ACTIVE, 'SKILL_NOT_VERIFIED', 409);
      requireValue(record.definition.evidence.length > 0, 'SKILL_VERIFICATION_EVIDENCE_REQUIRED', 409);
      const key = keyOf(request.skill_id, request.version);
      deactivateOtherVersions(request.skill_id, key);
      record.status = SKILL_STATUSES.ACTIVE;
      record.activated_at = request.activated_at;
      return snapshotRecord(record);
    },

    async deprecate(input) {
      const request = transitionRequest(input, 'deprecate');
      const record = requireRecord(request);
      record.status = SKILL_STATUSES.DEPRECATED;
      record.deprecated_at = request.deprecated_at;
      if (request.reason) record.deprecation_reason = request.reason;
      return snapshotRecord(record);
    },

    async get(input) {
      return snapshotRecord(requireRecord(skillRef(input)));
    },

    async list(input = {}) {
      const query = listSkillsRequest(input);
      return [...records.values()]
        .filter(record => query.status === undefined || record.status === query.status)
        .filter(record => query.capability === undefined || record.definition.capabilities.includes(query.capability))
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, query.limit)
        .map(snapshotRecord);
    },

    async resolve(input) {
      const query = resolveSkillRequest(input);
      const matches = [...records.values()]
        .filter(record => record.status === SKILL_STATUSES.ACTIVE)
        .filter(record => record.definition.capabilities.includes(query.capability))
        .sort((a, b) => b.activated_at - a.activated_at || a.sequence - b.sequence);
      return matches.length ? snapshotRecord(matches[0]) : null;
    },

    async exportSnapshot() {
      return clone({
        schema: 'mel.skill-registry.v1',
        records: [...records.values()]
          .sort((a, b) => a.sequence - b.sequence)
          .map(snapshotRecord),
      });
    },

    async importSnapshot(input) {
      requireValue(isRecord(input) && input.schema === 'mel.skill-registry.v1' && Array.isArray(input.records), 'SKILL_SNAPSHOT_INVALID', 400);

      const staged = input.records.map(raw => {
        requireValue(isRecord(raw), 'SKILL_SNAPSHOT_RECORD_INVALID', 400);
        const definition = skillDefinition(raw.definition);
        requireValue(Object.values(SKILL_STATUSES).includes(raw.status), 'SKILL_SNAPSHOT_STATUS_INVALID', 400);
        requireValue(Number.isFinite(raw.registered_at), 'SKILL_SNAPSHOT_REGISTERED_AT_INVALID', 400);
        if (raw.status === SKILL_STATUSES.ACTIVE) {
          requireValue(Number.isFinite(raw.activated_at), 'SKILL_SNAPSHOT_ACTIVATED_AT_INVALID', 400);
          requireValue(definition.evidence.length > 0, 'SKILL_SNAPSHOT_ACTIVE_EVIDENCE_REQUIRED', 400);
        }
        return { raw, definition, key: keyOf(definition.skill_id, definition.version) };
      });

      requireValue(new Set(staged.map(entry => entry.key)).size === staged.length, 'SKILL_SNAPSHOT_DUPLICATE_VERSION', 409);

      for (const entry of staged) {
        const existing = records.get(entry.key);
        if (existing) requireValue(comparableDefinition(existing.definition) === comparableDefinition(entry.definition), 'SKILL_VERSION_CONFLICT', 409);
      }

      let imported = 0;
      for (const { raw, definition, key } of staged) {
        if (records.has(key)) continue;
        const record = insert(definition, raw.registered_at, raw.status);
        if (Number.isFinite(raw.verified_at)) record.verified_at = raw.verified_at;
        if (Number.isFinite(raw.activated_at)) record.activated_at = raw.activated_at;
        if (Number.isFinite(raw.deprecated_at)) record.deprecated_at = raw.deprecated_at;
        if (nonEmptyString(raw.deprecation_reason)) record.deprecation_reason = raw.deprecation_reason.trim();
        imported += 1;
      }
      return { imported, total: staged.length };
    },
  });
}
