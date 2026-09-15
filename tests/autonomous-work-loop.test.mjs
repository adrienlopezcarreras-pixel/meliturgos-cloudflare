import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import { createWorkDag, DevJobWorkDagStore, WorkDagRunner, WORK_DAG_STATUS, WORK_NODE_STATUS } from '../src/work/work-dag.js';
import { AutonomousWorkLoop, InMemoryTeacherChannel } from '../src/work/autonomous-work-loop.js';
import { JsonlTeacherChannel, readJsonl } from '../scripts/jsonl-teacher-channel.mjs';
import { completeTeacherCouncil, teacherReply, TEST_CANDIDATE_BRANCH, TEST_CANDIDATE_SHA } from './helpers/teacher-review-fixtures.mjs';

function makeTeacherRequest() {
  return createTeacherReviewRequest({
    goal: 'Fermer la boucle autonome MEL vers Professeur',
    council: completeTeacherCouncil(),
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/work/autonomous-work-loop.js' }] },
    spec: { next: 'resume after teacher reply' },
  });
}

async function setup(jobId) {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: jobId, goal: 'Autonomy loop' });
  await repo.update(job.id, { candidate_branch: TEST_CANDIDATE_BRANCH });
  return { repo, job, store: new DevJobWorkDagStore(repo, job.id) };
}

test('autonomous loop publishes Teacher request, stays waiting, then consumes matching reply and continues automatically', async () => {
  const { job, store } = await setup(`autonomy-${crypto.randomUUID()}`);
  const request = makeTeacherRequest();
  let tasks = 0;
  const dag = createWorkDag({
    jobId: job.id,
    goal: 'task -> teacher -> continue',
    candidateBranch: TEST_CANDIDATE_BRANCH,
    candidateSha: TEST_CANDIDATE_SHA,
    nodes: [
      { id: 'before', kind: 'TASK', idempotent: true },
      { id: 'teacher', kind: 'TEACHER', depends_on: ['before'], payload: { request } },
      { id: 'after', kind: 'TASK', depends_on: ['teacher'], idempotent: true },
    ],
  });
  await store.save(dag);
  const runner = new WorkDagRunner({
    store,
    expectedCandidateSha: TEST_CANDIDATE_SHA,
    executors: { TASK: async (node) => { tasks += 1; return { node: node.id }; } },
  });
  const channel = new InMemoryTeacherChannel();
  const loop = new AutonomousWorkLoop({ runner, store, teacherChannel: channel });

  const waiting = await loop.run();
  assert.equal(waiting.status, WORK_DAG_STATUS.WAITING);
  assert.equal(tasks, 1);
  assert.ok(channel.requests.has(request.request_id));
  assert.equal(waiting.nodes.find((node) => node.id === 'teacher').status, WORK_NODE_STATUS.WAITING_TEACHER);

  await channel.submitReply(teacherReply(request.request_id));
  const complete = await loop.run();
  assert.equal(complete.status, WORK_DAG_STATUS.COMPLETED);
  assert.equal(tasks, 2);
  assert.equal(complete.nodes.every((node) => node.status === WORK_NODE_STATUS.COMPLETED), true);
});

test('autonomous loop does not accept a different Teacher request id', async () => {
  const { job, store } = await setup(`autonomy-mismatch-${crypto.randomUUID()}`);
  const request = makeTeacherRequest();
  await store.save(createWorkDag({
    jobId: job.id,
    candidateBranch: TEST_CANDIDATE_BRANCH,
    candidateSha: TEST_CANDIDATE_SHA,
    nodes: [{ id: 'teacher', kind: 'TEACHER', payload: { request } }],
  }));
  const runner = new WorkDagRunner({ store, expectedCandidateSha: TEST_CANDIDATE_SHA, executors: {} });
  const channel = new InMemoryTeacherChannel();
  const loop = new AutonomousWorkLoop({ runner, store, teacherChannel: channel });
  await loop.run();
  channel.replies.set(request.request_id, teacherReply('wrong'));
  await assert.rejects(() => loop.run(), (error) => error?.code === 'TEACHER_REPLY_REQUEST_MISMATCH');
});

