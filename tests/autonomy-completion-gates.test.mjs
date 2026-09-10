import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { reconcileRuntimeCompletions } from '../src/teachers/github-completion-reconciler.js';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REQUEST = 'runtime-request-1';
const JOB = 'job-completion-gate';
const BRANCH = 'candidate/augmentio-core';

function completionLine(overrides = {}) {
  return JSON.stringify({
    kind: 'MEL_WORK_COMPLETION',
    status: 'COMPLETED',
    job_id: JOB,
    request_id: REQUEST,
    candidate_sha: SHA,
    candidate_branch: BRANCH,
    ci_run_id: 4242,
    tests: [{ name: 'full candidate suite', passed: true }],
    summary: 'candidate verified',
    ...overrides,
  });
}

function fetchImplFor(line = completionLine()) {
  return async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(`${line}\n`, { status: 200 });
    if (target.includes('/actions/runs/4242')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: SHA,
        head_branch: BRANCH,
        status: 'completed',
        conclusion: 'success',
      });
    }
    return new Response('not found', { status: 404 });
  };
}

async function approvedRepository({ proposal = true, proposalRequest = REQUEST, proposalBranch = BRANCH } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: JOB, requested_by: 'mel-autonomy', goal: 'x' });
  await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: REQUEST },
        review: { request_id: REQUEST, verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      implementation_proposal: proposal ? {
        status: 'READY',
        teacher_request_id: proposalRequest,
        candidate_branch: proposalBranch,
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        inspected_files: [{ path: 'src/evolution/autonomy-runtime.js', sha: 'source-sha' }],
        selected: { provider: 'workers-ai', model: 'a', text: 'bounded implementation plan' },
        production_touched: false,
        candidate_write_performed: false,
      } : null,
    },
  });
  return repository;
}

test('a green CI cannot complete an approved job before MEL has produced her own multi-AI implementation proposal', async () => {
  const repository = await approvedRepository({ proposal: false });
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.completed.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].code, 'COMPLETION_MEL_IMPLEMENTATION_PROPOSAL_REQUIRED');
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'TEACHER_APPROVED');
  assert.equal(stored.result_json.autonomy_completion, undefined);
});

test('implementation proposal must be correlated to the same Teacher request and candidate branch', async () => {
  for (const options of [
    { proposalRequest: 'wrong-request' },
    { proposalBranch: 'candidate/other' },
  ]) {
    const repository = await approvedRepository(options);
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImplFor(),
    });
    assert.equal(result.completed.length, 0);
    assert.equal(result.rejected[0].code, 'COMPLETION_MEL_IMPLEMENTATION_PROPOSAL_REQUIRED');
  }
});

test('correlated MEL proposal plus exact successful full-candidate-ci evidence completes the job', async () => {
  const repository = await approvedRepository();
  const result = await reconcileRuntimeCompletions({
    repository,
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
    fetchImpl: fetchImplFor(),
  });
  assert.equal(result.rejected.length, 0);
  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].candidate_sha, SHA);
  const stored = await repository.get(JOB);
  assert.equal(stored.status, 'COMPLETED');
  assert.equal(stored.result_json.autonomy_completion.status, 'VERIFIED');
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.verified, true);
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.providers_attempted, 2);
  assert.equal(stored.result_json.autonomy_completion.mel_implementation.selected_model, 'a');
});
