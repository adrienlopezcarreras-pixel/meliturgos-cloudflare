import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import { queueRuntimeTeacherRequest } from '../src/teachers/runtime-teacher-bridge.js';
import { maybeHandlePublicTeacherBridge } from '../src/teachers/public-teacher-api.js';

test('public Teacher feed is read-only and omits full council/inspection/private evidence', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `public-teacher-${crypto.randomUUID()}`, goal: 'Public minimal Teacher request' });
  const request = createTeacherReviewRequest({
    goal: 'Technical review only',
    council: { responses: [
      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },
      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },
    ] },
    inspection: { status: 'COMPLETE', evidence: [{ path: 'src/x.js', finding: 'PRIVATE INSPECTION DETAIL' }] },
    spec: { hidden_detail: 'PRIVATE SPEC DETAIL' },
    candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },
    patchSummary: 'bounded public patch summary',
    tests: [{ name: 'test', passed: true }],
    unknowns: ['one technical unknown'],
  });
  await queueRuntimeTeacherRequest(repo, job.id, request);

  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/pending'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control').includes('no-store'), true);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mutation_allowed, false);
  const row = body.pending.find((item) => item.request_id === request.request_id);
  assert.ok(row);
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes('PRIVATE COUNCIL DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE INSPECTION DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE SPEC DETAIL'), false);
  assert.equal(serialized.includes('bounded public patch summary'), true);
});

test('public Teacher status discloses only channel/count metadata', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/status'), {});
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.exposes_secrets, false);
  assert.equal(body.mutation_allowed, false);
  assert.equal(typeof body.pending_count, 'number');
});

test('public Teacher API refuses mutation by not handling non-GET requests', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/pending', { method: 'POST', body: '{}' }), {});
  assert.equal(response, null);
});
