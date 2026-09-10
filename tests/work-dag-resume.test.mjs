import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import {
  createWorkDag,
  DevJobWorkDagStore,
  WorkDagRunner,
  createAugmentioWorkExecutor,
  WORK_DAG_STATUS,
  WORK_NODE_STATUS,
  verifyWorkDag,
} from '../src/work/work-dag.js';

function council() {
  return {
    responses: [
      { provider: 'workers-ai', model: 'zero-a', zero_added_cost: true, summary: 'A' },
      { provider: 'workers-ai', model: 'zero-b', zero_added_cost: true, summary: 'B' },
    ],
  };
}

function teacherRequest() {
  return createTeacherReviewRequest({
    goal: 'Prouver la reprise Work de MEL',
    council: council(),
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/work/work-dag.js' }] },
    spec: { scope: 'bounded-test' },
  });
}

async function setup(jobId) {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: jobId, goal: 'Work DAG resume proof' });
  await repo.update(job.id, { candidate_branch: 'candidate/augmentio-core' });
  return { repo, job, store: new DevJobWorkDagStore(repo, job.id) };
}

test('general Work DAG executes dependencies, .augmentio, waits for Teacher, then resumes without duplicate work', async () => {
  const { store, job } = await setup(`work-e2e-${crypto.randomUUID()}`);
  const request = teacherRequest();
  let augmentioCalls = 0;
  let taskCalls = 0;
  const augmentio = {
    async fanOut(input) {
      augmentioCalls += 1;
      assert.equal(input.capability, 'GENERAL');
      return { best: { text: 'bounded council result' }, candidates: [{ text: 'bounded council result' }] };
    },
  };
  const taskExecutor = async (node) => {
    taskCalls += 1;
    return { completed: node.id };
  };
  const dag = createWorkDag({
    jobId: job.id,
    goal: 'Council -> task -> Teacher -> continuation',
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: 'abc1234',
    nodes: [
      { id: 'council', kind: 'AUGMENTIO', idempotent: true, payload: { input: 'state of play', capability: 'GENERAL', maxCandidates: 2 } },
      { id: 'inspect', kind: 'TASK', depends_on: ['council'], idempotent: true },
      { id: 'teacher', kind: 'TEACHER', depends_on: ['inspect'], payload: { request } },
      { id: 'continue', kind: 'TASK', depends_on: ['teacher'], idempotent: true },
    ],
  });
  await store.save(dag);

  const firstRunner = new WorkDagRunner({
    store,
    expectedCandidateSha: 'abc1234',
    executors: { AUGMENTIO: createAugmentioWorkExecutor(augmentio), TASK: taskExecutor },
  });
  const waiting = await firstRunner.run();
  assert.equal(waiting.status, WORK_DAG_STATUS.WAITING);
  assert.equal(waiting.nodes.find((n) => n.id === 'teacher').status, WORK_NODE_STATUS.WAITING_TEACHER);
  assert.equal(augmentioCalls, 1);
  assert.equal(taskCalls, 1);

  const restartedRunner = new WorkDagRunner({
    store,
    expectedCandidateSha: 'abc1234',
    executors: { AUGMENTIO: createAugmentioWorkExecutor(augmentio), TASK: taskExecutor },
  });
  const stillWaiting = await restartedRunner.run();
  assert.equal(stillWaiting.status, WORK_DAG_STATUS.WAITING);
  assert.equal(augmentioCalls, 1, 'completed augmentio node must not run again after restart');
  assert.equal(taskCalls, 1, 'completed task node must not run again after restart');

  await assert.rejects(
    () => restartedRunner.submitTeacherReply('teacher', { request_id: 'wrong', verdict: 'APPROVE_PLAN' }),
    (error) => error?.code === 'TEACHER_REVIEW_REQUEST_MISMATCH',
  );

  const complete = await restartedRunner.submitTeacherReply('teacher', {
    request_id: request.request_id,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed with bounded implementation.',
  });
  assert.equal(complete.status, WORK_DAG_STATUS.COMPLETED);
  assert.equal(complete.nodes.every((n) => n.status === WORK_NODE_STATUS.COMPLETED), true);
  assert.equal(augmentioCalls, 1);
  assert.equal(taskCalls, 2, 'only the post-Teacher continuation should execute');
  await verifyWorkDag(complete);
});

