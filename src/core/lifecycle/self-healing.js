import { port } from '../contracts.js';
export const methods=['health','detect','diagnose','knownFix','candidate','test','rollback'];
/** TODO persist diagnostics + proposed ChangePlan; never call activate automatically. */
export const createSelfHealing = adapters => port('self-healing',methods,adapters);
