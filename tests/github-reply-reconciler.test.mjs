import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import { queueRuntimeTeacherRequest } from '../src/teachers/runtime-teacher-bridge.js';
import {
  defaultTeacherRepliesUrl,
  parseTeacherRepliesJsonl,
  reconcileRuntimeTeacherReplies,
} from '../src/teachers/github-reply-reconciler.js';

function makeRequest(jobId) {
  return createTeacherReviewRequest({
    goal: `Teacher reconcile ${jobId}`,
    council: { responses: [
      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },
      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },
    ] },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/teachers/github-reply-reconciler.js' }] },
    spec: { candidate_only: true },
  });
}

test('canonical Teacher reply URL stays on the candidate branch', () => {
  const url = defaultTeacherRepliesUrl({
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
  });
  assert.equal(url, 'https://raw.githubusercontent.com/owner/repo/refs/heads/candidate/augmentio-core/teacher-bridge/replies.jsonl');
  assert.throws(
    () => defaultTeacherRepliesUrl({ MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: 'main' }),
    (error) => error?.code === 'TEACHER_BRANCH_NOT_CANDIDATE',
  );
});

test('JSONL parser ignores malformed and non-verdict records', () => {
  const replies = parseTeacherRepliesJsonl([
    '{bad json',
    JSON.stringify({ request_id: 'legacy', status: 'ANSWERED', instruction: 'no structured verdict' }),
    JSON.stringify({ kind: 'TEACHER_REPLY', request_id: 'r1', verdict: 'APPROVE_PLAN', feedback: 'continue' }),
    JSON.stringify({ kind: 'TEACHER_REPLY', request_id: 'r2', verdict: 'NEEDS_CHANGES', instruction: 'more evidence' }),
  ].join('\n'));
  assert.equal(replies.length, 2);
  assert.equal(replies[0].request_id, 'r1');
  assert.equal(replies[1].feedback, 'more evidence');
});

test('reconciler applies only the canonical matching GitHub reply', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `reconcile-${crypto.randomUUID()}`, goal: 'Reconcile candidate work' });
  const request = makeRequest(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const jsonl = [
    JSON.stringify({ request_id: 'other', verdict: 'APPROVE_PLAN', feedback: 'must not apply' }),
    JSON.stringify({ request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'matching reply' }),
  ].join('\n');
  const fetchImpl = async () => new Response(jsonl, { status: 200 });
  const result = await reconcileRuntimeTeacherReplies({
    repository: repo,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: 'candidate/augmentio-core' },
    fetchImpl,
  });
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].request_id, request.request_id);
  assert.equal((await repo.get(job.id)).status, 'TEACHER_APPROVED');
});

test('reconciler remains waiting when GitHub has no matching reply', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `reconcile-wait-${crypto.randomUUID()}`, goal: 'Wait for Teacher' });
  const request = makeRequest(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const fetchImpl = async () => new Response(JSON.stringify({ request_id: 'different', verdict: 'APPROVE_PLAN' }), { status: 200 });
  const result = await reconcileRuntimeTeacherReplies({ repository: repo, env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: 'candidate/augmentio-core' }, fetchImpl });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.unmatched, [request.request_id]);
  assert.equal((await repo.get(job.id)).status, 'WAITING_TEACHER');
});
