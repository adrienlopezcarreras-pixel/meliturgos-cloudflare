import { port } from '../core/contracts.js';
import { validateManifest } from './validator.js';
import { PluginVersionManager } from './version-manager.js';
import { D1PluginVersionStore } from './d1-version-store.js';

export { validateManifest };
export { createPluginRuntime, Mel } from './runtime.js';
export { PluginVersionManager } from './version-manager.js';
export { D1PluginVersionStore, createD1PluginVersionStore } from './d1-version-store.js';

export const methods = [
  'validateManifest','installCandidate','markTested','activate','load','listVersions',
  'execute','health','disable','rollback'
];

/**
 * Low-level compatibility port. Unwired actions remain fail-closed.
 */
export const createPlugin = adapters => port('plugin', methods, { validateManifest, ...adapters });

/**
 * Durable plugin control plane. This controls manifest/version state only;
 * executable code remains owned by createPluginRuntime() or another explicit
 * runtime loader and is never deserialized from D1.
 */
export function createPluginControlPlane({ store, db, now } = {}) {
  const durableStore = store || (db ? new D1PluginVersionStore(db) : null);
  if (!durableStore) throw new Error('PLUGIN_VERSION_STORE_REQUIRED');
  const manager = new PluginVersionManager(durableStore, { now });

  return Object.freeze({
    validateManifest,
    installCandidate: input => manager.installCandidate(input),
    markTested: ({ pluginId, version, proofs } = {}) => manager.markTested(pluginId, version, proofs),
    activate: ({ pluginId, version, proofs } = {}) => manager.activate(pluginId, version, proofs),
    load: ({ pluginId, version = null } = {}) => manager.get(pluginId, version),
    listVersions: ({ pluginId } = {}) => manager.list(pluginId),
    disable: ({ pluginId, reason } = {}) => manager.disable(pluginId, { reason }),
    rollback: ({ pluginId, targetVersion, proofs } = {}) => manager.rollback(pluginId, targetVersion, proofs),
    async health({ pluginId } = {}) {
      const versions = await manager.list(pluginId);
      const active = await manager.get(pluginId);
      return Object.freeze({
        plugin_id: String(pluginId || ''),
        active_version: active?.version || null,
        active_status: active?.status || null,
        versions: versions.length,
        healthy: active?.status === 'ACTIVE',
      });
    },
  });
}