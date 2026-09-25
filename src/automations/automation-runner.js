import { port } from '../core/contracts.js';
export const methods = ["run", "resume", "cancel"];
/** Canonical automation runner port. Agent-backed runtime adapter is explicit and fail-closed. */
export const createAutomationRunner = adapters => port('automations/automation-runner',methods,adapters);

export { createAgentAutomationRunnerAdapter } from './agent-automation-runner.js';
export { createD1AgentAutomationPolicyAdapter } from './d1-agent-automation-policy.js';
