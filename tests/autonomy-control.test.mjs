import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutonomyControlMemoryState, getAutonomyControl, setAutonomyControl, setOwnerMaxAutonomy, resetAutonomyControlForTests } from '../src/evolution/autonomy-control.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

test('autonomy emergency pause persists only in explicitly injected fallback state and blocks a runtime heartbeat', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  resetAutonomyControlForTests(autonomyControlState);
  const paused = await setAutonomyControl(null, { paused: true, source: 'test', reason: 'owner-emergency-stop', memoryState: autonomyControlState });
  assert.equal(paused.paused, true);
  assert.equal((await getAutonomyControl(null, { memoryState: autonomyControlState })).status, 'PAUSED');

  const tick = await runAutonomyRuntimeTick({}, { autonomyControlState });
  assert.equal(tick.status, 'PAUSED');
  assert.equal(tick.paused, true);
  assert.equal(tick.advanced, false);

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null, memoryState: autonomyControlState });
  assert.equal(resumed.paused, false);
  assert.equal((await getAutonomyControl(null, { memoryState: autonomyControlState })).status, 'RUNNING');
  resetAutonomyControlForTests(autonomyControlState);
});

test('MAX autonomy is independent from emergency pause and survives pause/resume with explicit fallback state', async () => {
  const autonomyControlState = createAutonomyControlMemoryState();
  resetAutonomyControlForTests(autonomyControlState);
  const maximum = await setOwnerMaxAutonomy(null, { enabled: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(maximum.max_autonomy, true);
  assert.equal(maximum.owner_override, true);
  assert.equal(maximum.status, 'MAX_AUTONOMY');

  const paused = await setAutonomyControl(null, { paused: true, source: 'test', memoryState: autonomyControlState });
  assert.equal(paused.paused, true);
  assert.equal(paused.max_autonomy, true);
  assert.equal(paused.status, 'PAUSED');

  const resumed = await setAutonomyControl(null, { paused: false, source: 'test', reason: null, memoryState: autonomyControlState });
  assert.equal(resumed.paused, false);
  assert.equal(resumed.max_autonomy, true);
  assert.equal(resumed.status, 'MAX_AUTONOMY');

  const normal = await setOwnerMaxAutonomy(null, { enabled: false, source: 'test', memoryState: autonomyControlState });
  assert.equal(normal.max_autonomy, false);
  assert.equal(normal.status, 'RUNNING');
  resetAutonomyControlForTests(autonomyControlState);
});
