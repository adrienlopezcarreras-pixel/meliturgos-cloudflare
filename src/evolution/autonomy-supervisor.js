import { staleCouncilDeferral } from '../teachers/council-inference-policy.js';
import { jobActivityTimestamp } from './autonomy-job-epoch.js';
import { approvedEvolutionRoadmap } from '../roadmap/evolution-autonomy-queue.js';
import { flattenRoadmap, ROADMAP_STATUSES, isClosedRoadmapStatus } from '../roadmap/master-roadmap.js';
import { isClaimedPreparedDevBridgeJob } from '../dev/bridge-job-state.js';
import { providerRetryContext, isRotatableProviderExhaustion } from './provider-exhaustion-rotation.js';
import { unmetRoadmapPrerequisites } from '../roadmap/roadmap-dependencies.js';
export { providerRetryContext } from './provider-exhaustion-rotation.js';

// Strict category order: roadmap, recorded errors, then ecosystem watches.
export function autonomyQueueCategory(job) {
  const source = String(job?.optional_context?.source || job?.source || '').toLowerCase();
  if (source === 'error-ledger' || String(job?.id || '').startsWith('error-ledger-')) return 1;
  if (source.includes('watch') || source.includes('discovery') || source.includes('veille')) return 2;
  return 0;
}

const TERMINAL_JOB = new Set(['COMPLETED', 'CANCELLED', 'FAILED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
const BLOCKED_ROADMAP = new Set([ROADMAP_STATUSES.BLOCKED_HUMAN, ROADMAP_STATUSES.BLOCKED_EXTERNAL]);
function isVerifiedRoadmap(item) { return isClosedRoadmapStatus(item?.status); }
const PRIORITY_WEIGHT = Object.freeze({ P0: 0, P1: 10, P2: 20, P3: 30 });
const STATUS_WEIGHT = Object.freeze({ IN_PROGRESS: 0, PARTIAL: 1, PLANNED: 2 });
const SUPERVISED_REQUESTERS = new Set(['owner-chat', 'mel-autonomy']);
export const MAX_AUTONOMOUS_ROADMAP_ATTEMPTS = 3;

// Autonomy-first ordering: finish the ability to keep working before cosmetics or devices.
const AUTONOMY_ORDER = [
  'MEL-FOUNDER-01',
  'MEL-FOUNDER-02',
  'MEL-FOUNDER-03',
  'MEL-FOUNDER-04',
  'MEL-FOUNDER-05',
  'MEL-FOUNDER-06',
  'MEL-FOUNDER-07',
  'MEL-FOUNDER-08',
  'MEL-MANIFEST-01',
  'MEL-MANIFEST-02',
  'MEL-MANIFEST-03',
  'MEL-MANIFEST-04',
  'MEL-WORK-01',
  'MEL-WORK-02',
  'MEL-MANIFEST-05',
  'MEL-MANIFEST-06',
  'MEL-MANIFEST-07',
  'MEL-MANIFEST-08',
  'MEL-MANIFEST-09',
  'MEL-MANIFEST-10',
  'GEN2-17',
  'MEL-EVOL-01',
  'MEL-EVOL-02',
  'MEL-EVOL-03',
  'MEL-COUNCIL-03',
  'GEN2-63',
  'GEN2-14',
  'GEN2-16',
  'GEN2-36',
  'MEL-CODE-01',
  'MEL-CODE-02',
  'MEL-CODE-03',
  'MEL-EVAL-02',
  'MEL-EVAL-03',
];
const AUTONOMY_INDEX = new Map(AUTONOMY_ORDER.map((id, index) => [id, index]));

function score(item) {
  const autonomy = AUTONOMY_INDEX.has(item.id) ? AUTONOMY_INDEX.get(item.id) : 1000;
  const priority = PRIORITY_WEIGHT[item.priority] ?? 40;
  const status = STATUS_WEIGHT[item.status] ?? 5;
  return autonomy * 100 + priority * 10 + status;
}

function isWaitingTeacher(job) {
  return String(job?.status || '').toUpperCase() === 'WAITING_TEACHER';
}

// Mentor rounds a bridge-phase job gets: 3 small-model rounds, then the large one.
export const BRIDGE_MENTOR_ROUNDS = 4;

// Set at the start of each tick from the monthly re-verification.
let runtimeRegressions = new Set();
export function setRuntimeRoadmapRegressions(ids = []) { runtimeRegressions = new Set(ids); }
function currentRoadmap() {
  const items = flattenRoadmap();
  return runtimeRegressions.size ? items.map(item => runtimeRegressions.has(item.id) ? { ...item, status: 'REGRESSED' } : item) : items;
}

// CODEX: a durable, bounded provider delay is passive, not a global MAX lock.
function providerDeferred(job) {
  if (staleCouncilDeferral(job)) return false;
  const delay = job?.result_json?.autonomy_deferral;
  if (delay?.context && delay.context !== providerRetryContext(job)) return false;
  // Bridge-phase jobs parked under the old one-round limit (FOUNDER-02..07,
  // 25/10) get the rounds the current policy grants before the large model.
  const exhausted = delay?.exhausted === true
    && !(delay?.phase === 'bridge' && Number(delay?.max_attempts) === 1 && Number(delay?.attempts || 0) < BRIDGE_MENTOR_ROUNDS);
  // Keep exhausted identical retries parked until the approved context changes.
  // A mere elapsed cooldown must never reset the bounded provider budget.
  return exhausted || Number(delay?.retry_after || 0) > Date.now();
}

function isPassiveRuntimeJob(job) {
  if (providerDeferred(job)) return true;
  const status = String(job?.status || '').toUpperCase();
  if (status === 'WAITING_TEACHER') return true;
  if (isClaimedPreparedDevBridgeJob(job)) return true;
  if (status === 'CANCELLED' || status === 'FAILED' || status === 'WAITING_DEPENDENCY') return true;

  // [MEL-MANIFEST-06] Protection against stale QUEUED jobs from before activity epoch.
  if (status === 'QUEUED') {
    const activityEpoch = job?.result_json?.activity_epoch;
    const jobCreatedAt = jobActivityTimestamp(job);
    if (activityEpoch && jobCreatedAt < activityEpoch) return true;
  }

  return status === 'READY_FOR_REVIEW' && job?.result_json?.dev_bridge?.needs_repair !== true;
}



function hasLiveExternalProgress(job) {
  if (providerDeferred(job)) return true;
  const status = String(job?.status || '').toUpperCase();
  if (status === 'WAITING_TEACHER') {
    return job?.result_json?.teacher_bridge?.status === 'WAITING_TEACHER';
  }
  if (isClaimedPreparedDevBridgeJob(job)) return true;
  if (status === 'READY_FOR_REVIEW' && job?.result_json?.dev_bridge?.needs_repair !== true) {
    return job?.result_json?.teacher_bridge?.status === 'ANSWERED'
      && job?.result_json?.dev_bridge?.status === 'READY_FOR_REVIEW';
  }
  return false;
}

function executionReadyRank(job) {
  const status = String(job?.status || '').toUpperCase();
  // Already-approved implementation or an explicit repair can make concrete
  // candidate progress immediately. Prefer that over preflight-only work so a
  // queue of CLAIMED/QUEUED owner requests cannot starve an approved internal
  // roadmap implementation forever. Owner priority is still preserved when
  // both jobs are equally implementation-ready.
  if (status === 'REPAIR_REQUIRED') return -1;
  if (status === 'TEACHER_APPROVED') return 0;
  if (status === 'READY_FOR_REVIEW' && job?.result_json?.dev_bridge?.needs_repair === true) return 0;
  return 1;
}

function revisionContinuationRank(job) {
  const status = String(job?.status || '').toUpperCase();
  const internalRevision = job?.requested_by === 'mel-autonomy'
    && ['QUEUED', 'CLAIMED', 'COUNCIL_COMPLETE'].includes(status)
    && Boolean(job?.plan_json?.revision?.previous_request_id || job?.result_json?.last_teacher_review?.request_id);
  // A stale-approval requeue is a continuation of an already-started internal
  // development cycle, not unrelated new background work. Let it finish the
  // fresh Council/Teacher preflight before unrelated owner preflights consume
  // every heartbeat. Implementation-ready owner work still wins via the rank
  // above, so this does not bypass explicit owner execution priority.
  return internalRevision ? 0 : 1;
}

function activeJobRank(job) {
  // Passive jobs stay persisted and untouched but cannot starve another job
  // that can genuinely advance. Implementation-ready work outranks preflight;
  // an internal revision outranks unrelated new preflight; within an otherwise
  // equal class explicit owner work still outranks background roadmap work.
  return {
    passive: isPassiveRuntimeJob(job) ? 1 : 0,
    category: autonomyQueueCategory(job),
    executionReady: executionReadyRank(job),
    revisionContinuation: revisionContinuationRank(job),
    requester: job?.requested_by === 'owner-chat' ? 0 : 1,
    createdAt: Number(job?.created_at || 0),
  };
}

function compareActiveJobs(left, right) {
  const a = activeJobRank(left);
  const b = activeJobRank(right);
  return a.passive - b.passive
    || a.category - b.category
    || a.executionReady - b.executionReady
    || a.revisionContinuation - b.revisionContinuation
    || a.requester - b.requester
    || a.createdAt - b.createdAt
    || String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function selectActionableAutonomyJobs(jobs = [], { epochMs = 0, roadmap = flattenRoadmap(), completedIds = [], verifiedIds = [], excludeIds = [], limit = 4 } = {}) {
  const closedIds = new Set(roadmap.filter(isVerifiedRoadmap).map(item => item.id));
  const epoch = Number(epochMs) || 0;
  const excluded = new Set(excludeIds);
  return (Array.isArray(jobs) ? jobs : [])
    .filter(isSupervisedAutonomyJob)
    .filter(job => !closedIds.has(roadmapIdFromJob(job)))
    .filter(job => {
      const item = roadmap.find(row => row.id === roadmapIdFromJob(job));
      return !item || (!BLOCKED_ROADMAP.has(String(item.status || '').toUpperCase())
        && !unmetRoadmapPrerequisites(item, roadmap, verifiedIds).length);
    })
    .filter((job) => !TERMINAL_JOB.has(String(job?.status || '').toUpperCase()))
    .filter((job) => !isPassiveRuntimeJob(job))
    .filter((job) => !epoch || jobActivityTimestamp(job) >= epoch)
    .filter((job) => !excluded.has(job?.id))
    .sort(compareActiveJobs)
    .slice(0, Math.max(1, Math.min(4, Number(limit) || 1)));
}

export function selectActionableAutonomyJob(jobs = [], options = {}) {
  return selectActionableAutonomyJobs(jobs, { ...options, limit: 1 })[0] || null;
}

export function manifestObjective(roadmap = flattenRoadmap()) {
  return roadmap
    .filter((item) => item?.id && (item.id.startsWith('MEL-FOUNDER-') || item.id.startsWith('MEL-MANIFEST-')))
    .filter((item) => !isVerifiedRoadmap(item))
    .map((item) => item.id + ':' + item.status)
    .join(' ')
    .slice(0, 900);
}

export function selectNextAutonomyItem({ roadmap = flattenRoadmap(), completedIds = [], verifiedIds = [], blockedIds = [] } = {}) {
  const completed = new Set(completedIds);
  const blocked = new Set(blockedIds);
  return roadmap
    .filter((item) => item && item.id)
    .filter((item) => !isVerifiedRoadmap(item))
    .filter((item) => !BLOCKED_ROADMAP.has(String(item.status || '').trim().toUpperCase()))
    .filter((item) => !unmetRoadmapPrerequisites(item, roadmap, verifiedIds).length)
    .filter((item) => (!completed.has(item.id) || String(item.status).toUpperCase() === 'REGRESSED') && !blocked.has(item.id))
    .sort((a, b) => score(a) - score(b) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

// A capability-watch discovery cites GEN2-42 as its origin, not as the item it
// implements. GEN2-42 is closed, so every discovery was skipped as "already
// done" and the watch -> Mentor -> production chain never ran (JOB_STALLED
// for hours on 25/10). Discoveries are worked as their own goal.
function roadmapIdFromJob(job) {
  if (String(job?.optional_context?.source || '') === 'ecosystem-watch') return null;
  return job?.optional_context?.roadmap_id || null;
}

function jobAttemptId(itemId, attempt, epochMs = 0) {
  const suffix = `${epochMs > 0 ? `-e${epochMs}` : ''}-${attempt}`;
  const prefix = `mel-autonomy-${String(itemId).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
  return prefix.slice(0, 180 - suffix.length) + suffix;
}

export function isSupervisedAutonomyJob(job) {
  return SUPERVISED_REQUESTERS.has(String(job?.requested_by || ''));
}

export class AutonomySupervisor {
  constructor({ repository, roadmap = currentRoadmap(), evolutionLoader = null, epochMs = 0, onlyJobId = null, singleFlight = true } = {}) {
    if (!repository || typeof repository.list !== 'function' || typeof repository.create !== 'function') {
      throw Object.assign(new Error('AUTONOMY_JOB_REPOSITORY_REQUIRED'), { code: 'AUTONOMY_JOB_REPOSITORY_REQUIRED' });
    }
    this.repository = repository;
    this.roadmap = roadmap;
    this.epochMs = Number(epochMs) || 0;
    this.onlyJobId = onlyJobId ? String(onlyJobId) : null;
    this.singleFlight = singleFlight === true;
    if (evolutionLoader !== null && typeof evolutionLoader !== 'function') throw new Error('EVOLUTION_QUEUE_INVALID_LOADER');
    this.evolutionLoader = evolutionLoader;
  }

  async listSchedulerJobs() {
    const recent = await this.repository.list();
    if (typeof this.repository.listActiveAutonomyJobs !== 'function') return recent;
    const active = await this.repository.listActiveAutonomyJobs();
    const byId = new Map(recent.map(job => [job.id, job]));
    // Active full rows take precedence over trimmed UI rows.
    for (const job of active) byId.set(job.id, job);
    return [...byId.values()];
  }

  async state() {
    const jobs = await this.listSchedulerJobs();
    // Only jobs created by the supervised autonomy channels may advance, block
    // or consume roadmap attempts. Legacy/manual Professor jobs remain visible
    // in the repository but cannot forge roadmap completion evidence.
    const supervisedJobs = jobs
      .filter(isSupervisedAutonomyJob)
      .filter((job) => !this.epochMs || jobActivityTimestamp(job) >= this.epochMs);
    let evolutionItems = null;
    let evolution = { status: this.evolutionLoader ? 'NOT_CHECKED' : 'NOT_CONFIGURED', actionable_count: null, code: null };
    const readEvolution = async () => {
      try {
        const rows = await this.evolutionLoader();
        const approved = approvedEvolutionRoadmap(rows);
        evolutionItems = rows;
        evolution = { status: 'CONNECTED', actionable_count: approved.length, code: null };
        return approved;
      } catch {
        evolutionItems = [];
        evolution = { status: 'UNAVAILABLE', actionable_count: null, code: 'EVOLUTION_QUEUE_READ_FAILED' };
        return [];
      }
    };
    if (this.evolutionLoader && supervisedJobs.some(job => String(roadmapIdFromJob(job) || '').startsWith('EVOLUTION-'))) await readEvolution();
    const verifiedRoadmapIds = new Set(this.roadmap.filter(isVerifiedRoadmap).map(item => item.id));
    for (const item of evolutionItems || []) if (isClosedRoadmapStatus(item.status)) verifiedRoadmapIds.add('EVOLUTION-' + item.id);
    const reopenedIds = new Set(this.roadmap.filter(item => String(item.status).toUpperCase() === 'REGRESSED').map(item => item.id));
    for (const item of evolutionItems || []) if (item.status === 'REGRESSED') reopenedIds.add('EVOLUTION-' + item.id);
    const completedIds = supervisedJobs
      .filter(job => ['COMPLETED'].includes(String(job.status).toUpperCase()) || isClosedRoadmapStatus(job.status))
      .map(roadmapIdFromJob).filter(id => id && !reopenedIds.has(id));
    const completedSet = new Set(completedIds);
    // Terminal code delivery is not an acceptance verdict. Only exact roadmap
    // DONE_VERIFIED proof may unlock an objective that depends on this one.
    const verifiedDependencyIds = [...verifiedRoadmapIds];
    const waiting = supervisedJobs.filter(job => String(job.status || '').toUpperCase() === 'WAITING_DEPENDENCY');
    const active = supervisedJobs.filter(job => !TERMINAL_JOB.has(String(job.status || '').toUpperCase())
      && String(job.status || '').toUpperCase() !== 'WAITING_DEPENDENCY')
      .filter(job => !verifiedRoadmapIds.has(roadmapIdFromJob(job)) && !completedSet.has(roadmapIdFromJob(job)))
      .filter(job => !(evolution.status === 'UNAVAILABLE' && String(roadmapIdFromJob(job) || '').startsWith('EVOLUTION-')));
    const activeIds = active.map(roadmapIdFromJob).filter(Boolean);
    const explicitlyBlockedIds = supervisedJobs
      .filter((job) => String(job.status || '').toUpperCase() === 'FAILED' && job?.result_json?.autonomy_blocked === true)
      .map(roadmapIdFromJob)
      .filter(Boolean);
    const failedAttemptsByRoadmap = new Map();
    for (const job of supervisedJobs) {
      if (job?.requested_by !== 'mel-autonomy') continue;
      if (String(job?.status || '').toUpperCase() !== 'FAILED') continue;
      const roadmapId = roadmapIdFromJob(job);
      if (!roadmapId) continue;
      failedAttemptsByRoadmap.set(roadmapId, (failedAttemptsByRoadmap.get(roadmapId) || 0) + 1);
    }
    // The recent UI window omits old terminal failures. Use the complete D1
    // counts for quarantine without duplicating failures present in this list.
    if (typeof this.repository.failedAutonomyObjectiveCounts === 'function') {
      const persisted = await this.repository.failedAutonomyObjectiveCounts();
      for (const [id, count] of Object.entries(persisted || {})) {
        failedAttemptsByRoadmap.set(id, Math.max(failedAttemptsByRoadmap.get(id) || 0, Number(count) || 0));
      }
    }
    const retryExhaustedIds = [...failedAttemptsByRoadmap.entries()]
      .filter(([, attempts]) => attempts >= MAX_AUTONOMOUS_ROADMAP_ATTEMPTS)
      .map(([roadmapId]) => roadmapId);
    const blockedIds = [...new Set([...explicitlyBlockedIds, ...retryExhaustedIds])];
    const excludedIds = [...blockedIds, ...activeIds];
    let next = selectNextAutonomyItem({
      roadmap: this.roadmap,
      completedIds,
      verifiedIds: verifiedDependencyIds,
      blockedIds: excludedIds,
    });
    if (!next && this.evolutionLoader) {
      const items = evolutionItems === null ? await readEvolution() : approvedEvolutionRoadmap(evolutionItems);
      next = selectNextAutonomyItem({ roadmap: items, completedIds, blockedIds: excludedIds });
    }
    return { evolution,
      jobs,
      supervisedJobs,
      active,
      activeIds,
      waiting,
      completedIds,
      verifiedDependencyIds,
      blockedIds,
      retryExhaustedIds,
      failedAttemptsByRoadmap: Object.fromEntries(failedAttemptsByRoadmap),
      next,
    };
  }

  async ensureNextJob() {
    // Release stale non-executing D1 jobs only when the canonical roadmap
    // explicitly marks their objective verified. Never delete history or
    // interrupt Teacher, Bridge or review lanes.
    if (typeof this.repository.reconcileVerifiedAutonomyJob === 'function') {
      const verifiedStatuses = new Set(['DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
      const explicitlyVerified = item => verifiedStatuses.has(String(item?.status || '').trim().toUpperCase());
      const verified = new Map(this.roadmap.filter(explicitlyVerified).map(item => [item.id, item]));
      // The persistent evolution backlog is separate from the base roadmap.
      // Only its explicitly verified entries may release an old D1 admission
      // fence, and a loader failure must never certify completion.
      if (this.evolutionLoader) {
        try {
          for (const item of await this.evolutionLoader()) {
            const id = String(item?.id || '');
            if (!/^[A-Z0-9-]+$/.test(id) || !explicitlyVerified(item)) continue;
            verified.set('EVOLUTION-' + id, { ...item, id: 'EVOLUTION-' + id });
          }
        } catch {
          // state() reports EVOLUTION_QUEUE_READ_FAILED when this matters.
        }
      }
      if (verified.size) {
        for (const job of await this.listSchedulerJobs()) {
          const item = job?.requested_by === 'mel-autonomy' ? verified.get(roadmapIdFromJob(job)) : null;
          if (!item || TERMINAL_JOB.has(String(job.status || '').toUpperCase())) continue;
          try {
            await this.repository.reconcileVerifiedAutonomyJob(job.id, item);
          } catch (error) {
            if (error?.code !== 'JOB_UPDATE_CONFLICT') throw error;
          }
        }
      }
    }
    const current = await this.state();
    // Preflight: if an old internal mission was selected before its foundations
    // were proved, park it durably instead of repeatedly running Mentor.
    // Only QUEUED / TEACHER_APPROVED are safe to park here; a published or
    // Bridge-claimed package is already in a separate delivery lane.
    if (!this.onlyJobId) {
      const blocked = current.active.find(job => {
        if (job.requested_by !== 'mel-autonomy'
            || !['QUEUED', 'TEACHER_APPROVED'].includes(String(job.status || '').toUpperCase())) return false;
        const item = this.roadmap.find(row => row.id === roadmapIdFromJob(job));
        return item && (BLOCKED_ROADMAP.has(String(item.status || '').toUpperCase())
          || unmetRoadmapPrerequisites(item, this.roadmap, current.verifiedDependencyIds).length > 0);
      });
      if (blocked) {
        const item = this.roadmap.find(row => row.id === roadmapIdFromJob(blocked));
        const dependencies = unmetRoadmapPrerequisites(item, this.roadmap, current.verifiedDependencyIds);
        try {
          await this.repository.update(blocked.id, {
            status: 'WAITING_DEPENDENCY',
            result_json: {
              ...(blocked.result_json || {}),
              dependency_wait: {
                previous_status: blocked.status,
                prerequisites: dependencies,
                ...(BLOCKED_ROADMAP.has(String(item.status || '').toUpperCase()) ? { blocker: item.status } : {}),
                observed_at: new Date().toISOString(),
              },
            },
          }, { expected: blocked });
        } catch (error) {
          if (error?.code !== 'JOB_UPDATE_CONFLICT') throw error;
          // The contender owns this row now; do not loop on stale snapshots.
          return { created: false, job: null, next: current.next, complete: false,
            external_progress: { job_id: blocked.id, status: 'DEPENDENCY_PARK_CONFLICT' } };
        }
        // The next state is fresh: it may admit an independent prerequisite
        // without submitting a second generation call for the blocked job.
        return this.ensureNextJob();
      }
    }
    if (this.onlyJobId) {
      const wanted = current.active.find(job => job.id === this.onlyJobId) || null;
      const item = this.roadmap.find(row => row.id === roadmapIdFromJob(wanted));
      if (item && (BLOCKED_ROADMAP.has(String(item.status || '').toUpperCase())
        || unmetRoadmapPrerequisites(item, this.roadmap, current.verifiedDependencyIds).length)) {
        return { created: false, job: null, next: current.next, complete: false,
          external_progress: { job_id: wanted.id, status: 'ROADMAP_PREREQUISITES_PENDING' } };
      }
      return { created: false, job: wanted, next: current.next };
    }
    // A parked mission may receive a newly approved SHA while its rotated
    // successor still owns the only runnable slot. Never reactivate that old
    // mission in parallel; resume it once the successor has left the active set.
    // This remains a scheduler decision, never an invented completion signal.
    const changedExhaustedContext = job => {
      const delay = job?.result_json?.autonomy_deferral;
      return delay?.exhausted === true && typeof delay.context === 'string'
        && delay.context !== providerRetryContext(job);
    };
    // Single-flight must not switch to a different internal objective just
    // because an older one is waiting for Teacher, Bridge or CI. Explicit
    // owner-chat requests retain their established priority.
    const activeInternal = current.active
      .filter(job => job.requested_by === 'mel-autonomy')
      .filter(job => !isRotatableProviderExhaustion(job))
      .filter(job => !this.roadmap.some(item => item.id === roadmapIdFromJob(job) && isVerifiedRoadmap(item)))
      .sort((left, right) => Number(changedExhaustedContext(left)) - Number(changedExhaustedContext(right))
        || Number(left?.created_at || 0) - Number(right?.created_at || 0)
        || String(left?.id || '').localeCompare(String(right?.id || '')))[0] || null;
    // The shared selector can rank a changed-context TEACHER_APPROVED job
    // above its QUEUED successor; constrain internal selection to the slot
    // holder while preserving explicit owner-chat priority.
    const selectableJobs = this.singleFlight && activeInternal
      ? current.active.filter(job => job.requested_by !== 'mel-autonomy' || job.id === activeInternal.id)
      : current.active;
    const actionable = selectActionableAutonomyJob(selectableJobs, { epochMs: this.epochMs, roadmap: this.roadmap, completedIds: current.completedIds, verifiedIds: current.verifiedDependencyIds });
    if (this.singleFlight && activeInternal && actionable?.requested_by !== 'owner-chat') {
      // COMMITTED means the candidate was committed, not necessarily that the
      // release passed live verification. D1's admission fence still sees this
      // state as active; never run a second mission or re-enter COMMITTED.
      if (String(activeInternal.status || '').toUpperCase() === 'COMMITTED') {
        return {
          created: false, job: null, next: current.next, complete: false,
          external_progress: {
            job_id: activeInternal.id,
            status: 'DELIVERY_VERIFICATION_PENDING',
          },
        };
      }
      if (isClaimedPreparedDevBridgeJob(activeInternal) || providerDeferred(activeInternal)) {
        return {
          created: false, job: null, next: current.next, complete: false,
          external_progress: {
            job_id: activeInternal.id,
            status: providerDeferred(activeInternal) ? 'DEFERRED_PROVIDER_RETRY_PENDING' : 'BRIDGE_EXECUTION_IN_PROGRESS',
          },
        };
      }
      return { created: false, job: activeInternal, next: current.next };
    }
    if (actionable) return { created: false, job: actionable, next: current.next };

    // Never materialize another roadmap job while an existing internal
    // objective is still active, even when its external lane is passive.
    // Keep the old selection/owner-priority semantics for the active job.
    const inFlightInternal = current.active
      .filter(job => job.requested_by === 'mel-autonomy' && !isRotatableProviderExhaustion(job))
      .sort(compareActiveJobs)[0] || null;
    if (this.singleFlight && inFlightInternal) {
      if (String(inFlightInternal.status || '').toUpperCase() === 'COMMITTED') {
        return { created: false, job: null, next: current.next, complete: false,
          external_progress: { job_id: inFlightInternal.id, status: 'DELIVERY_VERIFICATION_PENDING' } };
      }
      // A Bridge-owned prepared CLAIMED job or a deferred provider must not
      // be re-entered by the generic runtime while its external lane owns it.
      if (isClaimedPreparedDevBridgeJob(inFlightInternal) || providerDeferred(inFlightInternal)) {
        return {
          created: false,
          job: null,
          next: current.next,
          complete: false,
          external_progress: {
            job_id: inFlightInternal.id,
            status: providerDeferred(inFlightInternal) ? 'DEFERRED_PROVIDER_RETRY_PENDING' : 'BRIDGE_EXECUTION_IN_PROGRESS',
          },
        };
      }
      return { created: false, job: inFlightInternal, next: current.next };
    }

    // Teacher, Bridge execution and CI/review are validation/execution lanes,
    // not global scheduler locks. A passive job remains persisted and keeps
    // reconciling while MEL may start the next compatible roadmap item.
    // Select a passive internal job only when its external progress has gone
    // stale; do not let one healthy passive lane hide another stale one.
    const passiveInternal = current.active
      .filter(isSupervisedAutonomyJob)
      .filter((job) => isPassiveRuntimeJob(job) && job.requested_by === 'mel-autonomy')
      .filter((job) => !isRotatableProviderExhaustion(job))
      .filter((job) => !hasLiveExternalProgress(job))
      .sort(compareActiveJobs)[0];
    if (passiveInternal) {
      return { created: false, job: passiveInternal, next: current.next };
    }

    if (!current.next) {
      const passiveOwner = current.active
        .filter(isSupervisedAutonomyJob)
        .filter((job) => isPassiveRuntimeJob(job) && !isRotatableProviderExhaustion(job))
        .sort(compareActiveJobs)[0] || null;
      // A prepared CLAIMED package is already executing outside the heartbeat.
      // Returning it as `job` would make autonomy-runtime-core run its generic
      // CLAIMED preflight path and race the Dev Bridge. Keep it visible in the
      // repository, but give the core no job to mutate until Bridge reports a
      // new persisted state.
      if (passiveOwner && (isClaimedPreparedDevBridgeJob(passiveOwner) || providerDeferred(passiveOwner))) {
        return {
          created: false,
          job: null,
          next: null,
          complete: false,
          external_progress: {
            job_id: passiveOwner.id,
            status: providerDeferred(passiveOwner) ? 'DEFERRED_PROVIDER_RETRY_PENDING' : 'BRIDGE_EXECUTION_IN_PROGRESS',
          },
        };
      }
      const exhausted = current.active.filter(isRotatableProviderExhaustion)
        .sort((a,b)=>Number(a.result_json?.autonomy_deferral?.priority_penalty||0)-Number(b.result_json?.autonomy_deferral?.priority_penalty||0)
          || Number(a.result_json?.autonomy_deferral?.retry_after||0)-Number(b.result_json?.autonomy_deferral?.retry_after||0))[0];
      if (!passiveOwner && exhausted && Number(exhausted.result_json?.autonomy_deferral?.retry_after||0) <= Date.now()) {
        // Fresh roadmap work always comes first. Only when that queue is empty
        // may a demoted entry claim the single slot for another bounded round.
        const previous = exhausted.result_json.autonomy_deferral;
        const resumed = await this.repository.update(exhausted.id, { result_json: {
          ...exhausted.result_json,
          previous_provider_deferral: previous,
          autonomy_deferral: { ...previous, attempts: 0, exhausted: false, retry_after: 0 },
          council_model_exclusions: [],
        } }, { expected: exhausted });
        return { created: false, job: resumed, next: null, complete: false };
      }
      if (!passiveOwner && exhausted) {
        // Preserve the original mission in D1 without retrying its identical
        // provider context or claiming all remaining work complete.
        return { created: false, job: null, next: null, complete: false,
          external_progress: { job_id: exhausted.id, status: 'DEFERRED_PROVIDER_RETRY_PENDING',
            reason: 'PROVIDER_EXHAUSTED_CONTEXT_REQUIRED' } };
      }
      return { created: false, job: passiveOwner, next: null, complete: !passiveOwner && current.evolution?.status !== 'UNAVAILABLE', evolution: current.evolution };
    }

    const item = current.next;
    // A prerequisite-waiting mission is resumed, never duplicated. Resume is
    // an atomic D1 claim: another running mission or maintenance lease wins.
    const waiting = current.waiting.find(job => job.requested_by === 'mel-autonomy' && roadmapIdFromJob(job) === item.id);
    if (waiting) {
      if (typeof this.repository.resumeWaitingDependency !== 'function') {
        return { created: false, job: null, next: item, complete: false,
          external_progress: { job_id: waiting.id, status: 'DEPENDENCY_RESUME_UNAVAILABLE' } };
      }
      const resumed = await this.repository.resumeWaitingDependency(waiting.id, { expected: waiting });
      if (resumed) return { created: false, job: resumed, next: item };
      return { created: false, job: null, next: item, complete: false,
        external_progress: { job_id: waiting.id, status: 'DEPENDENCY_RESUME_SLOT_BUSY' } };
    }
    const listedAttempts = current.supervisedJobs.filter((job) => roadmapIdFromJob(job) === item.id).length;
    const persistedAttempts = typeof this.repository.countAutonomyObjectiveAttempts === 'function'
      ? await this.repository.countAutonomyObjectiveAttempts(item.id)
      : listedAttempts;
    const attempts = Math.max(listedAttempts, persistedAttempts);
    const deterministicId = jobAttemptId(item.id, attempts + 1, this.epochMs);
    const technicalMode = String(item.mode || 'IMPLEMENT').toUpperCase();
    const requiredProof = String(item.required_proof || 'DIFF_TESTS_EXACT_SHA_CI');
    const goal = `[${item.id}] ${item.title}${item.next ? ` — ${item.next}` : ''} | MODE_TECHNIQUE ${technicalMode} | PREUVE_REQUISE ${requiredProof} | OBJECTIF ${manifestObjective(this.roadmap)}`;
    const input = {
      id: deterministicId,
      requested_by: 'mel-autonomy',
      goal,
      optional_context: {
        roadmap_id: item.id,
        phase_id: item.phase_id,
        phase: item.phase,
        priority: item.priority,
        work_mode: technicalMode,
        required_proof: requiredProof,
        depends_on: [...(item.depends_on || [])],
        source: 'autonomy-supervisor',
        candidate_branch_only: true,
        zero_added_cost: true,
        attempt: attempts + 1,
      },
    };

    if (typeof this.repository.createIfAbsent === 'function') {
      const result = await this.repository.createIfAbsent(input);
      // The atomic D1 admission fence can return an older, different active
      // objective (e.g. a verified roadmap item still awaiting Bridge review).
      // Never feed that job to the runtime as though it were the next mission.
      if (!result.created && result.job?.requested_by === 'mel-autonomy'
          && roadmapIdFromJob(result.job) !== item.id) {
        return {
          created: false, job: null, next: item, complete: false,
          external_progress: {
            job_id: result.job.id,
            roadmap_id: roadmapIdFromJob(result.job),
            status: 'ACTIVE_OBJECTIVE_REQUIRES_RECONCILIATION',
          },
        };
      }
      if (result.job && this.epochMs && jobActivityTimestamp(result.job) < this.epochMs) {
        return {created:false,job:null,next:null,complete:false,external_progress:{job_id:result.job.id,status:'ACTIVE_OBJECTIVE_OUTSIDE_CURRENT_EPOCH'}};
      }
      return { created: result.created, job: result.job, next: item };
    }

    const job = await this.repository.create(input);
    return { created: true, job, next: item };
  }
}
