import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { Augmentio } from '../augmentio/augmentio.js';
import { createDefaultAugmentioPool } from '../augmentio/default-pool.js';
import {
  createWorkDag,
  DevJobWorkDagStore,
  WorkDagRunner,
  createAugmentioWorkExecutor,
  WORK_DAG_STATUS,
  WORK_NODE_STATUS,
} from '../work/work-dag.js';

const PROOF_KEY = 'work_dag_resume';

function proofFromJob(job) {
  return job?.result_json?.autonomy_proofs?.[PROOF_KEY] || null;
}

function isVerifiedProof(proof) {
  return proof?.status === 'VERIFIED'
    && proof?.recovered_interrupted_node === true
    && Number(proof?.providers_attempted || 0) >= 2;
}

/**
 * With targetJobId, reuse is deliberately scoped to that exact job. A proof
 * persisted by an older autonomous job cannot silently satisfy a new loop.
 * Without targetJobId this preserves the historical repository-wide lookup for
 * diagnostic callers that only need to know whether any proof ever existed.
 */
export async function findVerifiedRuntimeWorkProof(repository, { targetJobId = null } = {}) {
  if (!repository || typeof repository.list !== 'function') return null;
  if (targetJobId) {
    if (typeof repository.get !== 'function') return null;
    const job = await repository.get(targetJobId);
    const proof = proofFromJob(job);
    return isVerifiedProof(proof) ? { job_id: job.id, proof } : null;
  }
  const jobs = await repository.list();
  for (const job of jobs) {
    const proof = proofFromJob(job);
    if (isVerifiedProof(proof)) return { job_id: job.id, proof };
  }
  return null;
}

async function persistProof(repository, targetJobId, proof) {
  if (!repository || !targetJobId) return proof;
  const job = await repository.get(targetJobId);
  if (!job) throw Object.assign(new Error('AUTONOMY_PROOF_TARGET_JOB_NOT_FOUND'), { code: 'AUTONOMY_PROOF_TARGET_JOB_NOT_FOUND' });
  const result = job.result_json && typeof job.result_json === 'object' ? { ...job.result_json } : {};
  const proofs = result.autonomy_proofs && typeof result.autonomy_proofs === 'object' ? { ...result.autonomy_proofs } : {};
  proofs[PROOF_KEY] = proof;
  result.autonomy_proofs = proofs;
  await repository.update(job.id, { result_json: result });
  return proof;
}

/**
 * Executes a bounded live runtime proof of the exact recovery path MEL relies on:
 * - a Work DAG is checkpointed with an idempotent AUGMENTIO node left RUNNING;
 * - a fresh runner loads that checkpoint and must recover/retry the node;
 * - .augmentio must attempt at least two explicitly zero-added-cost providers;
 * - the recovered DAG must complete without replaying unsafe/non-idempotent work.
 *
 * The proof uses an isolated in-memory dev-job repository so it cannot mutate a
 * real development DAG. Only the compact proof result is persisted into the
 * caller's real dev job when repository/targetJobId are supplied.
 */
