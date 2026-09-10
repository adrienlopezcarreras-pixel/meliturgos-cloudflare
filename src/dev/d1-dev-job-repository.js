import { migrate } from '../persistence/migrations.js';
import { createDevJobCheckpoint, verifyDevJobCheckpoint } from './dev-job-checkpoint.js';

const sharedMemory = new Map();

export class D1DevJobRepository {
  constructor(db, { memoryStore = sharedMemory } = {}) {
    this.db = db;
    this.memory = memoryStore;
    this.ready = null;
  }

  async init() {
    if (this.db) {
      if (!this.ready) this.ready = migrate(this.db);
      await this.ready;
    }
  }

  async create(input) {
    await this.init();
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
    if (!this.db) {
      this.memory.set(j.id, j);
      return j;
    }
    await this.db.prepare('INSERT INTO dev_jobs(id,created_at,updated_at,status,requested_by,goal,optional_context,plan_json,files_json,patch_json,tests_json,result_json,candidate_branch,approval_status,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(j.id, j.created_at, j.updated_at, j.status, j.requested_by, j.goal, JSON.stringify(j.optional_context), null, '[]', null, '[]', null, null, j.approval_status, null)
      .run();
    return j;
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
    return this.get(id);
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

  async claim() {
    await this.init();
    if (!this.db) {
      const j = [...this.memory.values()].find(x => x.status === 'QUEUED');
      return j ? this.update(j.id, { status: 'CLAIMED' }) : null;
    }
    const row = await this.db.prepare("SELECT id FROM dev_jobs WHERE status='QUEUED' ORDER BY created_at ASC LIMIT 1").first();
    if (!row) return null;
    const r = await this.db.prepare("UPDATE dev_jobs SET status='CLAIMED',updated_at=? WHERE id=? AND status='QUEUED'")
      .bind(Date.now(), row.id)
      .run();
    return r.meta?.changes === 1 ? this.get(row.id) : null;
  }
}
