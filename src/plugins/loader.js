import { DomainError, port, requireValue } from '../core/contracts.js';
import { validateManifest } from './validator.js';

export const methods = ['installCandidate', 'load', 'execute', 'health', 'disable', 'rollback'];
export const createLoader = adapters => port('plugins/loader', methods, adapters);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

function pluginId(input = {}) {
  const value = input.plugin_id ?? input.id;
  requireValue(nonEmptyString(value), 'PLUGIN_LOADER_ID_REQUIRED', 400);
  return value.trim();
}

function pinnedVersion(input = {}) {
  requireValue(nonEmptyString(input.version), 'PLUGIN_LOADER_PINNED_VERSION_REQUIRED', 400);
  return input.version.trim();
}

function installInput(input = {}) {
  requireValue(isRecord(input), 'PLUGIN_LOADER_INPUT_INVALID', 400);
  const manifest = validateManifest(input.manifest, 'plugin');
  requireValue(nonEmptyString(input.artifact_hash), 'PLUGIN_LOADER_ARTIFACT_HASH_REQUIRED', 400);
  return {
    manifest,
    artifact_hash: input.artifact_hash.trim(),
  };
}

/**
 * Server-side loader that binds the durable registry to an in-process plugin
 * runtime. The artifact resolver is injected: this module never fetches code or
 * executes arbitrary URLs by itself.
 */
export function createRegistryBackedPluginLoader({
  registry,
  runtime,
  resolvePlugin,
} = {}) {
  requireValue(
    registry
      && typeof registry.register === 'function'
      && typeof registry.get === 'function'
      && typeof registry.disable === 'function',
    'PLUGIN_LOADER_REGISTRY_REQUIRED',
    500,
  );
  requireValue(
    runtime
      && typeof runtime.register === 'function'
      && typeof runtime.execute === 'function'
      && typeof runtime.deactivate === 'function'
      && typeof runtime.get === 'function',
    'PLUGIN_LOADER_RUNTIME_REQUIRED',
    500,
  );
  requireValue(typeof resolvePlugin === 'function', 'PLUGIN_LOADER_RESOLVER_REQUIRED', 500);

  async function getVersion(id, version) {
    return registry.get({ plugin_id: id, version });
  }

  async function installCandidate(input = {}) {
    const candidate = installInput(input);
    const id = candidate.manifest.id;
    const version = candidate.manifest.version;
    let current = null;

    try {
      current = await getVersion(id, version);
    } catch (error) {
      if (error?.code !== 'PLUGIN_REGISTRY_VERSION_NOT_FOUND' && error?.code !== 'PLUGIN_REGISTRY_NOT_FOUND') throw error;
    }

    if (!current) {
      current = await registry.register({ ...candidate, proofs: {}, status: 'DISCOVERED' });
    }

    if (current.status === 'FAILED' || current.status === 'ROLLED_BACK') {
      current = await registry.register({ ...candidate, proofs: {}, status: 'DISCOVERED' });
    }
    if (current.status === 'DISABLED') {
      current = await registry.register({ ...candidate, proofs: {}, status: 'CANDIDATE' });
    }
    if (current.status === 'DISCOVERED') {
      current = await registry.register({ ...candidate, proofs: {}, status: 'VALIDATED' });
    }
    if (current.status === 'VALIDATED') {
      current = await registry.register({ ...candidate, proofs: {}, status: 'CANDIDATE' });
    }

    requireValue(
      ['CANDIDATE', 'TESTED', 'ACTIVE'].includes(current.status),
      'PLUGIN_LOADER_CANDIDATE_STATE_INVALID',
      409,
    );
    return current;
  }

  async function load(input = {}, context = {}) {
    const id = pluginId(input);
    const version = pinnedVersion(input);
    const record = await getVersion(id, version);

    requireValue(record.status !== 'ACTIVE', 'PLUGIN_LOADER_DURABLE_ALREADY_ACTIVE', 409);
    requireValue(!['DISABLED', 'ROLLED_BACK'].includes(record.status), 'PLUGIN_LOADER_VERSION_RETIRED', 409);

    const resolved = await resolvePlugin({
      plugin_id: id,
      version,
      manifest: structuredClone(record.manifest),
      artifact_hash: record.artifact_hash,
      record: structuredClone(record),
      context,
    });

    requireValue(resolved && typeof resolved === 'object', 'PLUGIN_LOADER_ARTIFACT_INVALID', 500);
    const resolvedManifest = validateManifest(resolved.manifest, 'plugin');
    requireValue(
      resolvedManifest.id === record.plugin_id && resolvedManifest.version === record.version,
      'PLUGIN_LOADER_ARTIFACT_MANIFEST_MISMATCH',
      409,
    );

    return runtime.register(resolved, {
      ...context,
      pluginArtifactHash: record.artifact_hash,
    });
  }

  async function execute(input = {}, context = {}) {
    const id = pluginId(input);
    requireValue(nonEmptyString(input.capability), 'PLUGIN_LOADER_CAPABILITY_REQUIRED', 400);
    return runtime.execute(id, input.capability.trim(), input.input ?? {}, context);
  }

  async function health(input = {}) {
    const id = pluginId(input);
    const durable = await registry.get({ plugin_id: id });
    const runtimeRecord = runtime.get(id);
    const sameActiveVersion = durable.active_version != null
      && runtimeRecord?.version === durable.active_version;
    const healthy = durable.status === 'ACTIVE'
      && runtimeRecord?.status === 'ACTIVE'
      && sameActiveVersion;

    return Object.freeze({
      plugin_id: id,
      healthy,
      durable_status: durable.status,
      active_version: durable.active_version,
      runtime_status: runtimeRecord?.status ?? 'NOT_LOADED',
      runtime_version: runtimeRecord?.version ?? null,
    });
  }

  async function disable(input = {}, context = {}) {
    const id = pluginId(input);
    const runtimeRecord = runtime.get(id);

    if (runtimeRecord?.status === 'ACTIVE') {
      await runtime.deactivate(id, context);
    } else {
      const durable = await registry.get({ plugin_id: id });
      requireValue(nonEmptyString(durable.active_version), 'PLUGIN_REGISTRY_NOT_ACTIVE', 409);
      await registry.disable({
        plugin_id: id,
        version: input.version ?? durable.active_version,
      });
    }

    return health({ plugin_id: id });
  }

  async function rollback() {
    throw new DomainError('PLUGIN_ROLLBACK_NOT_IMPLEMENTED', 501);
  }

  return Object.freeze({
    installCandidate,
    load,
    execute,
    health,
    disable,
    rollback,
  });
}