export async function runRuntimeWorkDagResumeProof(env = {}, {
  repository = null,
  targetJobId = null,
} = {}) {
  if (!env?.AI || typeof env.AI.run !== 'function') {
    throw Object.assign(new Error('AI_BINDING_MISSING'), { code: 'AI_BINDING_MISSING' });
  }

  if (repository) {
    const existing = await findVerifiedRuntimeWorkProof(repository, { targetJobId });
    if (existing) return { ...existing.proof, reused: true, evidence_job_id: existing.job_id };
  }

  const proofRepository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const proofJob = await proofRepository.create({
    id: `runtime-work-proof-${crypto.randomUUID()}`,
    requested_by: 'mel-runtime-proof',
    goal: 'Prove resumable Work DAG with live .augmentio fan-out',
  });
  await proofRepository.update(proofJob.id, { candidate_branch: 'candidate/runtime-proof' });

  const store = new DevJobWorkDagStore(proofRepository, proofJob.id);
  const dag = createWorkDag({
    id: `work-proof-${crypto.randomUUID()}`,
    jobId: proofJob.id,
    goal: 'Recover an interrupted idempotent multi-AI node and complete the DAG',
    candidateBranch: 'candidate/runtime-proof',
    nodes: [
      {
        id: 'multi-ai-state',
        kind: 'AUGMENTIO',
        idempotent: true,
        payload: {
          capability: 'GENERAL',
          input: 'Runtime continuity proof. Reply with a short technical acknowledgement only.',
          context: { purpose: 'MEL_RUNTIME_WORK_DAG_RESUME_PROOF' },
          maxCandidates: 2,
        },
      },
      {
        id: 'local-finish',
        kind: 'TASK',
        depends_on: ['multi-ai-state'],
        idempotent: true,
        payload: { purpose: 'finish-proof' },
      },
    ],
  });

  // Persist an intentionally interrupted idempotent node exactly as a Worker
  // restart would leave it. WorkDagRunner must recover it fail-safely.
  dag.nodes[0].status = WORK_NODE_STATUS.RUNNING;
  dag.nodes[0].attempts = 1;
  await store.save(dag);

  const augmentio = new Augmentio({ pool: createDefaultAugmentioPool(env) });
  const runner = new WorkDagRunner({
    store,
    executors: {
      AUGMENTIO: createAugmentioWorkExecutor(augmentio),
      TASK: async () => ({ ok: true, source: 'local-runtime-proof' }),
    },
  });

  const completed = await runner.run();
  const multi = completed.nodes.find((node) => node.id === 'multi-ai-state');
  const recovered = completed.audit?.some((entry) => entry.event === 'WORK_NODE_RECOVERED_FOR_RETRY' && entry.node_id === 'multi-ai-state') === true;
  const providersAttempted = Array.isArray(multi?.result?.providersAttempted) ? multi.result.providersAttempted.length : 0;
  const successfulCandidates = Array.isArray(multi?.result?.candidates) ? multi.result.candidates.length : 0;

  if (completed.status !== WORK_DAG_STATUS.COMPLETED) {
    throw Object.assign(new Error('RUNTIME_WORK_DAG_PROOF_NOT_COMPLETED'), { code: 'RUNTIME_WORK_DAG_PROOF_NOT_COMPLETED' });
  }
  if (!recovered || Number(multi?.attempts || 0) < 2) {
    throw Object.assign(new Error('RUNTIME_WORK_DAG_RECOVERY_NOT_PROVEN'), { code: 'RUNTIME_WORK_DAG_RECOVERY_NOT_PROVEN' });
  }
  if (providersAttempted < 2) {
    throw Object.assign(new Error('RUNTIME_WORK_DAG_MULTI_AI_NOT_PROVEN'), { code: 'RUNTIME_WORK_DAG_MULTI_AI_NOT_PROVEN' });
  }
  if (successfulCandidates < 1) {
    throw Object.assign(new Error('RUNTIME_WORK_DAG_NO_SUCCESSFUL_AI_RESULT'), { code: 'RUNTIME_WORK_DAG_NO_SUCCESSFUL_AI_RESULT' });
  }

  const proof = {
    status: 'VERIFIED',
    schema: 'mel.autonomy-proof/work-dag-resume',
    version: 2,
    verified_at: new Date().toISOString(),
    target_job_id: targetJobId || null,
    recovered_interrupted_node: true,
    interrupted_node_id: 'multi-ai-state',
    attempts_after_recovery: Number(multi.attempts || 0),
    providers_attempted: providersAttempted,
    successful_candidates: successfulCandidates,
    zero_added_cost_policy: 'ENFORCED_BY_AUGMENTIO_GOVERNOR',
    candidate_branch_isolated: true,
    destructive_effects: false,
    production_touched: false,
    proof_dag_status: completed.status,
    proof_dag_audit_events: (completed.audit || []).map((entry) => entry.event).slice(-20),
  };

  return persistProof(repository, targetJobId, proof);
}
