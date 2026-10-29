import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { persistBridgePreparationDiagnostic } from '../src/evolution/autonomy-runtime-core.js';

test('rejected Mentor rounds accumulate across ticks and clear once a package is ready', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'j', goal: 'g', requested_by: 'mel-autonomy' });
  await repository.update(job.id, { status: 'TEACHER_APPROVED' });
  const rejected = { status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL',
    failures: [{ stage: 'initial', code: 'MENTOR_TEST_REQUIRED', detail: 'no test' }] };
  for (let i = 0; i < 3; i += 1) await persistBridgePreparationDiagnostic(repository, job.id, rejected);
  const history = (await repository.get(job.id)).result_json.mentor_attempt_history;
  assert.equal(history.length, 3);
  assert.deepEqual(history[0], { name: 'initial', error: 'MENTOR_TEST_REQUIRED', stderr: 'no test' });
  await persistBridgePreparationDiagnostic(repository, job.id, { status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL',
    failures: [{ stage: 'initial', code: 'MENTOR_PROVIDER_TIMEOUT' }] });
  assert.equal((await repository.get(job.id)).result_json.mentor_attempt_history.length, 3, 'a timeout is not a model failure');
  await persistBridgePreparationDiagnostic(repository, job.id, { status: 'READY' });
  assert.equal((await repository.get(job.id)).result_json.mentor_attempt_history, undefined);
});

test('the bridge preparer hands that history to the Mentor so the third failure escalates', async () => {
  const source = await readFile(new URL('../src/evolution/autonomy-bridge-preparer.js', import.meta.url), 'utf8');
  assert.match(source, /: current\?\.result_json\?\.mentor_attempt_history \|\| \[\]/);
  const mentor = await readFile(new URL('../src/learning/mentor-engine.js', import.meta.url), 'utf8');
  assert.match(mentor, /escalate: previousAttempts\.length >= 3/);
});

test('a structural Mentor rejection does not park the job before the large model had its turn', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'k', goal: 'g', requested_by: 'mel-autonomy' });
  await repository.update(job.id, { status: 'TEACHER_APPROVED' });
  const rejected = { status: 'NOT_READY', code: 'MENTOR_NO_VALID_CODE_PROPOSAL',
    failures: [{ stage: 'initial', code: 'MENTOR_UNINSPECTED_EDIT' }] };
  await persistBridgePreparationDiagnostic(repository, job.id, rejected);
  const deferral = (await repository.get(job.id)).result_json.autonomy_deferral;
  assert.equal(deferral.max_attempts, 3);
  assert.equal(deferral.exhausted, false);
});

test('a bridge job parked under the old one-round limit is worked again until its rounds are spent', async () => {
  const { selectActionableAutonomyJob, providerRetryContext } = await import('../src/evolution/autonomy-supervisor.js');
  const job = { id: 'mel-autonomy-x-1', requested_by: 'mel-autonomy', status: 'TEACHER_APPROVED', created_at: 1, optional_context: { roadmap_id: 'MEL-X' }, result_json: {} };
  const parked = (attempts) => ({ ...job, result_json: { autonomy_deferral: { phase: 'bridge', exhausted: true, attempts, max_attempts: 1, retry_after: 0, context: providerRetryContext(job) } } });
  assert.equal(selectActionableAutonomyJob([parked(1)], { roadmap: [] })?.id, job.id);
  assert.equal(selectActionableAutonomyJob([parked(4)], { roadmap: [] }), null);
});
