import { createDefaultCapabilityBus } from '../../capabilities/default-bus.js';
import { registerAutonomyCapabilities } from '../../capabilities/autonomy-capabilities.js';
import { registerMentorCapabilities } from '../../capabilities/mentor-capabilities.js';
import { registerCapabilityAuditCapability } from '../../capabilities/capability-audit-capability.js';
import { registerDevicePolicyCapabilities } from '../../capabilities/device-policy-capabilities.js';
import { registerGapDetectorCapability } from '../../capabilities/gap-detector-capability.js';
import { registerWebResearchCapability } from '../../capabilities/web-research-capability.js';
import { registerCodeIntegrityCapability } from '../../capabilities/code-integrity-capability.js';
import { registerModuleProposalCapability } from '../../capabilities/module-proposal-capability.js';
import { registerWorkIntrospectionCapabilities } from '../../capabilities/work-introspection-capabilities.js';
import { registerConversationRuntimeCapabilities } from '../../capabilities/conversation-runtime-capabilities.js';
import { registerChatGPTArchiveImportCapability } from '../../capabilities/chatgpt-archive-import-capability.js';
import { registerMemoryCompatibilityCapabilities } from '../../capabilities/memory-compat-capabilities.js';
import { registerSelfStateCapability } from '../../capabilities/self-state-capability.js';
import { registerCommunicationAuditCapability } from '../../capabilities/communication-audit-capability.js';
import { registerKnowledgeWorkspaceCapabilities } from '../../capabilities/knowledge-workspace-capabilities.js';
import { registerSelfHealingCapabilities } from '../../capabilities/self-healing-capabilities.js';
import { registerNotificationCapabilities } from '../../capabilities/notification-capabilities.js';
import { registerConnectorOAuthCapabilities } from '../../capabilities/connector-oauth-capabilities.js';
import { validateManifest } from '../../plugins/validator.js';
import { createD1PluginRegistryAdapter, createPluginRuntime, createRegistry, createRegistryBackedPluginLoader } from '../../plugins/sdk.js';
import { createAgentRegistry, createD1AgentRegistryAdapter, createInMemoryAgentRegistryAdapter } from '../../agents/agent-registry.js';
import { createWorkAgentRuntime } from '../../agents/work-agent-runtime.js';
import { transition } from '../lifecycle/extension.js';
import { requireValue } from '../contracts.js';
import { requireStateOfPlayCouncil } from '../../teachers/model-council.js';
import { audit as persistAuditLog } from '../../audit/audit-service.js';

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
  registerAutonomyCapabilities(bus, env);
  registerMentorCapabilities(bus, env);
  registerDevicePolicyCapabilities(bus, env);
  registerCapabilityAuditCapability(bus, env);
  registerGapDetectorCapability(bus);
  registerWebResearchCapability(bus, env);
  registerCodeIntegrityCapability(bus, env);
  registerModuleProposalCapability(bus);
  registerWorkIntrospectionCapabilities(bus, env);
  registerConversationRuntimeCapabilities(bus, env);
  registerChatGPTArchiveImportCapability(bus, env);
  registerMemoryCompatibilityCapabilities(bus, env);
  registerSelfStateCapability(bus, env);
  registerCommunicationAuditCapability(bus, env);
  registerKnowledgeWorkspaceCapabilities(bus, env);
  registerSelfHealingCapabilities(bus, env);
  registerNotificationCapabilities(bus, env);
  registerConnectorOAuthCapabilities(bus, env);
  const pluginRegistry = env?.DB && typeof env.DB.prepare === 'function'
    ? createRegistry(createD1PluginRegistryAdapter(env.DB))
    : null;
  const pluginRuntime = createPluginRuntime({ registry: pluginRegistry });
  const pluginResolver = typeof env?.MEL_PLUGIN_RESOLVER === 'function' ? env.MEL_PLUGIN_RESOLVER : null;
  const pluginLoader = pluginRegistry && pluginResolver
    ? createRegistryBackedPluginLoader({
        registry: pluginRegistry,
        runtime: pluginRuntime,
        resolvePlugin: pluginResolver,
      })
    : null;
  const modules = new Map();
  const agentRegistry = createAgentRegistry(
    env?.DB && typeof env.DB.prepare === 'function'
      ? createD1AgentRegistryAdapter(env.DB)
      : createInMemoryAgentRegistryAdapter(),
  );
  const deployedSha = String(env?.MEL_DEPLOYED_GIT_SHA || env?.MEL_GITHUB_SHA || '');
  const agentRuntime = createWorkAgentRuntime({
    db: env?.DB && typeof env.DB.prepare === 'function' ? env.DB : null,
    bus,
    registry: agentRegistry,
    sourceSha: /^[a-f0-9]{40}$/i.test(deployedSha) ? deployedSha : '',
  });

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

  const capabilityManageContext = {
    owner: 'runtime',
    permissions: ['capabilities.manage'],
    requestId: 'runtime-plugin-bootstrap',
  };

  const exposePluginOnBus = manifest => {
    const capabilityName = manifest.capabilities?.[0] || 'execute';
    const record = {
      id: `plugin:${manifest.id}`,
      name: manifest.name,
      category: 'plugin',
      version: manifest.version,
      provider: manifest.author,
      description: manifest.description,
      input_schema: { type: 'object', additionalProperties: true },
      output_schema: { type: 'object', additionalProperties: true },
      risk: manifest.risk,
      permissions: manifest.permissions,
      health: 'HEALTHY',
      enabled: true,
    };
    const execute = (input, context) => pluginRuntime.execute(manifest.id, capabilityName, input, context);
    try {
      bus.describe(record.id);
      return bus.replace(record, execute);
    } catch (error) {
      if (error?.code !== 'CAPABILITY_NOT_FOUND') throw error;
      return bus.discover(record, execute);
    }
  };

  const requirePluginLoader = () => {
    requireValue(pluginLoader, 'PLUGIN_DURABLE_RUNTIME_UNAVAILABLE', 503);
    return pluginLoader;
  };

  const registerInlinePlugin = async (manifest, handler) => {
    validateManifest(manifest, 'plugin');
    requireValue(typeof handler === 'function', 'HANDLER_REQUIRED');
    const capabilities = manifest.capabilities?.length ? [...manifest.capabilities] : ['execute'];
    const runtimeManifest = { ...structuredClone(manifest), capabilities };
    const runtimeCapabilities = Object.fromEntries(capabilities.map(name => [name, handler]));
    const result = await pluginRuntime.register({
      manifest: runtimeManifest,
      capabilities: runtimeCapabilities,
      async activate() {},
      async deactivate() {},
    }, {
      owner: 'runtime',
      permissions: runtimeManifest.permissions,
      requestId: crypto.randomUUID(),
      pluginPersistence: false,
    });
    requireValue(result.status === 'ACTIVE', result.error || 'PLUGIN_ACTIVATION_FAILED', 409);
    exposePluginOnBus(result.manifest);
    return result;
  };

  const loadDurablePlugin = async (input, context = {}) => {
    const result = await requirePluginLoader().load(input, context);
    if (result.status === 'ACTIVE') exposePluginOnBus(result.manifest);
    return result;
  };

  const disablePlugin = async (id, context = {}) => {
    const current = pluginRuntime.get(id);
    let result;
    if (current?.status === 'ACTIVE') {
      result = await pluginRuntime.deactivate(id, {
        owner: context.owner || 'runtime',
        permissions: context.permissions || current.manifest.permissions || [],
        requestId: context.requestId || crypto.randomUUID(),
      });
    } else if (pluginLoader) {
      result = await pluginLoader.disable({ plugin_id: id }, context);
    } else {
      requireValue(current, 'PLUGIN_NOT_FOUND', 404);
      result = current;
    }

    try { bus.disable(`plugin:${id}`, capabilityManageContext); }
    catch (error) { if (error?.code !== 'CAPABILITY_NOT_FOUND') throw error; }
    return result;
  };

  const normalizeLegacyAgent = (id, steps) => {
    requireValue(typeof id === 'string' && id.trim(), 'AGENT_ID_REQUIRED', 400);
    requireValue(Array.isArray(steps) && steps.length > 0, 'PLAN_REQUIRED');
    return {
      id: id.trim(),
      version: '1.0.0',
      name: id.trim(),
      description: 'Compatibility agent registered through createGen2Runtime',
      steps: steps.map((step, index) => ({
        id: String(step?.id || `step-${index + 1}`),
        kind: String(step?.kind || 'TASK').toUpperCase(),
        depends_on: Array.isArray(step?.depends_on) ? step.depends_on : [],
        idempotent: step?.idempotent === true,
        capability: step?.capability,
        input: step?.input ?? {},
        ...(step?.request ? { request: step.request } : {}),
        ...(step?.use_run_input === true ? { use_run_input: true } : {}),
      })),
    };
  };

  const registerAgent = async (definitionOrId, steps) => {
    const definition = typeof definitionOrId === 'string'
      ? normalizeLegacyAgent(definitionOrId, steps)
      : definitionOrId;
    const record = await agentRegistry.register({ definition });
    return {
      id: record.id,
      version: record.version,
      status: record.status,
      steps: record.steps.length,
      required_capabilities: record.required_capabilities,
    };
  };

  const runAgent = async (agentOrInput, context = {}) => {
    const input = typeof agentOrInput === 'string'
      ? { agent_id: agentOrInput, run_id: crypto.randomUUID() }
      : { ...(agentOrInput || {}) };
    if (!input.run_id) input.run_id = crypto.randomUUID();
    const result = await agentRuntime.run(input, context);
    return {
      id: result.agent.id,
      version: result.agent.version,
      run_id: result.run_id,
      status: result.summary.status,
      results: result.dag.nodes
        .filter(node => node.status === 'COMPLETED')
        .map(node => node.result),
      summary: result.summary,
      dag: result.dag,
    };
  };

  const rollbackPlugin = async (input, context = {}) => {
    const result = await requirePluginLoader().rollback(input, context);
    if (result?.active?.status === 'ACTIVE') exposePluginOnBus(result.active.manifest);
    return result;
  };

  return {
    bus,
    plugins: {
      register: registerInlinePlugin,
      get: id => pluginRuntime.get(id),
      disable: disablePlugin,
      execute: (id, input, context) => bus.execute(`plugin:${id}`, input, context),
      installCandidate: (input, context) => requirePluginLoader().installCandidate(input, context),
      load: loadDurablePlugin,
      health: input => requirePluginLoader().health(input),
      rollback: rollbackPlugin,
      durableAvailable: Boolean(pluginLoader),
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
      register: registerAgent,
      get: input => agentRegistry.get(typeof input === 'string' ? { agent_id: input } : input),
      list: input => agentRegistry.list(input || {}),
      disable: input => agentRegistry.disable(typeof input === 'string' ? { agent_id: input } : input),
      run: runAgent,
      resume: (input, context = {}) => agentRuntime.resume(input, context),
      getRun: input => agentRuntime.getRun(input),
      cancel: (input, context = {}) => agentRuntime.cancel(input, context),
    }
  };
}
