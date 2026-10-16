import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { findVerifiedRuntimeWorkProof } from '../src/evolution/autonomy-proof.js';

function proof() {
  return {
    status: 'VERIFIED',
    version: 4,
    runtime_fanout_cache_hit: false,
    recovered_interrupted_node: true,
    providers_attempted: 2,
    provider_model_identities: [
      { provider: 'workers-ai', model: 'model-a' },
      { provider: 'workers-ai', model: 'model-b' },
    ],
    successful_candidates: 2,
  };
}

test('repository-wide diagnostic lookup may find historical Work proof', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const oldJob = await repository.create({ id:'old-job', requested_by:'mel-autonomy', goal:'old proof', optional_context:{ roadmap_id:'MEL-WORK-01' } });
  await repository.update(oldJob.id, { result_json:{ autonomy_proofs:{ work_dag_resume: proof() } } });
  const found = await findVerifiedRuntimeWorkProof(repository);
  assert.equal(found.job_id, 'old-job');
});

test('target-scoped lookup never reuses another job proof', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const oldJob = await repository.create({ id:'old-job', requested_by:'mel-autonomy', goal:'old proof', optional_context:{ roadmap_id:'MEL-WORK-01' } });
  const newJob = await repository.create({ id:'new-job', requested_by:'mel-autonomy', goal:'new proof', optional_context:{ roadmap_id:'MEL-WORK-02' } });
  await repository.update(oldJob.id, { result_json:{ autonomy_proofs:{ work_dag_resume: proof() } } });
  assert.equal(await findVerifiedRuntimeWorkProof(repository, { targetJobId:newJob.id }), null);

  await repository.update(newJob.id, { result_json:{ autonomy_proofs:{ work_dag_resume:{ ...proof(), target_job_id:newJob.id } } } });
  const found = await findVerifiedRuntimeWorkProof(repository, { targetJobId:newJob.id });
  assert.equal(found.job_id, 'new-job');
  assert.equal(found.proof.target_job_id, 'new-job');
});

test('incomplete target proof is not reusable even when an older valid proof exists', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const oldJob = await repository.create({ id:'old-valid', requested_by:'mel-autonomy', goal:'old proof', optional_context:{ roadmap_id:'MEL-WORK-01' } });
  const target = await repository.create({ id:'target-invalid', requested_by:'mel-autonomy', goal:'new proof', optional_context:{ roadmap_id:'GEN2-17' } });
  await repository.update(oldJob.id, { result_json:{ autonomy_proofs:{ work_dag_resume: proof() } } });
  await repository.update(target.id, { result_json:{ autonomy_proofs:{ work_dag_resume:{ ...proof(), providers_attempted:1 } } } });
  assert.equal(await findVerifiedRuntimeWorkProof(repository, { targetJobId:target.id }), null);
});

test('a malformed provider count or no successful candidate is never reusable proof', async () => {
  const broken = [
    { providers_attempted: Number.POSITIVE_INFINITY },
    { providers_attempted: '2' },
    { providers_attempted: 2.5 },
    { successful_candidates: 0 },
    { successful_candidates: Number.POSITIVE_INFINITY },
    { successful_candidates: 3 },
    { successful_candidates: '1' },
  ];
  for (const fields of broken) {
    const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
    const target = await repository.create({ id: 'malformed-proof', requested_by: 'mel-autonomy', goal: 'validate proof' });
    await repository.update(target.id, { result_json: {
      autonomy_proofs: { work_dag_resume: { ...proof(), ...fields } },
    } });
    assert.equal(await findVerifiedRuntimeWorkProof(repository, { targetJobId: target.id }), null);
  }
});

test('targeted and repository-wide proof lookup reject evidence bound to another job', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'real-job', requested_by: 'mel-autonomy', goal: 'recover work DAG' });
  await repository.update(job.id, { result_json: {
    autonomy_proofs: { work_dag_resume: { ...proof(), target_job_id: 'other-job' } },
  } });
  assert.equal(await findVerifiedRuntimeWorkProof(repository, { targetJobId: job.id }), null);
  assert.equal(await findVerifiedRuntimeWorkProof(repository), null);

  await repository.update(job.id, { result_json: {
    autonomy_proofs: { work_dag_resume: { ...proof(), target_job_id: job.id } },
  } });
  const valid = await findVerifiedRuntimeWorkProof(repository, { targetJobId: job.id });
  assert.equal(valid.job_id, job.id);
});

test('targeted proof lookup returns no proof when job is absent or has expired', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  assert.equal(await findVerifiedRuntimeWorkProof(repository, { targetJobId: 'missing-job' }), null);
  assert.equal(await findVerifiedRuntimeWorkProof(repository), null);
});
