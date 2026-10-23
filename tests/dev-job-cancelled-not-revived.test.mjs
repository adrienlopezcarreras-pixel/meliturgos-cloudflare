import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

// "Vider la liste" cancelled mel-autonomy-mel-founder-03 while a tick was in
// its Council preflight; the tick then wrote COUNCIL_COMPLETE over CANCELLED.
test('a tick that read a job before it was cancelled cannot revive it', async () => {
  for (const db of [sqliteD1(), null]) {
    const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
    const job = await repository.create({ id: 'job-race', requested_by: 'mel-autonomy', goal: 'x' });
    const readByTick = await repository.get(job.id);
    await repository.update(job.id, { status: 'CANCELLED', error: 'ACTIVITY_LIST_RESET' });
    const after = await repository.update(readByTick.id, { status: 'COUNCIL_COMPLETE', plan_json: { preflight: {} } });
    assert.equal(after.status, 'CANCELLED');
    assert.equal((await repository.get(job.id)).status, 'CANCELLED');
    assert.equal((await repository.get(job.id)).error, 'ACTIVITY_LIST_RESET');
    db?.close();
  }
});

// json_set()/other writers store JSON text that JSON.stringify(parse()) does
// not reproduce; the CAS fence must compare the stored text, or every update
// of that job is a permanent JOB_UPDATE_CONFLICT (MEL-FOUNDER-03 FAILED).
test('a job whose stored JSON is not in JSON.stringify form can still be updated, real conflicts still fail', async () => {
  const db = sqliteD1();
  try {
    const repository = new D1DevJobRepository(db);
    await repository.create({ id: 'job-raw', requested_by: 'mel-autonomy', goal: 'x' });
    for (const raw of ['{"a":"\\u00e9"}', '{"a": 1}', '{"x":1.0}']) {
      await db.prepare("UPDATE dev_jobs SET result_json=? WHERE id='job-raw'").bind(raw).run();
      const updated = await repository.update('job-raw', { error: null });
      assert.equal(updated.id, 'job-raw');
    }
    const stale = await repository.get('job-raw');
    await repository.update('job-raw', { status: 'CLAIMED' });
    await assert.rejects(repository.update('job-raw', { status: 'QUEUED' }, { expected: stale }), { code: 'JOB_UPDATE_CONFLICT' });
  } finally { db.close(); }
});