test('JSONL Teacher channel publishes once, strips secret-shaped fields, and reads matching reply', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mel-teacher-'));
  try {
    const channel = new JsonlTeacherChannel({ repoRoot: root });
    const request = { type: 'MEL_TEACHER_REVIEW_REQUEST', request_id: 'req-1', created_at: new Date().toISOString(), objective: 'test', token: 'must-not-survive' };
    const first = await channel.publishRequest(request, { candidate_branch: TEST_CANDIDATE_BRANCH, authorization: 'must-not-survive' });
    const second = await channel.publishRequest(request);
    assert.equal(first.published, true);
    assert.equal(second.duplicate, true);
    const requests = await readJsonl(path.join(root, 'teacher-bridge/requests.jsonl'));
    assert.equal(requests.length, 1);
    assert.equal(JSON.stringify(requests).includes('must-not-survive'), false);

    await fs.writeFile(path.join(root, 'teacher-bridge/replies.jsonl'), `${JSON.stringify(teacherReply('req-1'))}\n`, 'utf8');
    const reply = await channel.getReply('req-1');
    assert.equal(reply.request_id, 'req-1');
    assert.equal(reply.verdict, 'APPROVE_PLAN');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('repeated heartbeat invocations complete a long Teacher chain without duplicate task execution', async () => {
  const { job, store } = await setup(`autonomy-heartbeat-${crypto.randomUUID()}`);
  const stageCount = 50;
  const nodes = [];
  const requestIds = [];

  for (let index = 0; index < stageCount; index += 1) {
    const taskId = `task-${index}`;
    const teacherId = `teacher-${index}`;
    const request = makeTeacherRequest();
    requestIds.push(request.request_id);
    nodes.push({
      id: taskId,
      kind: 'TASK',
      depends_on: index === 0 ? [] : [`teacher-${index - 1}`],
      idempotent: true,
    });
    nodes.push({
      id: teacherId,
      kind: 'TEACHER',
      depends_on: [taskId],
      payload: { request },
    });
  }

  await store.save(createWorkDag({
    jobId: job.id,
    goal: '50 tasks -> 50 Teacher gates -> repeated heartbeat resume',
    candidateBranch: TEST_CANDIDATE_BRANCH,
    candidateSha: TEST_CANDIDATE_SHA,
    nodes,
  }));

  const executions = new Map();
  const runner = new WorkDagRunner({
    store,
    expectedCandidateSha: TEST_CANDIDATE_SHA,
    executors: {
      TASK: async (node) => {
        executions.set(node.id, (executions.get(node.id) || 0) + 1);
        return { node: node.id };
      },
    },
  });

  class AutoApprovingTeacherChannel extends InMemoryTeacherChannel {
    async publishRequest(request, metadata = {}) {
      const result = await super.publishRequest(request, metadata);
      if (!this.replies.has(request.request_id)) {
        await this.submitReply(teacherReply(request.request_id));
      }
      return result;
    }
  }

  const channel = new AutoApprovingTeacherChannel();
  const loop = new AutonomousWorkLoop({ runner, store, teacherChannel: channel, maxCycles: 32 });

  let current = null;
  let heartbeatCount = 0;
  let sawCycleLimit = false;
  const maxHeartbeats = 20;

  do {
    current = await loop.run();
    heartbeatCount += 1;
    sawCycleLimit ||= current.audit.some((entry) => entry.event === 'AUTONOMOUS_WORK_LOOP_CYCLE_LIMIT');
    assert.ok(heartbeatCount < maxHeartbeats, 'heartbeat loop did not converge');
  } while (current.status !== WORK_DAG_STATUS.COMPLETED);

  assert.ok(heartbeatCount > 1, 'long chain should require more than one bounded heartbeat');
  assert.equal(sawCycleLimit, true, 'the test must cross the per-heartbeat cycle limit');
  assert.equal(current.nodes.length, stageCount * 2);
  assert.equal(current.nodes.every((node) => node.status === WORK_NODE_STATUS.COMPLETED), true);
  assert.equal(channel.requests.size, stageCount);
  assert.equal(new Set(requestIds).size, stageCount);
  assert.equal(executions.size, stageCount);
  assert.equal([...executions.values()].every((count) => count === 1), true);
  assert.equal(
    [...channel.requests.values()].every(({ metadata }) => metadata.candidate_branch === TEST_CANDIDATE_BRANCH),
    true,
  );
});
