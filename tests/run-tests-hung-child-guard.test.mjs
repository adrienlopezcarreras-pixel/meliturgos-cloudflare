import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../scripts/run-tests.mjs', import.meta.url), 'utf8');

test('full test runner recognizes only a complete TAP summary with zero failed or cancelled tests', () => {
  assert.match(runner, /# tests \\(\\d\+\\)/);
  assert.match(runner, /# pass \\(\\d\+\\)/);
  assert.match(runner, /# fail \\(\\d\+\\)/);
  assert.match(runner, /failed === 0 && cancelled === 0/);
  assert.match(runner, /passed \+ skipped \+ todo === tests/);
});

test('complete passing TAP with a leaked child handle is bounded and logged', () => {
  assert.match(runner, /complete passing TAP summary but child remained alive; terminating leaked handle/);
  assert.match(runner, /summaryCleanupTimer = setTimeout/);
  assert.match(runner, /cp\.kill\("SIGTERM"\)/);
  assert.match(runner, /cp\.kill\("SIGKILL"\)/);
});

test('incomplete or timed-out test files fail closed instead of hanging the release', () => {
  assert.match(runner, /exceeded 180 seconds/);
  assert.match(runner, /timed_out: !completeTapSummary && closed\.code === null/);
  assert.match(runner, /: \(closed\.code \?\? 1\)/);
});
