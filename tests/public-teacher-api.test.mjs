import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { createTeacherReviewRequest } from '../src/teachers/teacher-request.js';
import { queueRuntimeTeacherRequest } from '../src/teachers/runtime-teacher-bridge.js';
import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';

test('public Teacher feed is read-only and omits goals, full council/inspection and private evidence', async () => {
  const repo = new D1DevJobRepository(null);
  const job = await repo.create({ id: `public-teacher-${crypto.randomUUID()}`, goal: 'PRIVATE JOB GOAL MUST NOT LEAK' });
  const request = createTeacherReviewRequest({
    goal: 'PRIVATE TECHNICAL OBJECTIVE MUST NOT LEAK',
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
  assert.equal(body.exposes_goals, false);
  assert.equal(body.exposes_implementation_text, false);
  const row = body.pending.find((item) => item.request_id === request.request_id);
  assert.ok(row);
  assert.equal('objective' in row, false);
  const serialized = JSON.stringify(row);
  assert.equal(serialized.includes('PRIVATE JOB GOAL'), false);
  assert.equal(serialized.includes('PRIVATE TECHNICAL OBJECTIVE'), false);
  assert.equal(serialized.includes('PRIVATE COUNCIL DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE INSPECTION DETAIL'), false);
  assert.equal(serialized.includes('PRIVATE SPEC DETAIL'), false);
  assert.equal(serialized.includes('bounded public patch summary'), true);
});

test('autonomy status exposes opaque Teacher correlation but never goals or private review evidence', () => {
  const summary = summarizeAutonomyJobs([
    {
      id: 'job-1',
      requested_by: 'mel-autonomy',
      status: 'WAITING_TEACHER',
      goal: 'PRIVATE GOAL MUST NOT LEAK',
      created_at: 1,
      optional_context: { roadmap_id: 'MEL-WORK-01' },
      result_json: {
        teacher_bridge: {
          status: 'WAITING_TEACHER',
          request: { request_id: 'opaque-request-1', objective: 'PRIVATE OBJECTIVE' },
          evidence: { inspection: 'PRIVATE EVIDENCE' },
        },
      },
    },
    {
      id: 'job-2',
      requested_by: 'mel-autonomy',
      status: 'COMPLETED',
      goal: 'ANOTHER PRIVATE GOAL',
      created_at: 2,
      optional_context: { roadmap_id: 'MEL-WORK-00' },
    },
    { id: 'manual', requested_by: 'professor', status: 'WAITING_TEACHER', goal: 'MANUAL PRIVATE GOAL' },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.active_count, 1);
  assert.equal(summary.owner_requested_count, 0);
  assert.equal(summary.waiting_teacher_count, 1);
  assert.equal(summary.completed_count, 1);
  assert.deepEqual(summary.current, {
    job_id: 'job-1',
    requested_by: 'mel-autonomy',
    status: 'WAITING_TEACHER',
    roadmap_id: 'MEL-WORK-01',
    teacher_status: 'WAITING_TEACHER',
    request_id: 'opaque-request-1',
    verdict: null,
    implementation_proposal_ready: false,
    implementation_models: 0,
    implementation_diagnostic_code: null,
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE GOAL'), false);
  assert.equal(serialized.includes('PRIVATE OBJECTIVE'), false);
  assert.equal(serialized.includes('PRIVATE EVIDENCE'), false);
});

test('autonomy status exposes sanitized live Council provenance for MEL roadmap work without Council content', () => {
  const summary = summarizeAutonomyJobs([{
    id: 'council-job',
    requested_by: 'mel-autonomy',
    status: 'WAITING_TEACHER',
    created_at: 1,
    optional_context: { roadmap_id: 'MEL-COUNCIL-02', zero_added_cost: true },
    plan_json: {
      preflight: {
        council: {
          status: 'COMPLETE',
          responses: [
            {
              member: 'workers-ai:llama',
              answer: {
                provider_id: 'workers-ai:llama',
                role: 'ARCHITECTURE_REUSE',
                content: 'PRIVATE COUNCIL ANSWER MUST NOT LEAK',
                provenance: { provider: 'cloudflare-workers-ai', model: '@cf/meta/llama-3.1-8b-instruct' },
              },
            },
            {
              member: 'workers-ai:qwen',
              answer: {
                provider_id: 'workers-ai:qwen',
                role: 'SECURITY_GOVERNANCE',
                content: 'SECOND PRIVATE ANSWER',
                provenance: { provider: 'cloudflare-workers-ai', model: '@cf/qwen/qwen2.5-coder-32b-instruct' },
              },
            },
          ],
          providers_attempted: ['workers-ai:llama', 'workers-ai:qwen'],
          providers_succeeded: ['workers-ai:llama', 'workers-ai:qwen'],
          required_roles_attempted: ['ARCHITECTURE_REUSE', 'SECURITY_GOVERNANCE', 'TESTS_EVIDENCE', 'PRODUCT_INTEGRATION'],
          required_roles_succeeded: ['ARCHITECTURE_REUSE', 'SECURITY_GOVERNANCE', 'TESTS_EVIDENCE', 'PRODUCT_INTEGRATION'],
          all_required_roles_satisfied: true,
          synthesis: {
            status: 'COMPLETE', coordinator: 'MEL', provider_id: 'workers-ai:llama',
            provenance: { provider: 'cloudflare-workers-ai', model: '@cf/meta/llama-3.1-8b-instruct' },
            text: 'PRIVATE MEL SYNTHESIS MUST NOT LEAK',
          },
          teacher_required: true,
        },
      },
    },
    result_json: {
      teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'council-request' } },
    },
  }]);

  const evidence = summary.current.council_evidence;
  assert.ok(evidence);
  assert.equal(evidence.status, 'COMPLETE');
  assert.deepEqual(evidence.providers_attempted, ['workers-ai:llama', 'workers-ai:qwen']);
  assert.equal(evidence.responses.length, 2);
  assert.equal(evidence.responses[0].role, 'ARCHITECTURE_REUSE');
  assert.equal(evidence.responses[0].model, '@cf/meta/llama-3.1-8b-instruct');
  assert.equal(evidence.all_required_roles_satisfied, true);
  assert.equal(evidence.synthesis.status, 'COMPLETE');
  assert.equal(evidence.synthesis.coordinator, 'MEL');
  assert.equal(evidence.teacher_required, true);
  assert.equal(evidence.content_exposed, false);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE COUNCIL ANSWER'), false);
  assert.equal(serialized.includes('SECOND PRIVATE ANSWER'), false);
  assert.equal(serialized.includes('PRIVATE MEL SYNTHESIS'), false);
});

test('owner-chat Council metadata is never exposed through the public Teacher summary', () => {
  const summary = summarizeAutonomyJobs([{
    id: 'owner-council', requested_by: 'owner-chat', status: 'WAITING_TEACHER', created_at: 1,
    optional_context: { roadmap_id: 'PRIVATE' },
    plan_json: { preflight: { council: { status: 'COMPLETE', providers_attempted: ['private-provider'] } } },
    result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'owner-request' } } },
  }]);
  assert.equal('council_evidence' in summary.current, false);
  assert.equal(JSON.stringify(summary).includes('private-provider'), false);
});