test('interrupted idempotent Work node is recovered from checkpoint and retried once', async () => {
  const { store, job } = await setup(`work-resume-${crypto.randomUUID()}`);
  let calls = 0;
  let dag = createWorkDag({
    jobId: job.id,
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: 'def5678',
    goal: 'Recover interrupted safe work',
    nodes: [{ id: 'safe', kind: 'TASK', idempotent: true }],
  });
  dag.nodes[0].status = WORK_NODE_STATUS.RUNNING;
  dag.nodes[0].attempts = 1;
  dag = await store.save(dag);

  const runner = new WorkDagRunner({
    store,
    expectedCandidateSha: 'def5678',
    executors: { TASK: async () => { calls += 1; return { ok: true }; } },
  });
  const result = await runner.run();
  assert.equal(result.status, WORK_DAG_STATUS.COMPLETED);
  assert.equal(result.nodes[0].attempts, 2);
  assert.equal(calls, 1);
  assert.equal(result.audit.some((entry) => entry.event === 'WORK_NODE_RECOVERED_FOR_RETRY'), true);
});

test('interrupted non-idempotent node fails closed instead of risking duplicate side effects', async () => {
  const { store, job } = await setup(`work-failclosed-${crypto.randomUUID()}`);
  let calls = 0;
  let dag = createWorkDag({
    jobId: job.id,
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: '789abcd',
    goal: 'Do not duplicate side effects',
    nodes: [{ id: 'unsafe', kind: 'TASK', idempotent: false }],
  });
  dag.nodes[0].status = WORK_NODE_STATUS.RUNNING;
  dag.nodes[0].attempts = 1;
  await store.save(dag);

  const runner = new WorkDagRunner({
    store,
    expectedCandidateSha: '789abcd',
    executors: { TASK: async () => { calls += 1; return { ok: true }; } },
  });
  const result = await runner.run();
  assert.equal(result.status, WORK_DAG_STATUS.BLOCKED);
  assert.equal(result.nodes[0].status, WORK_NODE_STATUS.BLOCKED);
  assert.equal(result.nodes[0].error, 'INTERRUPTED_NON_IDEMPOTENT_NODE');
  assert.equal(calls, 0);
});

test('Work DAG binding, graph validity and integrity fail closed', async () => {
  const { store, repo, job } = await setup(`work-integrity-${crypto.randomUUID()}`);
  assert.throws(
    () => createWorkDag({ jobId: job.id, candidateBranch: 'main', nodes: [{ id: 'x', kind: 'TASK' }] }),
    (error) => error?.code === 'WORK_DAG_NON_CANDIDATE_BRANCH',
  );
  assert.throws(
    () => createWorkDag({ jobId: job.id, nodes: [
      { id: 'a', kind: 'TASK', depends_on: ['b'] },
      { id: 'b', kind: 'TASK', depends_on: ['a'] },
    ] }),
    (error) => error?.code === 'WORK_DAG_CYCLE',
  );

  const dag = createWorkDag({
    jobId: job.id,
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: 'feed123',
    goal: 'Integrity',
    nodes: [{ id: 'x', kind: 'TASK', idempotent: true }],
  });
  const saved = await store.save(dag);
  const mismatched = new WorkDagRunner({ store, expectedCandidateSha: 'different', executors: { TASK: async () => ({ ok: true }) } });
  await assert.rejects(() => mismatched.run(), (error) => error?.code === 'WORK_DAG_CANDIDATE_SHA_MISMATCH');

  const jobState = await repo.get(job.id);
  const tampered = structuredClone(jobState.result_json);
  tampered.work_dag.nodes[0].status = WORK_NODE_STATUS.COMPLETED;
  await repo.update(job.id, { result_json: tampered });
  await assert.rejects(() => store.load(), (error) => error?.code === 'WORK_DAG_INTEGRITY_MISMATCH');
  assert.ok(saved.integrity_sha256);
});
