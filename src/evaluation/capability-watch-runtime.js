import { migrate } from '../persistence/migrations.js';
import { createGen2Runtime } from '../core/orchestrator/gen2-runtime.js';
import { runPersistedCapabilityWatch, normalizeCapabilityWatchState } from './capability-watch.js';
import {
  ECOSYSTEM_WATCH_INTERVAL_MS,
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from './ecosystem-watch-catalog.js';
import { planEcosystemDiscoveries, mergeEcosystemDiscoveryLedger, selectEcosystemDiscoveryCandidate, markEcosystemDiscoveryHandoff, reconcileEcosystemDiscoveryHandoffs } from './ecosystem-discovery-planner.js';
import { enqueueSupervisedDevelopmentRequest } from '../evolution/owner-development-queue.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';

const WATCH_ID = 'ecosystem-canonical';
const DISCOVERY_ID = 'ecosystem-discoveries-canonical';

const CAPABILITY_SIGNALS = Object.freeze({
  tools: ['tool calling', 'tool use', 'tool-use'],
  connectors: ['connector', 'connected app', 'integration'],
  agents: ['agentic', 'agents sdk', 'agent sdk', 'agent mode'],
  browser: ['browser automation', 'browser tool', 'web browsing'],
  'computer-use': ['computer use', 'computer-use', 'computer tool'],
  files: ['file upload', 'files api', 'file search'],
  image: ['image generation', 'image input', 'images api'],
  audio: ['audio input', 'audio output', 'audio generation'],
  video: ['video generation', 'video input', 'video output'],
  automation: ['automation', 'scheduled task', 'scheduled tasks'],
  vision: ['vision', 'image understanding', 'visual understanding'],
  integrations: ['integration', 'connector'],
  'open-models': ['open source', 'open-source', 'open weight', 'open-weight'],
  MCP: ['model context protocol', ' mcp '],
  plugins: ['plugin', 'plugins'],
  multimodal: ['multimodal', 'multi-modal'],
  scheduling: ['scheduling', 'scheduled task', 'scheduled tasks'],
  'image.analyze': ['image analysis', 'image understanding', 'visual understanding'],
  'image.generate': ['image generation', 'generate images', 'text to image', 'text-to-image'],
  design: ['design tool', 'graphic design', 'design generation'],
  illustration: ['illustration', 'illustrations'],
  'art-history': ['art history', 'art historical'],
  'audio.analyze': ['audio understanding', 'audio analysis', 'speech recognition', 'transcription'],
  'audio.generate': ['audio generation', 'text to speech', 'text-to-speech', 'speech generation'],
  'music.analyze': ['music analysis', 'music understanding'],
  'music.generate': ['music generation', 'generate music', 'music composition'],
  voice: ['voice mode', 'voice generation', 'speech generation', 'text to speech'],
  'sound-design': ['sound design', 'sound generation'],
  'video.analyze': ['video understanding', 'video analysis'],
  'video.generate': ['video generation', 'generate video', 'text to video', 'text-to-video', 'sora', 'veo'],
  'video.edit': ['video editing', 'video edit'],
  animation: ['animation generation', 'animated video'],
  cinema: ['filmmaking', 'cinema', 'film generation'],
  literature: ['literature', 'creative writing'],
  storytelling: ['storytelling', 'story generation'],
  comics: ['comic generation', 'comics'],
  games: ['game development', 'game generation', 'gaming'],
  theatre: ['theatre', 'theater'],
  architecture: ['architecture design', 'architectural'],
  photography: ['photography', 'photo generation'],
});

function sourceCorpus(research = {}) {
  return (Array.isArray(research?.sources) ? research.sources : [])
    .map(source => [
      source?.title || '',
      source?.snippet || '',
      String(source?.content || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    ].join(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 120000);
}

function detectCapabilitiesFromSources(target = {}, research = {}) {
  const corpus = ` ${sourceCorpus(research)} `;
  const allowed = Array.isArray(target?.metadata?.capabilities) ? target.metadata.capabilities : [];
  return allowed.filter(capability => {
    const aliases = CAPABILITY_SIGNALS[capability] || [];
    return aliases.some(alias => corpus.includes(String(alias).toLowerCase()));
  }).slice(0, 30);
}

function busContext(env) {
  return {
    owner: env.MELITURGOS_USER || 'owner',
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID(),
  };
}

async function ensureStore(env, id = WATCH_ID) {
  if (!env?.DB) {
    throw Object.assign(new Error('CAPABILITY_WATCH_DB_REQUIRED'), { code: 'CAPABILITY_WATCH_DB_REQUIRED' });
  }
  await migrate(env.DB);
  return {
    async load() {
      const row = await env.DB.prepare(
        'SELECT state_json FROM capability_watch_state WHERE id = ?'
      ).bind(id).first();
      if (!row?.state_json) return {};
      try { return JSON.parse(row.state_json); } catch { return {}; }
    },
    async save(state) {
      await env.DB.prepare(
        `INSERT INTO capability_watch_state(id,state_json,updated_at) VALUES(?,?,?)
         ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`
      ).bind(id, JSON.stringify(state), Date.now()).run();
    },
  };
}

async function reconcileDiscoveryJobs(env, ledger, { repository = null, now = Date.now() } = {}) {
  const jobIds = [...new Set(
    (Array.isArray(ledger?.items) ? ledger.items : [])
      .map(item => String(item?.handoff?.job_id || ''))
      .filter(Boolean)
  )];
  if (!jobIds.length) return { changed: false, ledger };
  const repo = repository || new D1DevJobRepository(env?.DB);
  const jobs = [];
  for (const id of jobIds.slice(0, 50)) {
    try {
      const job = await repo.get(id);
      if (job) jobs.push(job);
    } catch {
      // Keep the last known handoff state if D1 is temporarily unavailable.
    }
  }
  return reconcileEcosystemDiscoveryHandoffs(ledger, jobs, now);
}

function watchEvaluator(env) {
  return async ({ target }) => {
    const started = Date.now();
    const query = String(target?.metadata?.query || '').trim();
    if (!query) {
      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: 'NO_QUERY',
          summary: 'Aucune requête de veille configurée.',
          citations_count: 0,
          sources: [],
        },
      };
    }

    try {
      const runtime = createGen2Runtime({ env });
      const research = await runtime.bus.execute(
        'web.research',
        {
          query,
          depth: 2,
          seed_urls: Array.isArray(target?.metadata?.sources) ? target.metadata.sources : [],
        },
        busContext(env),
      );
      const sources = Array.isArray(research?.sources)
        ? research.sources.slice(0, 5).map(source => ({
            title: source?.title || '',
            url: source?.url || '',
          }))
        : [];
      const citations = Math.max(0, Number(research?.citations_count) || sources.length);
      const detectedCapabilities = sources.length > 0
        ? detectCapabilitiesFromSources(target, research)
        : [];

      let crossAi = {
        status: sources.length ? 'UNAVAILABLE' : 'SKIPPED_NO_SOURCES',
        providers_attempted: [],
        candidates: [],
        best: null,
      };
      if (sources.length > 0) {
        try {
          const prompt = [
            'Tu participes à la veille générale de MELITURGOS.',
            'À partir des éléments web sourcés ci-dessous, identifie les nouveautés, outils, modèles, plugins, connecteurs, agents, workflows ou techniques réellement utiles à MEL.',
            'Distingue fait sourcé, signal communautaire et hypothèse. Une rumeur ne doit jamais devenir un fait.',
            'Compare avec une logique de réutilisation: améliorer ou remplacer un choix existant est préférable à créer un doublon si une alternative est objectivement meilleure.',
            'Critères: adéquation à la roadmap, qualité, fiabilité, simplicité, permissions, portabilité, coût ajouté nul ou explicitement autorisé, maintenance, provenance/licence, réversibilité et test reproductible.',
            'Ne demande aucune activation automatique. Toute amélioration doit être vérifiée par test avant intégration.',
            `CIBLE: ${String(target?.metadata?.label || target?.id || '')}`,
            `CLASSE_SOURCE: ${String(target?.metadata?.source_class || 'official')}`,
            `REQUETE: ${query}`,
            `RESUME_WEB: ${String(research?.summary || '').slice(0, 5000)}`,
            `SOURCES: ${JSON.stringify(sources)}`,
            'Réponds avec: NOUVEAUTES, ALTERNATIVES_A_EXISTANT, IMPACT_ROADMAP, TESTS_A_FAIRE, RISQUES, VERDICT_PROVISOIRE.',
          ].join('\n');
          const advisory = await runtime.bus.execute(
            'augmentio.fanout',
            {
              capability: 'GENERAL',
              input: prompt,
              context: {
                purpose: 'ecosystem-watch-cross-ai',
                target_id: String(target?.id || ''),
                source_class: String(target?.metadata?.source_class || 'official'),
              },
              maxCandidates: 4,
            },
            busContext(env),
          );
          crossAi = {
            status: 'COMPLETE',
            providers_attempted: Array.isArray(advisory?.providersAttempted) ? advisory.providersAttempted : [],
            candidates: Array.isArray(advisory?.candidates)
              ? advisory.candidates.slice(0, 4).map(row => ({
                  provider: row?.provider || null,
                  model: row?.model || null,
                  text: String(row?.text || '').slice(0, 5000),
                  confidence: Number(row?.confidence || 0),
                }))
              : [],
            best: advisory?.best ? {
              provider: advisory.best.provider || null,
              model: advisory.best.model || null,
              text: String(advisory.best.text || '').slice(0, 6000),
            } : null,
          };
        } catch (error) {
          crossAi = {
            status: 'DEGRADED',
            error: String(error?.code || error?.message || 'CROSS_AI_WATCH_UNAVAILABLE').slice(0, 180),
            providers_attempted: [],
            candidates: [],
            best: null,
          };
        }
      }

      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: citations > 0 && sources.length > 0 ? 'OBSERVED' : 'DEGRADED_NO_SOURCES',
          summary: research?.summary || '',
          citations_count: citations,
          sources,
          source_class: String(target?.metadata?.source_class || 'official'),
          verification_policy: String(target?.metadata?.verification_policy || 'SOURCE_AND_TEST_BEFORE_INTEGRATION'),
          detected_capabilities: detectedCapabilities,
          cross_ai: crossAi,
          performed_at: research?.provenance?.query_performed_at || new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        latency_ms: Date.now() - started,
        evidence: {
          status: 'DEGRADED',
          summary: `Veille indisponible: ${String(error?.code || error?.message || 'UNKNOWN').slice(0, 180)}`,
          citations_count: 0,
          sources: [],
          performed_at: new Date().toISOString(),
        },
      };
    }
  };
}

