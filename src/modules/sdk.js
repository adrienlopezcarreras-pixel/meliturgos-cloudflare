import { port } from '../core/contracts.js';
import { validateManifest as validate } from '../plugins/validator.js';
export const validateManifest = input => validate(input,'module');
export const methods = ['validateManifest','register','run','test','health','activate','disable','rollback'];
/** TODO persist version and proof records; runner always delegates to CapabilityBus. */
export const createModule = adapters => port('module',methods,{validateManifest,...adapters});
