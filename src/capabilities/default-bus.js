import { apiVersionRegistry, resolveApiVersionRequest, API_CURRENT_VERSION } from '../api/api-versioning.js';
import { generateCompletionMatrix } from '../roadmap/completion-matrix.js';
import { generateFinalStatusReport, FINAL_STATUS_REPORT_SCHEMA } from '../roadmap/final-status-report.js';
import { buildMelIdentityPrompt, MEL_IDENTITY } from '../identity/mel-persona.js';
import { systemPrompt } from '../identity/identity.js';
import { councilOperationalCatalog } from '../council/operational-catalog.js';
import { computeRoadmapTruth } from '../roadmap/roadmap-truth.js';
import { CapabilityBus } from './capability-bus.js';
import { registerGitHubCodeCapabilities } from './github-code-capabilities.js';
import { registerPlatformReadCapabilities } from './platform-read-capabilities.js';
import { registerPlatformControlCapabilities } from './platform-control-capabilities.js';
import { registerWorkCapabilities } from './work-capabilities.js';
import { registerMelWorkKickoffCapabilities } from '../work/mel-work-kickoff.js';
import { registerPresentationCapabilities } from '../presentation/presentation-skill.js';
import { registerOpenLoopCapabilities } from './open-loop-capabilities.js';
import { registerPlanningCapabilities } from './planning-capabilities.js';
import { registerEvolutionCapabilities } from './evolution-capabilities.js';
import { registerEventBusCapabilities } from './event-bus-capabilities.js';
import { registerD1ConsoleCapabilities } from './d1-console-capabilities.js';
import { registerSkillRegistryCapabilities } from './skill-registry-capabilities.js';
import { registerSelfAuditCapabilities } from './self-audit-capability.js';
import { registerBrowserRuntimeCapabilities } from './browser-runtime-capabilities.js';
import { registerComputerRuntimeCapabilities } from './computer-runtime-capabilities.js';
import { registerGoogleWorkspaceCapabilities } from './google-workspace-capabilities.js';
import { registerPipedreamLinkedCapabilities } from './pipedream-linked-capabilities.js';
import { registerCreativeMediaCapabilities } from './creative-media-capabilities.js';
import { createWorkersAiZeroCostMediaCapabilities, inspectWorkersAiMediaMissingReasons } from '../media/workers-ai-media-capabilities.js';
import { createProceduralAudioCapabilities } from '../media/procedural-audio-capabilities.js';
import { createLocalPcMediaCapabilities } from '../models/local-pc-media.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { ParallelScheduler } from '../augmentio/parallel-scheduler.js';
import { inspectZeroCostProviderReadiness } from '../augmentio/zero-cost-readiness.js';
import { RAGService } from '../search/rag-service.js';
import { getRoadmapPayload } from '../roadmap/master-roadmap.js';
import { getHumanActionsRequired } from '../roadmap/human-actions-required.js';
import { normalizeChatGPTArchive } from '../persistence/chatgpt-archive-importer.js';
import { createConversationService } from '../conversations/conversation-service.js';
import { runAugmentioStateOfPlay } from '../teachers/augmentio-council.js';
import { runModelCouncil } from '../models/model-council.js';
import { prepareDevelopmentRequest } from '../evolution/development-preflight.js';
import { enqueueOwnerDevelopmentRequest } from '../evolution/owner-development-queue.js';
import { createProviderEscapeCapsule, providerEscapeSummary } from '../portability/provider-escape-capsule.js';
import { auditDataIntegrity } from '../diagnostics/data-integrity.js';
import { auditFinalMaturity } from '../diagnostics/final-maturity-audit.js';

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
export function createDefaultCapabilityBus({ audit, env, repository, branch, token, fetchImpl, googleAccessTokenResolver = null, vercelConfigResolver = null, pipedreamRuntime = null } = {}) {
  const runtimeEnv = env || {};
  const bus = new CapabilityBus({ audit });
  // Register D1 in the canonical bus so the full chat manifest can discover it.
  registerD1ConsoleCapabilities(bus, { db: runtimeEnv.DB });

  bus.discover({
    id: 'echo', name: 'Diagnostic echo', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Returns a bounded value to prove the CapabilityBus execution path.',
    input_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    output_schema: { type: 'object', properties: { value: { type: 'string', minLength: 0, maxLength: 1000 } }, required: ['value'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async input => ({ value: input.value }));

  // GEN2-51: inspect the actual API version resolver and canonical registry.
  bus.discover({
    id: 'api.versioning.verify', name: 'Contrat de version API — vérification',
    category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Checks registered canonical v1 API and legacy alias resolution without mutating data.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', properties: {
      ok: { type: 'boolean' }, version: { type: 'string' }, routes: { type: 'number' }
    }, required: ['ok', 'version', 'routes'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    const registry = apiVersionRegistry();
    const canonical = resolveApiVersionRequest(new Request('https://mel.test/api/v1/roadmap'), { handler: 'router' });
    const legacy = resolveApiVersionRequest(new Request('https://mel.test/api/gen2/roadmap'), { handler: 'router' });
    const rejected = resolveApiVersionRequest(new Request('https://mel.test/api/v9/roadmap'), { handler: 'router' });
    if (registry.validation?.ok !== true || registry.current_version !== API_CURRENT_VERSION ||
        !registry.supported_versions.includes(API_CURRENT_VERSION) || !registry.routes.length ||
        canonical.status !== 'canonical' || !canonical.matched ||
        legacy.status !== 'legacy' || !legacy.matched ||
        rejected.unsupported !== true) {
      throw Object.assign(new Error('API_VERSIONING_CONTRACT_FAILED'), { code: 'API_VERSIONING_CONTRACT_FAILED' });
    }
    return { ok: true, version: registry.current_version, routes: registry.routes.length };
  });

  // GEN2-61: verify the real final status report generated from the canonical
  // roadmap matrix. Do not conflate a report existing with MEL being mature.
  bus.discover({
    id: 'roadmap.final-report.verify', name: 'Rapport final roadmap — vérification',
    category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Verifies current roadmap final report against its canonical source matrix.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', properties: {
      ok: { type: 'boolean' }, verdict: { type: 'string' }, fingerprint: { type: 'string' },
      complete: { type: 'number' }, total: { type: 'number' }
    }, required: ['ok', 'verdict', 'fingerprint', 'complete', 'total'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    const matrix = generateCompletionMatrix();
    const report = generateFinalStatusReport({ matrix });
    const valid = report.schema === FINAL_STATUS_REPORT_SCHEMA
      && report.source.matrix_fingerprint === matrix.matrix_fingerprint
      && report.summary.total === matrix.rows.length
      && report.summary.complete === matrix.rows.filter(row => row.complete).length
      && report.ready_for_final_milestone === (report.verdict === 'MATURE')
      && (report.verdict !== 'MATURE' || report.summary.complete === report.summary.total);
    if (!valid) throw Object.assign(new Error('ROADMAP_FINAL_REPORT_INVALID'), { code: 'ROADMAP_FINAL_REPORT_INVALID' });
    return { ok: true, verdict: report.verdict, fingerprint: matrix.matrix_fingerprint,
      complete: report.summary.complete, total: report.summary.total };
  });

  // GEN2-02: execute the actual portable persona composition, not a static
  // registry label. Fail closed if runtime composition loses its identity.
  bus.discover({
    id: 'identity.portability.verify', name: 'Identité MEL portable — vérification',
    category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Validates that the portable persona is included unchanged in the runtime system prompt.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', properties: {
      ok: { type: 'boolean' }, name: { type: 'string' }, language: { type: 'string' }
    }, required: ['ok', 'name', 'language'], additionalProperties: false },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    const portable = buildMelIdentityPrompt();
    const composed = systemPrompt('test-owner');
    if (!portable || !composed.startsWith(portable + '\n')) {
      throw Object.assign(new Error('IDENTITY_PORTABILITY_INTEGRATION_FAILED'), { code: 'IDENTITY_PORTABILITY_INTEGRATION_FAILED' });
    }
    return { ok: true, name: MEL_IDENTITY.name, language: MEL_IDENTITY.language };
  });

  const githubRepository = repository || runtimeEnv.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const definedIdentity = compileTimeDeployedGitIdentity();
  const deployedBranch = String(runtimeEnv.MEL_DEPLOYED_GIT_BRANCH || definedIdentity.branch || '').trim();
  const deployedSha = String(runtimeEnv.MEL_DEPLOYED_GIT_SHA || definedIdentity.sha || '').trim();
  const githubBranch = branch || deployedBranch || runtimeEnv.MEL_GITHUB_BRANCH || DEFAULT_BRANCH;
  const githubToken = token ?? runtimeEnv.MEL_GITHUB_TOKEN ?? '';
  const githubFetch = fetchImpl || runtimeEnv.MEL_GITHUB_FETCH || fetch;
  const platformFetch = fetchImpl || runtimeEnv.MEL_PLATFORM_FETCH || fetch;
  // Owner policy: paid Vercel is excluded from MEL's production capability inventory.
  // Keep Cloudflare as the deployment provider; no environment flag can re-enable Vercel.
  const includeVercel = false;
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
    resolveVercelConfig: typeof vercelConfigResolver === 'function' ? vercelConfigResolver : null,
    includeVercel,
  });
  registerPlatformControlCapabilities(bus, {
    env: runtimeEnv,
    repository: githubRepository,
    fetchImpl: platformFetch,
    resolveVercelConfig: typeof vercelConfigResolver === 'function' ? vercelConfigResolver : null,
    includeVercel,
  });
  registerGoogleWorkspaceCapabilities(bus, {
    env: runtimeEnv,
    fetchImpl: platformFetch,
    resolveAccessToken: typeof googleAccessTokenResolver === 'function' ? googleAccessTokenResolver : null,
    pipedreamRuntime,
  });
  registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime });

  registerPresentationCapabilities(bus);

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
    const purpose = String(input.context?.purpose || '');
    // Work-plan generation has a shared 105s HTTP/proof deadline and may
    // make up to two serial fan-outs (generate, repair). Bound each
    // fan-out below 30s including health refresh, without retrying the same
    // slow provider; independent zero-cost providers still run concurrently.
    // Other Augmentio callers retain their established scheduler defaults.
    const isWorkPlanGeneration = purpose === 'work-plan-generation'
      || purpose.startsWith('work-plan-generation-');
    const scheduler = isWorkPlanGeneration
      ? new ParallelScheduler({
        globalConcurrency: 4,
        perProviderConcurrency: 1,
        timeoutMs: 24_000,
        retries: 0,
        backoffMs: 0,
      })
      : undefined;
    const augmentio = new Augmentio({
      pool: createDefaultAugmentioPool(runtimeEnv),
      ...(scheduler ? { scheduler } : {}),
    });
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
      operationalCatalog:councilOperationalCatalog(bus,runtimeEnv),
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
      context: { ...(input.context || {}), operational_catalog:councilOperationalCatalog(bus,runtimeEnv) },
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
    description: 'Durably queues an owner development goal and starts its existing Council, inspection and Teacher pipeline via Worker waitUntil; the autonomy runtime resumes interruptions.',
    input_schema: enqueueInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true
  }, async (input, context = {}) => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    return enqueueOwnerDevelopmentRequest({
      env: runtimeEnv,
      goal: input.goal,
      conversationId: input.conversationId || '',
      requestKey: input.requestKey || '',
      fetchImpl: githubFetch,
      capabilities: bus.list(),
      waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil : null,
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
  }, async () => {
    const payload = getRoadmapPayload();
    // Real status from production executions (7 days), next to the declared one.
    try { payload.truth = await computeRoadmapTruth(env?.DB, payload.phases); }
    catch (error) { payload.truth = { available: false, reason: String(error?.code || error?.message || 'ROADMAP_TRUTH_FAILED').slice(0, 120) }; }
    return payload;
  });

  bus.discover({
    id: 'roadmap.human-actions-required', name: 'Actions humaines requises', category: 'planning', version: '1.0.0', provider: 'core',
    description: 'Returns only roadmap items explicitly marked BLOCKED_HUMAN, without inferring extra owner actions.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async () => getHumanActionsRequired());

  bus.discover({
    id: 'system.bindings', name: 'Diagnostic des bindings', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Reports which runtime bindings are configured without exposing secrets.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true
  }, async () => ({
    ai: Boolean(runtimeEnv.AI), db: Boolean(runtimeEnv.DB), media_bucket: Boolean(runtimeEnv.MEDIA_BUCKET),
    github_repository: githubRepository, github_branch: githubBranch,
    github_control_configured: Boolean(runtimeEnv.MEL_GITHUB_WRITABLE_WORKFLOWS && (runtimeEnv.MEL_GITHUB_TOKEN || runtimeEnv.DB)),
    github_control_mode: runtimeEnv.MEL_GITHUB_TOKEN
      ? 'direct-token'
      : (runtimeEnv.DB && runtimeEnv.MEL_GITHUB_WRITABLE_WORKFLOWS ? 'd1-actions-relay' : 'unconfigured'),
    cloudflare_control_configured: Boolean(runtimeEnv.CLOUDFLARE_API_TOKEN && runtimeEnv.CLOUDFLARE_ACCOUNT_ID && runtimeEnv.MEL_CLOUDFLARE_SCRIPT),
    vercel_optional_excluded_free_only: !includeVercel,
    free_deployment_provider: 'cloudflare',
    vercel_control_configured: includeVercel && Boolean(runtimeEnv.VERCEL_TOKEN && runtimeEnv.MEL_VERCEL_PROJECT_ID && runtimeEnv.MEL_VERCEL_PROJECT_NAME),
    owner_configured: Boolean(runtimeEnv.MELITURGOS_USER),
    browser_companion: Boolean(runtimeEnv.MEL_BROWSER_COMPANION?.fetch),
  }));

  bus.discover({
    id: 'system.integrity', name: 'Audit intégrité des données', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Runs a bounded read-only D1 integrity audit covering schema version, orphan references, malformed JSON and simple timestamp inconsistencies without repairing or exposing user content.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true
  }, async () => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    return auditDataIntegrity(runtimeEnv.DB);
  });

  bus.discover({
    id: 'system.maturity', name: 'Audit maturité finale', category: 'diagnostic', version: '1.0.0', provider: 'core',
    description: 'Composes read-only D1 integrity, CapabilityBus contract validation and roadmap structural validation without executing tools or making network calls.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true
  }, async () => {
    if (!runtimeEnv.DB) throw capabilityError('DB_BINDING_MISSING');
    return auditFinalMaturity({ bus, db: runtimeEnv.DB });
  });

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
    risk: 'LOW', permissions: [], health: runtimeEnv.DB ? 'HEALTHY' : 'UNAVAILABLE', enabled: true
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

  const builtInZeroCostMedia = createWorkersAiZeroCostMediaCapabilities(runtimeEnv);
  const builtInProceduralMedia = createProceduralAudioCapabilities(runtimeEnv);
  const localPcMedia = createLocalPcMediaCapabilities(runtimeEnv);
  const mediaEnv = {
    ...runtimeEnv,
    // Diagnostic is passive and reports configuration only, not runtime proof.
    MEL_MEDIA_MISSING_REASONS: inspectWorkersAiMediaMissingReasons(runtimeEnv),
    MEL_LOCAL_MEDIA: localPcMedia,
    MEL_MEDIA_CAPABILITIES: {
      ...builtInProceduralMedia,
      ...builtInZeroCostMedia,
      ...(runtimeEnv.MEL_MEDIA_CAPABILITIES || {}),
    },
  };
  registerCreativeMediaCapabilities(bus, { env: mediaEnv });
  registerBrowserRuntimeCapabilities(bus, {
    binding: runtimeEnv.MEL_BROWSER_COMPANION,
    endpoint: runtimeEnv.MEL_BROWSER_COMPANION_ENDPOINT,
    timeoutMs: runtimeEnv.MEL_BROWSER_COMPANION_TIMEOUT_MS,
  });
  registerComputerRuntimeCapabilities(bus, { db: runtimeEnv.DB });
  registerWorkCapabilities(bus, { db: runtimeEnv.DB });
  registerMelWorkKickoffCapabilities(bus, { fetchImpl: platformFetch });
  registerOpenLoopCapabilities(bus, { env: runtimeEnv });
  registerPlanningCapabilities(bus, { db: runtimeEnv.DB });
  registerEvolutionCapabilities(bus, { db: runtimeEnv.DB });
  registerEventBusCapabilities(bus, { db: runtimeEnv.DB });
  registerSkillRegistryCapabilities(bus, { env: runtimeEnv });
  registerSelfAuditCapabilities(bus, runtimeEnv);
  return bus;
}
