import {MAX_AUTONOMOUS_REPAIR_ATTEMPTS} from '../evolution/autonomy-repair-policy.js';
import { MAX_ACTIVE_REVENUE_JOBS } from '../revenue/revenue-queue-policy.js';
import { MAINTENANCE_FENCE_ID } from '../maintenance/maintenance-gate.js';
import { migrate } from '../persistence/migrations.js';
import { createDevJobCheckpoint, verifyDevJobCheckpoint } from './dev-job-checkpoint.js';
import { D1EvolutionLedger } from '../evolution/evolution-ledger.js';
import { isRotatableProviderExhaustion, ROTATABLE_PROVIDER_EXHAUSTION_SQL, PASSIVE_QUEUED_AUTONOMY_SQL, isPassiveQueuedAutonomyJob, isSecondPassQueued, singleFlightAutonomyMission, SINGLE_FLIGHT_AUTONOMY_JOB_SQL } from '../evolution/provider-exhaustion-rotation.js';

// Durable prerequisite waits own no execution slot; admission remains atomic.
// The Bridge's CLAIM is a single D1 UPDATE, so its owner-stop check must
// live in the UPDATE as well as in the HTTP guard. A missing control row is
// not an explicit owner stop (a scoped local fallback has its own consent
// gate), but a paused or legacy owner-off row blocks MAX atomically.
const OWNER_MAX_BRIDGE_CLAIM_FENCE_SQL = `NOT EXISTS (
  SELECT 1 FROM dev_bridge_state AS owner
  WHERE owner.bridge_id='mel-autonomy-control'
    AND (
      owner.status='PAUSED'
      OR CASE WHEN json_valid(owner.metadata_json) THEN (
        COALESCE(json_extract(owner.metadata_json,'$.paused'),0)=1
        OR (
          json_extract(owner.metadata_json,'$.source')='owner-ui'
          AND COALESCE(json_extract(owner.metadata_json,'$.max_autonomy'),0)=0
          AND COALESCE(json_extract(owner.metadata_json,'$.max_remembered'),0)=0
          AND COALESCE(json_extract(owner.metadata_json,'$.paused'),0)=0
          AND (
            json_extract(owner.metadata_json,'$.reason') IS NULL
            OR json_extract(owner.metadata_json,'$.reason')='owner-stop'
          )
        )
      ) ELSE 0 END
    )
)`;

// A repair holds the single autonomous slot even while the maintenance
// worker runs. Invalid or foreign repair scopes cannot authorize a claim.
const NO_REPAIR_LANE_SQL = `NOT EXISTS (SELECT 1 FROM dev_bridge_state c WHERE c.bridge_id='mel-autonomy-control'
 AND CASE WHEN json_valid(c.metadata_json) THEN json_type(c.metadata_json,'$.repair') IS NOT NULL
 AND json_type(c.metadata_json,'$.repair')<>'null' ELSE 1 END)`;
const THIS_REPAIR_LANE_SQL = `EXISTS (SELECT 1 FROM dev_bridge_state c WHERE c.bridge_id='mel-autonomy-control'
 AND c.status='MAX_AUTONOMY' AND json_valid(c.metadata_json)
 AND json_extract(c.metadata_json,'$.paused')=0 AND json_extract(c.metadata_json,'$.max_autonomy')=1
 AND json_extract(c.metadata_json,'$.repair.schema')='mel.autonomy-repair/v1'
 AND json_extract(c.metadata_json,'$.repair.job_id')=dev_jobs.id
 AND json_type(c.metadata_json,'$.repair.owner_control_version')='integer'
 AND json_extract(c.metadata_json,'$.repair.owner_control_version')>0
 AND json_extract(c.metadata_json,'$.repair.owner_control_version')=json_extract(c.metadata_json,'$.owner_control_version')
 AND json_type(c.metadata_json,'$.repair.started_at')='integer' AND json_extract(c.metadata_json,'$.repair.started_at')>0)`;

const ACTIVE_JOB_SQL = "status NOT IN ('CANCELLED','FAILED','COMPLETED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED','WAITING_DEPENDENCY')";
const objectiveId = job => job?.requested_by === 'mel-autonomy' ? String(job?.optional_context?.roadmap_id || '').trim() : '';
// Error-ledger repairs do not have roadmap_id, but still share the single
// autonomous Council/Teacher execution slot with roadmap missions.
// Revenue-watch deliberately retains its separate bounded intake queue.
const exclusiveAutonomyAdmission = job => job?.requested_by === 'mel-autonomy'
  && (Boolean(objectiveId(job)) || job?.optional_context?.source === 'error-ledger');
const activeJob = job => !['CANCELLED','FAILED','COMPLETED','DONE','DONE_VERIFIED','VERIFIED','ACCEPTED','WAITING_DEPENDENCY'].includes(String(job?.status||'').toUpperCase());
function memoryAdmission(memory, job) {
  const objective = objectiveId(job);
  const duplicate = objective && [...memory.values()].find(row => (activeJob(row) || row.status === 'WAITING_DEPENDENCY') && objectiveId(row) === objective);
  if (duplicate) throw Object.assign(new Error('AUTONOMY_OBJECTIVE_ALREADY_ACTIVE'), {code:'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE',job_id:duplicate.id});
  if (exclusiveAutonomyAdmission(job)) {
    const inFlight = [...memory.values()].find(row => row.requested_by === 'mel-autonomy' && activeJob(row) && !isRotatableProviderExhaustion(row) && !isPassiveQueuedAutonomyJob(row));
    if (inFlight) throw Object.assign(new Error('AUTONOMY_OBJECTIVE_ALREADY_ACTIVE'), {code:'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE',job_id:inFlight.id});
  }
  if (job?.optional_context?.source === 'revenue-watch' && [...memory.values()].filter(row=>activeJob(row)&&row?.optional_context?.source==='revenue-watch').length >= MAX_ACTIVE_REVENUE_JOBS) {
    throw Object.assign(new Error('REVENUE_WATCH_QUEUE_FULL'),{code:'REVENUE_WATCH_QUEUE_FULL'});
  }
}

