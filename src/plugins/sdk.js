import { port } from '../core/contracts.js';
import { validateManifest } from './validator.js';
export { validateManifest };
export const methods = ['validateManifest','installCandidate','load','execute','health','disable','rollback'];
/** TODO persistence operations use plugin_versions; load resolves a pinned server adapter. */
export const createPlugin = adapters => port('plugin',methods,{validateManifest,...adapters});
