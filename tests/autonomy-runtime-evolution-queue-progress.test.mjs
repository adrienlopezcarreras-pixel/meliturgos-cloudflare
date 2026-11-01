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

// MEL-FOUNDER-03: an authorized missing capability opens ONE resumable
// objective; its verified delivery registers the skill on the canonical bus.
test('MEL-FOUNDER-03: a missing capability opens one resumable objective, closed only by a verified delivery', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const s = await import('../src/roadmap/evolution-storage.js');
  const { CapabilityBus, registerDeliveredSkill } = await import('../src/capabilities/capability-bus.js');
  const db = sqliteD1();
  try {
    const cap = 'skill.missing';
    // Not authorized: reported, never turned into development work.
    const refused = await s.openMissingCapabilityObjective(db, { capability_id: cap });
    assert.equal(refused.opened, false);
    assert.equal(refused.code, 'MISSING_CAPABILITY_NOT_AUTHORIZED');

    const first = await s.openMissingCapabilityObjective(db, { capability_id: cap, authorized: true });
    assert.equal(first.opened, true);
    assert.equal(first.objective_id, 'capability-gap:skill.missing');
    // Same gap seen again: the SAME objective resumes, no duplicate.
    const again = await s.openMissingCapabilityObjective(db, { capability_id: cap, authorized: true });
    assert.equal(again.opened, false);
    assert.equal(again.resumed, true);
    assert.equal(again.objective_id, first.objective_id);
    assert.equal(Number((await db.prepare('SELECT count(*) AS n FROM mel_capability_gap_objectives').first()).n), 1);

    // An unverified delivery never closes the gap.
    assert.equal((await s.closeMissingCapabilityObjective(db, { capability_id: cap })).code, 'MISSING_CAPABILITY_DELIVERY_UNVERIFIED');

    const bus = new CapabilityBus();
    const descriptor = registerDeliveredSkill(bus, { capability_id: cap, candidate_sha: 'b'.repeat(40), ci_passed: true, ci_run_id: 9 },
      { id: cap, name: 'n', category: 'c', version: '1.0.0', provider: 'p', description: 'd',
        input_schema: { type: 'object', additionalProperties: false }, output_schema: { type: 'object', additionalProperties: true },
        risk: 'LOW', permissions: [], health: 'OK', enabled: true }, async () => ({}));
    const closed = await s.closeMissingCapabilityObjective(db, { capability_id: cap, descriptor });
    assert.equal(closed.closed, true);
    assert.equal(closed.registered_on_bus, true);
    assert.ok(bus.records.has(cap), 'the skill is on the canonical bus');
    assert.equal((await db.prepare('SELECT status FROM mel_capability_gap_objectives WHERE id=?').bind(first.objective_id).first()).status, 'CLOSED');
  } finally { db.close(); }
});
