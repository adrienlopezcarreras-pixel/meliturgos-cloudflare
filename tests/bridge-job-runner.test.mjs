import test from 'node:test';
import assert from 'node:assert/strict';
import { runStructuredBridgeJob, structuredFiles, requestedTests } from '../src/dev/bridge-job-runner.js';

function fakeBridge({ testExitCodes = [0, 0], diff = 'diff --git a/src/a.js b/src/a.js\n-0\n+1\n' } = {}) {
  const calls = [];
  let testIndex = 0;
  return {
    calls,
    bus: {
      async execute(id, input) {
        calls.push({ id, input });
        if (id === 'dev.create_candidate') return { branch: `mel-dev/${input.job_id}` };
        if (id === 'code.read') return { content: 'export const value = 0;\n' };
        if (id === 'dev.apply_change') return { path: input.path, branch: `mel-dev/${input.job_id}` };
        if (id === 'dev.test') {
          const code = testExitCodes[Math.min(testIndex++, testExitCodes.length - 1)];
          return { command: input.command, exit_code: code, stdout: code === 0 ? 'ok' : '', stderr: code === 0 ? '' : 'failure' };
        }
        if (id === 'code.diff') return { result: { exit_code: 0, stdout: diff, stderr: '' } };
        if (id === 'dev.report') return { branch: `mel-dev/${input.job_id}`, status: 'CANDIDATE' };
        throw new Error(`unexpected ${id}`);
      },
    },
  };
}

const job = {
  id: 'job-structured-1',
  files_json: [
    { path: 'src/a.js', content: 'export const value = 1;\n' },
    { path: 'tests/a.test.mjs', content: 'export const test = true;\n' },
  ],
  tests_json: [
    { name: 'smoke', command: 'test:smoke' },
    { name: 'integration', command: 'test:integration' },
  ],
};

test('structured package applies every bounded file, runs requested tests and reports the actual diff', async () => {
  const bridge = fakeBridge();
  const result = await runStructuredBridgeJob({ bridge, job });
  assert.equal(result.status, 'READY_FOR_REVIEW');
  assert.equal(result.needs_repair, false);
  assert.match(result.diff_summary, /diff --git/);
  assert.deepEqual(result.result_json.applied_files, ['src/a.js', 'tests/a.test.mjs']);
  assert.equal(result.tests_json.length, 2);
  assert.ok(result.tests_json.every(row => row.passed));
  assert.equal(bridge.calls.filter(call => call.id === 'dev.apply_change').length, 2);
  assert.equal(bridge.calls.filter(call => call.id === 'dev.test').length, 2);
});

test('failed test remains observable and marks package for repair', async () => {
  const bridge = fakeBridge({ testExitCodes: [0, 1] });
  const result = await runStructuredBridgeJob({ bridge, job });
  assert.equal(result.status, 'READY_FOR_REVIEW');
  assert.equal(result.needs_repair, true);
  assert.equal(result.result_json.needs_repair, true);
  assert.equal(result.result_json.failed_tests.length, 1);
  assert.equal(result.tests_json[1].passed, false);
  assert.match(result.tests_json[1].stderr, /failure/);
});

test('no structured files returns null so legacy bridge work remains compatible', async () => {
  const bridge = fakeBridge();
  assert.equal(await runStructuredBridgeJob({ bridge, job: { id: 'legacy', files_json: [] } }), null);
  assert.equal(bridge.calls.length, 0);
});

test('package parsing is bounded', () => {
  const manyFiles = Array.from({ length: 20 }, (_, i) => ({ path: `src/${i}.js`, content: 'x' }));
  const manyTests = Array.from({ length: 20 }, (_, i) => ({ command: i % 2 ? 'test:smoke' : 'test:integration' }));
  assert.equal(structuredFiles({ files_json: JSON.stringify(manyFiles) }).length, 10);
  assert.equal(requestedTests({ tests_json: JSON.stringify(manyTests) }).length, 4);
});
