// [GPT6] Contract: the serial TAP runner must not accumulate unbounded stdout/stderr.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('[GPT6] runner bounds retained TAP text and preserves streaming output', () => {
  const source=fs.readFileSync('scripts/run-tests.mjs','utf8');
  assert.match(source,/const TAP_TAIL_LIMIT = 64 \* 1024/);
  assert.equal((source.match(/out = \(out \+ chunk\)\.slice\(-TAP_TAIL_LIMIT\)/g)||[]).length,2);
  assert.doesNotMatch(source,/out \+= chunk/);
  assert.match(source,/process\.stdout\.write\(b\)/);
  assert.match(source,/process\.stderr\.write\(b\)/);
  assert.match(source,/completeTapSummary/);
});

test('[GPT6] deadline termination never counts as passing TAP cleanup', () => {
 const source=fs.readFileSync('scripts/run-tests.mjs','utf8');
 assert.match(source,/let deadlineExceeded = false/);
 assert.match(source,/deadlineExceeded = true/);
 assert.match(source,/!deadlineExceeded && summaryCleanupTriggered && completeTapSummary/);
 assert.match(source,/timed_out: deadlineExceeded/);
});

test('[GPT6] deadline failure overrides a child exit code zero',()=>{
 const source=fs.readFileSync('scripts/run-tests.mjs','utf8');
 assert.match(source,/deadlineExceeded \? 1 : \(closed\.code \?\? 1\)/);
});

test('[GPT6] externally signalled passing TAP child is not silently accepted',()=>{
 const source=fs.readFileSync('scripts/run-tests.mjs','utf8');
 assert.match(source,/let summaryCleanupTriggered = false/);
 assert.match(source,/summaryCleanupTriggered = true/);
 assert.match(source,/!deadlineExceeded && summaryCleanupTriggered && completeTapSummary/);
});
