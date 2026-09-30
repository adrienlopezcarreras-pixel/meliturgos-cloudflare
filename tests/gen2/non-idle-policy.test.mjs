import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_IDLE_POLICY_SCHEMA,
  assertContinueWhenActionable,
  getNonIdleDecision,
} from '../../src/roadmap/non-idle-policy.js';
import { generateCompletionMatrix } from '../../src/roadmap/completion-matrix.js';

function synthetic({ nextWork = [], blockers = [] } = {}) {
  return {
    schema: 'mel.roadmap.completion-matrix.v1',
    registry_revision: 'test-revision',
    matrix_fingerprint: 'fnv1a-deadbeef',
    summary: {
      actionable: nextWork.length,
      blocked: blockers.length,
    },
    next_work: nextWork,
    blockers,
  };
}

function actionable(id, priority = 'P1') {
  return {
    id,
    phase_id: 'P99',
    phase: 'Tests',
    title: id,
    priority,
    status: 'IN_PROGRESS',
    next: 'Continue',
    complete: false,
    blocked: false,
    actionable: true,
  };
}

function blocker(id, status = 'BLOCKED_HUMAN') {
  return {
    id,
    phase_id: 'P99',
    phase: 'Tests',
    title: id,
    priority: 'P0',
    status,
    next: 'Human/external action',
    complete: false,
    blocked: true,
    actionable: false,
  };
}

test('GEN2-63 continues when actionable work exists even with higher-priority blockers', () => {
  const matrix = synthetic({
    nextWork: [actionable('WORK-P1', 'P1')],
    blockers: [blocker('BLOCKED-P0')],
  });

  const decision = assertContinueWhenActionable({ matrix });
  assert.equal(decision.schema, NON_IDLE_POLICY_SCHEMA);
  assert.equal(decision.decision, 'CONTINUE');
  assert.equal(decision.idle, false);
  assert.equal(decision.selected.id, 'WORK-P1');
  assert.equal(decision.blocked_count, 1);
});

test('GEN2-63 never selects human or external blockers', () => {
  const matrix = synthetic({
    nextWork: [actionable('WORK-P2', 'P2')],
    blockers: [
      blocker('HUMAN', 'BLOCKED_HUMAN'),
      blocker('EXTERNAL', 'BLOCKED_EXTERNAL'),
    ],
  });

  const decision = getNonIdleDecision({ matrix });
  assert.equal(decision.selected.id, 'WORK-P2');
  assert.notEqual(decision.selected.id, 'HUMAN');
  assert.notEqual(decision.selected.id, 'EXTERNAL');
});

test('GEN2-63 waits only when every remaining item is blocked', () => {
  const matrix = synthetic({
    blockers: [blocker('HUMAN')],
  });

  const decision = getNonIdleDecision({ matrix });
  assert.equal(decision.decision, 'WAIT_FOR_BLOCKERS');
  assert.equal(decision.idle, true);
  assert.equal(decision.selected, null);
});

test('GEN2-63 reports completion when neither actionable nor blocked work remains', () => {
  const decision = getNonIdleDecision({ matrix: synthetic() });
  assert.equal(decision.decision, 'COMPLETE');
  assert.equal(decision.idle, true);
  assert.equal(decision.reason, 'ROADMAP_COMPLETE');
});

test('GEN2-63 is bound to the canonical matrix revision and fingerprint', () => {
  const matrix = generateCompletionMatrix();
  const decision = assertContinueWhenActionable({ matrix });

  assert.equal(decision.registry_revision, matrix.registry_revision);
  assert.equal(decision.matrix_fingerprint, matrix.matrix_fingerprint);
  if (matrix.next_work.length > 0) {
    assert.equal(decision.decision, 'CONTINUE');
    assert.equal(decision.selected.id, matrix.next_work[0].id);
  }
});

test('GEN2-63 fails closed on inconsistent matrix counts', () => {
  const matrix = synthetic({ nextWork: [actionable('WORK')] });
  matrix.summary.actionable = 2;
  assert.throws(
    () => getNonIdleDecision({ matrix }),
    { code: 'NON_IDLE_ACTIONABLE_COUNT_MISMATCH' },
  );
});

test('GEN2-63 fails closed if a blocked row leaks into next_work', () => {
  const bad = blocker('BAD');
  const matrix = synthetic({ nextWork: [bad] });
  assert.throws(
    () => getNonIdleDecision({ matrix }),
    { code: 'NON_IDLE_ACTIONABLE_SET_INVALID' },
  );
});
