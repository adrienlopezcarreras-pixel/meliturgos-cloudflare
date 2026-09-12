import { flattenRoadmap, ROADMAP_STATUSES } from '../roadmap/master-roadmap.js';

const TERMINAL_JOB = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);
const BLOCKED_ROADMAP = new Set([ROADMAP_STATUSES.BLOCKED_HUMAN, ROADMAP_STATUSES.BLOCKED_EXTERNAL]);
const DONE_ROADMAP = new Set([ROADMAP_STATUSES.DONE, ROADMAP_STATUSES.VERIFIED, 'DONE', 'DONE_VERIFIED']);
const PRIORITY_WEIGHT = Object.freeze({ P0: 0, P1: 10, P2: 20, P3: 30 });
const STATUS_WEIGHT = Object.freeze({ IN_PROGRESS: 0, PARTIAL: 1, PLANNED: 2 });
const SUPERVISED_REQUESTERS = new Set(['owner-chat', 'mel-autonomy']);

// Autonomy-first ordering: finish the ability to keep working before cosmetics or devices.
const AUTONOMY_ORDER = [
  'MEL-WORK-01',
  'MEL-WORK-02',
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

function isPassiveRuntimeJob(job) {
  const status = String(job?.status || '').toUpperCase();
  if (status === 'WAITING_TEACHER') return true;
  // READY_FOR_REVIEW without a failed local test has no runtime transition to
  // execute: it is waiting for externally recorded CI/completion evidence.
  // Treat it as passive so it cannot starve another job that can genuinely
  // advance. A repairable READY_FOR_REVIEW job remains actionable and keeps
  // normal owner priority.
  return status === 'READY_FOR_REVIEW' && job?.result_json?.dev_bridge?.needs_repair !== true;
}

function executionReadyRank(job) {
  const status = String(job?.status || '').toUpperCase();
  // Already-approved implementation or an explicit repair can make concrete
  // candidate progress immediately. Prefer that over preflight-only work so a
  // queue of CLAIMED/QUEUED owner requests cannot starve an approved internal
  // roadmap implementation forever. Owner priority is still preserved when
  // both jobs are equally implementation-ready.
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

export function selectNextAutonomyItem({ roadmap = flattenRoadmap(), completedIds = [], blockedIds = [] } = {}) {
  const completed = new Set(completedIds);
  const blocked = new Set(blockedIds);
  return roadmap
    .filter((item) => item && item.id)
    .filter((item) => !DONE_ROADMAP.has(item.status))
    .filter((item) => !BLOCKED_ROADMAP.has(item.status))
    .filter((item) => !completed.has(item.id) && !blocked.has(item.id))
    .sort((a, b) => score(a) - score(b) || String(a.id).localeCompare(String(b.id)))[0] || null;
}

function roadmapIdFromJob(job) {
  return job?.optional_context?.roadmap_id || null;
}

function jobAttemptId(itemId, attempt) {
  return `mel-autonomy-${String(itemId).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}-${attempt}`.slice(0, 180);
}

export function isSupervisedAutonomyJob(job) {
  return SUPERVISED_REQUESTERS.has(String(job?.requested_by || ''));
}

export class AutonomySupervisor {
  constructor({ repository, roadmap = flattenRoadmap() } = {}) {
    if (!repository || typeof repository.list !== 'function' || typeof repository.create !== 'function') {
      throw Object.assign(new Error('AUTONOMY_JOB_REPOSITORY_REQUIRED'), { code: 'AUTONOMY_JOB_REPOSITORY_REQUIRED' });
    }
    this.repository = repository;
    this.roadmap = roadmap;
  }

  async state() {
    const jobs = await this.repository.list();
    // Only jobs created by the supervised autonomy channels may advance, block
    // or consume roadmap attempts. Legacy/manual Professor jobs remain visible
    // in the repository but cannot forge roadmap completion evidence.
    const supervisedJobs = jobs.filter(isSupervisedAutonomyJob);
    const active = supervisedJobs.filter((job) => !TERMINAL_JOB.has(String(job.status || '').toUpperCase()));
    const activeIds = active.map(roadmapIdFromJob).filter(Boolean);
    const completedIds = supervisedJobs
      .filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase()))
      .map(roadmapIdFromJob)
      .filter(Boolean);
    const blockedIds = supervisedJobs
      .filter((job) => String(job.status || '').toUpperCase() === 'FAILED' && job?.result_json?.autonomy_blocked === true)
      .map(roadmapIdFromJob)
      .filter(Boolean);
    const next = selectNextAutonomyItem({
      roadmap: this.roadmap,
      completedIds,
      blockedIds: [...blockedIds, ...activeIds],
    });
    return { jobs, supervisedJobs, active, activeIds, completedIds, blockedIds, next };
  }

  async ensureNextJob() {
    const current = await this.state();
    const actionable = current.active
      .filter(isSupervisedAutonomyJob)
      .filter((job) => !isPassiveRuntimeJob(job))
      .sort(compareActiveJobs)[0];
    if (actionable) return { created: false, job: actionable, next: current.next };

    // An internal roadmap job that is passively waiting for Teacher or external
    // completion evidence is still the current roadmap gate: do not create a
    // second internal roadmap job in parallel. By contrast, passive owner-chat
    // work remains untouched while MEL may advance the next background item.
    const passiveInternal = current.active
      .filter(isSupervisedAutonomyJob)
      .filter((job) => isPassiveRuntimeJob(job) && job.requested_by === 'mel-autonomy')
      .sort(compareActiveJobs)[0];
    if (passiveInternal) return { created: false, job: passiveInternal, next: current.next };

    if (!current.next) {
      const passiveOwner = current.active
        .filter(isSupervisedAutonomyJob)
        .filter((job) => isPassiveRuntimeJob(job))
        .sort(compareActiveJobs)[0] || null;
      return { created: false, job: passiveOwner, next: null, complete: !passiveOwner };
    }

    const item = current.next;
    const attempts = current.supervisedJobs.filter((job) => roadmapIdFromJob(job) === item.id).length;
    const deterministicId = jobAttemptId(item.id, attempts + 1);
    const goal = `[${item.id}] ${item.title}${item.next ? ` — ${item.next}` : ''}`;
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
      return { created: result.created, job: result.job, next: item };
    }

    const job = await this.repository.create(input);
    return { created: true, job, next: item };
  }
}
