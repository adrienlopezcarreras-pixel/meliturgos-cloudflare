import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { maybeHandleAutonomyApi } from '../src/evolution/autonomy-api.js';

function authHeader(user = 'test', password = 'pw') {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const aiCalls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'pw',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: 'release/test',
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
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response('', { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('', { status: 200 });
    if (target.startsWith('https://api.github.com/')) return new Response('rate limit fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('export const fixture = true;\n// candidate source\n', { status: 200, headers: { etag: 'fixture' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { repository, env, aiCalls, fetchImpl };
}

test('autonomy operator API is authenticated', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/state'),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});

test('autonomy state reports candidate/deployed branches and lifecycle counts without private goals', async () => {
  const f = fixture();
  await f.repository.create({
    id: 'autonomy-state-1',
    requested_by: 'mel-autonomy',
    goal: 'PRIVATE AUTONOMY GOAL',
    optional_context: { roadmap_id: 'MEL-WORK-01', phase_id: 'P07', priority: 'P0' },
  });
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/state', { headers: { authorization: authHeader() } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.candidate_branch, 'candidate/augmentio-core');
  assert.equal(body.deployed_code_branch, 'release/test');
  assert.equal(body.counts.active, 1);
  assert.equal(body.active_jobs[0].roadmap_id, 'MEL-WORK-01');
  assert.equal(JSON.stringify(body).includes('PRIVATE AUTONOMY GOAL'), false);
});

test('manual autonomy tick executes the same Council-first heartbeat and returns refreshed state', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/tick', { method: 'POST', headers: { authorization: authHeader() } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.tick.ensured.created, true);
  assert.equal(body.tick.job.roadmap_id, 'MEL-WORK-01');
  assert.equal(body.tick.job.status, 'WAITING_TEACHER');
  assert.ok(body.tick.teacher.request_id);
  assert.ok(f.aiCalls.length >= 2, 'manual tick must preserve multi-AI Council-first rule');
  assert.equal(body.state.counts.waiting_teacher, 1);
  assert.equal(body.state.active_jobs[0].teacher.status, 'WAITING_TEACHER');
});

test('autonomy routes enforce method contracts', async () => {
  const f = fixture();
  const wrongState = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/state', { method: 'POST', headers: { authorization: authHeader() } }),
    f.env,
    { repository: f.repository },
  );
  assert.equal(wrongState.status, 405);
  const wrongTick = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/tick', { headers: { authorization: authHeader() } }),
    f.env,
    { repository: f.repository },
  );
  assert.equal(wrongTick.status, 405);
});
