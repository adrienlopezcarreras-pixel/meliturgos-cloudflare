import test from 'node:test';
import assert from 'node:assert/strict';
import { allLifeEvents, applyLifeCountermeasure } from '../src/continuity/life-contingency.js';

const actions = Object.fromEntries([
  'keepPrevious','rollback','refuseSecondRelease','keepSource','rollbackToSource',
  'rebuild','requeue','reject','refuseMerge','ensureNextJob','rebuildHead',
  'keepMax','restoreMax','requeueReview','restoreBackup','openKit',
].map(name => [name, async () => ({ ok: true })]));

test('all 21 life failures resolve to a safe bounded executor or deliberate pause', async () => {
  const events = allLifeEvents();
  assert.equal(events.length, 21);
  for (const event of events) {
    const result = await applyLifeCountermeasure(event.id, actions);
    assert.equal(result.applied, true, event.id);
    assert.equal(result.activation_performed, event.countermeasure !== 'KEEP_PAUSE', event.id);
  }
});

test('no life failure is reported repaired if its executor is absent or fails', async () => {
  for (const event of allLifeEvents()) {
    if (event.countermeasure === 'KEEP_PAUSE') continue;
    const missing = await applyLifeCountermeasure(event.id, {});
    assert.equal(missing.applied, false, event.id);
    assert.equal(missing.activation_performed, false, event.id);
  }
});
