import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autonomyWorkRemaining,
  autonomyQueueReadBlocker,
} from '../src/evolution/autonomy-runtime-core.js';

test('an unavailable evolution queue never reports an empty completed workload', () => {
  const state = {
    active: [],
    next: null,
    evolution: { status: 'UNAVAILABLE', actionable_count: null, code: 'EVOLUTION_QUEUE_READ_FAILED' },
  };
  assert.equal(autonomyWorkRemaining(state), true);
  assert.equal(autonomyQueueReadBlocker(state), 'EVOLUTION_QUEUE_READ_FAILED');
});

test('available empty queues and independently actionable work keep their correct status', () => {
  assert.equal(autonomyWorkRemaining({
    active: [], next: null, evolution: { status: 'CONNECTED', actionable_count: 0 },
  }), false);
  assert.equal(autonomyQueueReadBlocker({ evolution: { status: 'CONNECTED' } }), null);
  assert.equal(autonomyWorkRemaining({
    active: [{ id: 'runtime-job' }], next: null, evolution: { status: 'CONNECTED' },
  }), true);
  assert.equal(autonomyWorkRemaining({
    active: [], next: { id: 'MEL-WORK-01' }, evolution: { status: 'NOT_CONFIGURED' },
  }), true);
});

test('unavailable evolution queue uses a stable failure code even with incomplete metadata', () => {
  const state = { active: [], next: null, evolution: { status: 'UNAVAILABLE', code: null } };
  assert.equal(autonomyWorkRemaining(state), true);
  assert.equal(autonomyQueueReadBlocker(state), 'EVOLUTION_QUEUE_READ_FAILED');
});
