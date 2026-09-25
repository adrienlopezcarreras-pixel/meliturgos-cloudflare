import { port } from '../contracts.js';
export const methods=['health','detect','diagnose','knownFix','candidate','test','rollback'];
/** Canonical port facade. Controlled persistence/execution lives in resilience/self-healing-coordinator.js. */
export const createSelfHealing = adapters => port('self-healing',methods,adapters);

export { ControlledSelfHealingCoordinator, createControlledSelfHealingCoordinator, selfHealingJobId } from '../../resilience/self-healing-coordinator.js';
