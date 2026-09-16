import test from 'node:test';
import assert from 'node:assert/strict';
import { runLearningBenchmark, MEL_LEARNING_BENCHMARK_CASES } from '../src/learning/benchmark-suite.js';

test('text benchmark returns a complete measured summary with provenance', async () => {
  const answers = new Map([
    ['memory-provenance-01', 'A est confirmé; B reste une hypothèse.'],
    ['instruction-following-01', '{"ok":true,"value":4}'],
    ['taught-error-correction-01', 'Non. Sans provenance vérifiée du coût, MEL doit refuser ce fournisseur.'],
    ['code-development-01', 'Non. Il faut placer le test sous tests/ ou adapter explicitement le runner.'],
    ['tool-model-selection-01', 'Lire le fichier, modifier minimalement, puis tester.'],
    ['multi-step-autonomy-01', 'Marquer le P0 comme bloqué, passer au P1 actionnable puis revenir au P0.'],
    ['non-regression-01', 'Non. Une régression de la suite complète bloque la promotion.'],
  ]);

  const result = await runLearningBenchmark({
    metadata: {
      model_id: '@cf/example/free-model',
      source_sha: 'abc123',
      trigger: 'test',
    },
    respond: async (_prompt, item) => answers.get(item.id) || '',
  });

  assert.equal(result.suite, 'mel-learning-canonical-v1');
  assert.equal(result.version, 'v1');
  assert.equal(result.case_count, MEL_LEARNING_BENCHMARK_CASES.length);
  assert.equal(result.cases.length, MEL_LEARNING_BENCHMARK_CASES.length);
  assert.equal(result.score, 1);
  assert.equal(result.metadata.model_id, '@cf/example/free-model');
  assert.equal(result.metadata.source_sha, 'abc123');
  assert.match(result.benchmark_id, /^mel-learning-canonical-v1:abc123:/);
  assert.equal(Object.keys(result.domains).length, MEL_LEARNING_BENCHMARK_CASES.length);
});

test('text benchmark includes failed cases in the aggregate score instead of hiding them', async () => {
  let call = 0;
  const result = await runLearningBenchmark({
    respond: async () => {
      call += 1;
      if (call === 1) throw Object.assign(new Error('provider-failed'), { code: 'PROVIDER_FAILED' });
      return 'réponse insuffisante';
    },
  });

  assert.equal(result.case_count, MEL_LEARNING_BENCHMARK_CASES.length);
  assert.equal(result.cases[0].score, 0);
  assert.equal(result.cases[0].error, 'PROVIDER_FAILED');
  assert.ok(result.score >= 0 && result.score < 1);
});
