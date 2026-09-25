const DEFAULT_TOPICS = Object.freeze([
  'work.created',
  'work.running',
  'work.waiting',
  'work.resumable',
  'work.completed',
  'work.failed',
  'work.cancelled',
  'project.created',
  'project.status',
  'decision.recorded',
  'decision.status',
  'lesson.added',
]);

function bounded(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function uniqueTopics(values) {
  const input = Array.isArray(values) && values.length ? values : DEFAULT_TOPICS;
  return [...new Set(input.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function errorCode(error) {
  return String(error?.code || error?.message || error || 'CONTINUITY_UNKNOWN_ERROR').slice(0, 240);
}

/**
 * Composition-only coordinator for MEL continuity.
 *
 * inspectRestart() is strictly read-only.
 * repairContinuity() is the explicit mutation path: durable histories -> Event
 * Bus -> Timeline.
 * recover() performs repair first, then returns a fresh read-only snapshot.
 *
 * Concrete D1/in-memory implementations stay outside this class so multiple
 * workers can evolve storage independently.
 */
export class CoreContinuityCoordinator {
  constructor({
    restartSnapshot = null,
    historyReconciler = null,
    timelineProjector = null,
    skillBridge = null,
  } = {}) {
    this.restartSnapshot = restartSnapshot;
    this.historyReconciler = historyReconciler;
    this.timelineProjector = timelineProjector;
    this.skillBridge = skillBridge;
  }

  async inspectRestart(options = {}) {
    if (!this.restartSnapshot || typeof this.restartSnapshot.build !== 'function') {
      throw new Error('CONTINUITY_RESTART_SNAPSHOT_REQUIRED');
    }
    return this.restartSnapshot.build(options);
  }

  async repairContinuity({
    topics = DEFAULT_TOPICS,
    planningLimit = 500,
    workLimit = 100,
    projectorLimit = 50,
    leaseMs = 30_000,
    maxAttempts = 3,
    retryDelayMs = 60_000,
  } = {}) {
    if (!this.historyReconciler || typeof this.historyReconciler.reconcileAll !== 'function') {
      throw new Error('CONTINUITY_HISTORY_RECONCILER_REQUIRED');
    }
    if (!this.timelineProjector || typeof this.timelineProjector.consumeTopic !== 'function') {
      throw new Error('CONTINUITY_TIMELINE_PROJECTOR_REQUIRED');
    }

    const history = await this.historyReconciler.reconcileAll({
      planningLimit: Math.max(1, Math.min(500, Math.trunc(Number(planningLimit) || 500))),
      workLimit: bounded(workLimit, 100, 100),
    });

    const projections = [];
    for (const topic of uniqueTopics(topics)) {
      try {
        const outcomes = await this.timelineProjector.consumeTopic({
          topic,
          limit: bounded(projectorLimit, 50, 100),
          leaseMs: bounded(leaseMs, 30_000, 3_600_000),
          maxAttempts: bounded(maxAttempts, 3, 100),
          retryDelayMs: bounded(retryDelayMs, 60_000, 86_400_000),
        });
        const rows = Array.isArray(outcomes) ? outcomes : [];
        projections.push({
          topic,
          ok: rows.every(row => row?.ok !== false),
          projected: rows.filter(row => row?.ok === true).length,
          failed: rows.filter(row => row?.ok === false).length,
          outcomes: rows,
        });
      } catch (error) {
        projections.push({
          topic,
          ok: false,
          projected: 0,
          failed: 1,
          error: errorCode(error),
          outcomes: [],
        });
      }
    }

    const failures = projections.filter(row => row.ok === false);
    return {
      ok: failures.length === 0,
      status: failures.length === 0 ? 'REPAIRED' : 'PARTIAL',
      history,
      projections,
      failures: failures.map(row => ({ topic: row.topic, error: row.error || 'PROJECTION_FAILED' })),
    };
  }

  async recover({
    owner,
    repair = {},
    snapshot = {},
  } = {}) {
    const continuity = await this.repairContinuity(repair);
    const restored = await this.inspectRestart({ ...snapshot, owner });
    return {
      ok: continuity.ok,
      status: continuity.ok ? 'RECOVERED' : 'RECOVERED_WITH_REPAIR_ERRORS',
      continuity,
      snapshot: restored,
    };
  }

  async syncLearningSkill(options = {}) {
    if (!this.skillBridge || typeof this.skillBridge.syncLearningEngine !== 'function') {
      throw new Error('CONTINUITY_SKILL_BRIDGE_REQUIRED');
    }
    return this.skillBridge.syncLearningEngine(options);
  }
}

export const CONTINUITY_EVENT_TOPICS = DEFAULT_TOPICS;
