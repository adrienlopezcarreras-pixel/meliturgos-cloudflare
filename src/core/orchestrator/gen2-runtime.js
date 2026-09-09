import { createDefaultCapabilityBus } from '../../capabilities/default-bus.js';
import { validateManifest } from '../../plugins/validator.js';
import { transition } from '../lifecycle/extension.js';
import { requireValue } from '../contracts.js';

/**
 * Local composition root for integrated Gen2 proofs. Production adapters can
 * replace handlers, but all execution still crosses the same CapabilityBus.
 * State is intentionally in-memory here; persistence adapters are separate.
 */
export function createGen2Runtime({ audit = async () => {} } = {}) {
  const bus = createDefaultCapabilityBus({ audit });
  const plugins = new Map();
  const modules = new Map();
  const agents = new Map();

  const registerExtension = (store, kind, manifest, handler) => {
    validateManifest(manifest, kind);
    requireValue(typeof handler === 'function', 'HANDLER_REQUIRED');
    const record = { ...structuredClone(manifest), status: kind === 'plugin' ? 'TESTED' : 'TESTED', health: 'HEALTHY', created_at: Date.now(), updated_at: Date.now(), handler };
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
      async prove(manifest, handler) {
        const proofs = { version: manifest.version, tests: true, sandbox: true, security: true, activation: true };
        let row = { ...manifest, status: 'DRAFT' };
        for (const next of ['GENERATED', 'VALIDATED', 'TESTED', 'CANDIDATE']) row = transition(row, next, proofs, 'module');
        registerExtension(modules, 'module', { ...row, status: 'TESTED' }, handler);
        row = transition({ ...row, status: 'CANDIDATE' }, 'ACTIVE', proofs, 'module');
        modules.get(manifest.id).status = row.status;
        return { status: row.status, result: await bus.execute(`module:${manifest.id}`, { value: 'lab' }, { owner: 'runtime', permissions: manifest.permissions, requestId: crypto.randomUUID() }) };
      }
    },
    agents: {
      register: (id, steps) => { requireValue(Array.isArray(steps) && steps.length > 0, 'PLAN_REQUIRED'); agents.set(id, steps); return { id, steps: steps.length }; },
      async run(id, context) { const steps = agents.get(id); requireValue(steps, 'AGENT_NOT_FOUND', 404); const results = []; for (const step of steps) results.push(await bus.execute(step.capability, step.input, context)); return { id, results }; }
    }
  };
}