function buildJob(input = {}) {
  const j = {
    id: input.id || crypto.randomUUID(),
    created_at: Date.now(),
    updated_at: Date.now(),
    status: 'QUEUED',
    requested_by: input.requested_by || 'professor',
    goal: input.goal,
    optional_context: input.optional_context || null,
    plan_json: null,
    files_json: [],
    patch_json: null,
    tests_json: [],
    result_json: null,
    candidate_branch: null,
    approval_status: 'PENDING',
    error: null,
  };
  j.job_id = j.id;
  return j;
}

function preparedPackage(job) {
  const teacher = job?.result_json?.teacher_bridge;
  const preparation = job?.result_json?.bridge_preparation;
  if (teacher?.status !== 'ANSWERED' || teacher?.review?.verdict !== 'APPROVE_PLAN' || teacher?.review?.development_allowed !== true) return false;
  if (!teacher?.request?.request_id || teacher.request.request_id !== teacher.review.request_id) return false;
  if (preparation?.status !== 'READY' || preparation.teacher_request_id !== teacher.request.request_id) return false;
  if (!String(preparation.candidate_branch || '').startsWith('candidate/')) return false;
  if (!/^[a-f0-9]{40}$/i.test(String(preparation.candidate_sha || ''))) return false;
  if (!Array.isArray(job.files_json) || !job.files_json.length) return false;
  if (!job.files_json.every((file) => file && typeof file.path === 'string' && typeof file.content === 'string')) return false;
  if (!Array.isArray(job.tests_json) || !job.tests_json.length) return false;
  return job.tests_json.every((test) => test && typeof test.command === 'string');
}

function alreadyPublished(job) {
  return [job?.result_json?.autonomy_completion?.candidate_sha, job?.result_json?.dev_bridge?.candidate_sha]
    .some(value => /^[a-f0-9]{40}$/i.test(String(value || '')));
}

// CODEX: a successful isolated PC edit is not a published canonical commit.
// Only its correlated, tested original package may reach the existing cloud
// publisher; never import arbitrary local diffs or silently retry failed work.
function testedLocalPackage(job) {
  const local = job?.result_json?.dev_bridge;
  const preparation = job?.result_json?.bridge_preparation;
  if (local?.mode !== 'STRUCTURED_MENTOR_WORK' || local.changed !== true
      || local.needs_repair === true || local.validation_failure || local.production_touched !== false
      || local.approved_base?.candidate_branch !== preparation?.candidate_branch
      || local.approved_base?.candidate_sha !== preparation?.candidate_sha) return false;
  const paths = (job.files_json || []).map(file => file.path).sort();
  const applied = Array.isArray(local.applied_files) ? [...local.applied_files].sort() : [];
  if (JSON.stringify(paths) !== JSON.stringify(applied)) return false;
  return Array.isArray(local.tests) && local.tests.length > 0
    && local.tests.every(test => test?.passed === true && test.exit_code === 0
      && test.executed !== false && typeof test.command === 'string');
}

export function isPreparedDevBridgeJob(job) {
  return String(job?.status || '').toUpperCase() === 'TEACHER_APPROVED' && preparedPackage(job);
}

/** A READY package that never reached the candidate branch. CI cannot exist yet. */
export function isUnappliedReadyReviewJob(job) {
  return String(job?.status || '').toUpperCase() === 'READY_FOR_REVIEW'
    && preparedPackage(job) && !alreadyPublished(job)
    && (job?.result_json?.dev_bridge?.changed !== true || testedLocalPackage(job));
}

export function isTeacherGatedDevJob(job) {
  const requester = String(job?.requested_by || '').trim().toLowerCase();
  return requester === 'mel-autonomy' || requester.startsWith('owner-chat');
}

export function isLegacyQueuedDevBridgeJob(job) {
  return String(job?.status || '').toUpperCase() === 'QUEUED' && !isTeacherGatedDevJob(job);
}

function bridgeClaimPriority(job) {
  if (isPreparedDevBridgeJob(job)) return 0;
  if (isLegacyQueuedDevBridgeJob(job)) return 1;
  return 99;
}

const TERMINAL_SQL = "status IN ('CANCELLED','FAILED')";
const FULL_LIST_SQL = 'SELECT * FROM dev_jobs ORDER BY created_at DESC LIMIT 100';
const LIGHT_LIST_SQL = `SELECT id,created_at,updated_at,status,requested_by,goal,optional_context,
  CASE WHEN ${TERMINAL_SQL} THEN NULL ELSE plan_json END AS plan_json,
  CASE WHEN ${TERMINAL_SQL} THEN NULL ELSE files_json END AS files_json,
  CASE WHEN ${TERMINAL_SQL} THEN NULL ELSE patch_json END AS patch_json,
  CASE WHEN ${TERMINAL_SQL} THEN NULL ELSE tests_json END AS tests_json,
  CASE WHEN ${TERMINAL_SQL} AND json_valid(result_json)
    THEN json_set(json_remove(result_json,'$.teacher_bridge.request','$.teacher_bridge_history',
      '$.dev_bridge_history','$.implementation_proposal','$.bridge_package',
      '$.verification_evidence_repairs','$.noop_review_recovery.previous'),
      '$.teacher_bridge.request',json_object('request_id',json_extract(result_json,'$.teacher_bridge.request.request_id')),
      '$.implementation_proposal',json_object('status',json_extract(result_json,'$.implementation_proposal.status'),
        'decision',json_extract(result_json,'$.implementation_proposal.decision'),
        'candidate_sha',json_extract(result_json,'$.implementation_proposal.candidate_sha'),
        'teacher_request_id',json_extract(result_json,'$.implementation_proposal.teacher_request_id')))
    ELSE result_json END AS result_json,
  candidate_branch,approval_status,error
  FROM dev_jobs ORDER BY created_at DESC LIMIT 100`;

export class D1DevJobRepository {
  constructor(db, { memoryStore = null, evolutionLedger = null } = {}) {
    this.db = db;
    this.memory = memoryStore ?? new Map();
    this.ready = null;
    this.evolutionLedger = evolutionLedger || (db ? new D1EvolutionLedger(db) : null);
  }

  async recordEvolution(job, stage, evidence = {}) {
    if (!this.evolutionLedger || !job?.id) return null;
    return this.evolutionLedger.append({
      evolution_id: job.id,
      stage,
      status: String(job.status || 'UNKNOWN'),
      actor: String(job.requested_by || 'unknown'),
      source_sha: String(job?.result_json?.dev_bridge?.candidate_sha || job?.result_json?.bridge_preparation?.candidate_sha || ''),
      branch: String(job.candidate_branch || job?.result_json?.bridge_preparation?.candidate_branch || ''),
      evidence,
      occurred_at: Number(job.updated_at || job.created_at || Date.now()),
    });
  }

