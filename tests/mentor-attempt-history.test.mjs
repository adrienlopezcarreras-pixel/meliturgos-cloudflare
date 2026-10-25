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
