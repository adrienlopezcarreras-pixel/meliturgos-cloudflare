import { getChatGPTImportStatus } from '../persistence/chatgpt-archive-importer.js';

function failure(error) {
  return {
    ok: false,
    error: String(error?.code || error?.message || 'OBSERVATION_UNAVAILABLE').slice(0, 200),
  };
}

async function observeCapability(bus, id, input, context) {
  try {
    return { ok: true, data: await bus.execute(id, input, context) };
  } catch (error) {
    return failure(error);
  }
}

async function observeChatGPT(env) {
  try {
    return { ok: true, data: await getChatGPTImportStatus(env) };
  } catch (error) {
    return failure(error);
  }
}

function compactCodeObservation(section) {
  if (!section?.ok) return section;
  const value = section.data || {};
  const deployed = value.self_code && typeof value.self_code === 'object'
    ? {
        repository: value.self_code.repository || null,
        branch: value.self_code.branch || null,
        commit: value.self_code.commit || null,
        branch_known: value.self_code.branch_known === true,
        commit_known: value.self_code.commit_known === true,
        exact_identity_known: value.self_code.exact_identity_known === true,
        source: value.self_code.source || null,
        inspected_branch: value.self_code.inspected_branch || null,
        inspected_head: value.self_code.inspected_head || null,
        inspected_branch_matches_deployment: value.self_code.inspected_branch_matches_deployment ?? null,
        inspected_head_matches_deployment: value.self_code.inspected_head_matches_deployment ?? null,
      }
    : null;
  return {
    ok: true,
    data: {
      status: value.status || 'UNKNOWN',
      repository: value.repository || null,
      branch: value.branch || null,
      head: value.head || null,
      self_code: deployed,
      failures: Array.isArray(value.failures)
        ? value.failures.slice(0, 8).map(row => ({ code: String(row?.code || 'UNKNOWN').slice(0, 120) }))
        : [],
    },
  };
}

/**
 * Bounded read-only self-observation used by conversational introspection.
 * It aggregates evidence that already has canonical capability/API owners rather
 * than inventing a second state store.
 */
export async function collectSelfState({ bus, env = {}, context = {} } = {}) {
  if (!bus || typeof bus.execute !== 'function') {
    throw Object.assign(new Error('CAPABILITY_BUS_REQUIRED'), { code: 'CAPABILITY_BUS_REQUIRED' });
  }

  // Keep DB-backed observations ordered so local/test SQLite adapters do not
  // race schema migrations. Each sub-observation is fail-soft and names only
  // the source that could not be observed.
  const chatgpt = await observeChatGPT(env);
  const memory = await observeCapability(bus, 'memory.status', {}, context);
  const work = await observeCapability(bus, 'work.open', { limit: 20 }, context);
  const system = await observeCapability(bus, 'system.bindings', {}, context);
  const code = compactCodeObservation(await observeCapability(
    bus,
    'code.integrity',
    { paths: ['src/index.js'] },
    context,
  ));

  const sections = { code, work, memory, chatgpt_import: chatgpt, system };
  return {
    ok: Object.values(sections).some(section => section?.ok === true),
    observed_at: new Date().toISOString(),
    scope: 'bounded_read_only_runtime_observation',
    sections,
    capabilities: {
      registered: typeof bus.list === 'function' ? bus.list().length : null,
    },
    interpretation: {
      observed_now: 'A section with ok=true was queried during this request.',
      unavailable: 'A section with ok=false is unavailable by itself; it does not prove a global lack of access.',
      browser_boundary: 'This is structured runtime/tool observation, not visual access to unrelated browser tabs.',
      uncommitted_boundary: 'Remote code state cannot reveal another page changes that have not been committed to the observed branch.',
    },
  };
}

export function registerSelfStateCapability(bus, env = {}) {
  bus.discover({
    id: 'self.state',
    name: 'État interne observé de MEL',
    category: 'diagnostic',
    version: '1.0.0',
    provider: 'mel',
    description: 'Aggregates bounded read-only evidence about MEL code identity, persistent work, memory, ChatGPT import and runtime bindings for grounded self-introspection.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, (_input, context = {}) => collectSelfState({ bus, env, context }));

  return bus;
}
