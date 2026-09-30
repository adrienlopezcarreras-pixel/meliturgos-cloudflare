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
  assert.ok(ids.has('autonomy.bridge.status'));
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


test('autonomy.bridge.status reads live local bridge heartbeat and READY packages', async () => {
  const DB = sqliteD1();
  try {
    const runtime = createGen2Runtime({ env: { DB } });
    const repository = new D1DevJobRepository(DB);
    await repository.init();
    const now = Date.now();
    await DB.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
      .bind('primary', now - 120000, 'ONLINE', '{}').run();
    await DB.prepare('INSERT INTO dev_bridge_state(bridge_id,last_seen,status,metadata_json) VALUES(?,?,?,?)')
      .bind('runtime-lease:autonomy-heartbeat', 0, 'RELEASED', '{}').run();

    const job = await repository.create({
      id:'bridge-status-ready-fixture',
      requested_by:'mel-autonomy',
      goal:'Prepared bridge fixture',
      optional_context:{roadmap_id:'MEL-UI-06'},
    });
    await repository.update(job.id, {
      status:'TEACHER_APPROVED',
      files_json:[{path:'src/fixture.js',content:'export default true;'}],
      tests_json:[{command:'test:smoke'}],
      result_json:{
        teacher_bridge:{
          status:'ANSWERED',
          request:{request_id:'teacher-fixture'},
          review:{request_id:'teacher-fixture',verdict:'APPROVE_PLAN',development_allowed:true,owner_override:true},
        },
        implementation_proposal:{status:'READY'},
        bridge_preparation:{
          status:'READY',
          teacher_request_id:'teacher-fixture',
          candidate_branch:'candidate/mel-clean-autonomy',
          candidate_sha:'a'.repeat(40),
        },
      },
    });

    const status = await runtime.bus.execute('autonomy.bridge.status', { limit:10 }, context);
    assert.equal(status.ok, true);
    assert.equal(status.local_bridge.bridge_id, 'primary');
    assert.equal(status.local_polling_effective, false);
    assert.ok(status.local_bridge.age_ms >= 60000);
    assert.equal(status.autonomy_lease.status, 'RELEASED');
    assert.equal(status.counts.ready, 1);
    assert.equal(status.ready_packages[0].job_id, job.id);
    assert.equal(status.ready_packages[0].bridge_preparation_status, 'READY');
  } finally {
    DB.close();
  }
});
