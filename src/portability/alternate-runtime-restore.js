import { verifyPortableMemoryExport } from '../memory/portable-export.js';
import { SkillRegistry } from '../evolution/skill-registry.js';
import { createInMemoryProjectAdapter, createProjectService } from '../planning/project-service.js';
import { verifyProviderNeutralSystemBundle } from './system-bundle.js';

export const ALTERNATE_RUNTIME_SCHEMA = 'mel.provider-neutral-alternate-runtime/v1';
export const PORTABILITY_RESTORE_DRILL_SCHEMA = 'mel.provider-neutral-restore-drill/v1';

const IMPORTERS = new Set([
  'memory.export',
  'planning.projects',
  'skills.registry',
  'plugins.registry',
  'core.config',
]);

function restoreError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function requireCondition(condition, code, status = 400) {
  if (!condition) throw restoreError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function clone(value) {
  return structuredClone(value);
}

function unique(values, code) {
  const normalized = values.map(value => text(value));
  requireCondition(normalized.every(Boolean), code);
  requireCondition(new Set(normalized).size === normalized.length, code);
  return normalized;
}

function artifactByContract(bundle) {
  const map = new Map();
  for (const artifact of bundle.artifacts || []) {
    const contractId = text(artifact?.contract_id);
    requireCondition(contractId, 'PORTABILITY_RESTORE_ARTIFACT_CONTRACT_REQUIRED');
    requireCondition(!map.has(contractId), 'PORTABILITY_RESTORE_DUPLICATE_CONTRACT_ARTIFACT');
    map.set(contractId, artifact);
  }
  return map;
}

async function importMemory(payload) {
  const verification = await verifyPortableMemoryExport(payload);
  requireCondition(verification.ok, 'PORTABILITY_RESTORE_MEMORY_INVALID', 422);
  const ids = unique((payload.records || []).map(row => row?.memory?.id), 'PORTABILITY_RESTORE_MEMORY_IDS_INVALID');
  const records = new Map();
  for (const entry of payload.records || []) records.set(text(entry.memory.id), clone(entry.memory));
  return Object.freeze({
    kind: 'memory',
    count: records.size,
    ids: Object.freeze([...ids].sort()),
    records,
  });
}

async function importProjects(payload) {
  requireCondition(payload?.schema === 'mel.planning-projects-export/v1', 'PORTABILITY_RESTORE_PROJECTS_SCHEMA_INVALID', 422);
  requireCondition(Array.isArray(payload.projects), 'PORTABILITY_RESTORE_PROJECTS_INVALID', 422);
  requireCondition(Array.isArray(payload.decisions), 'PORTABILITY_RESTORE_DECISIONS_INVALID', 422);
  requireCondition(Array.isArray(payload.lessons), 'PORTABILITY_RESTORE_LESSONS_INVALID', 422);

  const adapter = createInMemoryProjectAdapter({
    projects: clone(payload.projects),
    decisions: clone(payload.decisions),
    lessons: clone(payload.lessons),
  });
  const service = createProjectService(adapter);

  const projects = await service.listProjects({ limit: 500, order: 'asc' });
  const decisions = [];
  const lessons = [];
  for (const project of projects) {
    decisions.push(...await service.listDecisions({ project_id: project.project_id, limit: 500, order: 'asc' }));
    lessons.push(...await service.listLessons({ project_id: project.project_id, limit: 500, order: 'asc' }));
  }

  requireCondition(projects.length === payload.projects.length, 'PORTABILITY_RESTORE_PROJECTS_COUNT_MISMATCH', 422);
  requireCondition(decisions.length === payload.decisions.length, 'PORTABILITY_RESTORE_DECISIONS_COUNT_MISMATCH', 422);
  requireCondition(lessons.length === payload.lessons.length, 'PORTABILITY_RESTORE_LESSONS_COUNT_MISMATCH', 422);

  return Object.freeze({
    kind: 'projects',
    service,
    counts: Object.freeze({
      projects: projects.length,
      decisions: decisions.length,
      lessons: lessons.length,
    }),
    ids: Object.freeze({
      projects: projects.map(row => row.project_id).sort(),
      decisions: decisions.map(row => row.decision_id).sort(),
      lessons: lessons.map(row => row.lesson_id).sort(),
    }),
  });
}

async function importSkills(payload) {
  requireCondition(payload?.schema === 'mel.skill-registry/v1', 'PORTABILITY_RESTORE_SKILLS_SCHEMA_INVALID', 422);
  let registry;
  try {
    registry = new SkillRegistry({ snapshot: clone(payload) });
  } catch (error) {
    const wrapped = restoreError('PORTABILITY_RESTORE_SKILLS_INVALID', 422);
    wrapped.cause = error;
    throw wrapped;
  }
  const exported = registry.exportSnapshot();
  requireCondition(stableJson(exported) === stableJson(payload), 'PORTABILITY_RESTORE_SKILLS_ROUNDTRIP_MISMATCH', 422);
  return Object.freeze({
    kind: 'skills',
    registry,
    count: registry.list().length,
    active: Object.freeze(clone(exported.active || {})),
  });
}

async function importPlugins(payload) {
  requireCondition(payload?.schema === 'mel.plugin-runtime-export/v1', 'PORTABILITY_RESTORE_PLUGINS_SCHEMA_INVALID', 422);
  requireCondition(Array.isArray(payload.plugins), 'PORTABILITY_RESTORE_PLUGINS_INVALID', 422);
  const keys = unique(
    payload.plugins.map(row => `${text(row?.id)}@${text(row?.version)}`),
    'PORTABILITY_RESTORE_PLUGIN_KEYS_INVALID',
  );
  for (const plugin of payload.plugins) {
    requireCondition(text(plugin?.id), 'PORTABILITY_RESTORE_PLUGIN_ID_REQUIRED', 422);
    requireCondition(text(plugin?.version), 'PORTABILITY_RESTORE_PLUGIN_VERSION_REQUIRED', 422);
    requireCondition(Array.isArray(plugin?.capabilities), 'PORTABILITY_RESTORE_PLUGIN_CAPABILITIES_INVALID', 422);
    requireCondition(Array.isArray(plugin?.permissions), 'PORTABILITY_RESTORE_PLUGIN_PERMISSIONS_INVALID', 422);
    requireCondition(!Object.hasOwn(plugin, 'plugin'), 'PORTABILITY_RESTORE_PLUGIN_EXECUTABLE_FORBIDDEN', 422);
  }
  const records = new Map(payload.plugins.map(row => [`${row.id}@${row.version}`, Object.freeze(clone(row))]));
  return Object.freeze({
    kind: 'plugins',
    count: records.size,
    keys: Object.freeze([...keys].sort()),
    records,
    executable_bindings: 0,
  });
}

async function importConfig(payload) {
  requireCondition(payload?.schema === 'mel.core-config-export/v1', 'PORTABILITY_RESTORE_CONFIG_SCHEMA_INVALID', 422);
  requireCondition(isObject(payload.app), 'PORTABILITY_RESTORE_CONFIG_APP_INVALID', 422);
  requireCondition(isObject(payload.defaults), 'PORTABILITY_RESTORE_CONFIG_DEFAULTS_INVALID', 422);
  requireCondition(isObject(payload.database), 'PORTABILITY_RESTORE_CONFIG_DATABASE_INVALID', 422);
  return Object.freeze({
    kind: 'config',
    snapshot: Object.freeze(clone(payload)),
  });
}

const importer = Object.freeze({
  'memory.export': importMemory,
  'planning.projects': importProjects,
  'skills.registry': importSkills,
  'plugins.registry': importPlugins,
  'core.config': importConfig,
});

export async function restoreProviderNeutralBundleToAlternateRuntime(bundle, {
  runtimeId = 'alternate-memory-runtime',
  provider = null,
  now = () => new Date().toISOString(),
} = {}) {
  const verification = await verifyProviderNeutralSystemBundle(bundle);
  if (!verification.ok) {
    const error = restoreError('PORTABILITY_RESTORE_BUNDLE_INVALID', 422);
    error.issues = verification.issues;
    throw error;
  }

  const artifacts = artifactByContract(bundle);
  const requiredContracts = (bundle.manifest?.contracts || [])
    .filter(row => row?.required !== false)
    .map(row => text(row.id))
    .sort();

  for (const contractId of requiredContracts) {
    requireCondition(IMPORTERS.has(contractId), `PORTABILITY_RESTORE_IMPORTER_MISSING:${contractId}`, 501);
    requireCondition(artifacts.has(contractId), `PORTABILITY_RESTORE_REQUIRED_ARTIFACT_MISSING:${contractId}`, 422);
  }

  const restored = new Map();
  const payloads = new Map();
  for (const [contractId, artifact] of artifacts.entries()) {
    if (!IMPORTERS.has(contractId)) {
      const contract = (bundle.manifest?.contracts || []).find(row => text(row.id) === contractId);
      if (contract?.required !== false) throw restoreError(`PORTABILITY_RESTORE_IMPORTER_MISSING:${contractId}`, 501);
      continue;
    }
    const payload = clone(artifact.payload);
    restored.set(contractId, await importer[contractId](payload));
    payloads.set(contractId, payload);
  }

  const providerId = provider == null || provider === '' ? null : text(provider);
  if (providerId && !/^[a-z0-9._:-]{1,120}$/i.test(providerId)) {
    throw restoreError('PORTABILITY_RESTORE_PROVIDER_INVALID');
  }

  const runtime = Object.freeze({
    schema: ALTERNATE_RUNTIME_SCHEMA,
    runtime_id: text(runtimeId) || 'alternate-memory-runtime',
    restored_at: now(),
    provider: providerId,
    external_side_effects: 0,
    restored_contracts: Object.freeze([...restored.keys()].sort()),
    required_contracts: Object.freeze(requiredContracts),
    get(contractId) {
      return restored.get(text(contractId)) || null;
    },
    exportPayload(contractId) {
      const payload = payloads.get(text(contractId));
      return payload === undefined ? null : clone(payload);
    },
  });

  return runtime;
}

export async function drillProviderNeutralBundleRestore(bundle, options = {}) {
  const runtime = await restoreProviderNeutralBundleToAlternateRuntime(bundle, options);
  const artifacts = artifactByContract(bundle);
  const results = [];

  for (const contractId of runtime.restored_contracts) {
    const artifact = artifacts.get(contractId);
    const payload = runtime.exportPayload(contractId);
    const digest = `sha256:${await sha256(payload)}`;
    requireCondition(
      digest === artifact.checksum,
      `PORTABILITY_RESTORE_ROUNDTRIP_CHECKSUM_MISMATCH:${contractId}`,
      422,
    );
    results.push(Object.freeze({
      contract_id: contractId,
      artifact_id: text(artifact.id),
      checksum: digest,
      restored: true,
    }));
  }

  const requiredSet = new Set(runtime.required_contracts);
  const restoredSet = new Set(runtime.restored_contracts);
  const missingRequired = [...requiredSet].filter(id => !restoredSet.has(id)).sort();
  requireCondition(missingRequired.length === 0, 'PORTABILITY_RESTORE_REQUIRED_CONTRACTS_MISSING', 422);

  return Object.freeze({
    schema: PORTABILITY_RESTORE_DRILL_SCHEMA,
    ok: true,
    runtime: Object.freeze({
      schema: runtime.schema,
      runtime_id: runtime.runtime_id,
      provider: runtime.provider,
      external_side_effects: runtime.external_side_effects,
    }),
    required_contracts: runtime.required_contracts,
    restored_contracts: runtime.restored_contracts,
    artifact_count: results.length,
    artifacts: Object.freeze(results),
    provider_calls: 0,
    external_side_effects: 0,
  });
}
