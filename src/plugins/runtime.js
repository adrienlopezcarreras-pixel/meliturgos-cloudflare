import { DomainError, requireValue } from '../core/contracts.js';
import { validateManifest } from './validator.js';

const ACTIVE = 'ACTIVE';
const FAILED = 'FAILED';

function permissionSet(...sources) {
  const out = new Set();
  for (const source of sources) {
    if (!source) continue;
    const values = source instanceof Set ? [...source] : Array.isArray(source) ? source : [];
    for (const value of values) if (typeof value === 'string' && value) out.add(value);
  }
  return out;
}

function capabilityEntries(capabilities) {
  if (Array.isArray(capabilities)) {
    return capabilities.map((entry) => {
      if (typeof entry === 'string') return [entry, null];
      const name = entry?.name || entry?.id;
      return [name, entry?.execute || entry?.run || entry?.handler || null];
    });
  }
  if (capabilities && typeof capabilities === 'object') return Object.entries(capabilities);
  return [];
}

function publicRecord(record) {
  if (!record) return null;
  return {
    id: record.manifest.id,
    version: record.manifest.version,
    manifest: structuredClone(record.manifest),
    status: record.status,
    registered_at: record.registered_at,
    updated_at: record.updated_at,
    error: record.error || null,
  };
}

function contract(plugin) {
  requireValue(plugin && typeof plugin === 'object', 'INVALID_PLUGIN');
  const manifest = validateManifest(plugin.manifest, 'plugin');
  requireValue(typeof plugin.activate === 'function', 'PLUGIN_ACTIVATE_REQUIRED');
  requireValue(typeof plugin.deactivate === 'function', 'PLUGIN_DEACTIVATE_REQUIRED');
  requireValue(plugin.capabilities && (typeof plugin.capabilities === 'object'), 'PLUGIN_CAPABILITIES_REQUIRED');

  const entries = capabilityEntries(plugin.capabilities);
  const names = entries.map(([name]) => name);
  requireValue(names.every((name) => typeof name === 'string' && name.length > 0), 'INVALID_PLUGIN_CAPABILITY');

  const declared = new Set(manifest.capabilities);
  for (const name of declared) requireValue(names.includes(name), 'PLUGIN_CAPABILITY_MISSING');
  for (const name of names) requireValue(declared.has(name), 'PLUGIN_CAPABILITY_UNDECLARED');

  return { manifest, capabilities: new Map(entries) };
}

