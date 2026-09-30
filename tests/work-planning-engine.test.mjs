import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import {
  createWorkPlan,
  compileWorkPlanNodes,
  summarizeWorkPlan,
  validateWorkPlan,
} from '../src/work/planning-engine.js';

test('GEN2-38 planner compiles a bounded dependency plan into Work-compatible nodes', () => {
  const plan = createWorkPlan({
    id: 'plan-1',
    goal: 'Préparer puis publier un rapport',
    constraints: ['zéro dépense'],
    steps: [
      { id: 'collect', capability: 'echo', input: { value: 'collecte' }, idempotent: true },
      { id: 'publish', capability: 'echo', input: { value: 'publication' }, dependsOn: ['collect'], idempotent: false },
    ],
  });

  assert.equal(validateWorkPlan(plan), true);
  assert.deepEqual(summarizeWorkPlan(plan), {
    id: 'plan-1',
    step_count: 2,
    root_step_ids: ['collect'],
    leaf_step_ids: ['publish'],
    non_idempotent_step_ids: ['publish'],
    constraint_count: 1,
  });

  assert.deepEqual(compileWorkPlanNodes(plan), [
    {
      id: 'collect',
      kind: 'TASK',
      depends_on: [],
      idempotent: true,
      payload: { capability: 'echo', input: { value: 'collecte' } },
    },
    {
      id: 'publish',
      kind: 'TASK',
      depends_on: ['collect'],
      idempotent: false,
      payload: { capability: 'echo', input: { value: 'publication' } },
    },
  ]);
});

test('GEN2-38 planner fails closed on cycles, unknown dependencies and invalid inputs', () => {
  assert.throws(() => createWorkPlan({
    goal: 'cycle',
    steps: [
      { id: 'a', capability: 'echo', dependsOn: ['b'] },
      { id: 'b', capability: 'echo', dependsOn: ['a'] },
    ],
  }), error => error.code === 'WORK_PLAN_CYCLE');

  assert.throws(() => createWorkPlan({
    goal: 'unknown dependency',
    steps: [{ id: 'a', capability: 'echo', dependsOn: ['missing'] }],
  }), error => error.code === 'WORK_PLAN_DEPENDENCY_INVALID');

  assert.throws(() => createWorkPlan({
    goal: 'bad input',
    steps: [{ id: 'a', capability: 'echo', input: ['not-object'] }],
  }), error => error.code === 'WORK_PLAN_INPUT_OBJECT_REQUIRED');
});

test('GEN2-38 planner redacts secret-like values and does not make non-idempotent assumptions', () => {
  const plan = createWorkPlan({
    goal: 'safe planning',
    steps: [{
      id: 'safe',
      capability: 'echo',
      input: {
        token: 'should-disappear',
        note: 'Bearer abcdefghijklmnop',
        nested: { value: 'ok' },
      },
    }],
  });

  assert.equal(Object.hasOwn(plan.steps[0].input, 'token'), false);
  assert.equal(plan.steps[0].input.note, '[REDACTED]');
  assert.deepEqual(plan.steps[0].input.nested, { value: 'ok' });
  assert.equal(plan.steps[0].idempotent, false);
});

test('default capability bus exposes work.plan even when durable D1 is absent', async () => {
  const bus = createDefaultCapabilityBus({ env: {} });
  const descriptor = bus.describe('work.plan');
  assert.equal(descriptor.health, 'HEALTHY');
  assert.equal(descriptor.risk, 'LOW');

  const result = await bus.execute('work.plan', {
    id: 'bus-plan',
    goal: 'Construire un DAG exécutable',
    steps: [
      { id: 'one', capability: 'echo', input: { value: '1' }, idempotent: true },
      { id: 'two', capability: 'echo', input: { value: '2' }, dependsOn: ['one'], idempotent: true },
    ],
  }, { owner: 'adrien', requestId: 'planning-test', permissions: [] });

  assert.equal(result.plan.schema, 'mel.work-plan');
  assert.equal(result.summary.step_count, 2);
  assert.deepEqual(result.nodes.map((node) => node.id), ['one', 'two']);
});
