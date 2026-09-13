import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrainingCorpus,
  createCorrectionRecord,
  decideAdapterPromotion,
  summarizeLearning,
} from '../../src/learning/correction-corpus.js';

test('validated corrections become trainable examples', () => {
  const row = createCorrectionRecord({
    id: 'c1',
    domain: 'coding',
    input: 'Corrige cette fonction.',
    before: 'ancienne réponse',
    after: 'réponse corrigée',
    rationale: 'La version initiale oubliait le cas limite.',
    validated: true,
    quality: 0.9,
  });
  const corpus = buildTrainingCorpus([row]);
  assert.equal(corpus.accepted, 1);
  assert.equal(corpus.sft[0].messages.at(-1).content, 'réponse corrigée');
  assert.equal(corpus.preference[0].rejected, 'ancienne réponse');
});

test('unvalidated and low-quality corrections are excluded', () => {
  const corpus = buildTrainingCorpus([
    { id: 'c1', input: 'a', before: 'b', after: 'c', rationale: 'd', validated: false, quality: 1 },
    { id: 'c2', input: 'a', before: 'b', after: 'c', rationale: 'd', validated: true, quality: 0.2 },
  ]);
  assert.equal(corpus.accepted, 0);
  assert.equal(corpus.rejected, 2);
});

test('learning summary exposes measurable gain', () => {
  const summary = summarizeLearning([
    { id: 'c1', domain: 'coding', input: 'a', before: 'b', after: 'c', rationale: 'd', validated: true, quality: 0.8 },
    { id: 'c2', domain: 'coding', input: 'e', before: 'f', after: 'g', rationale: 'h', validated: true, quality: 1 },
  ], [
    { kind: 'baseline', score: 0.55 },
    { kind: 'candidate', score: 0.68 },
  ]);
  assert.equal(summary.corrections_validated, 2);
  assert.ok(Math.abs(summary.benchmark.absolute_gain - 0.13) < 1e-9);
});

test('adapter promotion is blocked by regressions', () => {
  const result = decideAdapterPromotion({
    baseline: { overall: 0.6, domains: { coding: 0.7, memory: 0.8 } },
    candidate: { overall: 0.66, domains: { coding: 0.76, memory: 0.7 } },
  });
  assert.equal(result.promote, false);
  assert.equal(result.reason, 'DOMAIN_REGRESSION');
});

test('adapter promotion requires real benchmark gain', () => {
  const result = decideAdapterPromotion({
    baseline: { overall: 0.6, domains: { coding: 0.7, memory: 0.8 } },
    candidate: { overall: 0.65, domains: { coding: 0.74, memory: 0.8 } },
  });
  assert.equal(result.promote, true);
});
