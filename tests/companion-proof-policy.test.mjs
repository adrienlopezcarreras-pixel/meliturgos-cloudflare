import test from 'node:test';
import assert from 'node:assert/strict';
import { companionTaskDisposition, companionTaskIntervalOpen } from '../src/evolution/companion-proof-policy.js';

test('a companion task parked while the PC is absent is due again as soon as it can be retried', () => {
  const now = 1_000_000;
  assert.equal(companionTaskIntervalOpen({ status: 'WAITING_FOR_COMPANION', last_run_at: now - 1_000 }, now, 60 * 60_000), true);
  assert.equal(companionTaskIntervalOpen({ status: 'DEVICE_OFFLINE', last_run_at: now - 1_000 }, now, 60 * 60_000), true);
  assert.equal(companionTaskIntervalOpen({ status: 'PREVALIDATED', last_run_at: now - 1_000 }, now, 60 * 60_000), false);
  assert.equal(companionTaskIntervalOpen({ status: 'PREVALIDATED', last_run_at: now - 2 * 60 * 60_000 }, now, 60 * 60_000), true);
});

test('companion tasks are active only while the companion is online', () => {
  assert.deepEqual(companionTaskDisposition(true), { state: 'active', blocks_cloud: false });
  assert.deepEqual(companionTaskDisposition(false), { state: 'set_aside', blocks_cloud: false });
});
