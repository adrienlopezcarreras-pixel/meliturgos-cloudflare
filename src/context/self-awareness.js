import { createDefaultCapabilityBus } from '../capabilities/default-bus.js';
import { flattenRoadmap, roadmapSummary } from '../roadmap/master-roadmap.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { MentorMemoryRepository } from '../learning/mentor-memory.js';
import { standardRegistry } from '../models/ModelRegistry.js';

const CACHE_MS = 10_000;
const caches = { compact: null, full: null };
const ACTIVE_JOB_STATUSES = new Set(['QUEUED', 'CLAIMED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED']);
const DONE = new Set(['DONE', 'DONE_VERIFIED']);

function explicitZero(value) {
  return value !== null && value !== undefined && value !== '' && Number(value) === 0;
}

function cacheKey(env = {}) {
  return [Boolean(env.AI), Boolean(env.DB), Boolean(env.MEDIA_BUCKET), env.MEL_GITHUB_BRANCH || '', env.MEL_GITHUB_REPOSITORY || ''].join('|');
}

function capabilityState(cap) {
  if (cap.enabled === false) return 'BLOQUÉ';
  if (String(cap.health || '').toUpperCase() === 'DEGRADED') return 'PARTIEL';
  if (String(cap.health || '').toUpperCase() === 'UNHEALTHY') return 'BLOQUÉ';
  return 'EXISTANT NON TESTÉ EN DIRECT';
}

function priorityScore(row) {
  const priority = { P0: 0, P1: 10, P2: 20, P3: 30 }[row.priority] ?? 40;
  const state = { IN_PROGRESS: 0, PARTIAL: 1, PLANNED: 2, BLOCKED_HUMAN: 8, BLOCKED_EXTERNAL: 9 }[row.status] ?? 6;
  return priority + state;
}

async function developmentState(env, full) {
  if (!env?.DB) return { available: false, active: [], recent: [], mentor_lessons: [] };
  try {
    const [jobs, lessons] = await Promise.all([
      new D1DevJobRepository(env.DB).list(),
      new MentorMemoryRepository(env.DB).recent({ limit: full ? 6 : 2 }),
    ]);
    const normalized = jobs.slice(0, full ? 10 : 4).map(job => ({
      id: job.job_id || job.id,
      status: job.status,
      goal: String(job.goal || '').slice(0, full ? 700 : 180),
      approval_status: job.approval_status || null,
      candidate_branch: job.candidate_branch || null,
      updated_at: Number(job.updated_at || 0),
      error: job.error || null,
    }));
    return {
      available: true,
      active: normalized.filter(job => ACTIVE_JOB_STATUSES.has(job.status)).slice(0, full ? 5 : 2),
      recent: normalized.slice(0, full ? 8 : 3),
      mentor_lessons: lessons.map(row => ({
        outcome: row.outcome,
        kind: row.kind,
        goal: String(row.goal || '').slice(0, 240),
        lesson: String(row.lesson || '').slice(0, full ? 900 : 220),
        score: row.score,
        created_at: row.created_at,
      })),
    };
  } catch (error) {
    return { available: false, error: String(error?.code || error?.message || 'DEV_STATE_UNAVAILABLE'), active: [], recent: [], mentor_lessons: [] };
  }
}

