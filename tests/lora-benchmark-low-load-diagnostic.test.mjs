import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveOperatorLoraBenchmarkConcurrency } from '../src/learning/operator-actions.js';

test('LoRA benchmark has unchanged normal concurrency and bounded diagnostic overrides', () => {
  assert.equal(resolveOperatorLoraBenchmarkConcurrency(undefined), 4);
  assert.equal(resolveOperatorLoraBenchmarkConcurrency(''), 4);
  assert.equal(resolveOperatorLoraBenchmarkConcurrency(1), 1);
  assert.equal(resolveOperatorLoraBenchmarkConcurrency('4'), 4);
  for (const value of [0, -1, 5, 100, '1.5', 'NaN', 'not-an-int']) {
    assert.throws(() => resolveOperatorLoraBenchmarkConcurrency(value), /LORA_BENCHMARK_CONCURRENCY_INVALID/);
  }
});
test('low-load diagnostic is read-only and does not lower activation gates', () => {
  const workflow=readFileSync('.github/workflows/lora-kaggle-free-collect.yml', 'utf8');
  const source=readFileSync('src/learning/operator-actions.js', 'utf8');
  const route=readFileSync('src/professor-live-learning-entry.js', 'utf8');
  const cli=readFileSync('scripts/finalize-lora.mjs', 'utf8');
  assert.match(workflow, /BENCHMARK_CONCURRENCY: \$\{\{ github\.event_name == 'push' && '1' \|\| '4' \}\}/);
  assert.match(workflow, /--concurrency "\$BENCHMARK_CONCURRENCY"/);
  assert.match(workflow, /MEL_LORA_ACTIVATION_APPROVED: \$\{\{ github\.event_name == 'workflow_dispatch'/);
  assert.match(source, /const benchmarkConcurrency = resolveOperatorLoraBenchmarkConcurrency\(options\.benchmark_concurrency\)/);
  assert.match(source, /concurrency: benchmarkConcurrency/);
  assert.match(source, /const stageReady = decision\.promote === true && impactGatePassed/);
  assert.match(route, /benchmark_concurrency: body\.benchmark_concurrency/);
  assert.match(cli, /benchmark_concurrency: benchmarkConcurrency/);
  assert.match(workflow, /Validate LoRA benchmark readiness/);
});
