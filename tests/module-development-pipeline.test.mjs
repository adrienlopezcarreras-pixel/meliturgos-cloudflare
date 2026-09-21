import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderPool } from '../src/augmentio/provider-pool.js';
import { ZERO_EURO_POLICY } from '../src/augmentio/zero-euro-governor.js';
import { runModuleLabPipeline } from '../src/modules/module-development-pipeline.js';

function verifiedFree(id) {
  return Object.freeze({
    verified: true,
    addedCost: 0,
    source: 'gen2-16-pipeline-test',
    authorization: Object.freeze({
      approved: true,
      policy: ZERO_EURO_POLICY,
      authority: 'gen2-16-pipeline-test',
      adapter_id: id,
      provider: 'test',
      model: id,
    }),
  });
}

function provider(id, calls) {
  return {
    id,
    providerId: 'test',
    modelId: id,
    capabilities: ['GENERAL'],
    priority: id === 'a' ? 2 : 1,
    estimatedCost: 0,
    costProvenance: verifiedFree(id),
    enabled: true,
    healthStatus: 'HEALTHY',
    health: async () => 'HEALTHY',
    invoke: async ({ context = {} }) => {
      calls.push({ id, purpose: context.purpose || '', role: context.council_role || '' });
      return {
        text: context.purpose === 'mel-council-synthesis'
          ? 'synthèse MEL: réutiliser, tester, fail-closed'
          : `avis indépendant ${id}`,
        provenance: { provider: 'test', model: id },
      };
    },
  };
}

function successfulAdapters(order) {
  return {
    inspect: async () => {
      order.push('inspect');
      return { status: 'COMPLETE', evidence: ['src/modules/module-lab.js'] };
    },
    spec: async () => {
      order.push('spec');
      return {
        status: 'COMPLETE',
        module_id: 'fixture.module',
        acceptance_criteria: ['candidate generated', 'tests pass'],
      };
    },
    generate: async () => {
      order.push('generate');
      return { status: 'GENERATED', candidate_ref: 'candidate/fixture-module' };
    },
    validate: async () => {
      order.push('validate');
      return { status: 'PASS' };
    },
    test: async () => {
      order.push('test');
      return { status: 'PASS', tests_run: 4, tests_failed: 0 };
    },
    sandbox: async () => {
      order.push('sandbox');
      return { status: 'PASS' };
    },
    securityReview: async () => {
      order.push('securityReview');
      return { status: 'PASS', blocking_findings: false };
    },
  };
}

test('GEN2-16 pipeline enforces Council -> inspection -> spec -> generation -> validation -> tests -> sandbox -> security', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('a', calls), provider('b', calls)]);
  const order = [];
  const result = await runModuleLabPipeline({
    env: {},
    goal: 'ajouter une capacité de test',
    pool,
    ...successfulAdapters(order),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'CANDIDATE');
  assert.equal(result.activation_allowed, false);
  assert.equal(result.release_gate_required, true);
  assert.equal(result.module_id, 'fixture.module');
  assert.deepEqual(order, ['inspect', 'spec', 'generate', 'validate', 'test', 'sandbox', 'securityReview']);
  assert.deepEqual(
    result.stages.map(row => row.stage),
    ['AI_STATE_OF_PLAY', 'INSPECTION', 'PLAN_GATE', 'SPEC', 'GENERATE', 'VALIDATE', 'TEST', 'SANDBOX', 'SECURITY_REVIEW'],
  );
  assert.ok(calls.some(row => row.purpose === 'state-of-play-before-development'));
  assert.ok(calls.some(row => row.purpose === 'mel-council-synthesis'));
});

test('GEN2-16 pipeline cannot generate before completed code inspection', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('a', calls), provider('b', calls)]);
  let generated = false;
  const adapters = successfulAdapters([]);
  adapters.inspect = async () => ({ status: 'PARTIAL', evidence: [] });
  adapters.generate = async () => {
    generated = true;
    return { status: 'GENERATED', candidate_ref: 'candidate/should-not-run' };
  };

  await assert.rejects(
    () => runModuleLabPipeline({ env: {}, goal: 'test fail closed inspection', pool, ...adapters }),
    error => error.code === 'MODULE_LAB_INSPECTION_INCOMPLETE',
  );
  assert.equal(generated, false);
});

test('GEN2-16 pipeline blocks candidate status when tests fail', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('a', calls), provider('b', calls)]);
  const adapters = successfulAdapters([]);
  adapters.test = async () => ({ status: 'FAIL', tests_run: 3, tests_failed: 1 });

  await assert.rejects(
    () => runModuleLabPipeline({ env: {}, goal: 'test fail closed tests', pool, ...adapters }),
    error => error.code === 'MODULE_LAB_TESTS_FAILED',
  );
});

test('GEN2-16 pipeline blocks candidate status on security findings', async () => {
  const calls = [];
  const pool = new ProviderPool([provider('a', calls), provider('b', calls)]);
  const adapters = successfulAdapters([]);
  adapters.securityReview = async () => ({ status: 'PASS', blocking_findings: true });

  await assert.rejects(
    () => runModuleLabPipeline({ env: {}, goal: 'test fail closed security', pool, ...adapters }),
    error => error.code === 'MODULE_LAB_SECURITY_REVIEW_FAILED',
  );
});
