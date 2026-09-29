import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const context = { owner: 'test', permissions: [], requestId: 'autonomy-capability-test' };

test('Gen2 runtime exposes autonomy.status and autonomy.tick as real capabilities', () => {
  const runtime = createGen2Runtime({ env: {} });
  const rows = runtime.bus.list();
  const ids = new Set(rows.map((row) => row.id));
  assert.ok(ids.has('autonomy.status'));
  assert.ok(ids.has('autonomy.tick'));
  assert.ok(ids.has('autonomy.activity'));
  assert.ok(ids.has('evolution.enqueue'));
  assert.ok(ids.size >= 14, `expected expanded runtime capability set, got ${ids.size}`);
});

test('autonomy capabilities fail closed when required Cloudflare bindings are absent', async () => {
  const runtime = createGen2Runtime({ env: {} });
  await assert.rejects(
    () => runtime.bus.execute('autonomy.status', {}, context),
    (error) => error?.code === 'DB_BINDING_MISSING' || error?.message === 'DB_BINDING_MISSING',
  );
  await assert.rejects(
    () => runtime.bus.execute('autonomy.tick', {}, context),
    (error) => error?.code === 'DB_BINDING_MISSING' || error?.message === 'DB_BINDING_MISSING',
  );
});


test('autonomy.activity reads live supervised jobs and recent evolution ledger evidence', async () => {
  const DB = sqliteD1();
  try {
    const runtime = createGen2Runtime({ env: { DB } });
    await runtime.bus.execute('autonomy.pause', { reason: 'activity-fixture' }, context);
    const repository = new D1DevJobRepository(DB);
    const job = await repository.create({
      id: 'mel-autonomy-activity-fixture',
      requested_by: 'mel-autonomy',
      goal: 'Validate live autonomy activity grounding',
      optional_context: { roadmap_id: 'MEL-TEST-ACTIVITY' },
    });
    await repository.update(job.id, { status: 'COUNCIL_COMPLETE' });

    const activity = await runtime.bus.execute('autonomy.activity', { limit: 10 }, context);
    assert.equal(activity.ok, true);
    assert.equal(activity.source, 'production_d1');
    assert.equal(activity.control.paused, true);
    assert.ok(activity.counts.supervised_total >= 1);
    assert.equal(activity.recent_jobs[0].job_id, job.id);
    assert.equal(activity.recent_jobs[0].roadmap_id, 'MEL-TEST-ACTIVITY');
    assert.ok(activity.recent_events.some(event => event.evolution_id === job.id));
  } finally {
    DB.close();
  }
});
