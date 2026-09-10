import { flattenRoadmap, ROADMAP_STATUSES } from '../roadmap/master-roadmap.js';

const TERMINAL_JOB = new Set(['COMPLETED', 'COMMITTED', 'CANCELLED', 'FAILED']);
const BLOCKED_ROADMAP = new Set([ROADMAP_STATUSES.BLOCKED_HUMAN, ROADMAP_STATUSES.BLOCKED_EXTERNAL]);
const DONE_ROADMAP = new Set([ROADMAP_STATUSES.DONE, ROADMAP_STATUSES.VERIFIED, 'DONE', 'DONE_VERIFIED']);
const PRIORITY_WEIGHT = Object.freeze({ P0: 0, P1: 10, P2: 20, P3: 30 });
const STATUS_WEIGHT = Object.freeze({ IN_PROGRESS: 0, PARTIAL: 1, PLANNED: 2 });

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
    const active = jobs.filter((job) => !TERMINAL_JOB.has(String(job.status || '').toUpperCase()));
    const activeIds = active.map(roadmapIdFromJob).filter(Boolean);
    const completedIds = jobs
      .filter((job) => ['COMPLETED', 'COMMITTED'].includes(String(job.status || '').toUpperCase()))
      .map(roadmapIdFromJob)
      .filter(Boolean);
    const blockedIds = jobs
      .filter((job) => String(job.status || '').toUpperCase() === 'FAILED' && job?.result_json?.autonomy_blocked === true)
      .map(roadmapIdFromJob)
      .filter(Boolean);
    const next = selectNextAutonomyItem({
      roadmap: this.roadmap,
      completedIds,
      blockedIds: [...blockedIds, ...activeIds],
    });
    return { jobs, active, activeIds, completedIds, blockedIds, next };
  }

  async ensureNextJob() {
    const current = await this.state();
    const existing = current.active
      .filter((job) => job.requested_by === 'mel-autonomy')
      .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))[0];
    if (existing) return { created: false, job: existing, next: current.next };
    if (!current.next) return { created: false, job: null, next: null, complete: true };

    const item = current.next;
    const goal = `[${item.id}] ${item.title}${item.next ? ` — ${item.next}` : ''}`;
    const job = await this.repository.create({
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
      },
    });
    return { created: true, job, next: item };
  }
}