test('explicit owner-chat work is included and becomes the public current technical lifecycle item', () => {
  const summary = summarizeAutonomyJobs([
    {
      id: 'background', requested_by: 'mel-autonomy', status: 'WAITING_TEACHER', created_at: 1,
      optional_context: { roadmap_id: 'MEL-WORK-01' },
      result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'background-r' } } },
    },
    {
      id: 'owner-job', requested_by: 'owner-chat', status: 'WAITING_TEACHER', created_at: 2,
      goal: 'PRIVATE OWNER GOAL', optional_context: { priority: 'P0' },
      result_json: { teacher_bridge: { status: 'WAITING_TEACHER', request: { request_id: 'owner-r', objective: 'PRIVATE OWNER OBJECTIVE' } } },
    },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.owner_requested_count, 1);
  assert.equal(summary.current.job_id, 'owner-job');
  assert.equal(summary.current.requested_by, 'owner-chat');
  assert.equal(summary.current.request_id, 'owner-r');
  assert.equal(summary.current.implementation_proposal_ready, false);
  assert.equal(summary.current.implementation_diagnostic_code, null);
  assert.equal(JSON.stringify(summary).includes('PRIVATE OWNER'), false);
});

test('autonomy status preserves approved request id and only a boolean/count for MEL implementation work', () => {
  const summary = summarizeAutonomyJobs([{
    id: 'approved-job',
    requested_by: 'mel-autonomy',
    status: 'TEACHER_APPROVED',
    created_at: 1,
    optional_context: { roadmap_id: 'GEN2-17' },
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: 'opaque-approved-request' },
        review: { request_id: 'opaque-approved-request', verdict: 'APPROVE_PLAN', feedback: 'PRIVATE FEEDBACK' },
      },
      implementation_proposal: {
        status: 'READY',
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        selected: { text: 'PRIVATE IMPLEMENTATION PLAN', model: 'a' },
      },
    },
  }]);
  assert.equal(summary.current.request_id, 'opaque-approved-request');
  assert.equal(summary.current.teacher_status, 'ANSWERED');
  assert.equal(summary.current.verdict, 'APPROVE_PLAN');
  assert.equal(summary.current.implementation_proposal_ready, true);
  assert.equal(summary.current.implementation_models, 2);
  assert.equal(summary.current.implementation_diagnostic_code, null);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('PRIVATE FEEDBACK'), false);
  assert.equal(serialized.includes('PRIVATE IMPLEMENTATION PLAN'), false);
});

