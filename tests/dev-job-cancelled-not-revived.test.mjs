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
