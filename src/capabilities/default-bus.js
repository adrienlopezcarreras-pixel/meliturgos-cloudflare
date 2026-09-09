import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { RAGService } from '../search/rag-service.js';
import { getRoadmapPayload } from '../roadmap/master-roadmap.js';
import { normalizeChatGPTArchive } from '../persistence/chatgpt-archive-importer.js';
import { createConversationService } from '../conversations/conversation-service.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const DEFAULT_BRANCH = 'release/mel-2026-09-09-r1';

function capabilityError(message, code = message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** Safe capability bus used by MEL's Gen2 runtime. Only real executable handlers are registered. */
export function createDefaultCapabilityBus({ audit, env = {}, repository, branch, token, fetchImpl } = {}) {
  const bus = new CapabilityBus({ audit });

  bus.discover({
    id: 'echo', name: 'Diagnostic echo', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value to prove the CapabilityBus execution path.',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  const githubRepository = repository || env.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const githubBranch = branch || env.MEL_GITHUB_BRANCH || DEFAULT_BRANCH;
  const githubToken = token ?? env.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || env.MEL_GITHUB_FETCH || fetch;
  registerGitHubCodeCapabilities(bus, {
    repository: githubRepository,
    branch: githubBranch,
    token: githubToken,
    fetchImpl: githubFetch,
  });

  bus.discover({
    id: 'augmentio.fanout', name: '.augmentio multi-AI', category: 'orchestration', version: '0.2.0', provider: 'mel',
    description: 'Runs real parallel multi-model orchestration through the explicitly zero-added-cost provider pool.',
    input_schema: { type: 'object', properties: { capability: { type: 'string' }, input: {}, context: { type: 'object' }, maxCandidates: { type: 'integer', minimum: 1, maximum: 12 } }, required: ['input'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.AI ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!env.AI) throw capabilityError('AI_BINDING_MISSING');
    const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });
    return augmentio.fanOut({
      capability: String(input.capability || 'GENERAL'),
      input: input.input,
      context: input.context || {},
      maxCandidates: Math.min(12, Math.max(1, Number(input.maxCandidates) || 4))
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
    ai: Boolean(env.AI), db: Boolean(env.DB), media_bucket: Boolean(env.MEDIA_BUCKET),
    github_repository: githubRepository, github_branch: githubBranch,
    owner_configured: Boolean(env.MELITURGOS_USER)
  }));

  bus.discover({
    id: 'rag.search', name: 'Recherche mémoire RAG', category: 'memory', version: '1.0.0', provider: 'core',
    description: 'Searches MEL persistent personal knowledge for relevant records.',
    input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 2000 }, limit: { type: 'integer', minimum: 1, maximum: 50 }, minSimilarity: { type: 'number' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['query'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: env.DB ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async input => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    if (!env.MELITURGOS_USER) throw capabilityError('MELITURGOS_USER_MISSING');
    return RAGService.search(env.DB, env.MELITURGOS_USER, input.query, {
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
    risk: 'LOW', permissions: [], health: env.DB ? 'HEALTHY' : 'DEGRADED', enabled: true
  }, async () => {
    if (!env.DB) throw capabilityError('DB_BINDING_MISSING');
    return createConversationService(env).list({ owner: env.MELITURGOS_USER || '' });
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
