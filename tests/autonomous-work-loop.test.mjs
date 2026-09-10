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

function makeTeacherRequest() {
  return createTeacherReviewRequest({
    goal: 'Fermer la boucle autonome MEL vers Professeur',
    council: { responses: [
      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },
      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },
    ] },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/work/autonomous-work-loop.js' }] },
    spec: { next: 'resume after teacher reply' },
  });
}

async function setup(jobId) {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: jobId, goal: 'Autonomy loop' });
  await repo.update(job.id, { candidate_branch: 'candidate/augmentio-core' });
  return { repo, job, store: new DevJobWorkDagStore(repo, job.id) };
}

test('autonomous loop publishes Teacher request, stays waiting, then consumes matching reply and continues automatically', async () => {
  const { job, store } = await setup(`autonomy-${crypto.randomUUID()}`);
  const request = makeTeacherRequest();
  let tasks = 0;
  const dag = createWorkDag({
    jobId: job.id,
    goal: 'task -> teacher -> continue',
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: 'abc9876',
    nodes: [
      { id: 'before', kind: 'TASK', idempotent: true },
      { id: 'teacher', kind: 'TEACHER', depends_on: ['before'], payload: { request } },
      { id: 'after', kind: 'TASK', depends_on: ['teacher'], idempotent: true },
    ],
  });
  await store.save(dag);
  const runner = new WorkDagRunner({
    store,
    expectedCandidateSha: 'abc9876',
    executors: { TASK: async (node) => { tasks += 1; return { node: node.id }; } },
  });
  const channel = new InMemoryTeacherChannel();
  const loop = new AutonomousWorkLoop({ runner, store, teacherChannel: channel });

  const waiting = await loop.run();
  assert.equal(waiting.status, WORK_DAG_STATUS.WAITING);
  assert.equal(tasks, 1);
  assert.ok(channel.requests.has(request.request_id));
  assert.equal(waiting.nodes.find((node) => node.id === 'teacher').status, WORK_NODE_STATUS.WAITING_TEACHER);

  await channel.submitReply({ request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'Continue.' });
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
    candidateBranch: 'candidate/augmentio-core',
    candidateSha: 'fed4321',
    nodes: [{ id: 'teacher', kind: 'TEACHER', payload: { request } }],
  }));
  const runner = new WorkDagRunner({ store, expectedCandidateSha: 'fed4321', executors: {} });
  const channel = new InMemoryTeacherChannel();
  const loop = new AutonomousWorkLoop({ runner, store, teacherChannel: channel });
  await loop.run();
  channel.replies.set(request.request_id, { request_id: 'wrong', verdict: 'APPROVE_PLAN' });
  await assert.rejects(() => loop.run(), (error) => error?.code === 'TEACHER_REPLY_REQUEST_MISMATCH');
});

test('JSONL Teacher channel publishes once, strips secret-shaped fields, and reads matching reply', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mel-teacher-'));
  try {
    const channel = new JsonlTeacherChannel({ repoRoot: root });
    const request = { type: 'MEL_TEACHER_REVIEW_REQUEST', request_id: 'req-1', created_at: new Date().toISOString(), objective: 'test', token: 'must-not-survive' };
    const first = await channel.publishRequest(request, { candidate_branch: 'candidate/augmentio-core', authorization: 'must-not-survive' });
    const second = await channel.publishRequest(request);
    assert.equal(first.published, true);
    assert.equal(second.duplicate, true);
    const requests = await readJsonl(path.join(root, 'teacher-bridge/requests.jsonl'));
    assert.equal(requests.length, 1);
    assert.equal(JSON.stringify(requests).includes('must-not-survive'), false);

    await fs.writeFile(path.join(root, 'teacher-bridge/replies.jsonl'), `${JSON.stringify({ kind: 'TEACHER_REPLY', request_id: 'req-1', verdict: 'APPROVE_PLAN', feedback: 'ok' })}\n`, 'utf8');
    const reply = await channel.getReply('req-1');
    assert.equal(reply.request_id, 'req-1');
    assert.equal(reply.verdict, 'APPROVE_PLAN');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
