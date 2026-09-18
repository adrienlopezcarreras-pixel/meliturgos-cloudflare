import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_LEARNING_BENCHMARK_SUITE,
  REQUIRED_LEARNING_BENCHMARK_DOMAINS,
  validateLearningBenchmarkSuite,
  runLearningBenchmarkSuite,
  compareBenchmarkScores,
} from '../src/evaluation/benchmarks.js';

test('canonical benchmark covers every required MEL domain exactly through one suite', async()=>{
  const validation=validateLearningBenchmarkSuite(CANONICAL_LEARNING_BENCHMARK_SUITE);
  assert.equal(validation.cases,CANONICAL_LEARNING_BENCHMARK_SUITE.length);
  for(const domain of REQUIRED_LEARNING_BENCHMARK_DOMAINS) assert.ok(validation.domains.includes(domain));

  const baseline=await runLearningBenchmarkSuite({
    evaluator:async()=>({score:0.6,repeated_error:false})
  });
  const candidate=await runLearningBenchmarkSuite({
    evaluator:async testCase=>({score:testCase.domain==='non_regression'?0.65:0.75,repeated_error:false})
  });
  const comparison=compareBenchmarkScores(baseline,candidate);
  assert.ok(comparison.delta>0);
  assert.ok(comparison.domains.non_regression.delta>=0);
});

test('benchmark fails closed when evaluator evidence is missing', async()=>{
  await assert.rejects(
    ()=>runLearningBenchmarkSuite({evaluator:async()=>({})}),
    /BENCHMARK_SCORE_REQUIRED/
  );
});
