import test from 'node:test';
import assert from 'node:assert/strict';
import { augmentTickProgress } from '../src/evolution/autonomy-runtime.js';
import { recordAutonomyProgressWatchdog } from '../src/evolution/autonomy-progress-watchdog.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ready = () => ({ ok: true, status: 'TEACHER_APPROVED',
  job: { id: 'audit-05', status: 'TEACHER_APPROVED' }, bridge_preparation: { status: 'READY' },
  progress: { advanced: false, events: [], work_remaining: true, waiting_external: false,
    job_id: 'audit-05', job_status: 'TEACHER_APPROVED', active_jobs: 1 } });

test('an already-tripped watchdog does not deadlock a valid READY packet before Bridge dispatch', async () => {
  const db = sqliteD1({ maintenanceFence: true });
  try {
    for (let i = 0; i < 3; i++) await recordAutonomyProgressWatchdog(db, ready(), { maxAutonomy: true, now: i + 1 });
    const tick = augmentTickProgress(ready());
    const watchdog = await recordAutonomyProgressWatchdog(db, tick, { maxAutonomy: true, now: 4 });
    assert.equal(watchdog.status, 'WAITING_EXTERNAL');
    assert.equal(watchdog.tripped, false);
    assert.equal(tick.progress.block_reason, 'CLOUD_BRIDGE_DISPATCH_PENDING');
    assert.equal(tick.advanced, false, 'dispatch availability is not execution or delivery');
    assert.deepEqual(tick.progress.events, []);
    assert.equal(watchdog.counters.jobs_completed, 0);
    assert.equal(watchdog.counters.advanced_ticks, 0);
    assert.equal(watchdog.last_delivered_at, null);
  } finally { db.close(); }
});

test('READY metadata does not hide a real failure, pause, mismatched job or unfinished packet', () => {
  for (const patch of [{ok:false}, {paused:true}, {runtime_error:'FAILED'}, {owner_max_error:'FAILED'},
    {bridge_preparation:{status:'NOT_READY'}}, {job:{id:'audit-05',status:'REPAIR_REQUIRED'}}]) {
    assert.equal(augmentTickProgress({...ready(),...patch}).progress.waiting_external, false);
  }
  const blocked = ready(); blocked.progress.block_reason = 'CODE_HEAD_PIN_MISMATCH';
  assert.equal(augmentTickProgress(blocked).progress.block_reason, 'CODE_HEAD_PIN_MISMATCH');
  assert.equal(augmentTickProgress(blocked).progress.waiting_external, false);
  const mismatch = ready(); mismatch.progress.job_id = 'another-job';
  assert.equal(augmentTickProgress(mismatch).progress.waiting_external, false);
});