  async init() {
    if (this.db) {
      if (!this.ready) this.ready = migrate(this.db);
      await this.ready;
    }
  }

  async create(input) {
    await this.init();
    const j = buildJob(input);
    if (!this.db) {
      memoryAdmission(this.memory, j);
      this.memory.set(j.id, j);
      await this.recordEvolution(j, 'JOB_CREATED', {
      goal: String(j.goal || '').slice(0, 4000),
      approval_status: j.approval_status,
      source: j?.optional_context?.source || null,
      roadmap_id: j?.optional_context?.roadmap_id || null,
      candidate_only: j?.optional_context?.candidate_branch_only === true,
      zero_added_cost: j?.optional_context?.zero_added_cost === true,
    });
    return j;
    }
    // Same SQL statement as the insertion: a preflight read cannot close this race.
    const admission = await this.db.prepare("INSERT INTO dev_jobs(id,created_at,updated_at,status,requested_by,goal,optional_context,plan_json,files_json,patch_json,tests_json,result_json,candidate_branch,approval_status,error) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (?<>'mel-autonomy' OR " + NO_REPAIR_LANE_SQL + ") AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED') AND (?='' OR NOT EXISTS (SELECT 1 FROM dev_jobs WHERE requested_by='mel-autonomy' AND " + "(" + ACTIVE_JOB_SQL + " OR status='WAITING_DEPENDENCY') AND json_extract(optional_context,'$.roadmap_id')=?)) AND (?=0 OR NOT EXISTS (SELECT 1 FROM dev_jobs WHERE requested_by='mel-autonomy' AND " + ACTIVE_JOB_SQL + " AND NOT COALESCE(" + ROTATABLE_PROVIDER_EXHAUSTION_SQL + ",0) AND NOT COALESCE(" + PASSIVE_QUEUED_AUTONOMY_SQL + ",0))) AND (?<> 'revenue-watch' OR (SELECT COUNT(*) FROM dev_jobs WHERE " + "(" + ACTIVE_JOB_SQL + " OR status='WAITING_DEPENDENCY') AND json_extract(optional_context,'$.source')='revenue-watch') < " + MAX_ACTIVE_REVENUE_JOBS + ")")
      .bind(j.id, j.created_at, j.updated_at, j.status, j.requested_by, j.goal, JSON.stringify(j.optional_context), null, '[]', null, '[]', null, null, j.approval_status, null, j.requested_by, MAINTENANCE_FENCE_ID, objectiveId(j), objectiveId(j), exclusiveAutonomyAdmission(j) ? 1 : 0, j.optional_context?.source || '')
      .run();
    if (Number(admission?.meta?.changes) !== 1) {
      if (objectiveId(j)) {
        const existing = await this.db.prepare("SELECT id FROM dev_jobs WHERE requested_by='mel-autonomy' AND " + "(" + ACTIVE_JOB_SQL + " OR status='WAITING_DEPENDENCY') AND json_extract(optional_context,'$.roadmap_id')=? LIMIT 1").bind(objectiveId(j)).first();
        if (existing) throw Object.assign(new Error('AUTONOMY_OBJECTIVE_ALREADY_ACTIVE'), {code:'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE',job_id:existing.id});
      }
      if (exclusiveAutonomyAdmission(j)) {
        const inFlight = await this.db.prepare("SELECT id FROM dev_jobs WHERE requested_by='mel-autonomy' AND " + ACTIVE_JOB_SQL + " AND NOT COALESCE(" + ROTATABLE_PROVIDER_EXHAUSTION_SQL + ",0) AND NOT COALESCE(" + PASSIVE_QUEUED_AUTONOMY_SQL + ",0) ORDER BY created_at ASC, id ASC LIMIT 1").first();
        if (inFlight) throw Object.assign(new Error('AUTONOMY_OBJECTIVE_ALREADY_ACTIVE'), {code:'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE',job_id:inFlight.id});
      }
      if (j.optional_context?.source === 'revenue-watch') {
        const count = await this.db.prepare("SELECT COUNT(*) AS n FROM dev_jobs WHERE " + ACTIVE_JOB_SQL + " AND json_extract(optional_context,'$.source')='revenue-watch'").first();
        if (Number(count?.n) >= MAX_ACTIVE_REVENUE_JOBS) throw Object.assign(new Error('REVENUE_WATCH_QUEUE_FULL'), {code:'REVENUE_WATCH_QUEUE_FULL'});
      }
      throw Object.assign(new Error('MAINTENANCE_JOB_ADMISSION_BLOCKED'), {code:'MAINTENANCE_JOB_ADMISSION_BLOCKED',status:423});
    }
    await this.recordEvolution(j, 'JOB_CREATED', {
      goal: String(j.goal || '').slice(0, 4000),
      approval_status: j.approval_status,
      source: j?.optional_context?.source || null,
      roadmap_id: j?.optional_context?.roadmap_id || null,
      candidate_only: j?.optional_context?.candidate_branch_only === true,
      zero_added_cost: j?.optional_context?.zero_added_cost === true,
    });
    return j;
  }

