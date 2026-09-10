import { applyTeacherReview } from '../teachers/teacher-request.js';

export const WORK_DAG_STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
});

export const WORK_NODE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  WAITING_TEACHER: 'WAITING_TEACHER',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
});

const NODE_KINDS = new Set(['TASK', 'AUGMENTIO', 'TEACHER']);
const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function clean(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12000);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unsignedDag(dag) {
  const value = clean(dag);
  delete value.integrity_sha256;
  return value;
}

async function signDag(dag) {
  const unsigned = unsignedDag(dag);
  return { ...unsigned, integrity_sha256: await sha256(stable(unsigned)) };
}

export async function verifyWorkDag(dag) {
  validateWorkDag(dag);
  const supplied = dag?.integrity_sha256;
  if (!supplied) throw Object.assign(new Error('WORK_DAG_INTEGRITY_REQUIRED'), { code: 'WORK_DAG_INTEGRITY_REQUIRED' });
  const unsigned = unsignedDag(dag);
  const expected = await sha256(stable(unsigned));
  if (expected !== supplied) throw Object.assign(new Error('WORK_DAG_INTEGRITY_MISMATCH'), { code: 'WORK_DAG_INTEGRITY_MISMATCH' });
  return true;
}

function assertNoCycles(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw Object.assign(new Error('WORK_DAG_CYCLE'), { code: 'WORK_DAG_CYCLE' });
    visiting.add(id);
    for (const dep of byId.get(id)?.depends_on || []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const node of nodes) visit(node.id);
}

export function validateWorkDag(dag) {
  if (!dag || dag.schema !== 'mel.work-dag' || dag.version !== 1 || !dag.id || !dag.job_id) {
    throw Object.assign(new Error('WORK_DAG_INVALID'), { code: 'WORK_DAG_INVALID' });
  }
  if (dag.candidate_branch && !String(dag.candidate_branch).startsWith('candidate/')) {
    throw Object.assign(new Error('WORK_DAG_NON_CANDIDATE_BRANCH'), { code: 'WORK_DAG_NON_CANDIDATE_BRANCH' });
  }
  if (!Array.isArray(dag.nodes) || dag.nodes.length === 0) {
    throw Object.assign(new Error('WORK_DAG_NODES_REQUIRED'), { code: 'WORK_DAG_NODES_REQUIRED' });
  }
  const ids = new Set();
  for (const node of dag.nodes) {
    if (!node?.id || ids.has(node.id)) throw Object.assign(new Error('WORK_DAG_NODE_ID_INVALID'), { code: 'WORK_DAG_NODE_ID_INVALID' });
    ids.add(node.id);
    if (!NODE_KINDS.has(node.kind)) throw Object.assign(new Error('WORK_DAG_NODE_KIND_INVALID'), { code: 'WORK_DAG_NODE_KIND_INVALID' });
  }
  for (const node of dag.nodes) {
    for (const dep of node.depends_on || []) {
      if (!ids.has(dep) || dep === node.id) throw Object.assign(new Error('WORK_DAG_DEPENDENCY_INVALID'), { code: 'WORK_DAG_DEPENDENCY_INVALID' });
    }
  }
  assertNoCycles(dag.nodes);
  return true;
}

