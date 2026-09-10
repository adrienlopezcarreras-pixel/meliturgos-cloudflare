import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeTeacherMirror, mirrorRuntimeTeacherRequestToGitHub } from '../src/teachers/github-request-mirror.js';

function fixture() {
  const job = {
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine persistant',
    optional_context: { roadmap_id: 'MEL-WORK-01', priority: 'P0' },
  };
  const state = {
    queued_at: '2026-09-10T06:00:00.000Z',
    request: {
      type: 'MEL_TEACHER_REVIEW_REQUEST',
      request_id: 'req-runtime-123',
      created_at: '2026-09-10T06:00:00.000Z',
      stage: 'TEACHER_REVIEW_REQUIRED',
      objective: 'internal roadmap work',
      candidate: { repository: 'owner/repo', branch: 'candidate/augmentio-core' },
      patch_summary: 'No patch yet.',
      tests: [],
      unknowns: ['CI pending'],
      requested_review: ['Review plan'],
      provenance: { roadmap_id: 'MEL-WORK-01', source: 'MEL_RUNTIME_CRON' },
    },
  };
  return { job, state };
}

test('buildRuntimeTeacherMirror exposes only internal roadmap work', () => {
  const { job, state } = fixture();
  const mirror = buildRuntimeTeacherMirror(job, state);
  assert.equal(mirror.kind, 'MEL_RUNTIME_REQUEST');
  assert.equal(mirror.request_id, 'req-runtime-123');
  assert.equal(mirror.roadmap_id, 'MEL-WORK-01');
  assert.equal(mirror.constraints.production_deploy_allowed, false);

  const ownerJob = { ...job, requested_by: 'owner-chat', goal: 'private owner goal' };
  assert.equal(buildRuntimeTeacherMirror(ownerJob, state), null);
});

test('mirror skips safely when no GitHub token is configured', async () => {
  const { job, state } = fixture();
  let calls = 0;
  const result = await mirrorRuntimeTeacherRequestToGitHub({
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: 'candidate/augmentio-core' },
    job,
    state,
    fetchImpl: async () => { calls += 1; return new Response('', { status: 500 }); },
  });
  assert.equal(result.status, 'SKIPPED_NO_GITHUB_TOKEN');
  assert.equal(calls, 0);
});

test('mirror writes a unique sanitized request file without leaking the token', async () => {
  const { job, state } = fixture();
  const calls = [];
  const token = 'github-token-fixture-value';
  const result = await mirrorRuntimeTeacherRequestToGitHub({
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
      MEL_GITHUB_TOKEN: token,
      MELITURGOS_PASSWORD: 'must-never-leak',
    },
    job,
    state,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if ((init.method || 'GET') === 'GET') return new Response('', { status: 404 });
      return Response.json({ content: { sha: 'abc' } }, { status: 201 });
    },
  });

  assert.equal(result.status, 'MIRRORED');
  assert.equal(result.path, 'teacher-bridge/runtime-requests/req-runtime-123.json');
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /runtime-requests\/req-runtime-123\.json$/);
  const body = JSON.parse(calls[1].init.body);
  const decoded = Buffer.from(body.content, 'base64').toString('utf8');
  assert.match(decoded, /MEL_RUNTIME_REQUEST/);
  assert.match(decoded, /MEL-WORK-01/);
  assert.doesNotMatch(decoded, new RegExp(token));
  assert.doesNotMatch(decoded, /must-never-leak/);
  assert.equal(body.branch, 'candidate/augmentio-core');
});

test('mirror is idempotent when the request file already exists', async () => {
  const { job, state } = fixture();
  let calls = 0;
  const result = await mirrorRuntimeTeacherRequestToGitHub({
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
      MEL_GITHUB_TOKEN: 'fixture-token',
    },
    job,
    state,
    fetchImpl: async () => { calls += 1; return Response.json({ name: 'existing' }, { status: 200 }); },
  });
  assert.equal(result.status, 'ALREADY_PRESENT');
  assert.equal(calls, 1);
});
