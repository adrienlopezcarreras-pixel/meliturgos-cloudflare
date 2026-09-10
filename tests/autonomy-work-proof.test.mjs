import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runRuntimeWorkDagResumeProof, findVerifiedRuntimeWorkProof } from '../src/evolution/autonomy-proof.js';

test('runtime proof recovers an interrupted idempotent Work DAG node through live .augmentio plumbing and persists evidence', async () => {
  const aiCalls = [];
  const env = {
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `ack:${model}` };
      },
    },
  };
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'proof-target', requested_by: 'mel-autonomy', goal: 'target' });

  const proof = await runRuntimeWorkDagResumeProof(env, { repository, targetJobId: job.id });
  assert.equal(proof.status, 'VERIFIED');
  assert.equal(proof.recovered_interrupted_node, true);
  assert.ok(proof.attempts_after_recovery >= 2);
  assert.ok(proof.providers_attempted >= 2);
  assert.ok(proof.successful_candidates >= 1);
  assert.ok(aiCalls.length >= 2);
  assert.ok(proof.proof_dag_audit_events.includes('WORK_NODE_RECOVERED_FOR_RETRY'));
  assert.ok(proof.proof_dag_audit_events.includes('WORK_DAG_COMPLETED'));

  const stored = await repository.get(job.id);
  assert.equal(stored.result_json.autonomy_proofs.work_dag_resume.status, 'VERIFIED');
  const found = await findVerifiedRuntimeWorkProof(repository);
  assert.equal(found.job_id, job.id);
});

test('runtime proof is idempotently reused once verified instead of consuming more AI calls', async () => {
  let calls = 0;
  const env = { AI: { async run(model) { calls += 1; return { response: `ack:${model}` }; } } };
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'proof-reuse', requested_by: 'mel-autonomy', goal: 'target' });

  const first = await runRuntimeWorkDagResumeProof(env, { repository, targetJobId: job.id });
  const firstCalls = calls;
  const second = await runRuntimeWorkDagResumeProof(env, { repository, targetJobId: job.id });

  assert.equal(first.status, 'VERIFIED');
  assert.equal(second.status, 'VERIFIED');
  assert.equal(second.reused, true);
  assert.equal(second.evidence_job_id, job.id);
  assert.equal(calls, firstCalls);
});

test('runtime proof fails closed without the AI binding', async () => {
  await assert.rejects(
    () => runRuntimeWorkDagResumeProof({}, {}),
    (error) => error?.code === 'AI_BINDING_MISSING',
  );
});
