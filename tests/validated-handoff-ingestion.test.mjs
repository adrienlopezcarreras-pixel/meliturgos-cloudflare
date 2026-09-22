import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestValidatedHandoff, persistValidatedHandoff, validateHandoffEnvelope } from '../src/learning/validated-handoff-ingestion.js';

const xp = (id, after = 'Toujours vérifier la postcondition réelle.') => ({
  id,
  source: 'agent-handoff',
  domain: 'runtime-proof',
  task: 'Valider une capacité après changement.',
  input: 'Un changement vient d’être intégré.',
  before: 'Supposer le succès depuis le code.',
  after,
  rationale: 'La postcondition observée évite les faux succès.',
  tests: ['run 123 success'],
  tags: ['runtime', 'proof'],
  validated: true,
  quality: 1,
  created_at: 1790087000000,
});

const handoff = (experiences) => ({
  id: 'handoff-20260922-a',
  validated: true,
  source_path: '.agents/HANDOFF.md',
  source_sha: '8a74c919f113553af6c1caefc7fea2b2b0c16db1',
  validated_at: 1790087000000,
  experiences,
});

test('handoff envelope fails closed without validation and provenance', () => {
  const result = validateHandoffEnvelope({ experiences: [xp('x')] });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('handoff:not-validated'));
  assert.ok(result.issues.includes('handoff:source-sha-required'));
});

test('handoff envelope rejects abbreviated SHA provenance', () => {
  const result = validateHandoffEnvelope({ ...handoff([xp('x')]), source_sha: '8a74c91' });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('handoff:source-sha-required'));
});

test('ingestion preserves provenance and deduplicates by id and meaning', () => {
  const existing = [xp('existing')];
  const result = ingestValidatedHandoff(handoff([
    xp('existing', 'Règle différente.'),
    xp('same-meaning'),
    xp('new-xp', 'Observer et relire l’effet persistant avant clôture.'),
  ]), existing);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].id, 'new-xp');
  assert.equal(result.accepted[0].provenance.source_sha, '8a74c919f113553af6c1caefc7fea2b2b0c16db1');
  assert.deepEqual(result.skipped.map((row) => row.reason).sort(), ['duplicate:id', 'duplicate:meaning']);
});

test('persistence writes only accepted validated experiences', async () => {
  const writes = [];
  const learningEngine = {
    async corrections() { return [xp('existing')]; },
    async recordCorrection(row) { writes.push(row); return row; },
  };
  const result = await persistValidatedHandoff({
    learningEngine,
    handoff: handoff([xp('new-xp', 'Nouvelle règle prouvée et distincte.')]),
  });
  assert.equal(result.accepted.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].source, 'handoff:handoff-20260922-a');
  assert.equal(writes[0].metadata.provenance.source_path, '.agents/HANDOFF.md');
});
