import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestValidatedHandoffs } from '../src/learning/handoff-ingestion.js';

function xp(id, after = 'Toujours conserver la provenance exacte.') {
  return { id, source: 'chatgpt-teacher', domain: 'learning', task: 'Ingérer un handoff', input: 'Un handoff validé arrive.', before: 'Ingérer sans preuve.', after, rationale: 'La provenance rend l’apprentissage auditable.', tests: ['proof'], tags: ['handoff'], validated: true, quality: 1, created_at: 1 };
}

function engine(existing = []) {
  const stored = [];
  return {
    stored,
    memory: { remember: async row => { stored.push(row); } },
    corrections: async () => existing,
  };
}

test('ingests only validated handoffs and persists exact provenance', async () => {
  const learningEngine = engine();
  const result = await ingestValidatedHandoffs({ learningEngine, handoffs: [
    { validated: true, provenance: { path: '.agents/H.md', sha: 'blob123', commit: 'abc123' }, experience: xp('xp-1') },
    { validated: false, provenance: { path: '.agents/X.md', sha: 'x' }, experience: xp('xp-2') },
  ] });
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.deepEqual(learningEngine.stored[0].evidence.handoff_provenance, { path: '.agents/H.md', sha: 'blob123', commit: 'abc123' });
});

test('deduplicates by id and semantic meaning', async () => {
  const existing = [xp('known')];
  const learningEngine = engine(existing);
  const result = await ingestValidatedHandoffs({ learningEngine, handoffs: [
    { validated: true, provenance: { path: 'a', sha: '1' }, experience: xp('known', 'Une autre règle.') },
    { validated: true, provenance: { path: 'b', sha: '2' }, experience: xp('new-id') },
  ] });
  assert.equal(result.duplicate.length, 2);
  assert.equal(learningEngine.stored.length, 0);
  assert.deepEqual(result.duplicate.map(x => x.reason), ['ID', 'SEMANTIC']);
});
