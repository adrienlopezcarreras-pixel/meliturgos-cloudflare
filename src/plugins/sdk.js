import { port } from '../core/contracts.js';
import { validateManifest } from './validator.js';
export { validateManifest };
export { createPluginRuntime, Mel } from './runtime.js';
export { createD1PluginRegistryAdapter, createRegistry } from './registry.js';
export const methods = ['validateManifest','installCandidate','load','execute','health','disable','rollback'];
/** Persistence uses the canonical plugin registry; load still resolves a pinned server adapter. */
export const createPlugin = adapters => port('plugin',methods,{validateManifest,...adapters});
