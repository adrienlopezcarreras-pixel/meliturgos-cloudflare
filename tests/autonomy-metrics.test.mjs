import test from 'node:test';
import assert from 'node:assert/strict';
import { mentorMetrics, pipelineAlerts, STALL_AFTER_MS } from '../src/evolution/autonomy-metrics.js';

const LLAMA = 'workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const GEMMA = 'workers-ai:@cf/google/gemma-4-26b-a4b-it';
const GLM = 'workers-ai:@cf/zai-org/glm-4.7-flash';

const packaged = (selected, rejected) => ({ status: 'QUEUED', updated_at: 1, result_json: { bridge_preparation: { mentor: { council: {
  providers_attempted: [LLAMA, GEMMA, GLM], selected_provider: selected,
  rejected_proposals: rejected.map(([provider, error]) => ({ provider, error })),
} } } } });

test('mentor metrics count attempts, selections and rejection causes per model', () => {
  const jobs = [
    packaged(LLAMA, [[GEMMA, 'MENTOR_JSON_INVALID'], [GLM, 'MENTOR_PROVIDER_TIMEOUT']]),
    packaged(GEMMA, [[LLAMA, 'MENTOR_JSON_REQUIRED'], [GLM, 'MENTOR_PROVIDER_TIMEOUT']]),
    { status: 'TEACHER_APPROVED', result_json: JSON.stringify({ bridge_preparation_diagnostic: { mentor_failure_codes: [
      { provider: GLM, code: 'MENTOR_PROVIDER_TIMEOUT' }, { provider: GLM, code: 'MENTOR_PROVIDER_TIMEOUT', stage: 'repair' },
    ] } }) },
  ];
  const m = mentorMetrics(jobs);
  const glm = m.models.find(row => row.provider === GLM);
  assert.equal(glm.attempts, 3);
  assert.equal(glm.selected, 0);
  assert.equal(glm.success_rate, 0);
  assert.equal(glm.rejection_codes.MENTOR_PROVIDER_TIMEOUT, 4);
  assert.equal(m.models.find(row => row.provider === LLAMA).success_rate, 0.5);
  assert.deepEqual(m.rejection_causes[0], { code: 'MENTOR_PROVIDER_TIMEOUT', count: 4 });
});

test('alerts flag stalled jobs and a model that is never selected', () => {
  const now = 10 * STALL_AFTER_MS;
  const jobs = [
    { id: 'a', status: 'REPAIR_REQUIRED', updated_at: now - STALL_AFTER_MS - 60000 },
    { id: 'b', status: 'COMPLETED', updated_at: 1 },
    packaged(LLAMA, [[GLM, 'MENTOR_PROVIDER_TIMEOUT']]),
    packaged(LLAMA, [[GLM, 'MENTOR_PROVIDER_TIMEOUT']]),
    packaged(LLAMA, [[GLM, 'MENTOR_PROVIDER_TIMEOUT']]),
  ].map(job => ({ ...job, updated_at: job.updated_at === 1 && job.status === 'QUEUED' ? now : job.updated_at }));
  const alerts = pipelineAlerts(jobs, mentorMetrics(jobs), { now });
  assert.ok(alerts.some(a => a.code === 'JOB_STALLED' && a.job_id === 'a'));
  assert.ok(!alerts.some(a => a.job_id === 'b'));
  assert.ok(alerts.some(a => a.code === 'MENTOR_MODEL_NEVER_SELECTED' && a.provider === GLM));
  assert.ok(!alerts.some(a => a.code === 'MENTOR_MODEL_NEVER_SELECTED' && a.provider === LLAMA));
});
