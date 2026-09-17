import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inferNativeCodeCapability } from '../src/api/native-chat.js';
import { onRequestGet as normalModePage } from '../src/pages/mvp-interface.js';
import { getLiveLearningProgress } from '../src/learning/live-progress.js';

test('source access questions never invent a default code path', () => {
  assert.equal(inferNativeCodeCapability('as-tu accès à ton code source ?'), null);
  assert.equal(inferNativeCodeCapability('lis le code'), null);
  assert.equal(inferNativeCodeCapability('quel est ton niveau ?', [
    { role: 'user', content: 'as-tu accès à ton code source ?' },
  ]), null);
});

test('explicit source path still invokes code.read', () => {
  assert.deepEqual(
    inferNativeCodeCapability('ouvre src/router.js et lis son contenu'),
    { id: 'code.read', input: { path: 'src/router.js' } },
  );
});

test('normal mode visual layer is owned by the canonical v3 surface', async () => {
  const response = await normalModePage({});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /data-visual-owner="mel-normal-v3"/);
  assert.match(html, /id="mel-normal-v3-style"/);
  assert.match(html, /\.normal-shell\{width:min\(1080px,calc\(100vw - 24px\)\)/);
  assert.match(html, /#messages\{min-height:clamp\(245px,29vh,370px\)/);
  assert.doesNotMatch(html, /mel-theme-avatar-runtime|mel-owner-visual-fix|mel-new-hd-scenes/);
});

test('benchmark and LoRA live state are evidence-backed', async () => {
  const plan = {
    id: 'mel-lora-ready-test',
    status: 'READY_FOR_TRAINING',
    examples: 50,
    base_model: 'mistralai/Mistral-7B-Instruct-v0.2',
    dataset_digest: 'dataset-test',
    readiness: {
      ready_for_training: true,
      enough_examples: true,
      min_examples: 50,
      runtime_model_supported: true,
      cloudflare_inference_compatible: true,
    },
  };
  const memory = {
    async recent({ kind }) {
      if (kind === 'LORA_PLAN') return [{ kind, evidence: plan, outcome: 'READY', created_at: 1000 }];
      if (kind === 'BENCHMARK_CADENCE') return [{ kind, evidence: {
        status: 'RAN',
        source_sha: 'abcdef1234567890',
        measured_at: 2000,
        verified_jobs_since_benchmark: 0,
        every_verified_jobs: 5,
      }, created_at: 2000 }];
      return [];
    },
  };
  const engine = {
    memory,
    async report() {
      return {
        corrections_recorded: 50,
        corrections_validated: 50,
        corrections_available_for_training: 50,
        validation_rate: 1,
        average_validated_quality: 1,
        benchmark: { runs: 2, baseline_score: 0.7, latest_score: 0.8, absolute_gain: 0.1 },
        benchmark_comparison: { domains: { non_regression: { baseline: 0.7, candidate: 0.8, delta: 0.1 } } },
        inference_trials: 0,
        repeated_taught_errors: 0,
        neural_weights_changed: false,
        active_adapter_count: 0,
      };
    },
  };
  const progress = await getLiveLearningProgress({ engine, db: null, now: () => new Date('2026-09-16T16:00:00Z') });
  assert.equal(progress.benchmark_status.status, 'RAN');
  assert.equal(progress.benchmark_status.latest_score, 0.8);
  assert.equal(progress.lora_status.state, 'READY');
  assert.match(progress.lora_status.reason, /entraînement réel non encore prouvé/);
  assert.equal(progress.evidence.neural_weights_changed, false);
});

test('Benchmark and LoRA remain Professor-only surfaces', async () => {
  const [normalLayer, professorLayer] = await Promise.all([
    readFile(new URL('../src/pages/theme-avatar-enhancer.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(normalLayer, /learnBenchmark|learnLora/);
  assert.match(professorLayer, /pathname !== '\/professor'/);
  assert.match(professorLayer, /learnBenchmark/);
  assert.match(professorLayer, /learnLora/);
});