export async function getSelfAwarenessSnapshot(env = {}, { full = false, force = false } = {}) {
  const slot = full ? 'full' : 'compact';
  const key = cacheKey(env);
  const now = Date.now();
  if (!force && caches[slot]?.key === key && caches[slot].expires_at > now) return caches[slot].value;

  const bus = createDefaultCapabilityBus({ env });
  const capabilities = bus.list().map(cap => ({
    id: cap.id,
    name: cap.name,
    category: cap.category,
    description: full ? cap.description : undefined,
    provider: cap.provider,
    enabled: cap.enabled !== false,
    health: cap.health || 'UNKNOWN',
    risk: full ? cap.risk : undefined,
    truth_state: capabilityState(cap),
  }));

  const rows = flattenRoadmap();
  const incomplete = rows
    .filter(row => !DONE.has(row.status))
    .sort((a, b) => priorityScore(a) - priorityScore(b));
  const roadmap = {
    summary: roadmapSummary(),
    current_priorities: incomplete.slice(0, full ? 16 : 5).map(row => ({
      id: row.id,
      phase: row.phase,
      title: row.title,
      status: row.status,
      priority: row.priority,
      next: full ? row.next : String(row.next || '').slice(0, 180),
    })),
    blocked: rows.filter(row => row.status === 'BLOCKED_HUMAN' || row.status === 'BLOCKED_EXTERNAL').slice(0, full ? 12 : 4).map(row => ({ id: row.id, title: row.title, status: row.status, next: row.next })),
  };

  const models = standardRegistry.list().map(model => ({
    id: model.id,
    provider: model.provider,
    capabilities: model.capabilities,
    enabled: model.enabled !== false,
    zero_added_cost: explicitZero(model.cost),
    cost_known: model.cost !== null && model.cost !== undefined && model.cost !== '',
  }));

  const development = await developmentState(env, full);
  const value = {
    generated_at: new Date(now).toISOString(),
    truth_contract: {
      rule: 'Décrire uniquement l’état fourni ici. Ne jamais transformer PLANNED/PARTIAL en capacité achevée.',
      health_note: 'HEALTHY signifie enregistré/configuré selon le runtime, pas qu’un appel vient de réussir. Ne dire EXISTANT ET TESTÉ que si une preuve de test explicite est présente.',
      status_labels: ['EXISTANT ET TESTÉ', 'EXISTANT NON TESTÉ', 'PARTIEL', 'STUB', 'NOT_IMPLEMENTED', 'PRÉVU', 'BLOQUÉ'],
      candidate_note: 'Une candidate testée n’est pas une release déployée. Commit et déploiement restent soumis à validation humaine.',
    },
    identity: { name: 'MEL', system: 'MELITURGOS', role: 'assistante personnelle généraliste en développement continu' },
    runtime: {
      ai_binding: Boolean(env.AI),
      db_binding: Boolean(env.DB),
      media_bucket: Boolean(env.MEDIA_BUCKET),
      owner_configured: Boolean(env.MELITURGOS_USER),
      github_repository: env.MEL_GITHUB_REPOSITORY || 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
      github_branch_configured: env.MEL_GITHUB_BRANCH || 'release/mel-2026-09-09-r2',
    },
    capabilities,
    capability_count: capabilities.length,
    models: full ? models : models.filter(model => model.enabled && model.zero_added_cost),
    roadmap,
    development,
  };

  caches[slot] = { key, expires_at: now + CACHE_MS, value };
  return value;
}

export async function selfAwarenessSystemContext(env = {}, { full = false, theme = 'classic' } = {}) {
  const snapshot = await getSelfAwarenessSnapshot(env, { full });
  const themeInstruction = theme === 'crusade'
    ? 'Mode visuel Croisés/parchemin actif. Le style peut être légèrement chevaleresque mais reste précis et efficace.'
    : theme === 'religious'
      ? 'Mode visuel baroque andalou religieux actif. Le style peut être posé, noble et catholique, sans sacrifier la précision.'
      : 'Mode visuel classique actif. Style direct, moderne et efficace.';
  return [
    'CONTEXTE INTERNE ACTUEL DE MEL — source de vérité sur tes propres capacités et ton état.',
    themeInstruction,
    'Tu dois t’appuyer sur ce contexte lorsque tu parles de toi. Si une capacité n’y figure pas comme réellement disponible, ne prétends pas l’avoir.',
    'Distingue toujours: capacité enregistrée, binding configuré, tâche planifiée, travail en candidate, test réussi et déploiement production.',
    JSON.stringify(snapshot),
  ].join('\n');
}

export function clearSelfAwarenessCache() {
  caches.compact = null;
  caches.full = null;
}