export function createWorkDag({ id = crypto.randomUUID(), jobId, goal, candidateBranch = null, candidateSha = null, nodes = [] } = {}) {
  const dag = {
    schema: 'mel.work-dag',
    version: 1,
    id: String(id),
    job_id: String(jobId || ''),
    goal: String(goal || '').slice(0, 4000),
    candidate_branch: candidateBranch,
    candidate_sha: candidateSha,
    status: WORK_DAG_STATUS.RUNNING,
    nodes: nodes.map((node) => ({
      id: String(node.id || ''),
      kind: String(node.kind || 'TASK').toUpperCase(),
      depends_on: [...(node.depends_on || [])].map(String),
      idempotent: node.idempotent === true,
      payload: clean(node.payload || {}),
      status: WORK_NODE_STATUS.PENDING,
      attempts: 0,
      result: null,
      artifacts: [],
      error: null,
      teacher_request: null,
      teacher_review: null,
    })),
    artifacts: [],
    audit: [{ event: 'WORK_DAG_CREATED', at: Date.now() }],
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  validateWorkDag(dag);
  return dag;
}

export class DevJobWorkDagStore {
  constructor(repository, jobId) {
    if (!repository || !jobId) throw new Error('WORK_DAG_STORE_CONFIG_REQUIRED');
    this.repository = repository;
    this.jobId = jobId;
  }

  async load() {
    const job = await this.repository.get(this.jobId);
    if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    const dag = job.result_json?.work_dag || null;
    if (!dag) return null;
    await verifyWorkDag(dag);
    if (dag.job_id !== job.id) throw Object.assign(new Error('WORK_DAG_JOB_MISMATCH'), { code: 'WORK_DAG_JOB_MISMATCH' });
    if (dag.candidate_branch && job.candidate_branch && dag.candidate_branch !== job.candidate_branch) {
      throw Object.assign(new Error('WORK_DAG_BRANCH_MISMATCH'), { code: 'WORK_DAG_BRANCH_MISMATCH' });
    }
    return dag;
  }

  async save(dag) {
    validateWorkDag(dag);
    if (dag.job_id !== this.jobId) throw Object.assign(new Error('WORK_DAG_JOB_MISMATCH'), { code: 'WORK_DAG_JOB_MISMATCH' });
    const signed = await signDag({ ...dag, updated_at: Date.now() });
    const job = await this.repository.get(this.jobId);
    if (!job) throw Object.assign(new Error('JOB_NOT_FOUND'), { code: 'JOB_NOT_FOUND' });
    const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
    result.work_dag = signed;
    await this.repository.update(this.jobId, { result_json: result });
    return signed;
  }
}

export function createAugmentioWorkExecutor(augmentio) {
  if (!augmentio?.fanOut) throw new Error('AUGMENTIO_REQUIRED');
  return async (node) => augmentio.fanOut({
    capability: node.payload?.capability || 'GENERAL',
    input: node.payload?.input || '',
    context: node.payload?.context || {},
    maxCandidates: node.payload?.maxCandidates || 4,
  });
}

export class WorkDagRunner {
  constructor({ store, executors = {}, expectedCandidateSha = null } = {}) {
    if (!store) throw new Error('WORK_DAG_STORE_REQUIRED');
    this.store = store;
    this.executors = executors;
    this.expectedCandidateSha = expectedCandidateSha;
  }

  assertBinding(dag) {
    if (this.expectedCandidateSha && dag.candidate_sha !== this.expectedCandidateSha) {
      throw Object.assign(new Error('WORK_DAG_CANDIDATE_SHA_MISMATCH'), { code: 'WORK_DAG_CANDIDATE_SHA_MISMATCH' });
    }
  }

  async persist(dag, event, detail = {}) {
    dag.audit = [...(dag.audit || []), clean({ event, at: Date.now(), ...detail })];
    return this.store.save(dag);
  }

  async run(initialDag = null) {
    let dag = initialDag || await this.store.load();
    if (!dag) throw Object.assign(new Error('WORK_DAG_NOT_FOUND'), { code: 'WORK_DAG_NOT_FOUND' });
    this.assertBinding(dag);

    for (const node of dag.nodes) {
      if (node.status !== WORK_NODE_STATUS.RUNNING) continue;
      if (!node.idempotent) {
        node.status = WORK_NODE_STATUS.BLOCKED;
        node.error = 'INTERRUPTED_NON_IDEMPOTENT_NODE';
        dag.status = WORK_DAG_STATUS.BLOCKED;
        return this.persist(dag, 'WORK_DAG_FAIL_CLOSED_ON_INTERRUPTED_NODE', { node_id: node.id });
      }
      node.status = WORK_NODE_STATUS.PENDING;
      node.result = null;
      node.artifacts = [];
      dag.artifacts = (dag.artifacts || []).filter((item) => item?.node_id !== node.id);
      node.error = null;
      dag = await this.persist(dag, 'WORK_NODE_RECOVERED_FOR_RETRY', { node_id: node.id });
    }

    while (true) {
      if (dag.nodes.every((node) => node.status === WORK_NODE_STATUS.COMPLETED)) {
        dag.status = WORK_DAG_STATUS.COMPLETED;
        return this.persist(dag, 'WORK_DAG_COMPLETED');
      }
      if (dag.nodes.some((node) => node.status === WORK_NODE_STATUS.WAITING_TEACHER)) {
        dag.status = WORK_DAG_STATUS.WAITING;
        return this.store.save(dag);
      }
      if (dag.nodes.some((node) => [WORK_NODE_STATUS.FAILED, WORK_NODE_STATUS.BLOCKED].includes(node.status))) {
        dag.status = WORK_DAG_STATUS.BLOCKED;
        return this.store.save(dag);
      }

      const ready = dag.nodes.find((node) => node.status === WORK_NODE_STATUS.PENDING &&
        (node.depends_on || []).every((dep) => dag.nodes.find((candidate) => candidate.id === dep)?.status === WORK_NODE_STATUS.COMPLETED));
      if (!ready) {
        dag.status = WORK_DAG_STATUS.BLOCKED;
        return this.persist(dag, 'WORK_DAG_NO_RUNNABLE_NODE');
      }

      ready.status = WORK_NODE_STATUS.RUNNING;
      ready.attempts += 1;
      dag.status = WORK_DAG_STATUS.RUNNING;
      dag = await this.persist(dag, 'WORK_NODE_STARTED', { node_id: ready.id, kind: ready.kind, attempt: ready.attempts });
      const node = dag.nodes.find((candidate) => candidate.id === ready.id);

      try {
        if (node.kind === 'TEACHER') {
          const request = node.payload?.request;
          if (!request || request.type !== 'MEL_TEACHER_REVIEW_REQUEST' || !request.request_id) {
            throw Object.assign(new Error('WORK_TEACHER_REQUEST_REQUIRED'), { code: 'WORK_TEACHER_REQUEST_REQUIRED' });
          }
          node.teacher_request = clean(request);
          node.status = WORK_NODE_STATUS.WAITING_TEACHER;
          dag.status = WORK_DAG_STATUS.WAITING;
          return this.persist(dag, 'WORK_NODE_WAITING_TEACHER', { node_id: node.id, request_id: request.request_id });
        }

        const executor = this.executors[node.kind] || this.executors[node.kind.toLowerCase()];
        if (!executor) throw Object.assign(new Error(`WORK_EXECUTOR_REQUIRED:${node.kind}`), { code: 'WORK_EXECUTOR_REQUIRED' });
        const result = clean(await executor(node, dag));
        const artifacts = Array.isArray(result?.artifacts) ? clean(result.artifacts) : [];
        node.result = result;
        node.artifacts = artifacts;
        dag.artifacts = [
          ...(dag.artifacts || []).filter((item) => item?.node_id !== node.id),
          ...artifacts.map((artifact) => clean({ node_id: node.id, artifact })),
        ].slice(0, 100);
        node.status = WORK_NODE_STATUS.COMPLETED;
        node.error = null;
        dag = await this.persist(dag, 'WORK_NODE_COMPLETED', { node_id: node.id, kind: node.kind, artifact_count: artifacts.length });
      } catch (error) {
        node.status = WORK_NODE_STATUS.FAILED;
        node.error = String(error?.code || error?.message || error).slice(0, 1000);
        dag.status = WORK_DAG_STATUS.BLOCKED;
        return this.persist(dag, 'WORK_NODE_FAILED', { node_id: node.id, code: node.error });
      }
    }
  }

  async submitTeacherReply(nodeId, review) {
    let dag = await this.store.load();
    if (!dag) throw Object.assign(new Error('WORK_DAG_NOT_FOUND'), { code: 'WORK_DAG_NOT_FOUND' });
    this.assertBinding(dag);
    const node = dag.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.status !== WORK_NODE_STATUS.WAITING_TEACHER || !node.teacher_request) {
      throw Object.assign(new Error('WORK_TEACHER_NODE_NOT_WAITING'), { code: 'WORK_TEACHER_NODE_NOT_WAITING' });
    }
    const applied = applyTeacherReview(node.teacher_request, review);
    node.teacher_review = clean(applied);
    if (!applied.development_allowed) {
      node.status = WORK_NODE_STATUS.BLOCKED;
      node.error = `TEACHER_${applied.verdict}`;
      dag.status = WORK_DAG_STATUS.BLOCKED;
      return this.persist(dag, 'WORK_TEACHER_REVIEW_BLOCKED', { node_id: node.id, request_id: applied.request_id, verdict: applied.verdict });
    }
    node.status = WORK_NODE_STATUS.COMPLETED;
    node.result = clean(applied);
    node.error = null;
    dag = await this.persist(dag, 'WORK_TEACHER_REVIEW_APPLIED', { node_id: node.id, request_id: applied.request_id, verdict: applied.verdict });
    return this.run(dag);
  }
}
