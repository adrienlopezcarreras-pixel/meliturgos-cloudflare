import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autonomyWorkRemaining,
  autonomyQueueReadBlocker,
} from '../src/evolution/autonomy-runtime-core.js';

test('an unavailable evolution queue never reports an empty completed workload', () => {
  const state = {
    active: [],
    next: null,
    evolution: { status: 'UNAVAILABLE', actionable_count: null, code: 'EVOLUTION_QUEUE_READ_FAILED' },
  };
  assert.equal(autonomyWorkRemaining(state), true);
  assert.equal(autonomyQueueReadBlocker(state), 'EVOLUTION_QUEUE_READ_FAILED');
});

test('available empty queues and independently actionable work keep their correct status', () => {
  assert.equal(autonomyWorkRemaining({
    active: [], next: null, evolution: { status: 'CONNECTED', actionable_count: 0 },
  }), false);
  assert.equal(autonomyQueueReadBlocker({ evolution: { status: 'CONNECTED' } }), null);
  assert.equal(autonomyWorkRemaining({
    active: [{ id: 'runtime-job' }], next: null, evolution: { status: 'CONNECTED' },
  }), true);
  assert.equal(autonomyWorkRemaining({
    active: [], next: { id: 'MEL-WORK-01' }, evolution: { status: 'NOT_CONFIGURED' },
  }), true);
});

test('unavailable evolution queue uses a stable failure code even with incomplete metadata', () => {
  const state = { active: [], next: null, evolution: { status: 'UNAVAILABLE', code: null } };
  assert.equal(autonomyWorkRemaining(state), true);
  assert.equal(autonomyQueueReadBlocker(state), 'EVOLUTION_QUEUE_READ_FAILED');
});

// MEL-MANIFEST-09: measured gap → idempotent evolution → versioned competence.
test('only a measured gap opens one idempotent evolution and the previous competence stays active until verified delivery', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const { initializeEvolutionStorage, openEvolutionFromMeasuredGap, activeCompetenceVersion, listEvolutionItems, changeEvolutionStatus } = await import('../src/roadmap/evolution-storage.js');
  const db = sqliteD1();
  try {
    await initializeEvolutionStorage(db);
    const gap = { capability: 'gmail.messages.search', current_version: '1.0.0', next_version: '1.1.0',
      evidence: [{ metric: 'rendered_ratio', measured: 0.4, expected: 1 }] };
    await assert.rejects(openEvolutionFromMeasuredGap(db, 'owner', { ...gap, evidence: [] }), /EVIDENCE_REQUIRED/);
    const first = await openEvolutionFromMeasuredGap(db, 'owner', gap);
    const again = await openEvolutionFromMeasuredGap(db, 'owner', gap);
    assert.equal(first.created, true);
    assert.deepEqual(again, { created: false, duplicate_of: first.item.id });
    let [item] = await listEvolutionItems(db, 'owner');
    assert.equal(item.gap.evidence[0].metric, 'rendered_ratio');
    assert.equal(activeCompetenceVersion(item), '1.0.0', 'the previous version stays active');
    let revision = item.revision;
    for (const next of ['TRIAGED', 'APPROVED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTING']) {
      revision = (await changeEvolutionStatus(db, 'owner', item.id, revision, next)).revision;
      assert.equal(activeCompetenceVersion((await listEvolutionItems(db, 'owner'))[0]), '1.0.0', next);
    }
    await changeEvolutionStatus(db, 'owner', item.id, revision, 'DONE_VERIFIED',
      { sha: 'f'.repeat(40), ci_passed: true, real_test_passed: true, environment: 'candidate', reference: 'run 1' });
    [item] = await listEvolutionItems(db, 'owner');
    assert.equal(activeCompetenceVersion(item), '1.1.0', 'switches only after verified delivery');
  } finally { db.close?.(); }
});
