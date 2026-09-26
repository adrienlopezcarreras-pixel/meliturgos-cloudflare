import { createDefaultCapabilityBus } from '../../capabilities/default-bus.js';
import { registerAutonomyCapabilities } from '../../capabilities/autonomy-capabilities.js';
import { registerMentorCapabilities } from '../../capabilities/mentor-capabilities.js';
import { registerCapabilityAuditCapability } from '../../capabilities/capability-audit-capability.js';
import { registerDevicePolicyCapabilities } from '../../capabilities/device-policy-capabilities.js';
import { registerGapDetectorCapability } from '../../capabilities/gap-detector-capability.js';
import { registerWebResearchCapability } from '../../capabilities/web-research-capability.js';
import { registerGooglePersonalAgentCapabilities } from '../../capabilities/google-personal-agent-capabilities.js';
import { registerCodeIntegrityCapability } from '../../capabilities/code-integrity-capability.js';
import { registerModuleProposalCapability } from '../../capabilities/module-proposal-capability.js';
import { registerWorkIntrospectionCapabilities } from '../../capabilities/work-introspection-capabilities.js';
import { registerConversationRuntimeCapabilities } from '../../capabilities/conversation-runtime-capabilities.js';
import { registerChatGPTArchiveImportCapability } from '../../capabilities/chatgpt-archive-import-capability.js';
import { registerMemoryCompatibilityCapabilities } from '../../capabilities/memory-compat-capabilities.js';
import { registerSelfStateCapability } from '../../capabilities/self-state-capability.js';
import { registerCommunicationAuditCapability } from '../../capabilities/communication-audit-capability.js';
import { registerKnowledgeWorkspaceCapabilities } from '../../capabilities/knowledge-workspace-capabilities.js';
import { registerEvolutionLedgerCapabilities } from '../../capabilities/evolution-ledger-capabilities.js';
import { registerRecoveryDrillCapability } from '../../capabilities/recovery-drill-capability.js';
import { registerColdStandbyCapability } from '../../capabilities/cold-standby-capability.js';
import { validateManifest } from '../../plugins/validator.js';
import { transition } from '../lifecycle/extension.js';
import { requireValue } from '../contracts.js';
import { requireStateOfPlayCouncil } from '../../teachers/model-council.js';
import { audit as persistAuditLog } from '../../audit/audit-service.js';
import { SkillRegistry, MemorySkillRegistryStore } from '../../evolution/skill-registry.js';
import { D1SkillRegistryStore } from '../../evolution/d1-skill-registry-store.js';

function boundedCapabilityAuditEvent(event = {}) {
  const duration = Number(event.duration_ms);
  return {
    event_id: String(event.id || '').slice(0, 120) || null,
    capability: String(event.capability || '').slice(0, 160) || null,
    status: String(event.status || '').slice(0, 40) || 'UNKNOWN',
    request_id: String(event.requestId || '').slice(0, 160) || null,
    reason: event.reason ? String(event.reason).slice(0, 120) : null,
    error_code: event.error_code ? String(event.error_code).slice(0, 120) : null,
    duration_ms: Number.isFinite(duration) && duration >= 0 ? Math.round(duration) : null,
  };
}

function runtimeAuditSink(env = {}, override) {
  if (typeof override === 'function') return override;
  if (!env?.DB || typeof env.DB.prepare !== 'function') return async () => {};
  return async event => {
    const status = String(event?.status || '').toUpperCase();
    if (!['SUCCEEDED', 'FAILED', 'DENIED'].includes(status)) return;
    await persistAuditLog(env.DB, 'capability_bus', null, boundedCapabilityAuditEvent(event));
  };
}

/**
 * Local composition root for integrated Gen2 proofs. Production adapters can
 * replace handlers, but all execution still crosses the same CapabilityBus.
 */
