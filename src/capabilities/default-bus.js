import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';
import { registerPlatformReadCapabilities } from './platform-read-capabilities.js';
import { registerPlatformControlCapabilities } from './platform-control-capabilities.js';
import { registerWorkCapabilities } from './work-capabilities.js';
import { registerBrowserRuntimeCapabilities } from './browser-runtime-capabilities.js';
import { registerComputerRuntimeCapabilities } from './computer-runtime-capabilities.js';
import { registerCreativeMediaCapabilities } from './creative-media-capabilities.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { inspectZeroCostProviderReadiness } from '../augmentio/zero-cost-readiness.js';
import { RAGService } from '../search/rag-service.js';
import { getRoadmapPayload } from '../roadmap/master-roadmap.js';
import { normalizeChatGPTArchive } from '../persistence/chatgpt-archive-importer.js';
import { createConversationService } from '../conversations/conversation-service.js';
import { runAugmentioStateOfPlay } from '../teachers/augmentio-council.js';
import { runModelCouncil } from '../models/model-council.js';
import { prepareDevelopmentRequest } from '../evolution/development-preflight.js';
import { enqueueOwnerDevelopmentRequest } from '../evolution/owner-development-queue.js';
import { createProviderEscapeCapsule, providerEscapeSummary } from '../portability/provider-escape-capsule.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const DEFAULT_BRANCH = 'candidate/mel-clean-autonomy';
const DEFAULT_TEACHER_BRANCH = 'candidate/mel-clean-autonomy';

function compileTimeDeployedGitIdentity() {
  const branch = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined'
    ? String(MEL_DEPLOYED_GIT_BRANCH || '').trim()
    : String(globalThis?.MEL_DEPLOYED_GIT_BRANCH || '').trim();
  const sha = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined'
    ? String(MEL_DEPLOYED_GIT_SHA || '').trim()
    : String(globalThis?.MEL_DEPLOYED_GIT_SHA || '').trim();
  return { branch, sha };
}
/**
 * Compatibility diagnostic only. Runtime capabilities must receive env
 * explicitly; no request bindings are retained globally between requests.
 */
export function setDefaultCapabilityEnvironment(env = {}) {
  return {
    ai: Boolean(env.AI),
    db: Boolean(env.DB),
    media_bucket: Boolean(env.MEDIA_BUCKET),
    owner: Boolean(env.MELITURGOS_USER),
    github_repository: env.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    github_branch: env.MEL_GITHUB_BRANCH || DEFAULT_BRANCH,
    teacher_branch: env.MEL_TEACHER_BRANCH || DEFAULT_TEACHER_BRANCH,
    browser_companion: Boolean(env.MEL_BROWSER_COMPANION?.fetch),
  };
}

function capabilityError(message, code = message, status) {
  const error = new Error(message);
  error.code = code;
  if (status) error.status = status;
  return error;
}

const modelCouncilInputSchema = {
  type: 'object',
  properties: {
    request: { type: 'object', additionalProperties: true },
    capability: { type: 'string', minLength: 1, maxLength: 100 },
    maxCandidates: { type: 'integer', minimum: 1, maximum: 12 },
    timeoutMs: { type: 'integer', minimum: 100, maximum: 120000 }
  },
  required: ['request'],
  additionalProperties: false
};

const councilInputSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', minLength: 0, maxLength: 4000 },
    context: { type: 'object', additionalProperties: true },
    minResponses: { type: 'integer', minimum: 2, maximum: 12 }
  },
  additionalProperties: false
};

const enqueueInputSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', minLength: 1, maxLength: 4000 },
    conversationId: { type: 'string', minLength: 0, maxLength: 200 },
    requestKey: { type: 'string', minLength: 0, maxLength: 200 }
  },
  required: ['goal'],
  additionalProperties: false
};

const augmentioMessageSchema = {
  type: 'object',
  properties: {
    role: { type: 'string', minLength: 1, maxLength: 40 },
    content: { type: 'string', minLength: 0, maxLength: 12000 },
  },
  required: ['role', 'content'],
  additionalProperties: false,
};

