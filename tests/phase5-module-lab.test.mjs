import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRunner } from '../src/modules/module-runner.js';

test('ModuleRunner exposes the current run API', () => {
  const runner = new ModuleRunner({});
  assert.equal(typeof runner.run, 'function');
});

test('ModuleRunner never invents connector implementations when no bus exists', async () => {
  const runner = new ModuleRunner({});
  await assert.rejects(
    () => runner.run('jira-create-task', { projectKey: 'TEST', summary: 'Task' }, { owner: 'test', permissions: [], requestId: 'r1' }),
    /MODULE_EXECUTOR_UNCONFIGURED/,
  );
});

test('ModuleRunner delegates capability validation and execution to CapabilityBus', async () => {
  const calls = [];
  const bus = {
    async execute(id, input, context) {
      calls.push({ id, input, context });
      return { connector: 'test', accepted: true };
    },
  };
  const runner = new ModuleRunner({}, bus);
  const result = await runner.run('connector:test', { value: 42 }, { owner: 'test', permissions: ['connector.test'], requestId: 'r2' });
  assert.equal(result.success, true);
  assert.equal(result.moduleId, 'connector:test');
  assert.deepEqual(result.output, { connector: 'test', accepted: true });
  assert.deepEqual(calls[0].input, { value: 42 });
});
