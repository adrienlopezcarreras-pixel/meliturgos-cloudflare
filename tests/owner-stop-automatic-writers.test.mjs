import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { getAutonomyControl, setAutonomyControl } from '../src/evolution/autonomy-control.js';

for (const source of ['verified-repair-completed', 'rollback-auto-resume', 'autonomous-launch-bind', 'release-launch-bootstrap']) {
  for (const legacy of [false, true]) test(`${source} cannot reactivate an ${legacy ? 'old MAX-off switch' : 'owner stop'} in real D1`, async t => {
    const db = sqliteD1(); t.after(() => db.close());
    const stopped = await setAutonomyControl(db, { paused: !legacy, max_autonomy: false, source: 'owner-ui', reason: legacy ? null : 'owner-stop' });
    const after = await setAutonomyControl(db, { paused: false, max_autonomy: true, source,
      reason: 'automatic-restore', expected_updated_at: stopped.updated_at });
    assert.equal(after.max_autonomy, false);
    assert.equal(after.source, 'owner-ui');
    assert.equal(after.owner_control_version, stopped.owner_control_version);
    assert.equal((await getAutonomyControl(db)).max_autonomy, false);
  });
}

test('the owner may explicitly resume after a protected stop', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  const resumed = await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'owner-ui', reason: 'owner-max-autonomy' });
  assert.equal(resumed.max_autonomy, true);
  assert.equal(resumed.paused, false);
});

test('a technical writer cannot erase the stop before a later rollback restore', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  await setAutonomyControl(db, { paused: true, source: 'watchdog', reason: 'safety-stop' });
  await setAutonomyControl(db, { paused: true, source: 'release-rollback-restore', reason: 'restore-predeploy-autonomy-state' });
  const result = await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'rollback-auto-resume' });
  assert.equal(result.max_autonomy, false);
  assert.equal(result.owner_stopped, true);
});

test('an unknown future automatic writer also cannot enable MAX over an owner stop', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
  const after = await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'future-automatic-writer' });
  assert.equal(after.max_autonomy, false);
});


test('a latched stop dominates contradictory stored MAX flags', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'owner-ui' });
  await db.prepare("UPDATE dev_bridge_state SET status='MAX_AUTONOMY',metadata_json=? WHERE bridge_id='mel-autonomy-control'")
    .bind(JSON.stringify({ paused: false, max_autonomy: true, source: 'watchdog', owner_stopped: true })).run();
  const read = await getAutonomyControl(db);
  assert.equal(read.paused, true);
  assert.equal(read.max_autonomy, false);
});

test('a concurrent owner stop wins over an automatic restore without caller-supplied CAS', async t => {
  const db = sqliteD1(); t.after(() => db.close());
  await setAutonomyControl(db, { paused: false, max_autonomy: true, source: 'owner-ui' });
  let intervened = false;
  const racing = { prepare(sql) {
    const statement = db.prepare(sql);
    if (!sql.includes('UPDATE dev_bridge_state') || !sql.includes('WHERE bridge_id=?')) return statement;
    return { bind(...values) { const bound = statement.bind(...values); return { async run() {
      intervened = true;
      await setAutonomyControl(db, { paused: true, max_autonomy: false, source: 'owner-ui', reason: 'owner-stop' });
      return bound.run();
    } }; } };
  } };
  await assert.rejects(setAutonomyControl(racing, { paused: false, max_autonomy: true, source: 'verified-repair-completed' }), { code: 'AUTONOMY_CONTROL_CHANGED' });
  assert.equal(intervened, true);
  const current = await getAutonomyControl(db);
  assert.equal(current.max_autonomy, false);
  assert.equal(current.reason, 'owner-stop');
});
