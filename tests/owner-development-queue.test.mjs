import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { enqueueOwnerDevelopmentRequest } from '../src/evolution/owner-development-queue.js';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const aiCalls = [];
  const fetchCalls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `Independent state-of-play from ${model}` };
      },
    },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('/commits/candidate%2Faugmentio-core')) return Response.json({ sha: CANDIDATE_HEAD_SHA });
    if (target.startsWith('https://api.github.com/')) return new Response('rate-limit fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('export const fixture = true;\n// candidate source\n', { status: 200, headers: { etag: 'fixture' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { repository, env, aiCalls, fetchCalls, fetchImpl };
}

test('owner development request persists one unified job, runs Council first, inspects candidate code and waits for Teacher', async () => {
  const f = fixture();
  const result = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Développe une compétence calendrier',
    conversationId: 'conversation-1',
    requestKey: 'message-1',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.requested_by, 'owner-chat');
  assert.equal(result.status, 'WAITING_TEACHER');
  assert.equal(result.teacher.status, 'WAITING_TEACHER');
  assert.ok(result.teacher.request_id);
  assert.equal(result.candidate_only, true);
  assert.equal(result.zero_added_cost, true);
  assert.equal(result.unified_update, true);
  assert.equal(result.policy, 'SINGLE_CANONICAL_WRITER');
  assert.ok(f.aiCalls.length >= 2, 'Council-first must call at least two explicitly zero-cost configured models');
  assert.ok(f.fetchCalls.some((url) => url.includes('raw.githubusercontent.com')), 'candidate code must be inspected before Teacher review');

  const stored = await f.repository.get(result.job_id);
  assert.equal(stored.status, 'WAITING_TEACHER');
  assert.equal(stored.requested_by, 'owner-chat');
  assert.equal(stored.optional_context.rule, 'AI_COUNCIL_ADVISORY_ONLY_THEN_ONE_CANONICAL_UPDATE');
  assert.equal(stored.optional_context.unified_update, true);
  assert.equal(stored.optional_context.parallel_implementations_allowed, false);
  assert.equal(stored.optional_context.provider_direct_writes_allowed, false);
  assert.ok(stored.plan_json.preflight.council);
  assert.equal(stored.result_json.teacher_bridge.status, 'WAITING_TEACHER');
  assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, CANDIDATE_HEAD_SHA);
});

test('replaying the same owner message is idempotent and does not repeat the Council', async () => {
  const f = fixture();
  const input = {
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-2',
    requestKey: 'message-2',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  };
  const first = await enqueueOwnerDevelopmentRequest(input);
  const calls = f.aiCalls.length;
  const second = await enqueueOwnerDevelopmentRequest(input);
  assert.equal(second.created, false);
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.status, 'WAITING_TEACHER');
  assert.equal(f.aiCalls.length, calls, 'same message must not repeat Council work');
  const jobs = (await f.repository.list()).filter((job) => job.requested_by === 'owner-chat');
  assert.equal(jobs.length, 1);
});

test('different owner messages for the same objective converge on the same canonical job', async () => {
  const f = fixture();
  const first = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-3',
    requestKey: 'message-a',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  const calls = f.aiCalls.length;
  const second = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-99',
    requestKey: 'message-b',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.created, false);
  assert.equal(f.aiCalls.length, calls, 'same objective from another message must reuse existing Council/job');
  const jobs = (await f.repository.list()).filter((job) => job.requested_by === 'owner-chat');
  assert.equal(jobs.length, 1);
});

test('owner queue requires durable D1 when no test repository is injected', async () => {
  await assert.rejects(
    () => enqueueOwnerDevelopmentRequest({
      env: { AI: { run: async () => ({ response: 'x' }) } },
      goal: 'Développe une compétence calendrier',
    }),
    (error) => error?.code === 'DB_BINDING_MISSING',
  );
});

test('owner queue refuses a non-candidate Teacher branch fail-closed', async () => {
  const f = fixture();
  f.env.MEL_TEACHER_BRANCH = 'main';
  await assert.rejects(
    () => enqueueOwnerDevelopmentRequest({
      env: f.env,
      goal: 'Développe une compétence calendrier',
      conversationId: 'conversation-4',
      requestKey: 'message-4',
      repository: f.repository,
      fetchImpl: f.fetchImpl,
    }),
    (error) => error?.code === 'AUTONOMY_BRANCH_NOT_CANDIDATE',
  );
});
