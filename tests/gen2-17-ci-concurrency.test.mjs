import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/gen2-17-multi-cycle-ci.yml', import.meta.url), 'utf8');

test('MAX validation serializes PR runs by stable PR number and cancels obsolete pushes', () => {
  assert.match(workflow, /^concurrency:\s*$/m);
  assert.match(workflow, /^\s+group:\s+gen2-17-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\s*$/m);
  assert.match(workflow, /^\s+cancel-in-progress:\s+\$\{\{ github\.event_name == 'pull_request' \}\}\s*$/m);
});

test('MAX targeted and complete suites are retained; dispatch and push proof are not cancelled', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /gen2-17-targeted:/);
  assert.match(workflow, /gen2-17-full-suite:/);
  assert.match(workflow, /needs: gen2-17-targeted/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
});
