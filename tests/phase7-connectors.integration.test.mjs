import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRunner } from '../src/modules/module-runner.js';

test('connectors are unavailable until an authorized CapabilityBus registers them', async () => {
  const runner = new ModuleRunner({});
  await assert.rejects(() => runner.run('jira-create-task', { projectKey: 'TEST', summary: 'Issue' }), /MODULE_EXECUTOR_UNCONFIGURED/);
});

test('an explicitly registered connector capability can be executed without hidden prototype behavior', async () => {
  const calls = [];
  const bus = {
    async execute(id, input, context) {
      calls.push({ id, input, context });
      assert.equal(id, 'jira-create-task');
      assert.equal(input.projectKey, 'TEST');
      assert.equal(input.summary, 'Issue');
      return { connector: 'jira-test-adapter', status: 'prepared' };
    },
  };
  const runner = new ModuleRunner({}, bus);
  const result = await runner.run('jira-create-task', { projectKey: 'TEST', summary: 'Issue' }, { owner: 'test', permissions: ['jira.write'], requestId: 'r1' });
  assert.equal(result.success, true);
  assert.deepEqual(result.output, { connector: 'jira-test-adapter', status: 'prepared' });
  assert.equal(calls.length, 1);
});