export async function runEcosystemCapabilityWatch(
  env,
  {
    now = Date.now(),
    sourceSha = null,
    developmentEnqueue = enqueueSupervisedDevelopmentRequest,
    developmentRepository = null,
    fetchImpl = fetch,
    force = false,
  } = {},
) {
  const store = await ensureStore(env, WATCH_ID);
  const result = await runPersistedCapabilityWatch({
    store,
    now,
    intervalMs: ECOSYSTEM_WATCH_INTERVAL_MS,
    targets: ECOSYSTEM_WATCH_TARGETS,
    evaluator: watchEvaluator(env),
    source_sha: sourceSha,
    metadata: {
      watch: 'general-opportunities-roadmap-optimization',
      zero_euro: true,
      discovery_only: true,
    },
    force,
  });

  const discoveryStore = await ensureStore(env, DISCOVERY_ID);
  let discoveryLedger = await discoveryStore.load();
  const reconciled = await reconcileDiscoveryJobs(env, discoveryLedger, {
    repository: developmentRepository,
    now,
  });
  if (reconciled.changed) {
    discoveryLedger = reconciled.ledger;
    await discoveryStore.save(discoveryLedger);
  }
  let discoveryPlan = null;
  if (result.status === 'RAN') {
    const runtime = createGen2Runtime({ env });
    discoveryPlan = planEcosystemDiscoveries({
      watchResult: result,
      catalog: getEcosystemWatchCatalog(),
      capabilities: runtime.bus.list(),
    });
    discoveryLedger = mergeEcosystemDiscoveryLedger(discoveryLedger, discoveryPlan, now);
    await discoveryStore.save(discoveryLedger);
  }

  let handoff = null;
  if (result.status === 'RAN' && discoveryLedger?.items?.length) {
    const candidate = selectEcosystemDiscoveryCandidate(discoveryLedger);
    if (candidate) {
      try {
        const runtime = createGen2Runtime({ env });
        const queued = await developmentEnqueue({
          env,
          goal: candidate.goal,
          requestKey: candidate.fingerprint,
          repository: developmentRepository,
          fetchImpl,
          capabilities: runtime.bus.list(),
          requestedBy: 'mel-autonomy',
          source: 'ecosystem-watch',
          priority: 'P1',
          extensionKind: candidate.action === 'UNBLOCK_EXISTING' ? 'plugin' : candidate.suggested_kind,
          allowBlockedExisting: candidate.action === 'UNBLOCK_EXISTING',
          allowExistingOptimization: candidate.action === 'REUSE_EXISTING',
          targetCapabilityId: candidate.best_match?.id || '',
          evidence: {
            fingerprint: candidate.fingerprint,
            capability_hint: candidate.capability_hint,
            citations_count: candidate.citations_count,
            observed_on: candidate.observed_on,
            sources: candidate.sources,
            source_watch_sha: discoveryPlan?.source_watch_sha || sourceSha,
          },
          roadmapId: candidate.roadmap_id,
          inspectionPaths: candidate.inspection_paths,
          inspectionQueries: candidate.inspection_queries,
        });
        handoff = {
          fingerprint: candidate.fingerprint,
          action: candidate.action,
          status: queued?.status || 'QUEUED',
          job_id: queued?.job_id || null,
          teacher_request_id: queued?.teacher?.request_id || null,
          created: queued?.created === true,
          closed: queued?.job_id == null && ['REUSE_EXISTING', 'REVIEW_EXISTING'].includes(String(queued?.status || '')),
        };
      } catch (error) {
        handoff = {
          fingerprint: candidate.fingerprint,
          action: candidate.action,
          status: 'FAILED',
          job_id: null,
          teacher_request_id: null,
          created: false,
          closed: false,
          code: String(error?.code || error?.message || 'ECOSYSTEM_DISCOVERY_HANDOFF_FAILED').slice(0, 180),
        };
      }
      discoveryLedger = markEcosystemDiscoveryHandoff(discoveryLedger, candidate.fingerprint, handoff, now);
      await discoveryStore.save(discoveryLedger);
    }
  }

  return {
    ...result,
    discoveries: {
      plan: discoveryPlan,
      ledger: discoveryLedger,
      handoff,
    },
  };
}

export async function getEcosystemCapabilityWatchStatus(env) {
  const store = await ensureStore(env, WATCH_ID);
  const discoveryStore = await ensureStore(env, DISCOVERY_ID);
  const state = normalizeCapabilityWatchState(await store.load());
  let discoveries = await discoveryStore.load();
  const reconciled = await reconcileDiscoveryJobs(env, discoveries, { now: Date.now() });
  if (reconciled.changed) {
    discoveries = reconciled.ledger;
    await discoveryStore.save(discoveries);
  }
  return {
    ok: true,
    catalog: getEcosystemWatchCatalog(),
    state,
    discoveries,
  };
}