  /**
   * Idempotent creation for deterministic autonomy job ids. D1 primary-key
   * uniqueness is the cross-isolate lock; the in-memory fallback performs the
   * check and insertion without an intervening await so concurrent callers
   * cannot create two logical copies of the same deterministic job.
   */
  // Reconcile an already-verified roadmap objective without deleting its job
  // or inventing Teacher/CI evidence. The caller must supply a verified
  // roadmap record; CAS prevents overwriting a concurrently advancing job.
  async reconcileVerifiedAutonomyJob(id, roadmapItem) {
    const verified = new Set(['DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']);
    if (!roadmapItem?.id || !verified.has(String(roadmapItem.status || '').trim().toUpperCase())) {
      throw Object.assign(new Error('ROADMAP_VERIFICATION_REQUIRED'), { code: 'ROADMAP_VERIFICATION_REQUIRED' });
    }
    const job = await this.get(id);
    if (!job || job.requested_by !== 'mel-autonomy' || objectiveId(job) !== roadmapItem.id) {
      throw Object.assign(new Error('AUTONOMY_OBJECTIVE_MISMATCH'), { code: 'AUTONOMY_OBJECTIVE_MISMATCH' });
    }
    if (!activeJob(job)) return job;
    // Do not interrupt an external Bridge execution or live review. Such
    // jobs require their own completion/rollback reconciliation.
    // Reconcile only inert legacy queue states. Unknown, executing, review,
    // repair and committed states require their own delivery evidence.
    if (!['QUEUED', 'TEACHER_APPROVED'].includes(String(job.status || '').toUpperCase())) {
      return job;
    }
    // A job still carrying an active Bridge or Teacher marker must not be
    // closed just because its roadmap entry was marked verified elsewhere.
    // Candidate artifacts or a pending approval are not stale queue entries:
    // preserve them until the normal Council/CI/delivery path resolves.
    if (job.candidate_branch || job.patch_json || (Array.isArray(job.files_json) && job.files_json.length > 0)
        || (Array.isArray(job.tests_json) && job.tests_json.length > 0)) {
      return job;
    }
    const bridgeStatus = String(job.result_json?.dev_bridge?.status || '').toUpperCase();
    const teacherStatus = String(job.result_json?.teacher_bridge?.status || '').toUpperCase();
    if (['RUNNING', 'IN_PROGRESS', 'CLAIMED', 'READY_FOR_REVIEW'].includes(bridgeStatus)
        || ['WAITING_TEACHER', 'PENDING', 'REQUESTED'].includes(teacherStatus)) {
      return job;
    }
    return this.update(id, {
      status: 'DONE_VERIFIED',
      result_json: {
        ...(job.result_json || {}),
        roadmap_reconciliation: {
          roadmap_id: roadmapItem.id,
          verified_status: String(roadmapItem.status).trim().toUpperCase(),
          previous_status: job.status,
          reconciled_at: Date.now(),
        },
      },
    }, { expected: job });
  }

