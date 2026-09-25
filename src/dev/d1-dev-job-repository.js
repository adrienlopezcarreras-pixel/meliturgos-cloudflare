import { migrate } from '../persistence/migrations.js';
import { createDevJobCheckpoint, verifyDevJobCheckpoint } from './dev-job-checkpoint.js';
import { D1EvolutionLedger } from '../evolution/evolution-ledger.js';

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

export function isPreparedDevBridgeJob(job) {
  if (String(job?.status || '').toUpperCase() !== 'TEACHER_APPROVED') return false;
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
    await this.db.prepare('INSERT INTO dev_jobs(id,created_at,updated_at,status,requested_by,goal,optional_context,plan_json,files_json,patch_json,tests_json,result_json,candidate_branch,approval_status,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(j.id, j.created_at, j.updated_at, j.status, j.requested_by, j.goal, JSON.stringify(j.optional_context), null, '[]', null, '[]', null, null, j.approval_status, null)
      .run();
    return j;
  }

  /**
   * Idempotent creation for deterministic autonomy job ids. D1 primary-key
   * uniqueness is the cross-isolate lock; the in-memory fallback performs the
   * check and insertion without an intervening await so concurrent callers
   * cannot create two logical copies of the same deterministic job.
   */
  async createIfAbsent(input) {
    if (!input?.id) throw Object.assign(new Error('ID_REQUIRED'), { code: 'ID_REQUIRED' });
    await this.init();
    if (!this.db) {
      const existing = this.memory.get(input.id);
      if (existing) return { created: false, job: existing };
      const job = buildJob(input);
      this.memory.set(job.id, job);
      return { created: true, job };
    }
    try {
      const job = await this.create(input);
      return { created: true, job };
    } catch (error) {
      const existing = await this.get(input.id);
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

  async list() {
    await this.init();
    return this.db
      ? ((await this.db.prepare('SELECT * FROM dev_jobs ORDER BY created_at DESC LIMIT 100').all()).results || []).map(x => this._row(x))
      : [...this.memory.values()];
  }

  async update(id, patch) {
    await this.init();
    const j = await this.get(id);
    if (!j) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    const n = { ...j, ...patch, updated_at: Date.now() };
    if (!this.db) {
      this.memory.set(id, n);
      return n;
    }
    await this.db.prepare('UPDATE dev_jobs SET updated_at=?,status=?,plan_json=?,files_json=?,patch_json=?,tests_json=?,result_json=?,candidate_branch=?,approval_status=?,error=? WHERE id=?')
      .bind(n.updated_at, n.status, JSON.stringify(n.plan_json), JSON.stringify(n.files_json || []), JSON.stringify(n.patch_json), JSON.stringify(n.tests_json || []), JSON.stringify(n.result_json), n.candidate_branch, n.approval_status, n.error, id)
      .run();
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
   * The local bridge may claim a legacy/manual QUEUED job or, with priority,
   * a TEACHER_APPROVED job carrying a correlated structured Bridge package.
   * Supervised autonomy/owner-chat jobs are never legacy claimable while
   * QUEUED: they must pass Council + Teacher and become a prepared package.
   */
  async claim() {
    await this.init();
    if (!this.db) {
      const candidates = [...this.memory.values()]
        .filter((job) => bridgeClaimPriority(job) < 99)
        .sort((a, b) => bridgeClaimPriority(a) - bridgeClaimPriority(b) || Number(a.created_at || 0) - Number(b.created_at || 0));
      const job = candidates[0];
      if (!job) return null;
      return this.update(job.id, { status: 'CLAIMED' });
    }

    const rows = ((await this.db.prepare(`
      SELECT * FROM dev_jobs
      WHERE status='TEACHER_APPROVED'
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
    const expectedStatus = String(candidate.status || '').toUpperCase();
    const r = await this.db.prepare('UPDATE dev_jobs SET status=?,updated_at=? WHERE id=? AND status=?')
      .bind('CLAIMED', Date.now(), candidate.id, expectedStatus)
      .run();
    return r.meta?.changes === 1 ? this.get(candidate.id) : null;
  }
}