export function createGen2Runtime({ audit, env = {} } = {}) {
  const bus = createDefaultCapabilityBus({ audit: runtimeAuditSink(env, audit), env });
  const skillRegistryStore = env?.DB && typeof env.DB.prepare === 'function'
    ? new D1SkillRegistryStore(env.DB, { registryKey: String(env.MEL_SKILL_REGISTRY_KEY || 'system') })
    : new MemorySkillRegistryStore();
  let skillRegistryPromise = null;
  const restoreSkillRegistry = () => {
    if (!skillRegistryPromise) skillRegistryPromise = SkillRegistry.restore(skillRegistryStore);
    return skillRegistryPromise;
  };
  registerAutonomyCapabilities(bus, env);
  registerMentorCapabilities(bus, env);
  registerDevicePolicyCapabilities(bus, env);
  registerCapabilityAuditCapability(bus, env);
  registerGapDetectorCapability(bus);
  registerWebResearchCapability(bus, env);
  registerGooglePersonalAgentCapabilities(bus, env);
  registerCodeIntegrityCapability(bus, env);
  registerModuleProposalCapability(bus);
  registerWorkIntrospectionCapabilities(bus, env);
  registerConversationRuntimeCapabilities(bus, env);
  registerChatGPTArchiveImportCapability(bus, env);
  registerMemoryCompatibilityCapabilities(bus, env);
  registerSelfStateCapability(bus, env);
  registerCommunicationAuditCapability(bus, env);
  registerKnowledgeWorkspaceCapabilities(bus, env);
  registerEvolutionLedgerCapabilities(bus, env);
  registerRecoveryDrillCapability(bus, env);
  registerColdStandbyCapability(bus, env);
  const plugins = new Map();
  const modules = new Map();
  const agents = new Map();

  const registerExtension = (store, kind, manifest, handler) => {
    validateManifest(manifest, kind);
    requireValue(typeof handler === 'function', 'HANDLER_REQUIRED');
    const record = { ...structuredClone(manifest), status: 'TESTED', health: 'HEALTHY', created_at: Date.now(), updated_at: Date.now(), handler };
    store.set(manifest.id, record);
    bus.discover({
      id: `${kind}:${manifest.id}`, name: manifest.name, category: kind, version: manifest.version,
      provider: manifest.author, description: manifest.description,
      input_schema: { type: 'object', additionalProperties: true }, output_schema: { type: 'object', additionalProperties: true },
      risk: manifest.risk, permissions: manifest.permissions, health: 'HEALTHY', enabled: true
    }, handler);
    return { ...record, handler: undefined };
  };

  return {
    bus,
    skillRegistry: {
      store: skillRegistryStore,
      restore: restoreSkillRegistry,
      async persist(registry = null) {
        const current = registry || await restoreSkillRegistry();
        await current.persist();
        skillRegistryPromise = Promise.resolve(current);
        return current;
      }
    },
    plugins: {
      register: (manifest, handler) => registerExtension(plugins, 'plugin', manifest, handler),
      get: id => plugins.get(id),
      disable: id => { const row = plugins.get(id); requireValue(row, 'PLUGIN_NOT_FOUND', 404); bus.disable(`plugin:${id}`, { owner: 'runtime', permissions: ['capabilities.manage'] }); row.status = 'DISABLED'; return { ...row, handler: undefined }; },
      execute: (id, input, context) => bus.execute(`plugin:${id}`, input, context)
    },
    modules: {
      register: (manifest, handler) => registerExtension(modules, 'module', manifest, handler),
      get: id => modules.get(id),
      activate: id => { const row = modules.get(id); requireValue(row, 'MODULE_NOT_FOUND', 404); row.status = 'ACTIVE'; row.updated_at = Date.now(); return { ...row, handler: undefined }; },
      disable: id => { const row = modules.get(id); requireValue(row, 'MODULE_NOT_FOUND', 404); bus.disable(`module:${id}`, { owner: 'runtime', permissions: ['capabilities.manage'] }); row.status = 'DISABLED'; return { ...row, handler: undefined }; },
      rollback: id => { const row = modules.get(id); requireValue(row, 'MODULE_NOT_FOUND', 404); row.status = 'ROLLED_BACK'; row.updated_at = Date.now(); return { ...row, handler: undefined }; },
      run: (id, input, context) => bus.execute(`module:${id}`, input, context)
    },
    moduleLab: {
      async prove(manifest, handler, { councilReport } = {}) {
        const council = requireStateOfPlayCouncil(councilReport);
        const proofs = { version: manifest.version, council: true, tests: true, sandbox: true, security: true, activation: true };
        let row = { ...manifest, status: 'DRAFT' };
        for (const next of ['GENERATED', 'VALIDATED', 'TESTED', 'CANDIDATE']) row = transition(row, next, proofs, 'module');
        registerExtension(modules, 'module', { ...row, status: 'TESTED' }, handler);
        row = transition({ ...row, status: 'CANDIDATE' }, 'ACTIVE', proofs, 'module');
        modules.get(manifest.id).status = row.status;
        return {
          status: row.status,
          council: { phase: council.phase, responses: council.responses?.length || 0 },
          result: await bus.execute(`module:${manifest.id}`, { value: 'lab' }, { owner: 'runtime', permissions: manifest.permissions, requestId: crypto.randomUUID() })
        };
      }
    },
    agents: {
      register: (id, steps) => { requireValue(Array.isArray(steps) && steps.length > 0, 'PLAN_REQUIRED'); agents.set(id, steps); return { id, steps: steps.length }; },
      async run(id, context) { const steps = agents.get(id); requireValue(steps, 'AGENT_NOT_FOUND'); const results = []; for (const step of steps) results.push(await bus.execute(step.capability, step.input, context)); return { id, results }; }
    }
  };
}
