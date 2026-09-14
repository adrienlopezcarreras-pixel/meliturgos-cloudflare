import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutonomyControl, setAutonomyControl, resetAutonomyControlForTests } from '../src/evolution/autonomy-control.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

test('autonomy emergency pause persists in fallback state and blocks a runtime heartbeat', async () => {
  resetAutonomyControlForTests();
  const paused = await setAutonomyControl(null, { paused: true, source: 'test', reason: 'red-stop-button' });
  assert.equal(paused.paused, true);
  assert.equal((await getAutonomyControl(null)).status, 'PAUSED');

  const tick = await runAutonomyRuntimeTick({}, {});
  assert.equal(tick.status, 'PAUSED');
  assert.equal(tick.paused, true);
  assert.equal(tick.advanced, false);

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test' });
  assert.equal(resumed.paused, false);
  assert.equal((await getAutonomyControl(null)).status, 'RUNNING');
  resetAutonomyControlForTests();
});
