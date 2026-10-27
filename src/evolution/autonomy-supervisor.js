import { jobActivityTimestamp } from './autonomy-job-epoch.js';
import { approvedEvolutionRoadmap } from '../roadmap/evolution-autonomy-queue.js';
import { flattenRoadmap, ROADMAP_STATUSES, isClosedRoadmapStatus } from '../roadmap/master-roadmap.js';
import { isClaimedPreparedDevBridgeJob } from '../dev/bridge-job-state.js';

const TERMINAL_JOB = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
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
export function providerRetryContext(job) {
  const result = job?.result_json || {};
  return JSON.stringify([job?.candidate_branch || null,
    result.teacher_bridge?.review?.target_sha || null,
    result.teacher_bridge?.review?.request_id || null,
    result.implementation_proposal?.candidate_sha || null,
    result.implementation_proposal?.teacher_request_id || null]);
}

function providerDeferred(job) {
  const delay = job?.result_json?.autonomy_deferral;
  if (delay?.context && delay.context !== providerRetryContext(job)) return false;
  // Bridge-phase jobs parked under the old one-round limit (FOUNDER-02..07,
  // 25/10) get the rounds the current policy grants before the large model.
  const exhausted = delay?.exhausted === true
    && !(delay?.phase === 'bridge' && Number(delay?.max_attempts) === 1 && Number(delay?.attempts || 0) < BRIDGE_MENTOR_ROUNDS);
  return exhausted || Number(delay?.retry_after || 0) > Date.now();
}

function isPassiveRuntimeJob(job) {
  if (providerDeferred(job)) return true;
  const status = String(job?.status || '').toUpperCase();
  if (status === 'WAITING_TEACHER') return true;
  if (isClaimedPreparedDevBridgeJob(job)) return true;
  if (status === 'CANCELLED' || status === 'FAILED') return true;

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
    || a.executionReady - b.executionReady
    || a.revisionContinuation - b.revisionContinuation
    || a.requester - b.requester
    || a.createdAt - b.createdAt
    || String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function selectActionableAutonomyJobs(jobs = [], { epochMs = 0, roadmap = flattenRoadmap(), excludeIds = [], limit = 4 } = {}) {
  const closedIds = new Set(roadmap.filter(isVerifiedRoadmap).map(item => item.id));
  const epoch = Number(epochMs) || 0;
  const excluded = new Set(excludeIds);
  return (Array.isArray(jobs) ? jobs : [])
    .filter(isSupervisedAutonomyJob)
    .filter(job => !closedIds.has(roadmapIdFromJob(job)))
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

export function selectNextAutonomyItem({ roadmap = flattenRoadmap(), completedIds = [], blockedIds = [] } = {}) {
  const completed = new Set(completedIds);
  const blocked = new Set(blockedIds);
  return roadmap
    .filter((item) => item && item.id)
    .filter((item) => !isVerifiedRoadmap(item))
    .filter((item) => !BLOCKED_ROADMAP.has(String(item.status || '').trim().toUpperCase()))
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

  async state() {
    const jobs = await this.repository.list();
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
      .filter(job => ['COMPLETED', 'COMMITTED'].includes(String(job.status).toUpperCase()) || isClosedRoadmapStatus(job.status))
      .map(roadmapIdFromJob).filter(id => id && !reopenedIds.has(id));
    const completedSet = new Set(completedIds);
    const active = supervisedJobs.filter(job => !TERMINAL_JOB.has(String(job.status || '').toUpperCase()))
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
    const retryExhaustedIds = [...failedAttemptsByRoadmap.entries()]
      .filter(([, attempts]) => attempts >= MAX_AUTONOMOUS_ROADMAP_ATTEMPTS)
      .map(([roadmapId]) => roadmapId);
    const blockedIds = [...new Set([...explicitlyBlockedIds, ...retryExhaustedIds])];
    const excludedIds = [...blockedIds, ...activeIds];
    let next = selectNextAutonomyItem({
      roadmap: this.roadmap,
      completedIds,
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
      completedIds,
      blockedIds,
      retryExhaustedIds,
      failedAttemptsByRoadmap: Object.fromEntries(failedAttemptsByRoadmap),
      next,
    };
  }

  async ensureNextJob() {
    const current = await this.state();
    if (this.onlyJobId) {
      const wanted = current.active.find(job => job.id === this.onlyJobId) || null;
      return { created: false, job: wanted, next: current.next };
    }
    const actionable = selectActionableAutonomyJob(current.active, { epochMs: this.epochMs, roadmap: this.roadmap });
    // Single-flight must not switch to a different internal objective just
    // because an older one is waiting for Teacher, Bridge or CI. Explicit
    // owner-chat requests retain their established priority.
    const activeInternal = current.active
      .filter(job => job.requested_by === 'mel-autonomy')
      .filter(job => !this.roadmap.some(item => item.id === roadmapIdFromJob(job) && isVerifiedRoadmap(item)))
      .sort((left, right) => Number(left?.created_at || 0) - Number(right?.created_at || 0)
        || String(left?.id || '').localeCompare(String(right?.id || '')))[0] || null;
    if (this.singleFlight && activeInternal && actionable?.requested_by !== 'owner-chat') {
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
      .filter(job => job.requested_by === 'mel-autonomy')
      .sort(compareActiveJobs)[0] || null;
    if (this.singleFlight && inFlightInternal) {
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
      .filter((job) => !hasLiveExternalProgress(job))
      .sort(compareActiveJobs)[0];
    if (passiveInternal) {
      return { created: false, job: passiveInternal, next: current.next };
    }

    if (!current.next) {
      const passiveOwner = current.active
        .filter(isSupervisedAutonomyJob)
        .filter((job) => isPassiveRuntimeJob(job))
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
      return { created: false, job: passiveOwner, next: null, complete: !passiveOwner && current.evolution?.status !== 'UNAVAILABLE', evolution: current.evolution };
    }

    const item = current.next;
    const attempts = current.supervisedJobs.filter((job) => roadmapIdFromJob(job) === item.id).length;
    const deterministicId = jobAttemptId(item.id, attempts + 1, this.epochMs);
    const goal = `[${item.id}] ${item.title}${item.next ? ` — ${item.next}` : ''} | OBJECTIF ${manifestObjective(this.roadmap)}`;
    const input = {
      id: deterministicId,
      requested_by: 'mel-autonomy',
      goal,
      optional_context: {
        roadmap_id: item.id,
        phase_id: item.phase_id,
        phase: item.phase,
        priority: item.priority,
        source: 'autonomy-supervisor',
        candidate_branch_only: true,
        zero_added_cost: true,
        attempt: attempts + 1,
      },
    };

    if (typeof this.repository.createIfAbsent === 'function') {
      const result = await this.repository.createIfAbsent(input);
      if (result.job && this.epochMs && jobActivityTimestamp(result.job) < this.epochMs) {
        return {created:false,job:null,next:null,complete:false,external_progress:{job_id:result.job.id,status:'ACTIVE_OBJECTIVE_OUTSIDE_CURRENT_EPOCH'}};
      }
      return { created: result.created, job: result.job, next: item };
    }

    const job = await this.repository.create(input);
    return { created: true, job, next: item };
  }
}
