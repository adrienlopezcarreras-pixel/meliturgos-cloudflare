import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPABILITY_WATCH_SCHEMA,
  DEFAULT_CAPABILITY_WATCH_TARGETS,
  capabilityWatchWindow,
  normalizeCapabilityWatchState,
  planCapabilityWatch,
  runCapabilityWatch,
  runPersistedCapabilityWatch,
} from '../../src/evaluation/capability-watch.js';

const HOUR = 60 * 60 * 1000;

test('GEN2-42 schedules the initial run and is idempotent inside one window', async () => {
  const now = Date.UTC(2026, 8, 15, 18, 0, 0);
  const intervalMs = 6 * HOUR;
  const plan = planCapabilityWatch({ now, intervalMs });
  assert.equal(plan.due, true);
  assert.equal(plan.reason, 'INITIAL');

  let calls = 0;
  const first = await runCapabilityWatch({
    now,
    intervalMs,
    evaluator: async ({ capability_id }) => {
      calls += 1;
      return { score: capability_id === 'code_development' ? 0.9 : 1, evidence: 'deterministic' };
    },
  });
  assert.equal(first.status, 'RAN');
  assert.equal(first.state.schema, CAPABILITY_WATCH_SCHEMA);
  assert.equal(first.state.run_count, 1);
  assert.equal(first.results.length, DEFAULT_CAPABILITY_WATCH_TARGETS.length);
  assert.equal(calls, DEFAULT_CAPABILITY_WATCH_TARGETS.length);

  const second = await runCapabilityWatch({
    now: now + HOUR,
    intervalMs,
    state: first.state,
    evaluator: async () => {
      calls += 1;
      return { score: 0 };
    },
  });
  assert.equal(second.status, 'NOT_DUE');
  assert.equal(second.reason, 'ALREADY_RAN_WINDOW');
  assert.equal(calls, DEFAULT_CAPABILITY_WATCH_TARGETS.length);
});

test('GEN2-42 fails closed when no evaluator is available and keeps the window retryable', async () => {
  const now = Date.UTC(2026, 8, 15, 18, 0, 0);
  const result = await runCapabilityWatch({ now, intervalMs: HOUR });
  assert.equal(result.status, 'BLOCKED_EVALUATOR_UNAVAILABLE');
  assert.equal(result.state.last_window_id, null);
  assert.equal(result.state.run_count, 0);

  const retryPlan = planCapabilityWatch({ now: now + 1, intervalMs: HOUR, state: result.state });
  assert.equal(retryPlan.due, true);
});

test('GEN2-42 detects per-capability regressions beyond the configured threshold', async () => {
  const intervalMs = HOUR;
  const initialNow = Date.UTC(2026, 8, 15, 18, 0, 0);
  const initial = await runCapabilityWatch({
    now: initialNow,
    intervalMs,
    evaluator: async () => ({ score: 0.9 }),
  });
  assert.equal(initial.status, 'RAN');

  const next = await runCapabilityWatch({
    now: initialNow + intervalMs,
    intervalMs,
    state: initial.state,
    regressionThreshold: 0.05,
    evaluator: async ({ capability_id }) => ({ score: capability_id === 'memory_provenance' ? 0.7 : 0.9 }),
  });
  assert.equal(next.status, 'RAN');
  assert.deepEqual(next.regressions.map(row => row.id), ['memory_provenance']);
  assert.ok(next.regressions[0].delta < -0.05);
});

test('GEN2-42 does not persist partial or failed runs', async () => {
  const now = Date.UTC(2026, 8, 15, 18, 0, 0);
  let stored = null;
  let saves = 0;
  const store = {
    async load() { return stored; },
    async save(value) { stored = value; saves += 1; },
  };

  const failed = await runPersistedCapabilityWatch({
    store,
    now,
    intervalMs: HOUR,
    evaluator: async ({ capability_id }) => {
      if (capability_id === 'code_development') throw Object.assign(new Error('synthetic failure'), { code: 'SYNTHETIC_FAILURE' });
      return { score: 1 };
    },
  });
  assert.equal(failed.status, 'FAILED');
  assert.equal(saves, 0);
  assert.equal(stored, null);

  const succeeded = await runPersistedCapabilityWatch({
    store,
    now,
    intervalMs: HOUR,
    evaluator: async () => ({ score: 1 }),
  });
  assert.equal(succeeded.status, 'RAN');
  assert.equal(saves, 1);
  assert.equal(stored.run_count, 1);
});

test('GEN2-42 normalizes corrupt state and calculates stable windows', () => {
  const normalized = normalizeCapabilityWatchState({
    interval_ms: 'invalid',
    last_window_id: '3',
    run_count: -4,
    last_scores: { ok: 2, bad: 'NaN' },
  });
  assert.equal(normalized.schema, CAPABILITY_WATCH_SCHEMA);
  assert.equal(normalized.last_window_id, null);
  assert.equal(normalized.run_count, 0);
  assert.deepEqual(normalized.last_scores, { ok: 1 });

  const window = capabilityWatchWindow({ now: 12 * HOUR, intervalMs: 6 * HOUR });
  assert.equal(window.window_id, 2);
  assert.equal(window.window_started_at, 12 * HOUR);
  assert.equal(window.next_window_at, 18 * HOUR);
});


test('forced preview-style run reuses the canonical watch inside the same window', async () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  const first = await runCapabilityWatch({
    now,
    intervalMs: 6 * HOUR,
    evaluator: async () => ({ score: 1 }),
  });
  let calls = 0;
  const forced = await runCapabilityWatch({
    now: now + 1000,
    intervalMs: 6 * HOUR,
    state: first.state,
    force: true,
    evaluator: async () => {
      calls += 1;
      return { score: 1 };
    },
  });
  assert.equal(forced.status, 'RAN');
  assert.equal(forced.reason, 'FORCED');
  assert.equal(forced.state.last_window_id, first.state.last_window_id);
  assert.equal(forced.state.run_count, 2);
  assert.equal(calls, DEFAULT_CAPABILITY_WATCH_TARGETS.length);
});