  async createIfAbsent(input) {
    if (!input?.id) throw Object.assign(new Error('ID_REQUIRED'), { code: 'ID_REQUIRED' });
    await this.init();
    if (!this.db) {
      const existing = this.memory.get(input.id);
      if (existing) return { created: false, job: existing };
      const job = buildJob(input);
      try { memoryAdmission(this.memory, job); } catch (error) {
        // Never alias a repair request to a different active mission: that
        // would falsely mark the error fixed/queued and advance its Council.
        if (error.code === 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' && input?.optional_context?.source !== 'error-ledger')
          return {created:false,job:this.memory.get(error.job_id)};
        throw error;
      }
      this.memory.set(job.id, job);
      return { created: true, job };
    }
    try {
      const job = await this.create(input);
      return { created: true, job };
    } catch (error) {
      // For a different active autonomy job, error repairs must stay OPEN in
      // the ledger; returning that unrelated job would fabricate admission.
      if (input?.requested_by === 'mel-autonomy' && input?.optional_context?.source === 'error-ledger'
          && error?.code === 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' && error.job_id !== input.id) throw error;
      const existing = await this.get(error?.code === 'AUTONOMY_OBJECTIVE_ALREADY_ACTIVE' ? error.job_id : input.id);
      if (existing) return { created: false, job: existing };
      throw error;
    }
  }

  _row(r) {
    if (!r) return null;
    r.job_id = r.id;
    for (const k of ['optional_context', 'plan_json', 'files_json', 'patch_json', 'tests_json', 'result_json']) {
      if (r[k]) {
        try { r[k] = JSON.parse(r[k]); } catch {}
      }
    }
    return r;
  }

  async get(id) {
    await this.init();
    return this.db
      ? this._row(await this.db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(id).first())
      : this.memory.get(id) || null;
  }

  // Every heartbeat lists jobs several times. Full rows of the last 100 jobs
  // weighed 17 MB on 24/10 (Teacher request copies, histories, patches): the
  // tick ran out of memory before writing anything and MAX never advanced.
  // Finished jobs are listed without those payloads; get() and { full: true }
  // (launch-readiness proofs read COMPLETED Teacher/Council evidence) keep them whole.
  async list({ full = false } = {}) {
    await this.init();
    return this.db
      ? ((await this.db.prepare(full ? FULL_LIST_SQL : LIGHT_LIST_SQL).all()).results || []).map(x => this._row(x))
      : [...this.memory.values()];
  }

  // A UI list is capped at 100 rows; the scheduler must not lose an older
  // active autonomy job behind that window while D1's admission fence still
  // sees it. Return all active autonomy jobs with their complete state.
  async listActiveAutonomyJobs() {
    await this.init();
    return this.db
      ? ((await this.db.prepare("SELECT * FROM dev_jobs WHERE requested_by='mel-autonomy' AND (" + ACTIVE_JOB_SQL + " OR status='WAITING_DEPENDENCY') ORDER BY created_at ASC, id ASC").all()).results || []).map(row => this._row(row))
      : [...this.memory.values()].filter(job => job.requested_by === 'mel-autonomy' && (activeJob(job) || job.status === 'WAITING_DEPENDENCY'));
  }

  // Acceptance is durable software knowledge, not a recent UI event. Keep
  // its exact proof envelope across the 100-row window without reloading
  // source contents, Teacher prompts, bridge history or learning payloads.
  async listAutonomyAcceptanceJobs() {
    await this.init();
    if (!this.db) return [...this.memory.values()].filter(job => job.requested_by === 'mel-autonomy'
      && job.status === 'COMPLETED' && job.result_json?.roadmap_code_acceptance);
    const sql = `SELECT id,created_at,updated_at,status,requested_by,
      json_object('roadmap_id',json_extract(optional_context,'$.roadmap_id'),
        'roadmap_contract_revision',json_extract(optional_context,'$.roadmap_contract_revision'),
        'source',json_extract(optional_context,'$.source')) AS optional_context,
      (SELECT json_group_array(json_object('path',CASE WHEN f.type='object' THEN json_extract(f.value,'$.path') ELSE NULL END))
        FROM json_each(CASE WHEN json_valid(dev_jobs.files_json) THEN dev_jobs.files_json ELSE '[]' END) f) AS files_json,
      json_object('roadmap_code_acceptance',json_extract(result_json,'$.roadmap_code_acceptance'),
        'verify_existing',json_object('status',json_extract(result_json,'$.verify_existing.status'),
          'candidate_sha',json_extract(result_json,'$.verify_existing.candidate_sha')),
        'autonomy_completion',json_object('status',json_extract(result_json,'$.autonomy_completion.status'),
          'candidate_sha',json_extract(result_json,'$.autonomy_completion.candidate_sha'),
          'candidate_branch',json_extract(result_json,'$.autonomy_completion.candidate_branch'),
          'ci',json_extract(result_json,'$.autonomy_completion.ci'),
          'mel_implementation',json_object(
            'verified',json(COALESCE(result_json -> '$.autonomy_completion.mel_implementation.verified','null')),
            'providers_attempted',json_extract(result_json,'$.autonomy_completion.mel_implementation.providers_attempted')))) AS result_json
      FROM dev_jobs WHERE requested_by='mel-autonomy' AND status='COMPLETED'
        AND json_valid(optional_context)
        AND CASE WHEN json_valid(result_json) THEN json_type(result_json,'$.roadmap_code_acceptance')='object' ELSE 0 END
      ORDER BY created_at ASC,id ASC`;
    return ((await this.db.prepare(sql).all()).results || []).map(row => this._row(row));
  }

  // A completed/cancelled attempt can fall outside the 100-row UI list.
  // Counting it in D1 prevents the next deterministic job ID from colliding
  // with historical records and silently reusing a terminal job.
  async countAutonomyObjectiveAttempts(roadmapId) {
    const id = String(roadmapId || '').trim();
    if (!id) return 0;
    await this.init();
    if (!this.db) return [...this.memory.values()].filter(job => objectiveId(job) === id).length;
    const row = await this.db.prepare("SELECT COUNT(*) AS attempts FROM dev_jobs WHERE requested_by='mel-autonomy' AND json_extract(optional_context,'$.roadmap_id')=?").bind(id).first();
    return Number(row?.attempts || 0);
  }

  // Retry limits must include failed attempts outside the UI's most recent
  // 100 rows. Otherwise an old objective can escape its safety quarantine.
  async failedAutonomyObjectiveCounts({ contractRevisions = {} } = {}) {
    await this.init();
    if (!this.db) {
      const counts = {};
      for (const job of this.memory.values()) {
        if (job.requested_by !== 'mel-autonomy' || String(job.status || '').toUpperCase() !== 'FAILED') continue;
        const id = objectiveId(job);
        if (contractRevisions[id] && job.optional_context?.roadmap_contract_revision !== contractRevisions[id]) continue;
        if (id) counts[id] = (counts[id] || 0) + 1;
      }
      return counts;
    }
    const rows = (await this.db.prepare("SELECT json_extract(optional_context,'$.roadmap_id') AS objective, json_extract(optional_context,'$.roadmap_contract_revision') AS revision, COUNT(*) AS failures FROM dev_jobs WHERE requested_by='mel-autonomy' AND status='FAILED' AND json_valid(optional_context) GROUP BY json_extract(optional_context,'$.roadmap_id'),json_extract(optional_context,'$.roadmap_contract_revision')").all()).results || [];
    const counts = {};
    for (const row of rows) {
      if (!row.objective || (contractRevisions[row.objective] && row.revision !== contractRevisions[row.objective])) continue;
      counts[row.objective] = (counts[row.objective] || 0) + Number(row.failures || 0);
    }
    return counts;
  }

  async update(id, patch, { expected = null } = {}) {
    await this.init();
    // In-memory CAS must re-read and compare without an intervening await.
    // The fence compares the stored text itself: a re-serialized JSON differs
    // from rows written by json_set()/other writers (\u escapes, spacing) and
    // used to make every later update a permanent JOB_UPDATE_CONFLICT.
    const raw = this.db ? await this.db.prepare('SELECT * FROM dev_jobs WHERE id=?').bind(id).first() : null;
    const j = this.db ? this._row(raw ? { ...raw } : raw) : this.memory.get(id) || null;
    if (!j) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    // A cancelled job stays cancelled: a tick that read it before "Vider la
    // liste" must not write it back to life (CANCELLED -> COUNCIL_COMPLETE).
    if (String(j.status || '').toUpperCase() === 'CANCELLED') return j;
    // CODEX: fence asynchronous writers against claims/results committed since
    // their read. Never silently retry a stale full-row patch against new state.
    const snapshot = expected || j;
    const conflict = () => Object.assign(new Error('JOB_UPDATE_CONFLICT'), { code: 'JOB_UPDATE_CONFLICT' });
    if (snapshot.id !== id || snapshot.updated_at !== j.updated_at
        || snapshot.status !== j.status
        || JSON.stringify(snapshot.result_json) !== JSON.stringify(j.result_json)
        || JSON.stringify(snapshot.plan_json) !== JSON.stringify(j.plan_json)) throw conflict();
    const n = { ...j, ...patch, updated_at: Math.max(Date.now(), Number(j.updated_at || 0) + 1) };
    // A previously attempted autonomous mission re-entering QUEUED yields
    // the only execution slot. The queue marker is durable, not a retry timer.
    // Never passivize a Bridge-claimed or externally executing package.
    const requestedQueue = String(n.status || '').toUpperCase() === 'QUEUED';
    const previousStatus = String(j.status || '').toUpperCase();
    const bridgeStatus = String(n.result_json?.dev_bridge?.status || '').toUpperCase();
    const teacherStatus = String(n.result_json?.teacher_bridge?.status || '').toUpperCase();
    if (j.requested_by === 'mel-autonomy' && requestedQueue
        && !['QUEUED', 'WAITING_DEPENDENCY'].includes(previousStatus)
        && !['RUNNING','IN_PROGRESS','CLAIMED','READY_FOR_REVIEW'].includes(bridgeStatus)
        && !['WAITING_TEACHER','PENDING','REQUESTED'].includes(teacherStatus)) {
      const previousPass = Number(j.result_json?.autonomy_queue_pass?.round || 1);
      n.result_json = { ...(n.result_json || {}), autonomy_queue_pass: {
        passive: true, round: Math.max(2, previousPass + 1),
        deferred_at: n.updated_at, previous_status: previousStatus,
      } };
    }
    if (!this.db) {
      this.memory.set(id, n);
      return n;
    }
    const write = await this.db.prepare('UPDATE dev_jobs SET goal=?,optional_context=?,updated_at=?,status=?,plan_json=?,files_json=?,patch_json=?,tests_json=?,result_json=?,candidate_branch=?,approval_status=?,error=? WHERE id=? AND (status IS NULL OR status<>\'CANCELLED\') AND updated_at=? AND status IS ? AND COALESCE(result_json,\'null\')=? AND COALESCE(plan_json,\'null\')=?')
      .bind(n.goal, JSON.stringify(n.optional_context), n.updated_at, n.status, JSON.stringify(n.plan_json), JSON.stringify(n.files_json || []), JSON.stringify(n.patch_json), JSON.stringify(n.tests_json || []), JSON.stringify(n.result_json), n.candidate_branch, n.approval_status, n.error, id, raw.updated_at, raw.status, raw.result_json ?? 'null', raw.plan_json ?? 'null')
      .run();
    if (write.meta?.changes === 0) throw conflict();
    const updated = await this.get(id);
    const changedFields = Object.keys(patch || {}).filter(key => !['updated_at'].includes(key)).sort();
    await this.recordEvolution(updated, 'JOB_UPDATED', {
      previous_status: String(j.status || ''),
      next_status: String(updated?.status || ''),
      changed_fields: changedFields,
      approval_status: updated?.approval_status || null,
      candidate_branch: updated?.candidate_branch || null,
      error: updated?.error ? String(updated.error).slice(0, 500) : null,
      teacher_status: updated?.result_json?.teacher_bridge?.status || null,
      teacher_verdict: updated?.result_json?.teacher_bridge?.review?.verdict || null,
      bridge_status: updated?.result_json?.bridge_preparation?.status || null,
      dev_bridge_status: updated?.result_json?.dev_bridge?.status || null,
    });
    return updated;
  }

  // Second pass: claim exactly one inert QUEUED row after the first sweep.
  // This is a D1 compare-and-swap with the same execution/maintenance fence
  // as normal admission, not a blanket activation of the waiting queue.
  async resumeSecondPassQueued(id, { expected = null } = {}) {
    await this.init();
    const job = await this.get(id);
    if (!isSecondPassQueued(job) || Number(job.result_json?.autonomy_queue_pass?.round) !== 2) return null;
    if (expected && (expected.updated_at !== job.updated_at
        || expected.status !== job.status
        || JSON.stringify(expected.result_json) !== JSON.stringify(job.result_json))) return null;
    const result = { ...job.result_json,
      autonomy_queue_pass: { ...job.result_json.autonomy_queue_pass,
        passive: false, resumed_at: Date.now() } };
    if (!this.db) {
      // No await between the final check and the map write: two concurrent
      // resume calls must not each observe a free slot and both become active.
      const observed = this.memory.get(id);
      if (!isSecondPassQueued(observed) || observed.updated_at !== job.updated_at
          || JSON.stringify(observed.result_json) !== JSON.stringify(job.result_json)) return null;
      const busy = [...this.memory.values()].some(row => row.id !== id
        && row.requested_by === 'mel-autonomy' && activeJob(row)
        && !isRotatableProviderExhaustion(row) && !isPassiveQueuedAutonomyJob(row));
      if (busy) return null;
      const updated = { ...observed, status: 'PLANNING', result_json: result,
        updated_at: Math.max(Date.now(), Number(observed.updated_at || 0) + 1) };
      this.memory.set(id, updated);
      await this.recordEvolution(updated, 'JOB_UPDATED', {
        previous_status: 'QUEUED', next_status: 'PLANNING',
        changed_fields: ['result_json','status'], queue_pass: 'SECOND_ROUND_RESUMED',
      });
      return updated;
    }
    const updatedAt = Math.max(Date.now(), Number(job.updated_at || 0) + 1);
    const raw = await this.db.prepare('SELECT result_json,plan_json FROM dev_jobs WHERE id=?').bind(id).first();
    const observed = this._row({ ...raw });
    if (!raw || JSON.stringify(observed.result_json ?? null) !== JSON.stringify(job.result_json ?? null)
        || JSON.stringify(observed.plan_json ?? null) !== JSON.stringify(job.plan_json ?? null)) return null;
    const statement = "UPDATE dev_jobs SET status='PLANNING',updated_at=?,result_json=? WHERE id=? AND status='QUEUED' AND updated_at=?"
      + " AND COALESCE(result_json,'null')=? AND COALESCE(plan_json,'null')=?"
      + " AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED')"
      + " AND NOT EXISTS (SELECT 1 FROM dev_jobs WHERE id<>? AND requested_by='mel-autonomy' AND "
      + ACTIVE_JOB_SQL + " AND NOT COALESCE(" + ROTATABLE_PROVIDER_EXHAUSTION_SQL + ",0)"
      + " AND NOT COALESCE(" + PASSIVE_QUEUED_AUTONOMY_SQL + ",0))";
    const write = await this.db.prepare(statement).bind(
      updatedAt, JSON.stringify(result), id, job.updated_at,
      raw?.result_json ?? 'null', raw?.plan_json ?? 'null', MAINTENANCE_FENCE_ID, id).run();
    if (Number(write?.meta?.changes) !== 1) return null;
    const resumed = await this.get(id);
    await this.recordEvolution(resumed, 'JOB_UPDATED', {
      previous_status: 'QUEUED', next_status: 'PLANNING',
      changed_fields: ['result_json','status'], queue_pass: 'SECOND_ROUND_RESUMED',
    });
    return resumed;
  }

  /** Atomically reserve the only execution lane for one first-pass QUEUED.
   * No Council, Teacher or model call is permitted until this CAS succeeds.
   * Second-pass rows must use resumeSecondPassQueued after the first sweep. */
  async claimQueuedAutonomy(id, { expected = null } = {}) {
    await this.init();
    const job = await this.get(id);
    if (!isPassiveQueuedAutonomyJob(job)
        || Number(job?.result_json?.autonomy_queue_pass?.round || 1) >= 2) return null;
    if (expected && (expected.updated_at !== job.updated_at
        || expected.status !== job.status
        || JSON.stringify(expected.result_json) !== JSON.stringify(job.result_json)
        || JSON.stringify(expected.plan_json) !== JSON.stringify(job.plan_json))) return null;
    if (!this.db) {
      // Final read/slot check/write have no await between them.
      const row = this.memory.get(id);
      if (!isPassiveQueuedAutonomyJob(row)
          || row.updated_at !== job.updated_at
          || JSON.stringify(row.result_json) !== JSON.stringify(job.result_json)
          || JSON.stringify(row.plan_json) !== JSON.stringify(job.plan_json)) return null;
      if ([...this.memory.values()].some(other => other.id !== id
          && other.requested_by === 'mel-autonomy' && activeJob(other)
          && !isRotatableProviderExhaustion(other) && !isPassiveQueuedAutonomyJob(other))) return null;
      const claimed = { ...row, status:'PLANNING',
        updated_at:Math.max(Date.now(),Number(row.updated_at || 0)+1) };
      this.memory.set(id,claimed);
      await this.recordEvolution(claimed,'JOB_UPDATED',{
        previous_status:'QUEUED',next_status:'PLANNING',changed_fields:['status']
      });
      return claimed;
    }
    const raw = await this.db.prepare('SELECT result_json,plan_json FROM dev_jobs WHERE id=?').bind(id).first();
    const observed = this._row({ ...raw });
    // Freeze the snapshot validated above. A fresh SELECT must not silently
    // authorize a Teacher/Bridge mutation which arrived between the reads.
    if (!raw || JSON.stringify(observed.result_json ?? null) !== JSON.stringify(job.result_json ?? null)
        || JSON.stringify(observed.plan_json ?? null) !== JSON.stringify(job.plan_json ?? null)) return null;
    const updatedAt=Math.max(Date.now(),Number(job.updated_at || 0)+1);
    const sql="UPDATE dev_jobs SET status='PLANNING',updated_at=?"
      +" WHERE id=? AND requested_by='mel-autonomy' AND status='QUEUED' AND updated_at=?"
      +" AND COALESCE(result_json,'null')=? AND COALESCE(plan_json,'null')=?"
      +" AND "+NO_REPAIR_LANE_SQL
      +" AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED')"
      +" AND NOT EXISTS (SELECT 1 FROM dev_jobs WHERE id<>? AND requested_by='mel-autonomy' AND "
      +ACTIVE_JOB_SQL+" AND NOT COALESCE("+ROTATABLE_PROVIDER_EXHAUSTION_SQL+",0)"
      +" AND NOT COALESCE("+PASSIVE_QUEUED_AUTONOMY_SQL+",0))";
    const written=await this.db.prepare(sql).bind(
      updatedAt,id,job.updated_at,raw?.result_json??'null',raw?.plan_json??'null',
      MAINTENANCE_FENCE_ID,id).run();
    if(Number(written?.meta?.changes)!==1)return null;
    const claimed=await this.get(id);
    await this.recordEvolution(claimed,'JOB_UPDATED',{
      previous_status:'QUEUED',next_status:'PLANNING',changed_fields:['status']
    });
    return claimed;
  }

  async claimQueuedRepair(id,{expected=null}={}) {
    await this.init();
    const job=await this.get(id);
    if(job?.requested_by!=='mel-autonomy'||job.status!=='QUEUED')return null;
    if(expected&&(job.updated_at!==expected.updated_at||JSON.stringify(job.result_json)!==JSON.stringify(expected.result_json)
      ||JSON.stringify(job.plan_json)!==JSON.stringify(expected.plan_json)))return null;
    if(!this.db)throw Object.assign(new Error('AUTONOMY_REPAIR_D1_FENCE_REQUIRED'),{code:'AUTONOMY_REPAIR_D1_FENCE_REQUIRED'});
    const at=Math.max(Date.now(),Number(job.updated_at||0)+1);
    const sql="UPDATE dev_jobs SET status='PLANNING',updated_at=? WHERE id=? AND status='QUEUED' AND updated_at=?"
      +" AND COALESCE(result_json,'null')=? AND COALESCE(plan_json,'null')=? AND "+THIS_REPAIR_LANE_SQL
      +" AND COALESCE(json_extract(result_json,'$.repair_cycle.attempts'),0)<=?"
      +" AND COALESCE(json_extract(result_json,'$.repair_cycle.status'),'')<>'EXHAUSTED'"
      +" AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED')"
      +" AND NOT EXISTS (SELECT 1 FROM dev_jobs other WHERE other.id<>dev_jobs.id AND other.requested_by='mel-autonomy' AND other.status IN ('CLAIMED','PLANNING'))";
    const write=await this.db.prepare(sql).bind(at,id,job.updated_at,job.result_json===null?'null':JSON.stringify(job.result_json),
      job.plan_json===null?'null':JSON.stringify(job.plan_json),MAX_AUTONOMOUS_REPAIR_ATTEMPTS,MAINTENANCE_FENCE_ID).run();
    if(Number(write?.meta?.changes)!==1)return null;
    const claimed=await this.get(id);
    await this.recordEvolution(claimed,'JOB_UPDATED',{previous_status:'QUEUED',next_status:'PLANNING',changed_fields:['status'],repair_only:true});
    return claimed;
  }

  /**
   * Restore a paused job only when no other internal mission owns the D1
   * single-flight slot. The caller must already have verified its prerequisites.
   */
  async resumeWaitingDependency(id, { expected = null } = {}) {
    await this.init();
    const job = await this.get(id);
    if (job?.status !== 'WAITING_DEPENDENCY') return null;
    if (expected && (expected.updated_at !== job.updated_at || expected.status !== job.status)) return null;
    const prior = String(job.result_json?.dependency_wait?.previous_status || '');
    if (!['QUEUED','TEACHER_APPROVED','WAITING_TEACHER','COUNCIL_COMPLETE','REPAIR_REQUIRED'].includes(prior)) return null;
    const result = { ...(job.result_json || {}) };
    delete result.dependency_wait;
    if (!this.db) {
      if ([...this.memory.values()].some(row => row.id !== id && row.requested_by === 'mel-autonomy'
          && activeJob(row) && !isRotatableProviderExhaustion(row) && !isPassiveQueuedAutonomyJob(row))) return null;
      return this.update(id, { status: prior, result_json: result }, { expected: job });
    }
    const updatedAt = Math.max(Date.now(), Number(job.updated_at || 0) + 1);
    const statement =
      "UPDATE dev_jobs SET status=?,updated_at=?,result_json=? WHERE id=? AND status='WAITING_DEPENDENCY' AND updated_at=?"
      + " AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status='PAUSED')"
      + " AND NOT EXISTS (SELECT 1 FROM dev_jobs WHERE id<>? AND requested_by='mel-autonomy' AND "
      + ACTIVE_JOB_SQL + " AND NOT COALESCE(" + ROTATABLE_PROVIDER_EXHAUSTION_SQL + ",0) AND NOT COALESCE(" + PASSIVE_QUEUED_AUTONOMY_SQL + ",0))";
    const write = await this.db.prepare(statement).bind(prior, updatedAt, JSON.stringify(result), id,
      job.updated_at, MAINTENANCE_FENCE_ID, id).run();
    if (Number(write?.meta?.changes) !== 1) return null;
    const resumed = await this.get(id);
    await this.recordEvolution(resumed, 'JOB_UPDATED', {
      previous_status: 'WAITING_DEPENDENCY', next_status: prior,
      changed_fields: ['result_json', 'status'], dependency_unblocked: true,
    });
    return resumed;
  }

  async checkpoint(id, evidence = {}) {
    const job = await this.get(id);
    if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    const checkpoint = await createDevJobCheckpoint(job, evidence);
    const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
    result.dev_checkpoint = checkpoint;
    await this.update(id, { result_json: result });
    return checkpoint;
  }

  async resume(id) {
    const job = await this.get(id);
    if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    const checkpoint = job.result_json?.dev_checkpoint;
    if (!checkpoint) throw Object.assign(new Error('CHECKPOINT_NOT_FOUND'), { code: 'CHECKPOINT_NOT_FOUND' });
    await verifyDevJobCheckpoint(checkpoint);
    if (checkpoint.job_id !== job.id) {
      throw Object.assign(new Error('CHECKPOINT_JOB_MISMATCH'), { code: 'CHECKPOINT_JOB_MISMATCH' });
    }
    if (checkpoint.candidate_branch && checkpoint.candidate_branch !== job.candidate_branch) {
      throw Object.assign(new Error('CHECKPOINT_BRANCH_MISMATCH'), { code: 'CHECKPOINT_BRANCH_MISMATCH' });
    }
    return { job, checkpoint };
  }

  /**
   * Atomically claim one exact prepared Teacher-approved package.
   * This is used by the cloud fallback so it can never race the local bridge:
   * whichever executor changes TEACHER_APPROVED -> CLAIMED first owns the job.
   */
  async claimPrepared(id) {
    await this.init();
    const job = await this.get(id);
    const approved = isPreparedDevBridgeJob(job);
    const unapplied = isUnappliedReadyReviewJob(job);
    if (!approved && !unapplied) return null;
    const expected = approved ? 'TEACHER_APPROVED' : 'READY_FOR_REVIEW';

    if (!this.db) {
      const current = this.memory.get(id);
      if (String(current?.status || '').toUpperCase() !== expected) return null;
      if (current.requested_by === 'mel-autonomy' && singleFlightAutonomyMission([...this.memory.values()])?.id !== id) return null;
      const claimed = { ...current, status: 'CLAIMED', updated_at: Date.now() };
      this.memory.set(id, claimed);
      await this.recordEvolution(claimed, 'JOB_UPDATED', { previous_status: expected, next_status: 'CLAIMED' });
      return claimed;
    }

    const r = await this.db.prepare(
      'UPDATE dev_jobs SET status=?,updated_at=? WHERE id=? AND status=? AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status=\'PAUSED\')'
        + " AND (requested_by <> 'mel-autonomy' OR (" + OWNER_MAX_BRIDGE_CLAIM_FENCE_SQL + " AND ("+THIS_REPAIR_LANE_SQL+" OR ("+NO_REPAIR_LANE_SQL+" AND id=(" + SINGLE_FLIGHT_AUTONOMY_JOB_SQL + ')))))'
    ).bind('CLAIMED', Date.now(), id, expected, MAINTENANCE_FENCE_ID).run();
    return r.meta?.changes === 1 ? this.get(id) : null;
  }

  /**
   * The local bridge may claim a legacy/manual QUEUED job or, with priority,
   * a TEACHER_APPROVED job carrying a correlated structured Bridge package.
   * Supervised autonomy/owner-chat jobs are never legacy claimable while
   * QUEUED: they must pass Council + Teacher and become a prepared package.
   */
  async claim() {
    await this.init();
    if (!this.db) {
      const holder = singleFlightAutonomyMission([...this.memory.values()]);
      const candidates = [...this.memory.values()]
        .filter(job => job.requested_by !== 'mel-autonomy' || job.id === holder?.id)
        .filter((job) => bridgeClaimPriority(job) < 99)
        .sort((a, b) => bridgeClaimPriority(a) - bridgeClaimPriority(b) || Number(a.created_at || 0) - Number(b.created_at || 0));
      const job = candidates[0];
      if (!job) return null;
      if (isPreparedDevBridgeJob(job)) return this.claimPrepared(job.id);
      return this.update(job.id, { status: 'CLAIMED' }, { expected: job });
    }

    const rows = ((await this.db.prepare(`
      SELECT * FROM dev_jobs
      WHERE (status='TEACHER_APPROVED' AND (requested_by <> 'mel-autonomy' OR id=(${SINGLE_FLIGHT_AUTONOMY_JOB_SQL})))
         OR (
           status='QUEUED'
           AND COALESCE(LOWER(requested_by), '') <> 'mel-autonomy'
           AND COALESCE(LOWER(requested_by), '') NOT LIKE 'owner-chat%'
         )
      ORDER BY CASE status WHEN 'TEACHER_APPROVED' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 100
    `).all()).results || []).map((row) => this._row(row));
    const candidate = rows.find((job) => isPreparedDevBridgeJob(job)) || rows.find((job) => isLegacyQueuedDevBridgeJob(job));
    if (!candidate) return null;
    if (isPreparedDevBridgeJob(candidate)) return this.claimPrepared(candidate.id);
    const expectedStatus = String(candidate.status || '').toUpperCase();
    const r = await this.db.prepare('UPDATE dev_jobs SET status=?,updated_at=? WHERE id=? AND status=? AND NOT EXISTS (SELECT 1 FROM dev_bridge_state WHERE bridge_id=? AND status=\'PAUSED\')')
      .bind('CLAIMED', Date.now(), candidate.id, expectedStatus, MAINTENANCE_FENCE_ID)
      .run();
    return r.meta?.changes === 1 ? this.get(candidate.id) : null;
  }
}
