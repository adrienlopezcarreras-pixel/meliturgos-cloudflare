import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutonomyControl, setAutonomyControl, setOwnerMaxAutonomy, resetAutonomyControlForTests } from '../src/evolution/autonomy-control.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

test('autonomy emergency pause persists in fallback state and blocks a runtime heartbeat', async () => {
  resetAutonomyControlForTests();
  const paused = await setAutonomyControl(null, { paused: true, source: 'test', reason: 'owner-emergency-stop' });
  assert.equal(paused.paused, true);
  assert.equal((await getAutonomyControl(null)).status, 'PAUSED');

  const tick = await runAutonomyRuntimeTick({}, {});
  assert.equal(tick.status, 'PAUSED');
  assert.equal(tick.paused, true);
  assert.equal(tick.advanced, false);

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null });
  assert.equal(resumed.paused, false);
  assert.equal((await getAutonomyControl(null)).status, 'RUNNING');
  resetAutonomyControlForTests();
});

test('MAX autonomy is independent from emergency pause and survives pause/resume', async () => {
  resetAutonomyControlForTests();
  const maximum = await setOwnerMaxAutonomy(null, { enabled: true, source: 'test' });
  assert.equal(maximum.max_autonomy, true);
  assert.equal(maximum.owner_override, true);
  assert.equal(maximum.status, 'MAX_AUTONOMY');

  const paused = await setAutonomyControl(null, { paused: true, source: 'test' });
  assert.equal(paused.paused, true);
  assert.equal(paused.max_autonomy, true);
  assert.equal(paused.status, 'PAUSED');

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null });
  assert.equal(resumed.paused, false);
  assert.equal(resumed.max_autonomy, true);
  assert.equal(resumed.status, 'MAX_AUTONOMY');

  const normal = await setOwnerMaxAutonomy(null, { enabled: false, source: 'test' });
  assert.equal(normal.max_autonomy, false);
  assert.equal(normal.status, 'RUNNING');
  resetAutonomyControlForTests();
});
