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