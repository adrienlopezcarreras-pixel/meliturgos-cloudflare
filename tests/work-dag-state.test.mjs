import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkDag, WORK_DAG_STATUS, WORK_NODE_STATUS } from '../src/work/work-dag.js';
import { summarizeWorkDag, isWorkDagComplete } from '../src/work/work-dag-state.js';

function dag(nodes) {
  return createWorkDag({
    jobId: `state-${crypto.randomUUID()}`,
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: '0123456789abcdef0123456789abcdef01234567',
    goal: 'Bounded Work DAG state',
    nodes,
  });
}

test('Work DAG state reports dependency readiness without exposing payloads or goals', () => {
  const current = dag([
    { id: 'a', kind: 'TASK', idempotent: true, payload: { private_note: 'must-not-leak' } },
    { id: 'b', kind: 'TASK', depends_on: ['a'], idempotent: true },
  ]);
  current.nodes[0].status = WORK_NODE_STATUS.COMPLETED;

  const summary = summarizeWorkDag(current);
  assert.equal(summary.completed, false);
  assert.equal(summary.blocked, false);
  assert.deepEqual(summary.runnable_node_ids, ['b']);
  assert.equal(summary.node_counts.COMPLETED, 1);
  assert.equal(summary.node_counts.PENDING, 1);
  assert.equal(JSON.stringify(summary).includes('must-not-leak'), false);
  assert.equal(JSON.stringify(summary).includes('Bounded Work DAG state'), false);
});

test('Work DAG is complete only when DAG and every node agree on completion', () => {
  const current = dag([{ id: 'a', kind: 'TASK', idempotent: true }]);
  current.nodes[0].status = WORK_NODE_STATUS.COMPLETED;
  assert.equal(isWorkDagComplete(current), false, 'node completion alone must not promote the DAG');

  current.status = WORK_DAG_STATUS.COMPLETED;
  assert.equal(isWorkDagComplete(current), true);
  assert.equal(summarizeWorkDag(current).terminal, true);
});

test('blocked and Teacher-waiting states remain observable and fail closed', () => {
  const blocked = dag([{ id: 'unsafe', kind: 'TASK', idempotent: false }]);
  blocked.nodes[0].status = WORK_NODE_STATUS.BLOCKED;
  blocked.status = WORK_DAG_STATUS.BLOCKED;
  const blockedSummary = summarizeWorkDag(blocked);
  assert.equal(blockedSummary.blocked, true);
  assert.equal(blockedSummary.terminal, true);

  const waiting = dag([{ id: 'teacher', kind: 'TEACHER', payload: { request: { request_id: 'r1' } } }]);
  waiting.nodes[0].status = WORK_NODE_STATUS.WAITING_TEACHER;
  waiting.status = WORK_DAG_STATUS.WAITING;
  const waitingSummary = summarizeWorkDag(waiting);
  assert.equal(waitingSummary.completed, false);
  assert.equal(waitingSummary.terminal, false);
  assert.deepEqual(waitingSummary.waiting_teacher_node_ids, ['teacher']);
});
