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
import { completeTeacherCouncil, teacherReply, TEST_CANDIDATE_BRANCH, TEST_CANDIDATE_SHA } from './helpers/teacher-review-fixtures.mjs';

const NEW_CANDIDATE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function makeRequest(jobId) {
  return createTeacherReviewRequest({
    goal: `Teacher reconcile ${jobId}`,
    council: completeTeacherCouncil(),
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/teachers/github-reply-reconciler.js' }] },
    spec: { candidate_only: true },
  });
}

test('canonical Teacher reply URL stays on the dedicated transport branch', () => {
  const url = defaultTeacherRepliesUrl({
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: TEST_CANDIDATE_BRANCH,
    MEL_TEACHER_TRANSPORT_BRANCH: 'teacher-bridge/runtime',
  });
  assert.equal(url, 'https://raw.githubusercontent.com/owner/repo/refs/heads/teacher-bridge/runtime/teacher-bridge/replies.jsonl');
  assert.throws(
    () => defaultTeacherRepliesUrl({
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_TEACHER_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_TRANSPORT_BRANCH: 'main',
    }),
    (error) => error?.code === 'TEACHER_TRANSPORT_BRANCH_INVALID',
  );
});

test('JSONL parser ignores malformed and non-verdict records', () => {
  const replies = parseTeacherRepliesJsonl([
    '{bad json',
    JSON.stringify({ request_id: 'legacy', status: 'ANSWERED', instruction: 'no structured verdict' }),
    JSON.stringify(teacherReply('r1')),
    JSON.stringify(teacherReply('r2', { verdict: 'NEEDS_CHANGES', feedback: 'more evidence' })),
  ].join('\n'));
  assert.equal(replies.length, 2);
  assert.equal(replies[0].request_id, 'r1');
  assert.equal(replies[1].feedback, 'more evidence');
});

test('reconciler applies only the canonical matching GitHub reply', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repo.create({ id: `reconcile-${crypto.randomUUID()}`, goal: 'Reconcile candidate work' });
  const request = makeRequest(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const jsonl = [
    JSON.stringify(teacherReply('other')),
    JSON.stringify(teacherReply(request.request_id, { feedback: 'matching reply' })),
  ].join('\n');
  const fetchImpl = async (url) => {
    if (String(url).includes('/branches/')) {
      return Response.json({ commit: { sha: TEST_CANDIDATE_SHA } });
    }
    assert.match(String(url), /refs\/heads\/teacher-bridge\/runtime\/teacher-bridge\/replies\.jsonl$/);
    return new Response(jsonl, { status: 200 });
  };
  const result = await reconcileRuntimeTeacherReplies({
    repository: repo,
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_GITHUB_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_TRANSPORT_BRANCH: 'teacher-bridge/runtime',
    },
    fetchImpl,
  });
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].request_id, request.request_id);
  assert.equal(result.applied[0].target_sha, TEST_CANDIDATE_SHA);
  assert.equal((await repo.get(job.id)).status, 'TEACHER_APPROVED');
});

test('reconciler remains waiting when transport branch has no matching reply', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repo.create({ id: `reconcile-wait-${crypto.randomUUID()}`, goal: 'Wait for Teacher' });
  const request = makeRequest(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);
  const fetchImpl = async (url) => {
    if (String(url).includes('/branches/')) return Response.json({ commit: { sha: TEST_CANDIDATE_SHA } });
    return new Response(JSON.stringify(teacherReply('different')), { status: 200 });
  };
  const result = await reconcileRuntimeTeacherReplies({
    repository: repo,
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_GITHUB_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_TRANSPORT_BRANCH: 'teacher-bridge/runtime',
    },
    fetchImpl,
  });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.unmatched, [request.request_id]);
  assert.equal((await repo.get(job.id)).status, 'WAITING_TEACHER');
});

test('stale WAITING_TEACHER is requeued on candidate SHA drift even when Teacher never replies', async () => {
  const repo = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repo.create({
    id: `reconcile-stale-${crypto.randomUUID()}`,
    requested_by: 'mel-autonomy',
    goal: 'Do not remain blocked behind a stale Teacher request',
  });
  const request = makeRequest(job.id);
  await queueRuntimeTeacherRequest(repo, job.id, request);

  let repliesFetched = false;
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('/branches/')) return Response.json({ commit: { sha: NEW_CANDIDATE_SHA } });
    if (target.includes('teacher-bridge/replies.jsonl')) {
      repliesFetched = true;
      return new Response('', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const result = await reconcileRuntimeTeacherReplies({
    repository: repo,
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_GITHUB_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_BRANCH: TEST_CANDIDATE_BRANCH,
      MEL_TEACHER_TRANSPORT_BRANCH: 'teacher-bridge/runtime',
    },
    fetchImpl,
  });

  assert.equal(result.stale.length, 1);
  assert.equal(result.stale[0].request_id, request.request_id);
  assert.equal(result.stale[0].previous_target_sha, TEST_CANDIDATE_SHA);
  assert.equal(result.stale[0].current_candidate_sha, NEW_CANDIDATE_SHA);
  assert.equal(repliesFetched, false, 'a stale request must be recovered before waiting for any Teacher reply');

  const recovered = await repo.get(job.id);
  assert.equal(recovered.status, 'QUEUED');
  assert.equal(recovered.result_json.teacher_bridge, null);
  assert.equal(recovered.result_json.last_teacher_stale.request_id, request.request_id);
  assert.equal(recovered.result_json.teacher_bridge_history.at(-1).status, 'STALE');
  assert.equal(recovered.result_json.teacher_bridge_history.at(-1).stale_reason, 'CANDIDATE_SHA_DRIFT');
  assert.equal(recovered.plan_json.revision.reason, 'TEACHER_REQUEST_STALE_SHA');
  assert.equal(recovered.plan_json.revision.current_candidate_sha, NEW_CANDIDATE_SHA);
});