function zeroCostHealth(runtimeEnv, minimum = 1) {
  return async () => inspectZeroCostProviderReadiness(runtimeEnv, {
    capability: 'GENERAL',
    minimum,
    refreshHealth: true,
  });
}

/** Safe capability bus used by MEL's Gen2 runtime. Only real executable handlers are registered. */
export function createDefaultCapabilityBus({ audit, env, repository, branch, token, fetchImpl } = {}) {
  const runtimeEnv = env || {};
  const bus = new CapabilityBus({ audit });

  bus.discover({
    id: 'echo', name: 'Diagnostic echo', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value to prove the CapabilityBus execution path.',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  const githubRepository = repository || runtimeEnv.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const definedIdentity = compileTimeDeployedGitIdentity();
  const deployedBranch = String(runtimeEnv.MEL_DEPLOYED_GIT_BRANCH || definedIdentity.branch || '').trim();
  const deployedSha = String(runtimeEnv.MEL_DEPLOYED_GIT_SHA || definedIdentity.sha || '').trim();
  const githubBranch = branch || deployedBranch || runtimeEnv.MEL_GITHUB_BRANCH || DEFAULT_BRANCH;
  const githubToken = token ?? runtimeEnv.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || runtimeEnv.MEL_GITHUB_FETCH || fetch;
  const platformFetch = fetchImpl || runtimeEnv.MEL_PLATFORM_FETCH || fetch;
  registerGitHubCodeCapabilities(bus, {
    repository: githubRepository,
    branch: githubBranch,
    pinnedSha: /^[0-9a-f]{40}$/i.test(deployedSha) ? deployedSha : '',
    token: githubToken,
    fetchImpl: githubFetch,
  });
  registerPlatformReadCapabilities(bus, {
    env: runtimeEnv,
    repository: githubRepository,
    fetchImpl: platformFetch,
  });
  registerPlatformControlCapabilities(bus, {
    env: runtimeEnv,
    repository: githubRepository,
    fetchImpl: platformFetch,
  });

  bus.discover({
    id: 'augmentio.fanout', name: '.augmentio multi-AI', category: 'orchestration', version: '0.3.0', provider: 'mel',
    description: 'Runs real parallel multi-model orchestration through the explicitly zero-added-cost provider pool.',
    input_schema: {
      type: 'object',
      properties: {
        capability: { type: 'string', minLength: 1, maxLength: 100 },
        input: { type: 'string', minLength: 1, maxLength: 12000 },
        messages: { type: 'array', items: augmentioMessageSchema },
        context: { type: 'object', additionalProperties: true },
        maxCandidates: { type: 'integer', minimum: 1, maximum: 12 }
      },
      required: ['input'],
      additionalProperties: false
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'DEGRADED', healthcheck: zeroCostHealth(runtimeEnv, 1), enabled: true
  }, async input => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(runtimeEnv) });
    return augmentio.fanOut({
      capability: String(input.capability || 'GENERAL'),
      input: Array.isArray(input.messages) && input.messages.length ? input.messages : input.input,
      context: input.context || {},
      maxCandidates: Math.min(12, Math.max(1, Number(input.maxCandidates) || 4))
    });
  });

  bus.discover({
    id: 'model.council', name: 'Model Council générique', category: 'orchestration', version: '1.0.0', provider: 'mel',
    description: 'Collects one independent critique per unique provider/model through the zero-euro pool, then runs a separate MEL synthesis.',
    input_schema: modelCouncilInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'DEGRADED', healthcheck: zeroCostHealth(runtimeEnv, 2), enabled: true
  }, async (input, context = {}) => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    return runModelCouncil({
      env: runtimeEnv,
      request: input.request,
      capability: String(input.capability || 'GENERAL'),
      maxCandidates: Math.min(12, Math.max(1, Number(input.maxCandidates) || 4)),
      timeoutMs: Math.min(120000, Math.max(100, Number(input.timeoutMs) || 30000)),
      signal: context.signal,
    });
  });

  bus.discover({
    id: 'council.state-of-play', name: 'Council multi-IA — état des lieux', category: 'evolution', version: '1.1.0', provider: 'mel',
    description: 'Asks multiple explicitly zero-added-cost AIs for an independent state-of-play before development starts.',
    input_schema: councilInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'DEGRADED', healthcheck: zeroCostHealth(runtimeEnv, 2), enabled: true
  }, async input => {
    if (!String(input.goal || '').trim()) throw capabilityError('COUNCIL_GOAL_REQUIRED', 'COUNCIL_GOAL_REQUIRED', 400);
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    return runAugmentioStateOfPlay({
      env: runtimeEnv,
      goal: input.goal,
      context: input.context || {},
      minResponses: Math.max(2, Number(input.minResponses) || 2)
    });
  });

  bus.discover({
    id: 'evolution.preflight', name: 'Préflight de nouvelle compétence', category: 'evolution', version: '1.1.0', provider: 'mel',
    description: 'Enforces AI-first state-of-play and stops before code generation until existing code is inspected.',
    input_schema: councilInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'DEGRADED', healthcheck: zeroCostHealth(runtimeEnv, 2), enabled: true
  }, async input => {
    if (!String(input.goal || '').trim()) throw capabilityError('DEVELOPMENT_GOAL_REQUIRED', 'DEVELOPMENT_GOAL_REQUIRED', 400);
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    return prepareDevelopmentRequest({
      env: runtimeEnv,
      goal: input.goal,
      context: input.context || {},
      minResponses: Math.max(2, Number(input.minResponses) || 2)
    });
  });

  bus.discover({
    id: 'evolution.enqueue', name: 'Lancer un développement autonome supervisé', category: 'evolution', version: '1.0.0', provider: 'mel',
    description: 'Persists an owner-requested development job, runs the mandatory multi-AI Council and candidate inspection, then queues the Teacher review so work can continue asynchronously.',
    input_schema: enqueueInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health: runtimeEnv.DB ? 'DEGRADED' : 'UNAVAILABLE', healthcheck: async () => {
      if (!runtimeEnv.DB) return { status: 'OFFLINE', reason: 'DB_BINDING_UNAVAILABLE' };
      return inspectZeroCostProviderReadiness(runtimeEnv, { capability: 'GENERAL', minimum: 2, refreshHealth: true });
    }, enabled: true
  }, async input => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    return enqueueOwnerDevelopmentRequest({
      env: runtimeEnv,
      goal: input.goal,
      conversationId: input.conversationId || '',
      requestKey: input.requestKey || '',
      fetchImpl: githubFetch,
      capabilities: bus.list(),
    });
  });

  bus.discover({
    id: 'portability.escape.plan',
    name: 'Provider Escape Capsule',
    category: 'portability',
    version: '1.0.0',
    provider: 'mel',
    description: 'Builds a plan-only provider escape capsule for AI, storage and runtime from a validated provider-neutral manifest. It never activates or migrates a provider.',
    input_schema: {
      type: 'object',
      properties: {
        manifest: { type: 'object', additionalProperties: true },
        layers: { type: 'object', additionalProperties: true },
        generated_at: { type: 'string', minLength: 1, maxLength: 80 },
        source: { type: 'object', additionalProperties: true },
      },
      required: ['manifest','layers'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async input => {
    const capsule = createProviderEscapeCapsule({
      manifest: input.manifest,
      layers: input.layers,
      generated_at: input.generated_at,
      source: input.source || {},
    });
    return {
      ok: true,
      capsule,
      summary: providerEscapeSummary(capsule),
      execution_started: false,
      activation_allowed: false,
    };
  });

  bus.discover({
    id: 'roadmap.read', name: 'Feuille de route MEL', category: 'planning', version: '1.0.0', provider: 'core',
    description: 'Returns the complete product roadmap and truthful implementation statuses.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async () => getRoadmapPayload());

  bus.discover({
    id: 'system.bindings', name: 'Diagnostic des bindings', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Reports which runtime bindings are configured without exposing secrets.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async () => ({
    ai: Boolean(runtimeEnv.AI), db: Boolean(runtimeEnv.DB), media_bucket: Boolean(runtimeEnv.MEDIA_BUCKET),
    github_repository: githubRepository, github_branch: githubBranch,
    github_control_configured: Boolean(runtimeEnv.MEL_GITHUB_TOKEN && runtimeEnv.MEL_GITHUB_WRITABLE_WORKFLOWS),
    cloudflare_control_configured: Boolean(runtimeEnv.CLOUDFLARE_API_TOKEN && runtimeEnv.CLOUDFLARE_ACCOUNT_ID && runtimeEnv.MEL_CLOUDFLARE_SCRIPT),
    vercel_control_configured: Boolean(runtimeEnv.VERCEL_TOKEN && runtimeEnv.MEL_VERCEL_PROJECT_ID && runtimeEnv.MEL_VERCEL_PROJECT_NAME),
    owner_configured: Boolean(runtimeEnv.MELITURGOS_USER),
    browser_companion: Boolean(runtimeEnv.MEL_BROWSER_COMPANION?.fetch),
  }));

  bus.discover({
    id: 'rag.search', name: 'Recherche mémoire RAG', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Searches MEL persistent personal knowledge for relevant records.',
    input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 2000 }, limit: { type: 'integer', minimum: 1, maximum: 50 }, minSimilarity: { type: 'number' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['query'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!runtimeEnv.MELITURGOS_USER) throw capabilityError('MELITURGOS_USER_MISSING');
    return RAGService.search(runtimeEnv.DB, runtimeEnv.MELITURGOS_USER, input.query, {
      sources: input.sources,
      limit: input.limit,
      minSimilarity: input.minSimilarity
    });
  });

  bus.discover({
    id: 'chatgpt.history.search', name: 'Rechercher dans l’historique ChatGPT collecté', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Searches messages ingested by the ChatGPT Collector/export with conversation title, role, provenance and completeness metadata.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 12000 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
        roles: { type: 'array', items: { type: 'string', enum: ['user','assistant','system','tool'] }, minItems: 1, maxItems: 4 }
      },
      required: ['query'],
      additionalProperties: false
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!runtimeEnv.MELITURGOS_USER) throw capabilityError('MELITURGOS_USER_MISSING');
    return RAGService.searchCollector(runtimeEnv.DB, runtimeEnv.MELITURGOS_USER, input.query, {
      limit: input.limit,
      roles: input.roles,
    });
  });

  bus.discover({
    id: 'conversation.list', name: 'Lister les conversations', category: 'conversation', version: '1.0.0', provider: 'core',
    description: 'Lists the owner conversations archived by ConversationService.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async () => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    return createConversationService(runtimeEnv).list({ owner: runtimeEnv.MELITURGOS_USER || '' });
  });

  bus.discover({
    id: 'chatgpt.archive.preview', name: 'Prévisualiser archive ChatGPT', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Recognizes a ChatGPT conversations export and reports import counts without writing data.',
    input_schema: { type: 'object', additionalProperties: true },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ ok: true, preview: true, ...normalizeChatGPTArchive(input.archive ?? input).summary }));

  registerCreativeMediaCapabilities(bus, { env: runtimeEnv });
  registerBrowserRuntimeCapabilities(bus, {
    binding: runtimeEnv.MEL_BROWSER_COMPANION,
    endpoint: runtimeEnv.MEL_BROWSER_COMPANION_ENDPOINT,
    timeoutMs: runtimeEnv.MEL_BROWSER_COMPANION_TIMEOUT_MS,
  });
  registerComputerRuntimeCapabilities(bus, { db: runtimeEnv.DB });
  registerWorkCapabilities(bus, { db: runtimeEnv.DB });
  return bus;
}
