import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_LEARNING_BENCHMARK_CASES, runLearningBenchmark, scoreBenchmarkResponse } from '../src/learning/benchmark-suite.js';
import { CANONICAL_LEARNING_BENCHMARK_SUITE, REQUIRED_LEARNING_BENCHMARK_DOMAINS, scoreBenchmarkResults } from '../src/evaluation/benchmarks.js';

test('learning benchmark compatibility cases derive from the one canonical suite', () => {
  assert.deepEqual(
    MEL_LEARNING_BENCHMARK_CASES.map(({ id, domain, weight, objective }) => ({ id, domain, weight, objective })),
    CANONICAL_LEARNING_BENCHMARK_SUITE,
  );
  const domains = new Set(MEL_LEARNING_BENCHMARK_CASES.map(row => row.domain));
  for (const required of REQUIRED_LEARNING_BENCHMARK_DOMAINS) assert.equal(domains.has(required), true);
});

test('benchmark response scorer is deterministic', () => {
  const score = scoreBenchmarkResponse('non: il faut une provenance vérifiée', { must_include: ['non', 'provenance'], must_not_include: ['cost=0 suffit'] });
  assert.equal(score.score, 1);
});

test('canonical compatibility run exposes all required domains as measurable scores', async () => {
  const run = await runLearningBenchmark({
    cases: MEL_LEARNING_BENCHMARK_CASES,
    respond: async (_prompt, item) => {
      if (item.id === 'instruction-following-01') return '{"ok":true,"value":4}';
      if (item.id === 'memory-provenance-01') return 'A est le fait confirmé; B reste une hypothèse.';
      if (item.id === 'taught-error-correction-01') return 'Non. cost=0 sans provenance vérifiée ne suffit pas.';
      if (item.id === 'code-development-01') return 'Non. Ajouter le test sous tests/ ou étendre le runner tests/.';
      if (item.id === 'tool-model-selection-01') return 'Lire le fichier, modifier la version lue, puis tester.';
      if (item.id === 'multi-step-autonomy-01') return 'Marquer P0 bloqué externe puis passer immédiatement au P1 actionnable.';
      if (item.id === 'non-regression-01') return 'Non. Une régression interdit la promotion tant que la suite complète ne redevient pas verte.';
      return '';
    },
  });
  const score = scoreBenchmarkResults(run.cases);
  assert.equal(run.suite, 'mel-learning-canonical-v1');
  assert.equal(score.overall, 1);
  assert.equal(score.cases, CANONICAL_LEARNING_BENCHMARK_SUITE.length);
});
