import test from 'node:test';
import assert from 'node:assert/strict';
import { assessValidatedHandoff, ingestValidatedHandoffs } from '../src/learning/validated-handoff-ingestion.js';

function xp(overrides = {}) {
  return {
    id: 'xp-one', source: 'chatgpt-teacher', domain: 'release', task: 'Promote safely', input: 'candidate ready',
    before: 'promote by timing', after: 'promote only exact SHA with green gates', rationale: 'prevents false release proof',
    tests: ['run 123 success'], tags: ['release'], validated: true, quality: 1, created_at: 1,
    provenance: { handoff: '.agents/example.md', source_sha: 'abc123' }, ...overrides,
  };
}

test('accepts validated handoff and preserves provenance', () => {
  const result = assessValidatedHandoff(xp(), []);
  assert.equal(result.accepted, true);
  assert.equal(result.experience.provenance.handoff, '.agents/example.md');
  assert.equal(result.experience.provenance.source_sha, 'abc123');
  assert.equal(result.experience.provenance.ingestion, 'validated-handoff');
});

test('fails closed for unvalidated handoff', () => {
  assert.equal(assessValidatedHandoff(xp({ validated: false }), []).reason, 'UNVALIDATED');
});

test('deduplicates by id and by normalized meaning', () => {
  const first = xp();
  assert.equal(assessValidatedHandoff(xp(), [first]).reason, 'DUPLICATE_ID');
  const sameMeaning = xp({ id: 'xp-two', task: 'Promote safely!!!', after: 'Promote only exact SHA with green gates.' });
  assert.equal(assessValidatedHandoff(sameMeaning, [first]).reason, 'DUPLICATE_MEANING');
});

test('batch ingestion records accepted rows once and reports rejects', async () => {
  const stored = [];
  const result = await ingestValidatedHandoffs({
    handoffs: [xp(), xp({ id: 'xp-two' }), xp({ id: 'xp-three', validated: false })],
    existing: [],
    record: async (row) => { stored.push(row); return row; },
  });
  assert.equal(result.accepted_count, 1);
  assert.equal(result.rejected_count, 2);
  assert.equal(stored.length, 1);
  assert.equal(result.rejected[0].reason, 'DUPLICATE_MEANING');
  assert.equal(result.rejected[1].reason, 'UNVALIDATED');
});
