import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRunner } from '../src/modules/module-runner.js';

test('ModuleRunner fails closed when no CapabilityBus is configured', async () => {
  const runner = new ModuleRunner({});
  await assert.rejects(() => runner.run('connector.test', { value: 'x' }), /MODULE_EXECUTOR_UNCONFIGURED/);
});

test('ModuleRunner executes only through an explicitly configured CapabilityBus', async () => {
  const calls = [];
  const bus = {
    async execute(id, input, context) {
      calls.push({ id, input, context });
      return { accepted: true, id, value: input.value };
    },
  };
  const runner = new ModuleRunner({}, bus);
  const result = await runner.run('connector.test', { value: 'hello' }, { owner: 'test', permissions: [], requestId: 'r1' });
  assert.deepEqual(result, { success: true, moduleId: 'connector.test', output: { accepted: true, id: 'connector.test', value: 'hello' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'connector.test');
});
