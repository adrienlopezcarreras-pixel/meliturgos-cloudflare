import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../scripts/run-tests.mjs', import.meta.url), 'utf8');

test('full test runner recognizes only a complete TAP summary with zero failed or cancelled tests', () => {
  assert.ok(runner.includes('const tests = number('));
  assert.ok(runner.includes('const passed = number('));
  assert.ok(runner.includes('const failed = number('));
  assert.ok(runner.includes('failed === 0 && cancelled === 0'));
  assert.ok(runner.includes('passed + skipped + todo === tests'));
});

test('complete passing TAP with a leaked child handle is bounded and logged', () => {
  assert.ok(runner.includes('complete passing TAP summary but child remained alive; terminating leaked handle'));
  assert.ok(runner.includes('summaryCleanupTimer = setTimeout'));
  assert.ok(runner.includes('cp.kill("SIGTERM")'));
  assert.ok(runner.includes('cp.kill("SIGKILL")'));
});

test('incomplete or timed-out test files fail closed instead of hanging the release', () => {
  assert.ok(runner.includes('exceeded 180 seconds'));
  assert.ok(runner.includes('timed_out: !completeTapSummary && closed.code === null'));
  assert.ok(runner.includes('(closed.code ?? 1)'));
});
