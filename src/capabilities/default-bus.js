import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { RAGService } from '../search/rag-service.js';
import { getRoadmapPayload } from '../roadmap/master-roadmap.js';
import { normalizeChatGPTArchive } from '../persistence/chatgpt-archive-importer.js';
import { createConversationService } from '../conversations/conversation-service.js';
import { runAugmentioStateOfPlay } from '../teachers/augmentio-council.js';
import { prepareDevelopmentRequest } from '../evolution/development-preflight.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const DEFAULT_BRANCH = 'release/mel-2026-09-09-r1';
let inheritedRuntimeEnv = Object.freeze({});

/**
 * Compatibility bridge for worker.js, which historically constructed the bus
 * without passing env. Only the bindings/configuration required by capabilities
 * are retained; authentication passwords are deliberately excluded.
 */
export function setDefaultCapabilityEnvironment(env = {}) {
  inheritedRuntimeEnv = Object.freeze({
    AI: env.AI,
    DB: env.DB,
    MEDIA_BUCKET: env.MEDIA_BUCKET,
    MELITURGOS_USER: env.MELITURGOS_USER,
    MEL_GITHUB_REPOSITORY: env.MEL_GITHUB_REPOSITORY,
    MEL_GITHUB_BRANCH: env.MEL_GITHUB_BRANCH,
    MEL_GITHUB_TOKEN: env.MEL_GITHUB_TOKEN,
    MEL_GITHUB_FETCH: env.MEL_GITHUB_FETCH,
  });
  return {
    ai: Boolean(inheritedRuntimeEnv.AI),
    db: Boolean(inheritedRuntimeEnv.DB),
    media_bucket: Boolean(inheritedRuntimeEnv.MEDIA_BUCKET),
    owner: Boolean(inheritedRuntimeEnv.MELITURGOS_USER),
    github_repository: inheritedRuntimeEnv.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
    github_branch: inheritedRuntimeEnv.MEL_GITHUB_BRANCH || DEFAULT_BRANCH,
  };
}

function capabilityError(message, code = message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const councilInputSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', minLength: 1, maxLength: 4000 },
    context: { type: 'object', additionalProperties: true },
    minResponses: { type: 'integer', minimum: 2, maximum: 12 }
  },
  required: ['goal'],
  additionalProperties: false
};

/** Safe capability bus used by MEL's Gen2 runtime. Only real executable handlers are registered. */
export function createDefaultCapabilityBus({ audit, env, repository, branch, token, fetchImpl } = {}) {
  const runtimeEnv = env === undefined ? inheritedRuntimeEnv : env;
  const bus = new CapabilityBus({ audit });

  bus.discover({
    id: 'echo', name: 'Diagnostic echo', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value to prove the CapabilityBus execution path.',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  const githubRepository = repository || runtimeEnv.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const githubBranch = branch || runtimeEnv.MEL_GITHUB_BRANCH || DEFAULT_BRANCH;
  const githubToken = token ?? runtimeEnv.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || runtimeEnv.MEL_GITHUB_FETCH || fetch;
  registerGitHubCodeCapabilities(bus, {
    repository: githubRepository,
    branch: githubBranch,
    token: githubToken,
    fetchImpl: githubFetch,
  });

  bus.discover({
    id: 'augmentio.fanout', name: '.augmentio multi-AI', category: 'orchestration', version: '0.2.0', provider: 'mel',
    description: 'Runs real parallel multi-model orchestration through the explicitly zero-added-cost provider pool.',
    input_schema: { type: 'object', properties: { capability: { type: 'string', minLength: 1, maxLength: 100 }, input: { type: 'string', minLength: 1, maxLength: 12000 }, context: { type: 'object', additionalProperties: true }, maxCandidates: { type: 'integer', minimum: 1, maximum: 12 } }, required: ['input'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.AI ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(runtimeEnv) });
    return augmentio.fanOut({
      capability: String(input.capability || 'GENERAL'),
      input: input.input,
      context: input.context || {},
      maxCandidates: Math.min(12, Math.max(1, Number(input.maxCandidates) || 4))
    });
  });

  bus.discover({
    id: 'council.state-of-play', name: 'Council multi-IA — état des lieux', category: 'evolution', version: '1.0.0', provider: 'mel',
    description: 'Asks multiple explicitly zero-added-cost AIs for an independent state-of-play before development starts.',
    input_schema: councilInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.AI ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    return runAugmentioStateOfPlay({
      env: runtimeEnv,
      goal: input.goal,
      context: input.context || {},
      minResponses: Math.max(2, Number(input.minResponses) || 2)
    });
  });

  bus.discover({
    id: 'evolution.preflight', name: 'Préflight de nouvelle compétence', category: 'evolution', version: '1.0.0', provider: 'mel',
    description: 'Enforces AI-first state-of-play and stops before code generation until existing code is inspected.',
    input_schema: councilInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.AI ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!runtimeEnv.AI) throw capabilityError('AI_BINDING_MISSING');
    return prepareDevelopmentRequest({
      env: runtimeEnv,
      goal: input.goal,
      context: input.context || {},
      minResponses: Math.max(2, Number(input.minResponses) || 2)
    });
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
    owner_configured: Boolean(runtimeEnv.MELITURGOS_USER)
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

  return bus;
}
