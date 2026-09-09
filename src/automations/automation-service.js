import { port } from '../core/contracts.js';
export const AUTOMATION_TYPES=Object.freeze(['SCHEDULED','CONDITION','EVENT']);
export const methods=['create','update','enable','disable','run','history'];
/** Each run pins capability versions, owner grants and idempotency key; resume cursor in D1. */
export const createAutomationService = adapters => port('automation',methods,adapters);
