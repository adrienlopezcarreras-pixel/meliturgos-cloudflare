import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBenchmarkScores } from '../src/evaluation/benchmarks.js';

test('workflow improvement is measured against a baseline instead of simulated static variants', () => {
  const baseline={overall:0.6,domains:{code_development:{score:0.6},non_regression:{score:0.8}}};
  const candidate={overall:0.72,domains:{code_development:{score:0.75},non_regression:{score:0.8}}};
  const comparison=compareBenchmarkScores(baseline,candidate);
  assert.equal(comparison.delta,0.12);
  assert.ok(comparison.domains.code_development.delta>0);
  assert.equal(comparison.domains.non_regression.delta,0);
});

test('regressions remain visible rather than being auto-activated', () => {
  const comparison=compareBenchmarkScores(
    {overall:0.8,domains:{non_regression:{score:0.9}}},
    {overall:0.7,domains:{non_regression:{score:0.5}}}
  );
  assert.ok(comparison.delta<0);
  assert.ok(comparison.domains.non_regression.delta<0);
});
