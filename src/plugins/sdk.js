import { port } from '../core/contracts.js';
import { validateManifest } from './validator.js';
export { validateManifest };
export { createPluginRuntime, Mel } from './runtime.js';
export { createD1PluginRegistryAdapter, createRegistry } from './registry.js';
export { createLoader, createRegistryBackedPluginLoader } from './loader.js';
export const methods = ['validateManifest','installCandidate','load','execute','health','disable','rollback'];
/** Persistence and pinned loading use the canonical registry-backed server adapters. */
export const createPlugin = adapters => port('plugin',methods,{validateManifest,...adapters});
