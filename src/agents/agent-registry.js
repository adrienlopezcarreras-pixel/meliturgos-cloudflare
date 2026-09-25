import { port } from '../core/contracts.js';
export const methods = ["register", "get", "list", "disable"];
/** Canonical registry port. Durable/reference adapters live in d1-agent-registry.js. */
export const createAgentRegistry = adapters => port('agents/agent-registry',methods,adapters);

export { AGENT_STATUSES, createD1AgentRegistryAdapter, createInMemoryAgentRegistryAdapter, normalizeAgentDefinition } from './d1-agent-registry.js';
export { createWorkAgentRuntime } from './work-agent-runtime.js';
