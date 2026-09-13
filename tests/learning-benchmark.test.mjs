import test from 'node:test';
import assert from 'node:assert/strict';
import { MEL_LEARNING_BENCHMARK_CASES, runLearningBenchmark, scoreBenchmarkResponse } from '../src/learning/benchmark-suite.js';
import { scoreBenchmarkResults } from '../src/evaluation/benchmarks.js';

test('stable learning benchmark covers required domains', () => {
  const domains = new Set(MEL_LEARNING_BENCHMARK_CASES.map(row => row.domain));
  for (const required of ['instruction', 'memory', 'correction-reuse', 'code', 'tools', 'autonomy']) assert.equal(domains.has(required), true);
});

test('benchmark response scorer is deterministic', () => {
  const score = scoreBenchmarkResponse('non: il faut une provenance vérifiée', { must_include: ['non', 'provenance'], must_not_include: ['cost=0 suffit'] });
  assert.equal(score.score, 1);
});

test('benchmark run can expose learned correction reuse as a measurable score', async () => {
  const run = await runLearningBenchmark({
    cases: MEL_LEARNING_BENCHMARK_CASES,
    respond: async (_prompt, item) => {
      if (item.id === 'instruction-json-only') return '{"ok":true,"value":4}';
      if (item.id === 'memory-provenance-separation') return 'A est le fait confirmé; B reste une hypothèse.';
      if (item.id === 'learned-correction-zero-cost') return 'Non. cost=0 sans provenance vérifiée ne suffit pas.';
      if (item.id === 'code-test-discovery') return 'Non. Ajouter le test sous tests/ ou étendre le runner tests/.';
      if (item.id === 'tool-selection-read-before-write') return 'Lire le fichier, modifier la version lue, puis tester.';
      if (item.id === 'autonomy-blocked-external') return 'Marquer P0 bloqué externe puis passer immédiatement au P1 actionnable.';
      return '';
    },
  });
  const score = scoreBenchmarkResults(run.cases);
  assert.equal(score.overall, 1);
  assert.equal(score.cases, MEL_LEARNING_BENCHMARK_CASES.length);
});
