import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { findVerifiedRuntimeWorkProof } from '../src/evolution/autonomy-proof.js';

function proof() {
  return {
    status: 'VERIFIED',
    recovered_interrupted_node: true,
    providers_attempted: 2,
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
