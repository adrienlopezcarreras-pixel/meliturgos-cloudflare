import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStressProgressFresh } from '../scripts/persistent-capability-stress-live-proof.mjs';

test('recent verified progress remains eligible for polling', () => {
  assert.doesNotThrow(() => assertStressProgressFresh(1_000, 1_000 + 11 * 60_000));
});

test('persistent stress fails closed after 12 minutes without progress', () => {
  assert.throws(() => assertStressProgressFresh(1_000, 1_000 + 12 * 60_000 + 1),
    /CAPABILITY_STRESS_PROGRESS_STALLED/);
});

test('invalid progress clocks never create a false green', () => {
  assert.throws(() => assertStressProgressFresh(Number.NaN, 1_000),
    /CAPABILITY_STRESS_PROGRESS_CLOCK_INVALID/);
  assert.throws(() => assertStressProgressFresh(2_000, 1_000),
    /CAPABILITY_STRESS_PROGRESS_CLOCK_INVALID/);
});