export function createPluginRuntime(options = {}) {
  const records = new Map();
  const hostPermissions = permissionSet(options.permissions);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const logger = options.logger || null;
  const timeline = options.timeline || options.emit || null;
  const registry = options.registry || null;
  const counters = { installed: 0, errors: 0, permission_denied: 0 };

  if (registry) {
    requireValue(
      typeof registry.register === 'function'
        && typeof registry.get === 'function'
        && typeof registry.disable === 'function',
      'PLUGIN_REGISTRY_INVALID',
      500,
    );
  }

  function durableEvidence(manifest, context = {}) {
    if (!registry) return null;
    requireValue(
      typeof context.pluginArtifactHash === 'string' && context.pluginArtifactHash.trim(),
      'PLUGIN_ARTIFACT_HASH_REQUIRED',
      400,
    );
    requireValue(
      context.pluginProofs && typeof context.pluginProofs === 'object' && !Array.isArray(context.pluginProofs),
      'PLUGIN_PROOFS_REQUIRED',
      400,
    );
    return {
      manifest,
      artifact_hash: context.pluginArtifactHash.trim(),
      proofs: structuredClone(context.pluginProofs),
    };
  }

  async function getDurableVersion(manifest) {
    if (!registry) return null;
    try {
      return await registry.get({ plugin_id: manifest.id, version: manifest.version });
    } catch (error) {
      if (error?.code === 'PLUGIN_REGISTRY_VERSION_NOT_FOUND' || error?.code === 'PLUGIN_REGISTRY_NOT_FOUND') return null;
      throw error;
    }
  }

  async function prepareDurableActivation(manifest, base) {
    if (!base) return null;

    let current = await getDurableVersion(manifest);
    if (!current) {
      current = await registry.register({ ...base, proofs: {}, status: 'DISCOVERED' });
    }

    if (current.status === ACTIVE) {
      throw new DomainError('PLUGIN_DURABLE_ALREADY_ACTIVE', 409);
    }
    if (current.status === 'FAILED' || current.status === 'ROLLED_BACK') {
      current = await registry.register({ ...base, proofs: {}, status: 'DISCOVERED' });
    }
    if (current.status === 'DISABLED') {
      current = await registry.register({ ...base, proofs: {}, status: 'CANDIDATE' });
    }
    if (current.status === 'DISCOVERED') {
      current = await registry.register({ ...base, proofs: {}, status: 'VALIDATED' });
    }
    if (current.status === 'VALIDATED') {
      current = await registry.register({ ...base, proofs: {}, status: 'CANDIDATE' });
    }
    if (current.status === 'CANDIDATE') {
      current = await registry.register({ ...base, status: 'TESTED' });
    }

    requireValue(current.status === 'TESTED', 'PLUGIN_DURABLE_NOT_TESTED', 409);
    return base;
  }

  async function markDurableFailed(base) {
    if (!registry || !base) return;
    try {
      const current = await registry.get({
        plugin_id: base.manifest.id,
        version: base.manifest.version,
      });
      if (current?.status !== ACTIVE && current?.status !== FAILED) {
        await registry.register({ ...base, status: FAILED });
      }
    } catch (error) {
      logger?.warn?.('plugin.registry.failure-state.failed', {
        plugin_id: base.manifest.id,
        version: base.manifest.version,
        error: error?.code || error?.message || String(error),
      });
    }
  }

  async function emit(type, record, payload = {}) {
    const event = Object.freeze({
      category: 'plugin',
      type,
      plugin_id: record?.manifest?.id || payload.plugin_id || null,
      version: record?.manifest?.version || payload.version || null,
      status: record?.status || payload.status || null,
      ts: now(),
      ...payload,
    });

    try {
      if (typeof timeline === 'function') await timeline(event);
      else if (timeline && typeof timeline.append === 'function') await timeline.append(event);
      else if (timeline && typeof timeline.record === 'function') await timeline.record(event);
      else if (timeline && typeof timeline.emit === 'function') await timeline.emit(event);
    } catch (error) {
      logger?.warn?.('plugin.timeline.failed', { error: error?.message || String(error), event });
    }

    const level = type.endsWith('failed') || type.endsWith('denied') ? 'error' : 'info';
    logger?.[level]?.(`plugin.${type}`, event);
    return event;
  }

  function assertPermissions(required, context = {}, pluginId = null) {
    const granted = permissionSet(hostPermissions, context.permissions);
    const missing = required.filter((permission) => !granted.has('*') && !granted.has(permission));
    if (missing.length) {
      counters.permission_denied += 1;
      const error = new DomainError('PLUGIN_PERMISSION_DENIED', 403);
      error.plugin_id = pluginId;
      error.missing_permissions = missing;
      throw error;
    }
    return Object.freeze([...granted]);
  }

  function activationContext(record, context = {}) {
    const permissions = assertPermissions(record.manifest.permissions, context, record.manifest.id);
    return Object.freeze({
      ...context,
      plugin: Object.freeze({ id: record.manifest.id, version: record.manifest.version }),
      manifest: structuredClone(record.manifest),
      permissions,
      hasPermission(permission) {
        return permissions.includes('*') || permissions.includes(permission);
      },
      requirePermission(permission) {
        if (!permissions.includes('*') && !permissions.includes(permission)) {
          counters.permission_denied += 1;
          throw new DomainError('PLUGIN_PERMISSION_DENIED', 403);
        }
        return true;
      },
      emit: (type, payload = {}) => emit(type, record, payload),
    });
  }

  async function register(plugin, context = {}) {
    const { manifest, capabilities } = contract(plugin);
    const existing = records.get(manifest.id);
    requireValue(!existing || existing.status !== ACTIVE, 'PLUGIN_ALREADY_ACTIVE', 409);

    const record = {
      manifest,
      capabilities,
      plugin,
      status: 'CANDIDATE',
      registered_at: now(),
      updated_at: now(),
      error: null,
    };
    records.set(manifest.id, record);

    let ctx = null;
    let durable = null;
    let activated = false;
    try {
      ctx = activationContext(record, context);
      durable = durableEvidence(manifest, context);
      await prepareDurableActivation(manifest, durable);
      await emit('registering', record);
      await plugin.activate(ctx);
      activated = true;

      if (registry) {
        await registry.register({
          ...durable,
          status: ACTIVE,
          proofs: {
            ...durable.proofs,
            activation: true,
            version: manifest.version,
          },
        });
      }

      record.status = ACTIVE;
      record.updated_at = now();
      counters.installed += 1;
      await emit('activated', record);
      return publicRecord(record);
    } catch (error) {
      if (activated && ctx) {
        try {
          await plugin.deactivate(ctx);
        } catch (rollbackError) {
          logger?.error?.('plugin.activation.rollback.failed', {
            plugin_id: manifest.id,
            version: manifest.version,
            error: rollbackError?.code || rollbackError?.message || String(rollbackError),
          });
        }
      }
      await markDurableFailed(durable);
      record.status = FAILED;
      record.updated_at = now();
      record.error = error?.code || error?.message || String(error);
      counters.errors += 1;
      const type = error?.code === 'PLUGIN_PERMISSION_DENIED' ? 'permission_denied' : 'activation_failed';
      await emit(type, record, {
        error: record.error,
        missing_permissions: error?.missing_permissions || [],
      });
      return publicRecord(record);
    }
  }

  async function registerAll(plugins = [], context = {}) {
    requireValue(Array.isArray(plugins), 'INVALID_PLUGIN_LIST');
    const results = [];
    for (const plugin of plugins) {
      try {
        results.push(await register(plugin, context));
      } catch (error) {
        counters.errors += 1;
        const manifest = plugin?.manifest || {};
        const failed = {
          manifest: {
            id: manifest.id || 'invalid-plugin',
            version: manifest.version || '0.0.0',
          },
          status: FAILED,
          registered_at: now(),
          updated_at: now(),
          error: error?.code || error?.message || String(error),
        };
        await emit('registration_failed', failed, { error: failed.error });
        results.push(publicRecord(failed));
      }
    }
    return results;
  }

  async function deactivate(id, context = {}) {
    const record = records.get(id);
    requireValue(record, 'PLUGIN_NOT_FOUND', 404);
    if (record.status !== ACTIVE) return publicRecord(record);
    try {
      await record.plugin.deactivate(activationContext(record, context));
      if (registry) {
        await registry.disable({
          plugin_id: record.manifest.id,
          version: record.manifest.version,
        });
      }
      record.status = 'DISABLED';
      record.updated_at = now();
      await emit('deactivated', record);
    } catch (error) {
      record.status = FAILED;
      record.updated_at = now();
      record.error = error?.code || error?.message || String(error);
      counters.errors += 1;
      await emit('deactivation_failed', record, { error: record.error });
    }
    return publicRecord(record);
  }

  async function execute(id, capability, input = {}, context = {}) {
    const record = records.get(id);
    requireValue(record, 'PLUGIN_NOT_FOUND', 404);
    requireValue(record.status === ACTIVE, 'PLUGIN_NOT_ACTIVE', 409);
    assertPermissions(record.manifest.permissions, context, id);
    requireValue(record.capabilities.has(capability), 'PLUGIN_CAPABILITY_NOT_FOUND', 404);
    const handler = record.capabilities.get(capability);
    requireValue(typeof handler === 'function', 'PLUGIN_CAPABILITY_NOT_EXECUTABLE', 409);
    try {
      const result = await handler(input, activationContext(record, context));
      await emit('capability_executed', record, { capability });
      return result;
    } catch (error) {
      counters.errors += 1;
      await emit('capability_failed', record, {
        capability,
        error: error?.code || error?.message || String(error),
      });
      throw error;
    }
  }

  return Object.freeze({
    register,
    registerAll,
    deactivate,
    execute,
    get(id) { return publicRecord(records.get(id)); },
    list() { return [...records.values()].map(publicRecord); },
    metrics() { return Object.freeze({ ...counters, active: [...records.values()].filter((r) => r.status === ACTIVE).length }); },
  });
}

export const Mel = createPluginRuntime();
