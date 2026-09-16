import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMelProgress, ROADMAP_XP_RULES } from '../src/learning/progress.js';
import { flattenRuntimeRoadmap } from '../src/roadmap/runtime-roadmap.js';
import { enhanceMelProgress } from '../src/pages/mel-progress-enhancer.js';

test('verified roadmap work contributes deterministic MEL XP', () => {
  const result = buildMelProgress({
    roadmapRows: [
      { id: 'A', status: 'DONE' },
      { id: 'B', status: 'DONE_VERIFIED' },
      { id: 'C', status: 'PARTIAL' },
      { id: 'D', status: 'IN_PROGRESS' },
      { id: 'E', status: 'PLANNED' }
    ]
  });

  assert.equal(ROADMAP_XP_RULES.DONE, 100);
  assert.equal(ROADMAP_XP_RULES.DONE_VERIFIED, 150);
  assert.equal(result.roadmap_included, true);
  assert.equal(result.roadmap_xp, 250);
  assert.equal(result.learning_xp, 0);
  assert.equal(result.xp, 250);
  assert.equal(result.level, 2);
  assert.equal(result.evidence.roadmap_complete, 2);
  assert.equal(result.evidence.roadmap_total, 5);
});

test('GEN2-47 is credited only after its verified production evidence', () => {
  const row = flattenRuntimeRoadmap().find((item) => item.id === 'GEN2-47');
  assert.ok(row);
  assert.equal(row.status, 'DONE_VERIFIED');
  assert.match(row.verification, /CI verte/i);
  assert.match(row.verification, /smoke production/i);
});

test('learning evidence remains additive instead of being replaced by roadmap XP', () => {
  const result = buildMelProgress({
    learningReport: {
      corrections_validated: 1,
      corrections_available_for_training: 1,
      inference_trials: 2,
      repeated_taught_errors: 0,
      active_adapter_count: 0,
      benchmark: { runs: 2, baseline_score: 0.5, latest_score: 0.6 }
    },
    roadmapRows: [{ id: 'A', status: 'DONE_VERIFIED' }]
  });

  assert.equal(result.learning_evidence_available, true);
  assert.equal(result.learning_xp, 300);
  assert.equal(result.roadmap_xp, 150);
  assert.equal(result.xp, 450);
});

test('full mode enhancer visibly explains roadmap-inclusive XP', async () => {
  const base = new Response('<!doctype html><html><head></head><body><main></main></body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
  const enhanced = await enhanceMelProgress(base);
  const html = await enhanced.text();

  assert.match(html, /Progression MEL/);
  assert.match(html, /Roadmap incluse/);
  assert.match(html, /Roadmap validée/);
  assert.match(html, /DONE 100 · VERIFIED 150/);
  assert.match(html, /PARTIAL \/ IN_PROGRESS = 0 XP/);
  assert.match(html, /\/api\/gen2\/progress/);
  assert.match(html, /melXpCardCanonical/);
});

test('router exposes progress and keeps canonical full-interface-v5', async () => {
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(router, /full-interface-v5\.js/);
  assert.match(router, /mel-progress-enhancer\.js/);
  assert.match(router, /\/api\/gen2\/progress/);
  assert.match(router, /getRuntimeRoadmapPayload/);
});