test('autonomy status exposes only a strict sanitized planner diagnostic code', () => {
  const base = {
    id: 'approved-job', requested_by: 'mel-autonomy', status: 'TEACHER_APPROVED', created_at: 1,
    optional_context: { roadmap_id: 'MEL-WORK-01' },
    result_json: {
      teacher_bridge: { status: 'ANSWERED', request: { request_id: 'r1' }, review: { request_id: 'r1', verdict: 'APPROVE_PLAN' } },
      implementation_planning_diagnostic: { status: 'NOT_READY', code: 'ALL_PROVIDERS_FAILED' },
    },
  };
  assert.equal(summarizeAutonomyJobs([base]).current.implementation_diagnostic_code, 'ALL_PROVIDERS_FAILED');
  const unsafe = structuredClone(base);
  unsafe.result_json.implementation_planning_diagnostic.code = 'Bearer secret-must-not-leak';
  const summary = summarizeAutonomyJobs([unsafe]);
  assert.equal(summary.current.implementation_diagnostic_code, null);
  assert.equal(JSON.stringify(summary).includes('secret-must-not-leak'), false);
});

test('public Teacher status discloses channel/count and minimized autonomy metadata only', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/status'), {});
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.exposes_secrets, false);
  assert.equal(body.exposes_goals, false);
  assert.equal(body.exposes_implementation_text, false);
  assert.equal(body.mutation_allowed, false);
  assert.equal(typeof body.pending_count, 'number');
  assert.equal(typeof body.autonomy.active_count, 'number');
  assert.equal('goal' in (body.autonomy.current || {}), false);
});

test('plain-text Teacher bridge is extractor-friendly, read-only and does not expose owner-chat goals', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/bridge.txt'), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/plain/);
  assert.equal(response.headers.get('cache-control').includes('no-store'), true);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.ok, true);
  assert.equal(body.channel, 'github-teacher-bridge');
  assert.equal(body.mutation_allowed, false);
  assert.equal(body.exposes_secrets, false);
  assert.equal(body.exposes_goals, false);
  assert.equal(body.exposes_owner_chat_work, false);
  assert.equal(Array.isArray(body.pending), true);
  assert.equal('work_available' in body, true);
  assert.equal(text.includes('MELITURGOS_PASSWORD'), false);
});

test('public Teacher API refuses mutation by not handling non-GET requests', async () => {
  const response = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/pending', { method: 'POST', body: '{}' }), {});
  assert.equal(response, null);
  const textResponse = await maybeHandlePublicTeacherBridge(new Request('http://x/api/teacher/bridge.txt', { method: 'POST', body: '{}' }), {});
  assert.equal(textResponse, null);
});
